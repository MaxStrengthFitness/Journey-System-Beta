# Operations → Team → This week, and the huddle

The redesign's Operations room, phase 6 (Sep 28 2026). The round is
`docs/rounds/2026-09-28-operations.md`; the blueprint is the Operations room's
★ pick, "Brief + Journey", which AJ took with every default.

## What is here

| File | What it decides |
| --- | --- |
| `TeamWeekPage.tsx` | The page: On today (a card per trainer, in the order their day starts), Off today (everyone else who works here, in name order), and Leaders only |
| `team-week.ts` | What a card says: who is on today and their hours, last week's logging, their usual clients who are drifting or at risk, and what is worth recognising |
| `useKudosThisWeek.ts` | The kudos the team gave each person in the last seven days: Relay's own roll-up, from the same reads as My Studio → Team |
| `renewal-counts.ts` | The leaders-only table: renewal points and how many were kept, by trainer, and the chance check |
| `huddle-memory.ts` | What Recognise put on today's huddle: this iPad's memory, per studio and studio day, forgotten at sign-out |
| `huddle-agenda.ts` | The huddle's five items, from the brief's own lines |
| `HuddleSheet.tsx` | Huddle mode, full screen, opened by Today's "Start huddle"; `BriefHuddle` adds what Team recognised and what the bell is showing |

## The decisions

- **Never a ranking.** Cards run in today's schedule order (then name); the
  off-today cards and the renewal table run in name order. No colour on a
  person's number, no "best", no "behind". Recognition, never ranking
  (the Relay round) holds here as it does on My Studio → Team.
- **Last week is done-means-logged** (`week/review.ts` `teamWeek`, the same
  numbers the Monday review's team line shows). A session nobody logged is
  "not logged yet", by name, never "didn't happen".
- **Their clients** are the usual clients last night's record names the
  trainer for (`renewal.primaryTrainerId`, the Journey's `usual`). While the
  Journey is being read or the nightly record is stale, the card says it
  can't tell, never "none".
- **Recognise sends nothing and writes nothing.** It puts the card's line on
  today's huddle in this iPad's memory. Kudos stay Relay's: the card shows
  the number the team gave (the existing kudos); it never sends one, because
  a kudos belongs to something a teammate closed and rings their bell.
- **Leaders only** shows to whoever `canManageRenewals` says may see
  per-trainer rates — studio leaders, head trainers (AJ's question 8: they
  count as leaders), studio owners, franchise owners and administrators.
  Counts under 10 renewal points, a rate from 10.
- **The chance check** takes the studio's own share kept this quarter as what
  chance gives anybody, and works out the 2.5th to 97.5th percentile of a
  binomial for each trainer's number, exactly. It needs 10 renewal points
  across the studio, and nobody is called out below 5 (the Outcomes panel's
  least for a line about one trainer). "How we check" says it in words, with
  the trainer who has the most renewal points as the example.
- **The huddle** is five items a leader points at: a concern and a win, who
  to catch today, the floor, recognition, announcements. Every line is one
  the brief already says, so the two never disagree. Covered marks last as
  long as the huddle is open. It is a Sheet run the full width, so it pays
  the status bar and home indicator itself (the Home Screen app's rule).

## Your notes and Note for our 1:1 (notes round, Oct 3 2026)

Built: `LeaderNotes.tsx` over `leader-notes.ts`. On each card, for a leader,
**Your notes** says how many Team member notes the leader has about that
person in their own Journal and when the newest was (one read of their own
notes, the Journal's own query), and **Note for our 1:1** writes one more
there (What happened · What I'll do). It is the Journal's Team member note,
so the two are never two stores; private to the leader, never shown to the
person, nothing sent. Whether a studio's leaders should share these is AJ's
question (the round document, `docs/rounds/2026-10-03-client-notes.md`).

## Not built, and why

- **Who moved toward steady** on the Monday review and the huddle's
  "yesterday" in the strict sense: both need yesterday's states, which
  Journey doesn't keep until the nightly job writes states (not approved).
