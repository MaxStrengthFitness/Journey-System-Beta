# 19 September 2026 — master takes the trim, and three items off the audit

Branch: `master`. Four commits. **Rules changed; a rules deploy is needed.**

This round has two halves. The first is a merge AJ asked for mid-session: the
beta-prep rule ("nothing goes to master") is over, and the 24-commit trim
branch comes in on top of My Studio and Operations. The second is three items
from the project-history audit, in the order AJ listed them.

---

## Why the rule changed

From 17 September, the cleanup, the polish, Demo Mode and the tutorials were
all meant to land on one long-lived `beta-prep` branch while `master` stayed at
what was live. On 19 September AJ called it:

> "We're actually going to ignore our beta prep rule and we're going to get
> everything pushed into master."

and, on the demo branch:

> "We have a demo mode set up to start being constructed it's a couple commits
> behind … I'm OK just to kind of get rid of it … but I want to go ahead and
> to start demo mode out once we have a couple more things factored in."

So: everything to `master`, and `demo-mode-foundation` retired. Note what that
restores — **every push to `master` deploys to trainers**, with no staging
step. The deploy order in `CLAUDE.md` is not optional any more.

`demo-mode-foundation` was 259 commits behind `master` with 10 of its own
(phases 1–9 plus the admin-overhaul prep). Rebasing 259 commits of drift for a
foundation AJ intends to redesign is work with no payoff, so the branch is
tagged `archive/demo-mode-foundation` and deleted. `git show
archive/demo-mode-foundation` still reads every phase — phase 2's demo-mode
module and phase 7's rules clause are the two worth rereading when Demo Mode
is rebuilt.

## The merge

`operations-round` fast-forwarded into `master`: 14 commits, no conflicts.
`beta-prep` then merged on top with **29 conflicts**, which is fewer than the
329-file diff suggested — git tracked the folder renames.

**One rule settled almost all of them: where the Operations round DELETED a
file that beta-prep only MOVED, deletion wins.** `FranchiseDashboardView`,
`FranchiseTeamManagement`, the Exports tab's `useLegacyImport` and the
`features/admin`, `features/admin-data` and `features/planner` barrels are
gone for good; nothing imports any of them.

Where master had newer content on an old path, the content stayed and the path
moved: the Operations shell, My Studio, the Hours and machine-fit tabs, the
prior-history state on `ClientProfileView`, every `session-draft` import. Where
master had only carried dead weight, beta-prep's trim won: four `useState`
declarations on `ClientProfileView` that nothing read, the React namespace
imports, `onSeedDemoClient`.

`profile-nav.test.ts` kept both sides' tests — master's `takeStoredLocation`
handoff tests and beta-prep's `openProfileAt` test cover different functions.

### The traps

`CLAUDE.md` had grown three rounds of traps back into it (machine fit, the
fluidity audit, My Studio, Operations) while beta-prep was busy moving them
out to `docs/KNOWN-TRAPS.md`. Taking beta-prep's pointer table and throwing
those away would have lost the newest scar tissue, so they moved instead —
word for word, into one new `docs/KNOWN-TRAPS.md` section, *Rounds since the
trim*. `CLAUDE.md` is back at ~14 KB.

### What the merge broke, and how we know

The PC cannot run `vitest` (no Linux rolldown binding in its `node_modules`),
so the whole thing was verified in a clean clone in the cloud container.
Straight after the merge: **24 typecheck errors against a baseline of 11**, and
one red test. The 13 that mattered:

- **The Routine Builder barrel had closed four exports** the trim thought were
  private — `CoverageStrip`, `MachinePicker`, `SequenceMachineRow` and
  `analyzeRoutine`. "Log past session" and the session pop-up both render all
  four. This is the merge's worst near-miss: a white screen on two dialogs
  that a clean typecheck alone would have shipped.
- **`ClientProfileView` was calling `setSessionNotes`** in the fluidity round's
  client-change reset, for state the trim had deleted.
- **`WorkoutTrackerView` referenced `clientNameDisplay`**, which the trim had
  renamed away; it now uses `clientFirstName(selectedClient)`, as the rest of
  that screen does.
- Four import paths left behind by the folder moves.

The red test was the palette ratchet: 260 non-theme-aware utilities against a
budget of 258, because `SessionFlagsSheet` (fluidity round, Sep 17–18) landed
after beta-prep set that budget. Rather than raise it, the sheet was fixed: the
scrim is `bg-foreground/20` and the alert icon has a `dark:` variant. **Still
owed:** its rose and amber tints belong on the equipment tokens rather than
Tailwind palette colours — one for the polish step.

After the fixes: typecheck **11** (baseline), suite **3,377 passing in 222
files**, one skipped, production build clean.

---

## A13 — the endpoints nothing calls

Five routes, confirmed dead by the grep sweep and by the archaeology reports
before it:

| Route | What it was |
| --- | --- |
| `/api/gemini/executionGuide` | AI Studio-era coaching-cue generator |
| `/api/gemini/clinicalStrategy` | AI Studio-era contraindication adviser |
| `/api/gemini/machineSetup` | AI Studio-era set-up wizard |
| `/api/parse-ical` | the iCal schedule import, replaced by Mindbody |
| `/api/sync-calendar` | the same, per trainer |

`server/gemini.ts` went from 768 lines to 313: three system prompts, three
response schemas, three result types and three `generate*` functions, roughly
16 KB of prompt text shipped to the server every deploy and never sent to a
model. It also carried its **own copy** of `ValidationLog`, `ValidationSession`
and `sanitizeImportedSessions`, duplicating the live ones in
`src/services/geminiService.ts` and imported by nothing — that went too.

`node-ical` comes out of `package.json`. `axios` stays; `scripts/` still uses
it.

**Untouched: `/api/gemini/processChart` and `/api/gemini/extractSettings`**,
the two image endpoints the legacy chart importer calls. See the diagnosis
below.

## The trainer PIN, finally

Added 2 June 2026, removed 3 June. What survived its own removal for three and
a half months: `hashPin` and `comparePin` with no callers, a **Force PIN
Reset** switch writing `requiresPinReset` that nothing read, three fields on
three type shapes, and a rules branch letting a trainer clear a flag nobody
set.

> "trainers do not need a pin, their device lock is enough" — AJ, Sep 19

There was a live bug hiding in it. **Both sign-in paths in `AppContent`
authenticated on `!hasPin`**, so a trainer whose document still carried a stale
`pin` or `pinHash` was set unauthenticated — with no PIN screen left in the app
to satisfy it. Choosing a studio now completes the sign-in outright.

Kept on purpose: `isValidTrainer`'s `!('pinHash' in data)` in
`firestore.rules`, now with a comment saying why. It refuses a field that no
longer exists anywhere, which is strictly safer than dropping the check, and
its test stays green.

**Rules changed.** The change only REMOVES a permission, so the rules can be
deployed after the app without a gap.

## Machine trends — the screen the weekly job never had

Since the cost round (16 September) `server/machine-trends-job.ts` has written
`machineTrends/{machineId}` every Sunday and **nothing in the app displayed
it**. `MachineLeaderboardDashboard`, the 486-line corpse it replaced, was
already deleted by the trim.

The brief is AJ's, from the project-history audit:

> "there is still a form of the leaderboard, its when trainers can view
> machines and what clients are at for each setting, i would also like to see
> that clients performance or strength increases in relation to their settings
> comparatively to other clients"

**Where it lives:** `Learning → Catalog → a machine → How it's used`, a
foldable on the machine's own page. A trainer asking "what is everyone set to
on this thing" is standing at the thing.

**What it says:** the window's clients, sets and sessions; the load
distribution as quartiles in a sentence; a table per setting — value, clients,
sets, median best, with a bar showing each value's share of the floor; and the
same by height.

**What it will not say.** It names nobody, and it cannot: `machineTrends/*` is
readable by any signed-in trainer, clients are studio-scoped, and the document
holds counts and medians with no client rows at all. It is not a ranking
either — values are ordered by how many people use them, which describes the
floor rather than scoring anyone. Below `MIN_CLIENTS` (5) the job writes a null
median and the panel prints "fewer than 5" rather than a number.

**Three answers, not two.** `presentMachineTrends` keeps "we could not look"
(`unreadable`), "nobody trained here" (`none`) and "too few to say"
(`thin`) apart all the way to the words on the page. A careless screen collapses
the first two into an empty state, which is the "unknown is never empty" rule
being broken quietly.

**Cost:** one document read per machine per app session, through the same
module-level cache the Settings card uses (`useMachineTrend.ts`). The panel is
folded **closed** by default and the read is gated on it being open, so a
trainer who never asks never pays.

The per-studio cut is deliberately not shown. The document carries
`studios[]`, but a studio-vs-studio table outside the Network tab is the
ranking the house rules keep out of a studio's own screens.

---

## Needs

1. `npm run test:rules` **on the PC** — the container cannot reach the
   emulator jar's host, so AJ's run is the one that counts.
2. `firebase deploy --only firestore:rules` (removes a permission; safe after
   the app).
3. `git push origin master` — **this deploys to trainers.**

No index deploy. No Functions deploy. No script run.

## Still open

- The legacy chart importer's rebuild — the diagnosis is in this session's
  notes and in the project timeline document. Short version: nine Gemini calls
  for an eight-page chart, every image uploaded twice, a hardcoded 20-machine
  dictionary that cannot see a studio's own machines, silent dropping of
  unmatched rows, fabricated future dates, a non-idempotent commit, and no
  `recordImportedSessions` call at all. It is a round of its own.
- `SessionFlagsSheet`'s rose and amber tints onto the equipment tokens.
- The Machine Trends panel on Programming → Setup, beside a suggestion.
