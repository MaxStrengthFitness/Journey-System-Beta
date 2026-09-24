# A Critical note marks the Hub card — Sep 24 2026

Branch `claude/brave-engelbart-790628`, off `master` at `70aae66`, with
done-means-logged (`claude/gallant-ritchie-6d6297`, phases 1–7) merged in first,
because this round builds on its Hub card. One commit per phase after the
merge, each typechecked on its own. Not pushed; not deployed.

This answers **question 12 of the Sep 20 audit**
(`2026-09-20-claude-experiment-phase1.md`; the finding is C1 in
`claude-experiment/03-client-profile.md`, and question 6 of the Sep 21 pre-beta
audit asked it again).

## What was wrong (checked in the code before anything changed)

The Hub card's red triangle came from `getClientAlertState()`
(`src/lib/client-alerts.ts`), which read three things: `client.priorityNote`,
`client.hasPriorityNote`, and a High-priority entry in `client.events[]`.
**Nothing in `src/`, `server/`, `scripts/` or `functions/src/` writes any of
them.** So the triangle lit only for a record that already carried a legacy
priority note. A Critical note written in Journey (Notes, the header's Note
button, the session's note sheet, the closing note) never reached the Hub.

The Loudness control had promised since the reporting round (Sep 16) that
Critical "marks the Hub card". The Sep 21 audit corrected the sentence in
`src/types/journal.ts` to match the code, but the comment in
`src/features/rating/Loudness.tsx` still said it, and so does the
reporting-round document.

## What AJ decided

Asked on Sep 24, with a recommendation on each:

| Question | AJ's answer |
| --- | --- |
| How should the card show it? | **The red triangle only.** The left edge keeps its current meanings (a session, a milestone, over). |
| Where should the Hub find out? | **Read the day's notes**, not a count kept on the client record. |
| Should "No need to remind me" quieten the Hub for that trainer? | **No — red for everyone, always**, like the critical line at the top of the record. |

## How it works

**One read for the day.** `src/hooks/useHubCriticalNotes.ts` reads
`journalEntries` where `clientId` is one of the clients booked on the day the
Hub shows and `importance` is `critical`, thirty clients to a query (the most
Firestore allows in one `in`). A studio day of sixty bookings is two
listeners, never one per card. They are live, so a note written or closed at
9:05 reaches the 9:30 card without a reload.

**By client, not by studio.** Writers stamp different studios on a note: one
written in a session carries the studio the trainer is standing in, one written
on the profile carries the client's home studio. A query on the Hub's studio
would miss a visiting client's note. Reading by client is how the journal
already reads notes (`useClientJournal`).

**Which notes light a card.** `src/lib/hub-critical-notes.ts`
(`criticalNotesOn`) uses the briefing's own rule, asked about the **booking's**
studio day rather than today:

- a thread's **root** at Critical (an update is always written plain, so it
  never lights anything on its own);
- that `mattersOn` the booking's day (`client-notes/mattering.ts`): a closed or
  archived thread lights nothing, nor does a window that ran out or has not
  opened yet. A one-day note lights only on its day (or its anniversary).

So a note that starts on Friday marks Friday's card and not Thursday's, and
the trainer can see that while looking ahead on Thursday.

**What the card does.** `getClientAlertState(client, liveCritical)` lights the
triangle for a live Critical note or a legacy priority note. Its label and the
card's tooltip carry every live note in whole sentences, newest first: "Critical:
Left shoulder: no overhead pressing until the MRI". The triangle follows the
card's state from done-means-logged: it stays while the trainer is running late
and goes once the session is logged. The left edge is never turned red by a
note, a legacy priority note included — that edge used to go red for one.

**Unknown is not empty.** While a group of clients has not answered, after it
failed, or when it hit its guard rail (300 notes), its silent clients are
unknown (`null`), and the card claims nothing. When any group failed or was cut
short, the Hub says so once, under the day strip: *"Couldn't check every
client's critical notes, so a card without the red triangle may still have one.
Each client's briefing still shows them."* A group that fails after answering
keeps the notes it had read, so a triangle already lit does not go out because
the network did.

**No new field, no index, no rules change, no Cloud Function.** Equality
filters alone (an `in` is a set of equalities) need no composite index, and
the rules let any signed-in trainer read `journalEntries`.

## Decisions I made — say if any is wrong

- **The day on screen, not the week.** The Hub reads the clients of the day it
  shows. Switching days opens a new read (the iPad's cache makes a day already
  visited quick). Reading the whole week up front would be four to seven
  listeners instead of one to three.
- **Critical only.** A Heads up does not mark the card; the promise was only
  ever made for Critical.
- **The legacy fields are still read.** A record imported with a
  `priorityNote` still lights the triangle, in the same place, with its own
  words after any Critical note's.
- **Closed notes count towards the guard rail.** The query cannot leave them
  out (a note that has never been closed has no `resolvedAt` at all, and
  Firestore will not match a missing field against null), so 300 per thirty
  clients leaves room for years of closed notes; past it, the Hub says so.

## Left alone

- **Firestore structure, rules, indexes, Cloud Functions, Mindbody.** Untouched.
- **The briefing, Notes and the critical line.** Unchanged — the Hub now uses
  the same rule they do.
- **Heads up on the Hub.** Not asked for.

## Verification (AJ's PC, in a worktree)

- `npx tsc --noEmit`: **4** errors after every phase — the baseline since the
  client codex's phase 8 (CLAUDE.md said 10; corrected in the merge commit).
- `TZ=America/New_York npx vitest run --dir src`: **4,904 passing in 309
  files** after the merge, **4,946 in 312** after phase 3 (42 new: 21 for the
  rule and the alert state, 11 for the read, 10 in
  `ScheduleBlock.render.test.tsx`). Run against the card as it was before
  phase 3, five of the ten new card cases fail — every case where the triangle
  should light, and the red edge.
- `npx vite build`: succeeds.
- The real `ScheduleBlock` was looked at in a throwaway page in the browser
  pane, light and dark, in a 160px cell: the triangle beside the name, the edge
  blue, a logged card faded without it, a closed note and an unknown read
  clear.
- Not yet seen on an iPad or on the live Hub. Round 16 of
  `docs/ops/TESTING-CHECKLIST.md` is the walkthrough.

## How to ship

Nothing to deploy to Firebase: no index, no rules. Merging this branch to
`master` also brings done-means-logged, which has not reached `master` yet.
Pushing `master` deploys the app. Ask before pushing, because every push to
`master` goes live.
