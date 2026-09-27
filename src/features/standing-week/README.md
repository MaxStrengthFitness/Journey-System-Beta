# The standing week

Round: voice review, Sep 27 2026. The round document is
`docs/rounds/2026-09-27-standing-week.md`. The follow-up the same day (AJ's
answers to the audit: offline, the check's claims, Away, colleagues, the
leave question, the rules) is under **Voice review follow-up** below. The
Openings round (`docs/rounds/2026-09-27-openings.md`, phase 9) gave a day
three blocks and changed the words: **Openings round** at the end.

Each trainer's **usual week at a studio**: when they usually take clients
(up to three **blocks** a day), and their
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
| `week.ts` | The week: `WorkHours` (one block), `Regular`, `StandingWeek`, the stored document, reading one safely (`normalizeWeek`), where a week stands (`weekStatus`: none · proposed · agreed · changed) and a week ready to write (`weekForWrite`). The limits the rules hold too: `MAX_RANGES_A_DAY` (3 blocks a day), `MAX_HOURS` (21 a week), `MAX_REGULARS`, `MAX_NOTE`, `MAX_AWAY`. The days away: `AwayRange`, `normalizeAway`, `upcomingAway`, `awayOn`, `awayForWrite` |
| `check.ts` | **The week check**: the next seven studio days' bookings against every AGREED week — as usual, moved, open, taken — and who is away (`awayThisWeek`, `awaySentence`). Pure |
| `present.ts` | What the screens say: the clock choices, a week laid out Monday first, the status sentences, the Review's line (`reviewSentence`, where `proposedBy` is read), what a proposal changes ("Moves Judy Smith from Monday at 8:00 AM to Tuesday at 9:30 AM."), the editor's words (`NO_BLOCKS`, `OUTSIDE_BLOCKS`, `BREAKS_LINE`, `addBlockLabel`, `blockName`, `blocksLabel`), a range away (`awayLabel`), and who may read a studio's weeks (`mayReadWeeks`) |
| `server-read.ts` | **An answer from the server, or "can't tell"**: `serverRead` turns a read's loading / failed / cache-only state and the browser's connection into ready · loading · failed · offline. Pure; `useServerWait.ts` is its clock and the online flag |
| `team.ts` | Who Team lists, whose week is waiting, and whether the studio's bookings can be checked at all |
| `store.ts` | The four writes: `proposeWeek`, `agreeWeek`, `setAway`, `removeWeek` |
| `useStandingWeeks.ts` | The live reads: a studio's weeks (Team), one trainer's (My Profile, a colleague's profile). The first answer must be the server's |
| `WeekEditor.tsx` | **The one editor**, day by day, up to three blocks a day. The trainer proposes with it; a leader changes a proposal with it before agreeing |
| `AwayEditor.tsx` | **Away**: the days a trainer is away, added and removed one range at a time. The trainer's on My Profile, a leader's in Team's Review |
| `MyStandingWeek.tsx` | My Profile → My standing week ("When I usually take clients" over the editor), with Away below it |
| `ColleagueStandingWeek.tsx` | A colleague's profile → Standing week: their agreed week and days away, read only. **Unreachable today**: another trainer's profile can't be opened in the app (the other profiles were trimmed to My Profile on Sep 26, and ClientsView's `onSelectTrainer` is never called). The Openings round shows colleagues' usual weeks inside Openings instead of reopening profiles; until then this card and its render test stand, unused |
| `StandingWeeksPanel.tsx` | My Studio → Team → Standing weeks: the next seven days (who is away, then what differs), then each person's standing week |

---

## Decisions

**Keyed by the Auth uid; `trainerId` beside it.** The document is
`studios/{studioId}/standingWeeks/{uid}`, because the rules pin a trainer's
own writes to the signed-in person (CLAUDE.md: use the Auth uid). A booking
carries the `trainers/{id}`, which differs on older accounts, so that is kept
as `trainerId` and the check matches on it. `team.ts` finds a week by either,
but never gives one listed person's own week to another person's row by its
trainer id (two rows would claim one document, and agreeing it from the wrong
row would point it at the wrong bookings). Once the week exists, a trainer's
own saves keep its stored `trainerId` (`MyStandingWeek`), because the rules
freeze it for them (D6); the leaders set it.

**A trainer proposes; only a leader agrees.** The rules let a trainer write
the proposal fields on their own document and nothing else, so a proposal
never agrees itself. The studio's leaders (the grant counts), franchise
owners and administrators agree, change and remove. Every stamp names the
person writing it and its time is the server's.

**Agreeing brings the proposal into line.** An agreement writes the week as
both `final` and `proposed`. So the trainer's next edit starts from the
agreed week, and a leader who changed something before agreeing isn't
reported as "a change since it was agreed".

**Only an AGREED week is checked, and only for someone who still works
here.** A proposal says what a trainer would like; the agreed week is what
the studio runs on. A week left behind by someone who left is listed so a
leader can remove it, but never checked — their old regulars would all read
as open slots. The week's bookings are read only when there is something to
check them against: an agreed week, at a studio whose Mindbody is linked.

**A review follows the trainer until the leader changes something.** If the
trainer proposes again while a leader has Review open, the untouched editor
shows the newer proposal, so a leader never agrees one that has since
changed; once the leader has edited it, their edits stay.

**"Can't tell" is never "open".** A failed or unfinished read, or a studio
whose Mindbody isn't linked (`bookingsKnown`), gives a sentence and no
findings. The Demo studio's week is seeded, so it is checked. An answer only
this iPad's cache gave is not a read either (see the follow-up, D1).

**A move is claimed only with proof.** The slot is "moved" when Mindbody
moved that very booking (`movedFromStart`), when she is booked at her time
with another trainer, or when her booking for it was cancelled (a stamped
cancellation) and a REAL rebook followed that Monday–Sunday week — one that
appeared with the cancellation and starts after it: `isRealRebook`
(`admin/changes/changes.ts`, the one rule Operations → Changes and the client
calendar read too; AJ, Sep 26 2026: "rebooked" only for a real rebook). Any
other booking that week proves nothing: a twice-a-week client's standing
Thursday was booked all along.
Without proof the slot is simply open; either way the trainer's slot is
free.

**Whose booking it is.** The sync and the webhook write the trainer's id
when they matched the Mindbody staff member to a Journey trainer AT THIS
STUDIO, and only the staff member's name when they didn't; the webhook also
keeps the Mindbody staff id on most rows it touches. In order: a "{studio}
Rotation" booking is nobody's in particular; else the booking's trainer id
decides; else a booking naming no staff member is nobody's either; else the
staff id, **only as a positive match** and only for a trainer whose staff id
is this studio's site's (`staffIdsAt`: their Mindbody record names the
site); else the name. Staff ids are numbered per site and a trainer holds
one, so a different staff id proves nothing: the booking may be theirs at a
studio on the other site, and the same number can be someone else there.
Only another trainer id proves a booking is someone else's. A booking that
is nobody's in particular may keep a slot but never takes one, and a name
that doesn't match proves nothing (D2). The client is matched by id when the
sync linked one, else by name.

**One booking, one claim.** The first pass keeps every slot booked as usual.
Only the bookings left over can make another slot "moved", and a rebook
named as one slot's move is never named for a second (D2).

**By name, never ranked.** Team lists people alphabetically. Whose proposal
is waiting is a line above the list, not the order of the people in it. The
check never counts or compares trainers' gaps (recognition, never ranking).

**Every time is picked, never typed.** A quarter-hour clock from 5:00 AM to
9:45 PM, and an end that can only come after its start, so the editor can't
build a week the save would have to drop. A time already in a week that is
off the grid stays in the list. A day's first block copies the day before,
so a Monday-to-Friday week is typed once; the second and third start an
hour after the day's latest block ends (the break left out).

---

## Voice review follow-up (Sep 27 2026)

AJ answered the audit and said "Go ahead". What changed, step by step:

**D1 — Offline is "can't tell", never "open".** Firestore keeps a persistent
cache here (`src/firebase.ts`), and a listener hands over what this iPad last
saw, flagged `fromCache`, before the server answers or while offline. The
bookings read used to report that as a finished read, so an iPad with no
connection listed every agreed slot the cache lacked as open, with a Free
slot badge. Now Team asks `useWeekSchedule` for `{ confirmed: true }` (an
opt-in: the Operations Overview reads exactly as before), which listens with
`includeMetadataChanges` — without it a listener is never told when the
server merely confirms the rows the cache held, and a wait would never end —
and `serverRead` says loading until the server has answered, and **offline**
("Can't tell: …") once the browser is offline or the server hasn't answered
in `SERVER_WAIT_MS` (15 s). The standing weeks themselves wait for the
server's FIRST answer the same way, so a cached empty list never reads as
"hasn't proposed" and Team lists nobody until the weeks are read; after
that the listener is in step with the server and a Wi-Fi blip doesn't take
an open review away. The bookings are held to the stricter rule (every
cache-only answer), because Mindbody changes them where this iPad can't see.

**D2 — The check claims only what it knows.** One rebook is named for one
slot only. A booking with no trainer id whose staff name differs from the
trainer's (Journey "Sam Lee", Mindbody "Samuel Lee": the sync had already
tried the exact name) keeps the regular's slot at her time instead of
calling the whole week moved. A Mindbody staff id counts only as proof that
a booking IS the trainer's, never that it isn't (see "Whose booking it is";
the review of the follow-up found that letting a different staff id decide
turned a webhook-written Rotation booking, and every booking of a trainer
who works on both Mindbody sites, into a move with a Free slot). Another
regular in their own slot at a shared time never "takes" the slot. **The
studio rotation** (AJ): on rotation days a client books "{studio} Rotation"
and that day's trainer later moves it to themselves in Mindbody; a
regular's Rotation booking at her time is as usual, never moved, taken or a
Free slot, whether the pull wrote it (the name only) or the webhook did (the
rotation's own staff id beside the name). A slot earlier today is simply
open (AJ: "Unbooked slots are just open").

**D3 — Away.** AJ: "if someone has a vacation then it should block it out."
`away: [{ id, from, to, note }]` on the week's document, studio days, both
ends included. It needs no agreement: the trainer sets it on My Profile, a
leader in Team's Review, and a trainer with no proposal can still set it.
Each range saves as it is added or removed; only today's and later ones are
shown, and past ones drop off at the next save. The check skips that
trainer's slots on those days (no open, moved or taken, no Free slot, not
counted among the slots checked; `awaySlots` counts them, so when every
agreed slot falls on days away Team says "Nothing else to check", never "No
agreed regular falls in the next seven days") and Team says once "Sam is
away Mon, Sep 28 – Wed, Sep 30." Journey's own: no Mindbody call. A first
day in the past is allowed (a vacation already under way reads "away until
..."); the last day must be today or later. **Six ranges at most**: the
rules check each range (a rule can't loop, so each place is written out),
and a request may evaluate only 1,000 expressions — at ten ranges a
leader's write already ran out in the emulator. The rules tests hold the
fullest real writes to it: a leader's agreement and a trainer's proposal on
a week that already holds six ranges and a full proposed and agreed week
(21 blocks since the Openings round — it was 14 — and 80 regulars), for the
cheapest leader (a studio owner at home) and
the costlier ones measured in the final review: a trainer with the grant, a
head trainer who runs the studio through `ownedStudioIds`, a studio leader
based elsewhere with the grant, and a leader agreeing their own week. If that
test ever fails, lower `MAX_AWAY` in
`week.ts` and the six in `standingWeekAwayValid` together.

Offline, a save is on the iPad at once and reaches the database when the
connection is back, but its promise waits for the database. So the editor
waits only a moment (the session record's `settleOrQueue`) and then closes
the adder and says "Saved on this iPad. It sends when the connection is
back." instead of "Saving…" until the Wi-Fi returns. Each save writes the
whole list, so **the last save wins**: a leader and the trainer changing the
same person's dates at the same moment, or an offline iPad's list sent later,
can undo the other's change. That is rare, and `arrayUnion` would bypass
`awayForWrite`'s pruning of past ranges and could run into the six-range
cap, so it stays. A range's note is read by everyone at the studio (the
colleague card below shows it), and a line under the field says so.

**D4 — Colleagues can see each other's weeks.** AJ: "schedules are open to
all." A colleague's profile has a read-only Standing week card at the active
studio: the AGREED week (when they take clients, and their regulars) and the days away that haven't
ended, else "No agreed week yet". The proposal waiting on a leader and the
note for the leader are not shown. It appears where the colleague works,
where the viewer may read the studio's weeks (`mayReadWeeks`: works there,
or an administrator, the founder or a franchise owner — the rules' own
question) and where the profile already shows their clients.

**D5 — A leader's edits never vanish.** Opening another person's Review or
Change, or tapping the same button again, asks first when the open review
holds changes (a leave scope around the review; unsaved-changes). So does
every way the Review closes itself (final review): its Cancel, and Agree or
Remove with dates away still being typed below them (the week itself is
saved; the question is about the dates). The dates-away adder's own Cancel
asks too, as an editor's Cancel does in Learning.

**D6 — The rules.** A trainer's own update may not change `trainerId` once
the document exists (the check matches bookings on it); a leader still sets
it from the roster as they agree. The rules tests cover a franchise owner,
an administrator, a head trainer and a studio leader agreeing, and refuse a
head trainer from another studio, a same-studio colleague changing someone
else's week, and the trainer id change.

**Demo Mode (final review).** Team lists Demo Mode's own seeded trainers
there (`lib/who-works-here.ts`, the realm rule), and also anyone who has
written a practice week at the demo studio: Demo Mode lets everyone act, so a
real trainer practising there may propose a week on My Profile, and it is
theirs to have agreed, never "no longer works at Demo Studio". Only people
with a practice week are added, so the list never becomes the whole company.

**D7 — Small things.** The Review says "Proposed by {name} on {date}", which
is where `proposedBy` is read. The heading is "Each person's standing week".
"Not in" (since the Openings round, "Doesn't take clients") reads in the
muted ink. Demo Mode's seeded appointments are "the
demo week", not the standing week. The trainer's "Propose this week" is a
blue save like Away's (the round's look: every save is brand blue). While
the weeks are read, or when they can't be, Team says why once, under the
next seven days; the list below says only that it waits.

## Openings round (Sep 27 2026): three blocks, and the words

The Openings round (`docs/rounds/2026-09-27-openings.md`, phase 9; AJ
approved it with the rest of the OK list) reads the agreed weeks as **who
is in** at each half-hour of the studio's usual week. That changed what a
week has to say, and how it says it.

**Three blocks a day.** AJ: some trainers "take three clients, have a little
break" and go again; not every trainer works hourly, "some trainers get paid
per client". With two ranges a day such a trainer typed one long block, and
Openings would read every habitual break inside it as room and offer it to a
client. So a day now holds up to three blocks (`MAX_RANGES_A_DAY = 3`,
exported from `week.ts`; the editor used to keep its own 2), and a week up
to 21 (`MAX_HOURS = MAX_RANGES_A_DAY * 7`, was 14). The stored field is
still `hours`, and a block is still a `WorkHours`: nothing about the data
changes but the one number.

**The rules.** `standingWeekShapeValid` holds `hours` to 21 (was 14). It
checks only the list's length, never each block, so the 1,000-expression
budget the days away were measured against doesn't move. The rules tests
refuse a 22nd block (proposed or agreed), accept 21 from the trainer and
from a leader, and the budget test's full week is now 21 blocks for every
writer it measures. `week.test.ts` reads `firestore.rules` and fails if its
limits for the blocks or the regulars ever differ from `week.ts`'s, so the
two can't drift on a machine that can't run the emulator. **The rules must
be deployed before the app**: until they are, a proposal with a 15th block
is refused (the proposal says so and keeps the week; nothing is lost).

**An iPad still on an older build cuts a week to 14 blocks.** A build from
before this round normalizes every week it reads with the old `MAX_HOURS`
(14), Monday first, so it shows a three-a-day week without its last blocks
(Friday's third, all of Saturday and Sunday) and nothing on screen says so.
If a leader AGREES such a week on that build, `agreementWrite` writes the
shortened week to both the proposal and the agreed week: Team then reads
"agreed" and the loss is **silent** — the trainer's own proposal is gone
too. If the trainer re-proposes on that build, the proposal is shortened,
and Team reads "changed" only when a week was already agreed. The new rules
accept both writes (21 is a ceiling, not a floor), and nothing in the new
code can tell which build wrote. So after the push, each iPad loads the new
version (go to the Hub, or tap the new-version line under the header)
before anyone proposes, agrees or re-saves a week with three blocks on a
day. To repair a week that was cut, the trainer enters the missing blocks
again on the new build and a leader agrees it again.

**The words.** A block is when a trainer takes clients, not the hours they
work, so no screen says "hours" any more:

| Where | Was | Now |
| --- | --- | --- |
| My Profile → My standing week: over the editor (new) | | **When I usually take clients** (the card keeps its name) |
| My Profile: the intro | "The hours you usually work at {studio}, and your regulars" | "When you usually take clients at {studio}, and your regulars" |
| The editor: a day with no blocks | "Not in" | "Doesn't take clients" (`NO_BLOCKS`) |
| The editor: the add button | "Hours" / "More hours" ("Add hours on {day}") | "Add a block" / "Add another block" ("Add a block on {day}"), until the day has three (`addBlockLabel`) |
| The editor: a regular outside every block | "Outside the day's hours" | "Outside when they take clients" (`OUTSIDE_BLOCKS`) |
| The editor: under the days (new) | | "A break inside a block shows as room on Openings, so leave the breaks out." (`BREAKS_LINE`) |
| A colleague's card: a day with only regulars | "Not in" | "Doesn't take clients" |
| Team's subtitle | "their hours and their regulars" | "when they take clients, and their regulars" |
| What a proposal changes | "Works {day}, …" / "No longer works {day} (was …)" / "{day}'s hours: …, was …" | "Takes clients on {day}, …" / "No longer takes clients on {day} (was …)" / "{day}: …, was …" |
| The week's summary on Team | "no hours set" | "no times set" |

The line about breaks departs from the round document on purpose: it
drafted "A break **between** blocks shows as room", but a break between two
blocks is the one Openings never offers; a break left **inside** a block is
the one it does. The final wording of all of these is AJ's, in his screen
audit.

**Three blocks, read and heard.** A day's blocks read as one phrase —
"6:00 AM – 8:00 AM, 9:00 AM – 11:00 AM and 3:00 PM – 6:00 PM" (`blocksLabel`,
on a colleague's card and in what a proposal changes). Each block has its
own name for VoiceOver, so three blocks don't read as three "Monday:
starts": the first is "Monday: starts", the next "Monday, block 2: starts"
(`blockName`). On My Profile the heading names the editor (`labelledBy`, a
`role="group"`). A block's two clocks share one width (`.stw-range
.stw-select`), so a day's blocks wrap evenly: one to a line on a 744 px
portrait iPad, side by side at 1133 px landscape (checked in headless
Chrome), never the first alone above the other two because one end was a
few pixels wider.

**Tests.** `WeekEditor.render.test.tsx` mounts the editor on its own: a day
with none, three blocks and no fourth, removing one of three and adding
again, the third block's times, the chip against three blocks, and a saving
editor offering nothing. `MyStandingWeek`, `ColleagueStandingWeek` and
`StandingWeeksPanel` render tests cover the words, a proposal of three
blocks, a colleague's day of three, and a leader adding a third block
before agreeing.

## Not built (see the round document)

- Suggesting a trainer's regulars from six weeks of bookings (about 1,700
  reads a tap at a busy studio).
- An agreed slot with no booking shown on the Hub (the Hub's "open slots"
  were removed on Sep 6 as "a sales question"; waiting on AJ).
- More than seven days ahead: AJ, Sep 27: "7 days works, 14 can be loaded on
  the calendar view if needed". A two-week absence shows its second week when
  that week comes into the window.
- A trainer Mindbody lists as inactive while they keep Journey access is
  still checked (a product call left with AJ).
