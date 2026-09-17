# Machine trends

**What it is.** The data behind "how is this machine used across every client" —
built once a week by `server/machine-trends-job.ts` (Render cron, Sundays 3am
ET) into `machineTrends/{machineId}` plus `machineTrends/_summary`. The Settings
card reads it for its height-based suggestion, and since the machine-fit round
(Sep 17) the same run also writes machine fit's **company tier** — see "The fit
block" below.

**Why it exists.** Until the cost round (Sep 2026) a nightly job read *every*
exercise log ever written to rank clients by load, and nothing in the app
displayed the result. AJ's actual question was about the machine, not the
ranking: how do clients compare on the Compound Row, and which chest-pad
setting do clients around 5'7" tend to use.

## The document

For each machine with at least one performed set in the window:

| Field | Meaning |
| --- | --- |
| `clients`, `sets`, `sessions` | distinct clients, performed sets, distinct sessions in the window |
| `load` | distribution of each client's **best** load: `min · p25 · median · p75 · max · avg` — or `null` under `MIN_CLIENTS` |
| `settings[key][value]` | for a setting (`chest-pad`) and a value (`6`): `clients` whose latest snapshot used it, `sets` logged with it, `medianBest`, and `byHeight` — height in whole inches → client count |
| `byHeight[inches]` | clients, sets and median best at that height |
| `studios[homeStudioId]` | the same, per client home studio (`unknown` when a client has none) |
| `windowDays`, `windowStart`, `windowEnd`, `computedAt` | the window (rolling days, UTC) and when it was built |

`_summary` lists every machine with `clients · sets · sessions` (and
`fitClients`, when the machine has a fit block) so a list screen costs one read.

## The fit block (machine-fit round, Sep 17)

`machineTrends/{machineId}.fit` is the company tier of machine fit
(`src/features/machine-fit/` — read that README): every studio's set-ups pooled
into anonymous cells, `"64|f" → { "gap=0;seat=5": 6 }` — a height and a gender,
a whole set-up, and how many clients. It is built from the per-studio
`machineFit` indexes, not from exercise logs, so:

- **a machine with set-ups but no sets this window keeps a document** (zero
  trends, a fit block) instead of being retired;
- the job reads **every** client for it — a past client's seat is still evidence
  of where that build sits — while the trends above still use active clients
  only, exactly as before;
- **every published cell describes at least five people** (`CELL_MIN_CLIENTS`):
  a thin gender is pooled into `x`, a thin pool pools the height, a thin height
  is left out and counted in `heldBack`. "Never a client row" includes a row
  with no name on it;
- if the fit step fails, **last week's blocks are carried over** and the
  administrators' `kaizenReports/*` are left as they were. The trends are still
  written.

## Rules that are load-bearing

- **Sentences, not scores.** `MIN_CLIENTS` (5) is the named minimum sample.
  Every median is `null` below it; counts are always present. A screen says
  "not enough data yet", never a number built on two people.
- **Performed sets only**, through `isPerformedLog()` — the same rule as every
  other aggregate (`src/lib/set-outcome.ts`).
- **Never a client row.** The document is readable by any signed-in trainer;
  clients are studio-scoped. "This client vs everyone" is the client's own
  `machineStats` (already on the profile) against the distribution here.
- **Settings are normalised** so the old label-keyed snapshots (`"Chest Pad"`)
  and the newer slug-keyed ones (`chest-pad`) count together, `"Seat 6"`
  under `seat` counts as `6`, and a number is one value however it was typed
  (`2.`, `2.0` and `02` are all `2`; `3.50` is `3_5`). The **latest** snapshot
  per client in the window is the one that counts — a client who moved from 5
  to 6 is a 6.
- **One range query.** `exerciseLogs.createdAt >= now − 90 days`, oldest
  first. A log stamped with a string date (one old writer did that) is simply
  outside the window; nothing is guessed.
- **A machine with no sets this window AND no fit block loses its document**,
  so a stale trend never outlives its window.

## Running it

```
npx tsx scripts/run-machine-trends.ts             # dry run — reads and prints, writes nothing
npx tsx scripts/run-machine-trends.ts --commit    # writes the documents
npx tsx scripts/run-machine-trends.ts --days 30
```

Needs `service-account.json` in the project folder. On Render the job is the
service still named `journey-cron-leaderboards` (a renamed blueprint service
is a new service — see `render.yaml`).
