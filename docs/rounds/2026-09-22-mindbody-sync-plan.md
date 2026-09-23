# Getting every client synced — the plan for beta

*Sep 22 2026. A proposal, not code. One piece of it needs AJ's explicit OK
before anyone writes a line, because it is inside the Mindbody integration.*

---

## Why this is the beta blocker

AJ, Sep 22: *"we need to make sure that all studios do have their clients set up
and they are syncing correctly — a client needs to have its number of visits and
Mindbody data pulling as well as the booked sessions. That is something we need
to figure out before we can launch into beta."*

Beta is **Nov 1** for the corporate locations and **Jan 1** for the first
franchises. Everything else on the roadmap can slip. This can't.

### The correction that produced this document

On Sep 22 I told AJ that Mindbody's lifetime visit count arrives free on every
schedule pull, and built the "is this client new" gate on it. **That was wrong in
practice.** The code path exists — `src/lib/mindbody-api-sync.ts:181` and
`:864-871` read `appt.ClientsNumberOfVisitsAtSite` and write it to the client —
but AJ reports the number only appears **after** a profile is synced by hand.

The warning was sitting three lines above the code I read
(`src/lib/mindbody-pass.ts:4-10`): those fields *"appear on CLASS booking
events"*, and Max Strength books 1:1 appointments. I read the code and didn't
weigh the comment.

**Consequence**: the coverage gate now on the `prior-history` branch is inert
until a client has been synced. It does no harm — an unsynced client reads "we
don't know", which is honest — but it does no work either. It comes alive the
moment sync happens, and correctly: because FileMaker was linked to Mindbody,
that visit count is accurate.

**Open diagnostic** (30 seconds, and it shapes Piece 2): does the *appointments*
REST response carry `ClientsNumberOfVisitsAtSite` at all? If it does and we're
dropping it, the steady state gets much cheaper. If it doesn't, Master Sync's
fifth call is the only source and the plan below stands as written.

---

## The numbers

Counted from the repo, or stated by AJ on Sep 22 — labelled either way.

| | |
| --- | --- |
| Master Sync, per client | **5 Mindbody calls** (counted: `server/mindbody-client.ts:315`) |
| Firestore cost, per client | **1–2 writes**, one document (counted) |
| Mindbody billing | free to **1,000 calls/day**, then about **a third of a cent** each (repo) |
| Locations, eventually | **~40** (AJ) |
| Clients, biggest studio | **~300 active** (AJ) |
| Sessions per studio per week | **100–200**, some over 200 (AJ) |
| A busy Monday | **60+ sessions**; a slow Wednesday, **4** (AJ) |
| Sessions behind each client | **10 to 200+** (AJ) |

### What that costs

**Onboarding one 300-client studio: 1,500 calls.** One studio alone exceeds a
day's free allowance.

**All forty locations, at ~150 clients average: roughly 30,000 calls.** Spread
across nights, free. Done impatiently in one run, **about $100, once.**

**Steady state is close to free.** AJ's own design — deep-sync only today's and
tomorrow's clients, let anything further out just load the booking — combined
with a staleness check means most days sync a handful of new or newly-stale
clients. Twenty clients is a hundred calls.

**So money is not the constraint.** Rate limiting and correctness are.

---

## What the backfill has to work around (found Sep 22, after the floor was built)

**The mapping we want to reuse is good, and it is currently unreachable from a
script.**

`buildMasterSyncPatch` in `src/lib/mindbody-master-sync.ts` is the heart of
Master Sync: it decides every field written to a client, only writes what
actually changed, never lets a blank from Mindbody blank a field, and it is
covered by **32 existing tests with 107 assertions** that call it directly. It
is exactly what a backfill should use, and duplicating it would put the same
logic in two places - which is the drift that produced the whole Sep 21 audit.

But that module imports `firebase/firestore` and `../firebase` at the top, and
it calls `buildCommercialWrites`, which does the same. A `scripts/` or
`server/` backfill runs on **firebase-admin**, so importing it would drag the
browser SDK and a second Firebase app into a Node process.

**So the first build step is an extraction, not the backfill itself**: move the
pure patch-building half into its own module with the timestamp constructor
injected, leaving `mindbody-master-sync.ts` importing and re-exporting it so
its own signature is unchanged. The 32 tests are the proof - they import
`buildMasterSyncPatch` by name, so if they still pass, the extraction is
faithful.

Two reasons it is not done yet: it is a multi-file refactor of the live sync
path (AJ pushed it to `master` on Sep 22, so it is running in the studios now),
and it is better done with him available than unattended.

## The one thing that has to exist first

**There is no retry, no backoff, no rate limiter and no 429 handling anywhere in
`server/mindbody-client.ts`.** `mindbodyGet` does one `fetch` and, on failure,
logs a warning and returns. A grep of that file for sleep, delay, throttle,
retry, backoff or 429 finds nothing but query parameters.

At today's volume — a trainer pressing Refresh — that is survivable. At 1,500
calls for one studio it is not: one 429 mid-run and the rest of that client's
data silently doesn't arrive, and nothing tells anyone.

What it needs:

- **Retry with exponential backoff that honours `Retry-After`.** The repo has
  this shape already, but written against *Firestore* REST, not Mindbody —
  `scripts/migrate-canonical-client-ids.ts:106-135`, 8 retries, linear delay.
- **A token bucket**, so a burst can't outrun whatever Mindbody's real limit is.
- **A circuit breaker**: after N consecutive failures, stop and report rather
  than hammering.

**This is inside the Mindbody integration, so it needs AJ's explicit OK** —
`CLAUDE.md`: *"Don't change the Mindbody integration, Cloud Functions or the
Firestore structure without an explicit OK."* Nothing below can be built
safely first.

---

## Before any bulk write: the collision check

`scripts/check-mindbody-client-collisions.ts` has never been run.

The two Mindbody sites share one client-id namespace in `clients/`. If client
`100001234` exists at both sites as two different people, they already share one
Journey document — and a bulk sync would write one person's name, birthday,
contact details and waiver over the other's. The script's own header says
nothing in the app can tell.

It is read-only, costs about one Mindbody call per 20 clients — roughly 40 for
the whole roster — and answers the question in one run. **It is a prerequisite,
not a nice-to-have.**

---

## Piece 1 — steady state: today and tomorrow

AJ's design, and it's the right one.

**When a client appears on today's or tomorrow's schedule**, check
`client.mindbodyMasterSyncedAt`. If it's missing, or older than the staleness
window, sync them. Everything further out just loads the booking.

Three things already exist for this and none of them are being used for it:

- **`client.mindbodyMasterSyncedAt`** is written on every Master Sync and
  currently only feeds a "Synced 3 days ago" label on the profile. It is the
  ledger, already there.
- **`src/features/admin/syncPolicy.ts`** is a pure decision module with a
  **shared lease on the studio document**, so six iPads on one floor do the work
  once; a rule that a hidden tab never syncs; and exponential backoff so a
  misconfigured studio goes quiet. Its header was written against the Aug 30
  storm and says the naive `setInterval` version *"is the shape of the Aug 30
  quota storm, rebuilt on purpose."*
- **`src/features/renewals/job-plan.ts`** ranks every client by staleness — near
  a renewal and not pulled this week, never pulled and active, not pulled for a
  month, never pulled and quiet — sorts, takes the top N, and misses nobody
  across successive nights. That is a budgeted self-resuming sweep, already
  working, pointed at the wrong data.

**The staleness window.** AJ's instinct was 15–30 days, and he's right that
Mindbody data rarely changes. One refinement: **contracts do change — a renewal
is a contract change.** So copy the renewals model rather than a flat window:
near a renewal, pull weekly; quiet, pull monthly. That is `job-plan.ts` almost
verbatim.

**Budget it per studio per day** and report what it skipped, so a busy Monday
can't turn into a call storm.

---

## Piece 2 — onboarding a studio

A one-off per location, forty times over the next few months. This is a
`scripts/` tool, not a button.

`scripts/backfill-client-since.ts` is the house pattern and its safety model
should be copied close to verbatim:

> - Dry run by default. Nothing is written without `--commit`.
> - A client that already has the value is **skipped, always**.
> - `update()` with named fields, so nothing else on the document can be touched
>   by a bug in here.
> - A JSON report of every decision goes to `backups/` either way.
> - **Re-running is harmless.**

Plus, from `scripts/migrate-canonical-client-ids.ts:360-375`, a **resume log**: a
file of completed client ids, read once at the start, appended only *after* an
item fully succeeds, with per-item failures collected rather than aborting the
run. That is what "restartable without redoing work" means concretely.

Flags to match the house: `--commit`, `--studio`, `--limit`, `--key`.
Auth through `scripts/lib/admin.ts` — a service account, never the Firebase CLI
token, which is dead.

**Throttle it to fit the free allowance** unless AJ says to spend the hundred
dollars and get it over with. At 5 calls a client and a 1,000-call day, one
studio is two nights.

---

## The counting and verification tool — BUILT

`scripts/mindbody-sync-report.ts` (Sep 22). Read-only, no `--commit`, no write
path, and it imports nothing Mindbody so it cannot spend a call. Safe to run as
often as you like.

```
npx tsx scripts/mindbody-sync-report.ts
```

It answers the questions nobody has answered: how many clients there actually
are per studio, how many are linked to Mindbody, how many have ever been
synced and how stale they are, how many already carry a visit count, and **what
catching up would cost** in calls, in nights at the free allowance, and in
dollars if done in one go.

It also writes the proof artifact below to `backups/`.

## How we prove nobody was missed

The run's own report is not proof — it only knows about the clients it reached.

Prove it the other way round: **enumerate every client document, filter to those
with no `mindbodyMasterSyncedAt`, and print the list.** The deliverable is a
report of who has *not* been synced, and it must be empty.

That is what the report tool above writes, as `notSynced` in its JSON. It also
writes `notLinked` — clients a backfill will skip for good because they carry
no usable Mindbody id. Those need a person, not another run, and they would
otherwise sit in the "still to sync" number forever looking like a failure.

`mindbodyMasterSyncedAt` is an ISO string with no index, and Firestore cannot
query for an absent field — so that check is necessarily an
enumerate-and-filter, exactly as `backfill-client-since.ts:259` already does it.

---

## What the Aug 30 storm teaches this specific job

Three causes, all recorded, and each one maps onto a rule this job must obey:

- **A write inside a listener on the same collection**, so every write
  re-triggered the listener. → *Never sync from inside a schedule listener.*
- **When a fetch failed with a 429 the roster came back short, every schedule
  looked invalid, and it erased correct client ids** — a transient read failure
  turned into permanent data loss. → *A failed read means unknown, never empty.
  A sync that half-fails writes nothing.*
- **One aggregation query per snapshot** during a 432-appointment sync. → *No
  per-client queries in a loop; read once, build maps.*

And the one from the lease work: **one shared lease, not one timer per device.**

---

## Working back from Nov 1

| | |
| --- | --- |
| ~~Now~~ | ~~AJ's OK on the Mindbody client.~~ **DONE Sep 22** — the floor is built: token bucket, retry with `Retry-After`, per-site breaker, decisions in `src/lib/mindbody-throttle.ts` with 19 tests |
| **Now** | Run `scripts/mindbody-sync-report.ts` (built, read-only) and the collision check. Between them they replace every estimate in this document with a number |
| **Then** | Extract the pure patch builder, protected by its 32 existing tests. With AJ available — the sync path is live |
| **Next** | The onboarding script, proven on one studio with `--limit 25` first, AJ watching |
| **Then** | Steady state — today and tomorrow, on the existing lease |
| **Buffer** | The iPad walkthrough, and the live rules/indexes question that is still the roadmap's top item |

The two "now" items are independent of each other and neither depends on
anything else. They are the whole critical path.

---

## What I still don't know

- **Whether the appointments REST response carries the visit count at all.** It
  changes how much Piece 1 has to do. One look at a sync's response settles it.
- **Mindbody's real rate limits** — requests per second, burst, concurrency. The
  repo knows only the *billing* threshold. Nothing in it reads a rate-limit
  header. This is a question for Mindbody's developer portal or an account rep,
  and the floor should be built conservatively until it's answered.
*(One item moved out of this list on Sep 22 — see below.)*

---

## Answered since: `client/clients` does not truncate

This list used to carry a worry that a 50-id request might come back short
without saying so, which would have made a bulk backfill unsafe in a way no
report could catch.

AJ's first run of the collision check settled it, by failing:

```
Mindbody client/clients failed (Site 29068): 400
{"Error":{"Message":"ClientIds should not be more than 20.",
"Code":"InvalidParameter","ReasonCode":null}}
```

**Twenty is a hard ceiling, and going over it is refused outright rather than
quietly trimmed.** That is the good outcome: a short answer can never be
mistaken for a complete one on this endpoint, so the backfill's "who is still
unsynced" proof stays trustworthy.

It also explains why that script had never run — it asked for 50. Fixed on the
branch. The live schedule pull in `server.ts:676` already used 20 and was never
affected.
