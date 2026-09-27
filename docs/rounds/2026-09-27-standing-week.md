# The standing week — each trainer's usual week, checked against Mindbody

*Voice-review round, Sep 27 2026. Branch `claude/wizardly-davinci-x3onwn`.*

## What AJ asked for

From the voice review of the Screen Atlas, then his answers (Sep 27):

> "The lock should operate strictly within journey, option A, by checking
> actual MyBody bookings against the standing template and flagging for
> discrepancies. We can really take advantage by this, where studio leaders
> can know when trainers are, have gaps that they normally don't. Like if,
> say, one of their eight o'clocks on Monday is going out on vacation for a
> couple of weeks, that's going to let the studio leader or head trainers
> know that, like, oh, hey, this person's going to have an open up slot for
> these times. You should probably look to fill this."

> "Journey should never execute write holds as MindBody charges a ridiculous
> amount of money for this. And also, we don't really want any client emails
> or going out um, clashing with the front desk. Studios do generally utilize
> MindBody's reoccurring features for their booked regulars. Journey acting
> on it as a read-only verification that respects that existing system."

> "Trainers should propose and set their own ideal week via my profile while
> leaders review and finalize those standings with newly focused team
> section. Ideally, this can really help a team come together and create a
> strong understanding of when trainers are unavailable and how to optimize
> their schedules the best."

## The shape, in one paragraph

Each trainer has a **standing week** at a studio: the hours they work, and
their **regulars** — a client, a weekday and a time ("Judy, Monday 8:00").
The trainer **proposes** it on My Profile. A studio leader **agrees** it on
My Studio → Team, as it is or after changing it. Journey then reads the
coming week's Mindbody bookings (which it already syncs) against the agreed
weeks and says, in sentences, where they differ: *"Sam's Monday 8:00 is open
on Oct 6 — Judy isn't booked"*, *"Judy is booked Tuesday 9:30 instead"*,
*"Bob is booked in Judy's Monday 8:00"*. The front desk goes on booking in
Mindbody, with its recurring appointments, exactly as today.

## What it never does

- **Writes nothing to Mindbody.** No booking, no hold, no change to staff
  availability. ARCHITECTURE §1.7's fence stands: Journey reads Mindbody and
  never writes to it. So there are no Mindbody charges and no client emails,
  and nothing competes with the front desk.
- **Contacts nobody.** The differences are sentences on two screens a person
  opens. No bell, no email, no push.
- **Says "open" only when it read the day.** A day whose bookings could not
  be read is "can't tell yet", never "open". A studio whose Mindbody is not
  connected is told the week can't be checked, instead of being shown every
  slot as empty.
- **Ranks nobody.** Nothing compares trainers' weeks, fills or gaps against
  each other (recognition, never ranking).

## Why Journey can't see the recurring series itself

Mindbody holds the regulars as recurring appointments, but the server's
appointment filter keeps a whitelist of fields (`server.ts`), so a series id,
if Mindbody sends one, is dropped. Journey sees each occurrence, not the
series. Reading the series would be a change to the Mindbody integration,
which needs AJ's explicit OK. The standing week does not need it: the trainer
and the leader say what the week is, and the bookings are checked against
that.

## The data (new: needs AJ's OK on the database's shape)

One document per trainer per studio:

```
studios/{studioId}/standingWeeks/{trainerUid}      // id = the trainer's Auth uid
  studioId, trainerUid
  trainerId      trainers/{id} — what a booking's `trainerId` carries
  trainerName
  proposed       the trainer's week, or null       { hours[], regulars[], note }
  proposedAt, proposedBy
  final          the week a leader agreed, or null  { hours[], regulars[], note }
  finalAt, finalBy

hours[]     { weekday 0–6, from "HH:MM", to "HH:MM" }             the studio's clock
regulars[]  { id, weekday 0–6, start "HH:MM", clientId, clientName }
```

**Who may do what** (`firestore.rules`, `match /standingWeeks/{trainerUid}`):

| | Who |
| --- | --- |
| Read | Anyone who works at the studio (the same people who can open its clients) |
| Propose (write `proposed…`, and create the document) | The trainer themselves, at a studio they work at. They cannot write `final…` |
| Agree, change, remove | The studio's leaders (the grant counts), franchise owners, administrators |

Each stamp (`proposedBy`, `finalBy`) must name whoever is writing it (the
Auth uid), and each time (`proposedAt`, `finalAt`) must be the server's, so a
week can be neither agreed in someone else's name nor backdated. A stamp is
checked only when the write changes it, so a trainer proposing again never
has to re-sign the leader's agreement. Agreeing also brings `proposed` into
line with `final`, so the trainer's next edit starts from the agreed week and
the card says "agreed" rather than "changed since it was agreed" when the
leader changed something before agreeing.

**Every number has a reader:** `proposed` is read by My Profile (the
trainer's own) and Team (the leader's review); `final` by Team's week check
and review, and by My Profile ("agreed by …").

No index is needed (the reads are one studio's collection and one document).

## The screens

- **My Profile → My standing week** (the trainer's own profile only): the
  status (not proposed · proposed, waiting for a leader · agreed by … on … ·
  changed since it was agreed), then the week: for each day, the hours or
  "not in", and the regulars with a time and a client from the studio's list.
  Save proposes it.
- **My Studio → Team** (leaders): each person's card says where their week
  stands, with **Review** when there is a proposal to agree. Review shows the
  proposal beside the agreed week, and **Agree** makes the proposal the
  agreed week (or change it first, then agree). Above the people, **This
  week against the standing weeks**: the open slots to fill, the regulars
  booked somewhere else, the slots someone else is booked in, and the days
  that could not be read.

## The rules for a difference (pure: `src/features/standing-week/check.ts`)

For each agreed regular slot in the next seven studio days:

| Found in the bookings | What it says |
| --- | --- |
| The regular, with that trainer, within 15 minutes of the slot | nothing — it's as usual |
| The regular's slot went somewhere Journey can prove: Mindbody moved that booking, or she is booked at her time with another trainer, or her booking was cancelled and a **real rebook** followed that Monday–Sunday week (see below) | **Moved**: "Judy is booked Tue Oct 7 at 9:30 instead" — and the trainer's slot is open |
| The regular not booked that week at all | **Open**: "Sam's Mon Oct 6, 8:00 is open — Judy isn't booked" |
| Someone else booked with that trainer in the slot | **Taken**: "Bob is booked in Judy's slot" |
| The day's bookings could not be read, or Mindbody isn't connected | **Can't tell** |

A cancelled booking is no booking. **A real rebook** is the client
calendar's rule from master's app review (`client-history/bookings.ts`,
`isRealRebook`; AJ, Sep 26 2026: "rebooked" only for a real rebook): the
other booking first appeared around or after the cancellation. Merely having
another booking that week is not a move — a twice-a-week client's standing
Thursday was booked all along — so without proof the slot is simply open.
(The first cut used the Operations Changes list's looser rule, any other
booking that week; master's review found what that says about a Tue/Thu
client, and this follows the calendar.)

**Whose booking it is.** The schedule sync writes the trainer's id when it
matched the Mindbody staff member to a Journey trainer, and only the staff
member's name when it didn't. So an id decides when there is one and the
name when there isn't. A booking that names no staff member at all (the
sync's "{studio} Rotation") may keep a slot but never takes one. The client
is matched by id when the sync linked one, else by name, as the Overview
does.

## Phases

All five were built on Sep 27 2026, one commit each ("Standing week 1" to
"Standing week 5"), each typechecked on its own. Two more followed the merge
of master: "Standing week 6" (a move claimed only with proof, the app
review's real-rebook rule) and "Standing week 7" (Team checks only the weeks
of people who still work there, reads the bookings only when something is
agreed at a linked studio, and a review follows a proposal that changes
while it is open).

1. This proposal and the pure core (`standing-week/`: the week, the check),
   with tests.
2. The rules block and its rules tests, the data layer (read and write).
   The rules tests were also run against deliberately loosened rules; they
   catch a trainer agreeing their own week, a reader from another studio,
   and an agreement signed in someone else's name.
3. My Profile → My standing week: the editor and the proposal.
4. My Studio → Team: Standing weeks first — the next seven days, then each
   person's week with Review and Agree (as it is, or changed first) and
   Remove.
5. Docs: CLAUDE.md, the feature's README, ARCHITECTURE (the fence, the
   screen map, the data dictionary), the glossary, roles and permissions,
   data and metrics, KNOWN-TRAPS, and Round 20 of the testing checklist.

## As built — what differs from the proposal above

- **Team lists people by name**, and says whose proposal is waiting in a line
  above the list, rather than sorting the waiting ones first (recognition,
  never ranking).
- **Agreeing writes the week as both `final` and `proposed`**, so a leader
  who changes a proposal before agreeing it isn't reported as "a change
  since it was agreed".
- **A move is claimed only with proof** (Mindbody moved the booking, she is
  booked at her time with another trainer, or a real rebook followed a
  stamped cancellation), after master's app review ruled the same for the
  client calendar.
- **A booking's trainer is matched by id, then by name** (the sync writes
  only the staff name when it couldn't match a Journey trainer), and a
  booking naming no staff member never "takes" a slot.
- **The sentences** are "Sam's Mon, Sep 28 at 8:00 AM is open: Judy Smith
  isn't booked for it." (and, with proof of a move, "... is booked on Tue,
  Sep 29 at 9:30 AM instead."; "Bob Jones is booked in Judy Smith's Mon, Sep
  28 at 8:00 AM slot with Sam."), with a **Free slot** badge where the
  trainer has the time free.

## Deploy order

The rules only ADD a collection, so they go first and the running app is
unaffected: `firebase deploy --only firestore:rules` after AJ's
`npm run test:rules`, then the app (push to `master`). No index, no Cloud
Function, no Mindbody change.

## Open, for later

- **Suggest my week from my bookings.** Reading six weeks of the studio's
  bookings to suggest a trainer's regulars costs about 1,700 reads a tap at
  a busy studio; left out until it's wanted. Trainers know their regulars.
- **The Hub.** An agreed slot with no booking could show as a faint outline
  in the trainer's column. Not built: the Hub's "open slots" were removed on
  Sep 6 as "a sales question", so this waits for AJ's word.
- **More than a week ahead.** The check reads seven days, the window the
  Overview already reads. A two-week vacation shows its second week when that
  week comes into the window.
