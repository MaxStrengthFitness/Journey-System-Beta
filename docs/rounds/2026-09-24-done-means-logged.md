# Done means logged in Journey — Sep 24 2026

Branch `claude/booking-completed-by-journey`, off `master` at `810a41b`. One
commit per phase, each typechecked on its own. Not pushed; not deployed.
Phases 6 and 7 (the Hub card, below) are on `claude/gallant-ritchie-6d6297`,
which carries the first five phases unchanged and builds on them.

> "We don't currently have the resources to build a two-way webhook with
> Mindbody to pull in 'Completed' statuses. Manual marking in Mindbody is fine.
> For the Operations Overview, let's change the logic: if a session is
> successfully logged in Journey for a client on a given day, consider it
> 'Completed' for operational tracking." — AJ

## What was wrong (checked in the code before anything changed)

A booking in Firestore is never "Completed" and never "No-Show". The schedule
pull (`src/lib/mindbody-api-sync.ts`) writes a booking as Scheduled or
Cancelled and nothing else; the webhook does the same; End Session writes the
session, not the booking. So every screen that asked the booking alone was
wrong:

- **Overview:** Done and No-shows were always 0, every finished booking was
  "never logged", and Needs you could never reach zero.
- **Team this week:** every trainer's finished sessions showed as unlogged.
- **The trainer page's Upcoming:** listed yesterday's and this morning's
  clients (the app holds the schedule from yesterday on).
- **The attendance watch:** counted a no-show as a visit.
- **The Hub card** went grey when its start time passed, and a grey card
  hides the red priority-note flag, the Pulse flag and the clinical dot. So a
  trainer a few minutes late lost the flags while walking up to read them (the
  Sep 20 audit's H2). Fixed in phase 6; see "The Hub card" below.

## The rule — one function

`src/lib/booking-state.ts` decides what happened to a booking, on the studio's
Eastern day:

1. Cancelled in Mindbody → **cancelled**.
2. A completed Journey session for the same client (matched by the client's
   record id, never by name) on the same day → **completed**.
3. Mindbody marked it Completed or No-Show by hand → that.
4. Otherwise the clock: not started → upcoming; in its slot → in progress;
   slot over (five minutes' slack) → **never logged**.
5. If Journey's sessions could not be read, a finished slot is **unknown** —
   never "never logged".

Every screen that reads a booking's outcome for operations now asks it:

| Screen | What it reads | What changed |
| --- | --- | --- |
| Overview tiles and the chase list | today's sessions at the studio, live (`useTodaySessions`) | Done counts logged sessions; the chase list is only who has nothing logged; a failed read shows "—" and says "missing, not zero" |
| Team this week | the same read | "Unlogged today" is the same rule; the column hides when the read failed |
| Trainer page → Upcoming | the app's live 24-hour session stream (already there) | drops finished bookings and ones whose client was already logged today; keeps the one in its slot now |
| Attendance watch (the nightly renewals job, and the live renewal card) | each client's own sessions (already read) | a booking is a visit when logged — see the migration rule below |
| The Hub card (phase 6) | the app's live 24-hour session stream (already there) | stays live, flags and all, until the booking is done or its slot is over; see below |

No new query shape: the Overview's read uses the index the app's own session
stream already uses. **No new index, no rules change, nothing written.**

## The migration rule on the attendance watch

Before a studio moves onto Journey, its sessions are logged in FileMaker, and
Journey cannot see them. If an unlogged booking stopped counting as a visit
there, every client at a studio that has not switched over would look as if
they had stopped coming. So:

- **Before the studio's Journey cutover date, or with none set:** an unlogged
  past booking is still a visit, as it always was.
- **From the cutover on:** Journey is the record. A booking nobody logged is
  neither a visit nor a miss. It is on the Overview's chase list; once someone
  logs it, it counts from the next nightly run.

No studio has a cutover date yet, so the watch reads exactly as before until
one is set. The cutover field (My Studio → Studio) now says this in its hint.

## The Hub card (phase 6)

The trainer's floor, not Operations, so it was asked separately. The card
reads the same rule through `src/lib/hub-card-state.ts`, which only decides
how the floor draws each state:

| The booking | The card |
| --- | --- |
| Ahead, or in its slot with nothing finished | **Live**, with every flag. This is the fix: a trainer running late keeps the red flag, the Pulse flag and the clinical dot |
| A Journey session open for the client that day | **In session** (tinted, pulsing), past the slot too, because a session left open is still going |
| A Journey session completed for the client that day | **Faded**, flags hidden: done. It fades the moment End Session is pressed, even inside the slot |
| Slot over (five minutes' slack), nothing logged | **Faded, with a quiet "Not logged"** in the New-to-Journey tone |
| Slot over, and the sessions could not be read | Faded, and says nothing. A failed read is unknown, never "not logged" |
| A card with no profile yet | As before: the cloud mark says why. Never "Not logged" |

AJ's two answers (Sep 24):

- **A finished slot nobody logged fades with "Not logged"**, rather than
  fading silently. A grey card with no word would read as done when it is
  not. The chip is the quietest tone on the card and is faded with it: it
  tells whoever forgot End Session, and nobody else. It is not a new loud
  state.
- **A card never fades as done before its own start.** A client booked twice
  in a day (training at nine, an InBody scan at four) reads both bookings done
  once the nine o'clock is logged. That is right for Operations, but on the
  floor it would grey the four o'clock card and hide its flags before she
  arrives. The later card stays live until it starts; after that the per-day
  rule stands. Only the Hub does this. Operations and the attendance watch
  keep the rule as it is.

Two smaller fixes came with it. The card found "today's" workout session
with the iPad's `toDateString()`, which is the wrong day on an iPad set to
another zone, and compared it with TODAY rather than the booking's day, so a
session this morning would mark tomorrow's card as in session. It now looks
the session up on the booking's studio day, from one index built each time
the stream updates, not per card. And `useSessions` now reports whether its
stream has answered (`sessionsKnown`), so "Not logged" waits for a real
answer.

## Decisions I made — say if any is wrong

- **Per client, per day.** A client booked twice with one session logged reads
  both bookings done. That is how you worded it, and it is the simplest rule
  that is never wrong about whether they came in.
- **A logged session beats a Mindbody No-Show.** The session is proof they
  trained.
- **A cancelled booking stays cancelled**, even if the client trained later
  that day. The Changes list still needs it.
- **A session left open does not count.** If End Session was never pressed,
  the booking is chased once its slot is over. That is worth a leader's walk
  over.
- **An unlogged booking after the cutover is not a no-show** on the attendance
  watch. Calling it one would put a trainer's forgotten log into the
  "cancellations or no-shows" sentence.
- **The Overview reads today's sessions live**, so Done moves the moment a
  trainer presses End Session instead of the next morning.

## Left alone

- **Mindbody, the webhook, Cloud Functions, the Firestore structure.**
  Untouched. Pulling Mindbody's own "Completed" status is a
  Mindbody-integration change and needs your OK.
- **What feeds the Hub's red priority flag.** Phase 6 keeps the flag on
  screen, but nothing in the app writes the fields it reads
  (`client.priorityNote`, `client.hasPriorityNote`, a High-priority
  `client.events` entry), so it lights only for records that already carried
  a legacy `priorityNote`. A Critical note in Notes does not mark the card.
  That is question 12 of the Sep 20 audit
  (`2026-09-20-claude-experiment-phase1.md`), still waiting on AJ.
- `trainerLanes` and `loadByDay` in `overview/floor.ts` still read the booking
  alone, but no screen uses them. (Deleted at the landing, Sep 24 2026, with
  their tests.)
- **The weekly coach report cron** (`server/cron-weekly-coach-report.ts`)
  counts `status === "Completed"` / `"No-Show"` from `schedules`, which the
  sync never writes, so it would report zero completed sessions for every
  coach. It is commented out in `render.yaml`, so nothing ships wrong today.
  Before it is switched on it must read outcomes through `booking-state.ts`
  (one `sessions` read per week by `hostedAtStudioId`, then
  `loggedSessions` / `bookingState`). Named at the landing; its header says
  so too.

## Verification (AJ's PC, in a worktree)

- `npx tsc --noEmit`: **10** errors, the baseline.
- `TZ=America/New_York npx vitest run --dir src`: **3,771 passing in 251
  files**. 27 new tests: the rule itself, the tiles, the chase list, Team, the
  attendance migration rule, and two render tests (the Overview, including a
  failed read, and the trainer page's Upcoming).
- `npx vite build`: clean. The renewals job's bundle builds with the new
  imports.
- Not yet seen on a real iPad. Round 16 of `docs/ops/TESTING-CHECKLIST.md`
  is the walkthrough.

After phase 6 (the Hub card), same PC and worktree:

- `npx tsc --noEmit`: **10**, the baseline.
- `TZ=America/New_York npx vitest run --dir src`: **3,798 passing in 253
  files**. 27 new: 15 for `hub-card-state` and 12 in
  `ScheduleBlock.render.test.tsx`, which mounts the real card over every
  state. Run against the old card, five of those twelve fail, among them the
  late trainer's.
- `npx vite build`: clean.
- The states were looked at in a throwaway page in the browser pane, light
  and dark, in a 150px column (the Hub's narrowest is 144px). "Not logged"
  is about 66px wide, so it fits with room to spare.
  Not yet seen on an iPad or on the live Hub.

## How to ship

Nothing to deploy to Firebase: no index, no rules. Merging to `master` and
pushing deploys the app. The nightly renewals job builds from `master` too
(`render.yaml`, `journey-cron-renewals`), so it picks up the attendance rule
on its next deploy. Ask before pushing — every push to `master` goes live.
