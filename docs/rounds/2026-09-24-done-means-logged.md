# Done means logged in Journey — Sep 24 2026

Branch `claude/booking-completed-by-journey`, off `master` at `810a41b`. One
commit per phase, each typechecked on its own. Not pushed; not deployed.

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
- **The Hub card** greys out when its start time passes. Not changed here —
  see "Left alone".

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
- **The Hub card.** It greys out the moment its start time passes and hides
  its priority-note flag while it is grey, even if the session has not
  started. That is the trainer's floor rather than Operations, so it was not
  in this change. Flagged as a separate task.
- `trainerLanes` and `loadByDay` in `overview/floor.ts` still read the booking
  alone, but no screen uses them.

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

## How to ship

Nothing to deploy to Firebase: no index, no rules. Merging to `master` and
pushing deploys the app. The nightly renewals job builds from `master` too
(`render.yaml`, `journey-cron-renewals`), so it picks up the attendance rule
on its next deploy. Ask before pushing — every push to `master` goes live.
