# The standing week

Round: voice review, Sep 27 2026. The round document is
`docs/rounds/2026-09-27-standing-week.md`.

Each trainer's **usual week at a studio**: the hours they work, and their
**regulars** — a client, a weekday and a time ("Judy, Monday 8:00"). The
trainer **proposes** it on My Profile. A studio leader **agrees** it on My
Studio → Team. Journey then reads the coming week's Mindbody bookings
against every agreed week and says, in sentences, where they differ: the
free slots a leader can fill, the regulars booked somewhere else, and the
slots someone else is booked in.

AJ: *"Journey acting on it as a read-only verification that respects that
existing system."* The front desk books the regulars in Mindbody as
recurring appointments, exactly as before. **Nothing here writes to
Mindbody** — no hold, no booking, no availability. Holds cost money, can
email a client, and would clash with the front desk.

---

## The files

| File | What it is |
| --- | --- |
| `week.ts` | The week: `WorkHours`, `Regular`, `StandingWeek`, the stored document, reading one safely (`normalizeWeek`), where a week stands (`weekStatus`: none · proposed · agreed · changed) and a week ready to write (`weekForWrite`) |
| `check.ts` | **The week check**: the next seven studio days' bookings against every AGREED week — as usual, moved, open, taken. Pure |
| `present.ts` | What the screens say: the clock choices, a week laid out Monday first, the status sentences, and what a proposal changes ("Moves Judy Smith from Monday at 8:00 AM to Tuesday at 9:30 AM.") |
| `team.ts` | Who Team lists, whose week is waiting, and whether the studio's bookings can be checked at all |
| `store.ts` | The three writes: `proposeWeek`, `agreeWeek`, `removeWeek` |
| `useStandingWeeks.ts` | The live reads: a studio's weeks (Team), one trainer's (My Profile) |
| `WeekEditor.tsx` | **The one editor**, day by day. The trainer proposes with it; a leader changes a proposal with it before agreeing |
| `MyStandingWeek.tsx` | My Profile → My standing week |
| `StandingWeeksPanel.tsx` | My Studio → Team → Standing weeks: the next seven days, then each person's week |

---

## Decisions

**Keyed by the Auth uid; `trainerId` beside it.** The document is
`studios/{studioId}/standingWeeks/{uid}`, because the rules pin a trainer's
own writes to the signed-in person (CLAUDE.md: use the Auth uid). A booking
carries the `trainers/{id}`, which differs on older accounts, so that is kept
as `trainerId` and the check matches on it. `team.ts` finds a week by either.

**A trainer proposes; only a leader agrees.** The rules let a trainer write
the proposal fields on their own document and nothing else, so a proposal
never agrees itself. The studio's leaders (the grant counts), franchise
owners and administrators agree, change and remove. Every stamp names the
person writing it and its time is the server's.

**Agreeing brings the proposal into line.** An agreement writes the week as
both `final` and `proposed`. So the trainer's next edit starts from the
agreed week, and a leader who changed something before agreeing isn't
reported as "a change since it was agreed".

**Only an AGREED week is checked.** A proposal says what a trainer would
like; the agreed week is what the studio runs on.

**"Can't tell" is never "open".** A failed or unfinished read, or a studio
whose Mindbody isn't linked (`bookingsKnown`), gives a sentence and no
findings. The Demo studio's week is seeded, so it is checked.

**What counts as a move is the Overview's rule.** A regular booked another
day, time or trainer in the same Monday–Sunday week is "moved"
(`admin/changes/changes.ts` reads a reschedule the same way), and the
trainer's own slot is then free.

**Whose booking it is.** The sync writes the trainer's id when it matched the
Mindbody staff member to a Journey trainer, and only the staff member's name
when it didn't. So an id decides when there is one, the name when there
isn't. A booking naming no staff member (the sync's "{studio} Rotation") may
keep a slot but never takes one. The client is matched by id when the sync
linked one, else by name.

**One booking keeps one slot.** The first pass keeps every slot booked as
usual. Only the bookings left over can make another slot "moved".

**By name, never ranked.** Team lists people alphabetically. Whose proposal
is waiting is a line above the list, not the order of the people in it. The
check never counts or compares trainers' gaps (recognition, never ranking).

**Every time is picked, never typed.** A quarter-hour clock from 5:00 AM to
9:45 PM, and an end that can only come after its start, so the editor can't
build a week the save would have to drop. A time already in a week that is
off the grid stays in the list. A day's first hours copy the day before, so
a Monday-to-Friday week is typed once.

---

## Not built (see the round document)

- Suggesting a trainer's regulars from six weeks of bookings (about 1,700
  reads a tap at a busy studio).
- An agreed slot with no booking shown on the Hub (the Hub's "open slots"
  were removed on Sep 6 as "a sales question"; waiting on AJ).
- More than seven days ahead: a two-week absence shows its second week when
  that week comes into the window.
