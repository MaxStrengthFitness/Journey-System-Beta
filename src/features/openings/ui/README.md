# Openings — the screens

My Studio → **Openings**: when the studio is usually busy, what opened up, and
what to offer a client. The round is `docs/rounds/2026-09-27-openings.md`;
the rules and every sentence about the studio's times are the pure core one
folder up (`../README.md`). Nothing here works a rule out: the screens read,
call the core, and draw. The screens' own few words are the core's too, in
ONE place, `../present.ts`: the loading lines, the gate's line, what a screen
says when the marks couldn't be read, the two sentences for a chip that
narrows a list to nothing, "Mark this time"'s form and the Wrap-up sheet's
words (they sat in `words.ts`, `mark-words.ts` and the sheet until the
round's integration pass). Who's usually in reads a week with the standing
week's own words (`NO_AGREED_WEEK`, `EMPTY_WEEK`, `standing-week/present.ts`).
No part types a sentence of its own.

It books nothing, holds nothing, asks Mindbody nothing and pings nobody.

## Where it sits

The masthead is **Relay · Openings · Machines · Team · Studio**
(`my-studio/MyStudioView.tsx`). Openings is open to everyone who may read the
studio's standing weeks (`mayReadWeeks`: the people who work there, franchise
owners and administrators), because it reads them. `OpeningsSection` asks the
same question itself: a menu is not a gate.

Its parts are Relay's light second level (`.pl__subbar`), not a second row of
tabs: **The usual week** (it opens here) · **Next 7 days** · **A new regular
time** · **Who's usually in**. They wrap onto a second line rather than scroll sideways, and their
words never hide. Each iPad remembers the part it was
on (`part-memory.ts`, forgotten at sign-out). The parts are a leave scope, so
typing in one (a mark being written on a time's sheet) is asked about before
another replaces it. So is the Context Panel beside them: its X and Escape,
and a tap on another time in the grid, ask first (as My Studio → Machines'
door does); a tap on the time already open asks nothing.

It draws its own frame, as Relay and Machines do: the part and, beside it,
the Context Panel (a right column in landscape, a sheet from the foot in
portrait), where a time's sheet opens.

Names (AJ, Sep 27 2026: "keep it relaxed and we will tighten up later"):
everyone at the studio sees other trainers' names; the person looking is
"you". Client names only after a tap, on every part, as a courtesy to the
client at the iPad.

## What is here

| File | What it is |
| --- | --- |
| `OpeningsSection.tsx` | The section: its gate, the parts, the frame, the Context Panel |
| `useOpeningsData.ts` | **The data hook** (below): the summary, the standing weeks, the marks, and what they give |
| `context.ts` | The section's data for what it draws in the Context Panel (the time's sheet reads it live) |
| `UsualWeekPart.tsx` | The usual week: the one sentence before four weeks are counted, or the grid |
| `TimeSheet.tsx` | A time's sheet: `usualTime` and present.ts's lines, the mark first with its note, the 60-day review's Keep and Remove, and "Mark this time" at the foot. Its body is keyed by the time |
| `MarkThisTime.tsx` | **Marks** (below): "Mark this time", the form, "Change the mark", "Remove the mark" (one question first), and the review's Keep and Remove (`MarkReview`) |
| `useMarkThisTime.ts` | One time's mark on its sheet: the form's draft, registered with the leave warning, and the three writes through `settleOrQueue` |
| `marks-store.ts` | The only place a mark is written: `saveMark`, `keepMark`, `removeMark` (`markForWrite`'s fields, the Auth uid, the server's time) |
| `useNextSevenDays.ts` | **The live reads** (below): the next 7 days, "booked again from", the month, the coming weeks |
| `NextDaysPart.tsx` | Next 7 days: `nextDays`' lines, a tap for who, "booked again from" |
| `NewRegularPart.tsx` | A new regular time: `offers`, "Safe to show a client", every offer ending `OFFER_FOOT`; nothing offered until the marks are read |
| `WhoseChips.tsx` | "With you · Anyone · With Sam": whose times, remembered on the iPad |
| `WhosInPart.tsx` | Who's usually in: everyone who works here, in name order, each with their agreed week read only |
| `part-memory.ts` | Which part this iPad was on, and whose times; how a door from elsewhere opens a part |
| `openings.css` (one folder up) | The section's own look, on My Studio's `--st-*` tokens |
| `TimesWithRoomSheet.tsx` | The Wrap-up's "Times with room" sheet (below): times only, naming nobody, and `hasTimesToOffer`, whether the Wrap-up shows its door |
| `index.ts` | The one door for another feature: the data hook, the live reads and `showOpenings`. Reads only: not the section, which `MyStudioView` imports from its module, so the Wrap-up (in the session's chunk) never pulls in the section, Relay's Context Panel or their stylesheets |
| `test-shell.tsx` | Test helpers only: the Relay shell's doors, and a summary folded from the core's fixtures |

## The data hook — `useOpeningsData`

```ts
const data = useOpeningsData({ studio, trainers, authTrainer });
```

It reads three things and nothing else (no bookings, no Mindbody):

| Read | How | What the screen may say |
| --- | --- | --- |
| The summary, `studios/{s}/watch/openings` | ONE `getDoc` by id, held per studio for a day and shared by every caller (`loadSummary`), forgotten at sign-out. Only a summary the server returned is held: "never built", a failure and a cache's copy are asked again at the next open. With the screen left open it is read again when the held copy turns a day old (on the minute clock), and when an answer that wasn't the server's meets the iPad coming back online; the answer on screen stays until the new one comes | `data.summary.state`: `loading`, `none` (the server says it was never built), `unreadable` (the read failed, the document isn't version 1, or the iPad is offline with no copy), `ok` (with `fromCache` when the copy is this iPad's; it carries its own date). Never confuse the three: `summaryStateSentence` has one sentence for each |
| The standing weeks | `useStandingWeeks` (Team's read: only the server's answer is one) | `data.weeks.loading` / `data.weeks.error` are "can't tell yet", never "none agreed" |
| The marks, `studios/{s}/openingsMarks` | one live listener on the small collection (written only by `marks-store.ts`, from a time's sheet) | `data.marks.read`: only `ready` is an answer; before it (or refused, or offline) no mark is known, so A new regular time offers nothing (a time marked Always full is never offered, and an unread mark can't be left out), and a time's sheet offers no "Mark this time" (a new mark could silently replace one nobody has seen) |

A studio whose Mindbody isn't linked (`connected` false) reads neither the
summary nor the marks: there is no usual week to draw, and every part says so
before anything else.

And it gives, worked out once: `usual` (`usualWeek`, when the summary is
readable), `team` (everyone who works here, with their standing week, by name:
the standing weeks' own `teamWeeks`, so Openings and Team check the same
people), `worksHere`, `refs` and `staffIds` (the booking-placing rule's
trainers), `names` (`nameBook`), `viewer`, and the studio's `tz`, `today`,
`now` (a minute clock) and `connected` (`bookingsKnown`).

**The Wrap-up's "Times with room" sheet reuses it** (phase 8). The Wrap-up
mounts it on EVERY Wrap-up at a linked studio, not only once the sheet opens:
its door needs `hasTimesToOffer` (the summary, held for a day, the weeks and
the marks) to know whether to show itself. Nothing waits for them, so it
never slows the Wrap-up. Only the sheet's booking reads (`useNextSevenDays`
with no "booked again from", and `useComingWeeks` when the month was read in
full today) start when the sheet opens:

```ts
import { useOpeningsData, useNextSevenDays, useComingWeeks } from "../features/openings/ui";

const data = useOpeningsData({ studio: activeStudio, trainers, authTrainer });
```

It is an ordinary import, so the new-version rules (`lazy-screens.test.ts`)
are untouched, and the door is safe for the session's chunk: `index.ts`
exports reads only, never the section or a stylesheet.

Then call the core with it, never a rule of its own. The offers wait for the
marks, as A new regular time does: `offers` can only leave out a mark it is
given, so with `data.marks.read` anything but `"ready"` the sheet offers
nothing and says it can't tell ("Looking for times…" while it loads).
Offline, Most weeks says "Can't tell right now." rather than showing the
saved summary, as the proposal had hoped, because a mark may take a time off
and the marks can't be read offline. When both parts would say the same
thing (looking, can't check, can't tell, or empty for the whole studio) the
sheet says it once; "No usual times with room right now" is never said when
only "With you" emptied a part.

## The live reads — `useNextSevenDays`, `useComingWeeks`, `useMonthRead`

Made only by a part that shows them (and the Wrap-up's sheet, the same way):

| Read | How | Index |
| --- | --- | --- |
| The next 7 days | `useWeekSchedule(studio, today, tz, { confirmed: true })`, Team's read, with `useServerWait` and `serverRead`: loading, failed, offline, or a cache-only answer, and `nextDays` lists nothing ("Can't tell yet"). Not read at all where Mindbody isn't linked | (studioId, startTime), (studioId, movedFromDay) |
| Booked again from | ONE `getDocs` per 30 clients (`clientBatches`) for the lines about one client, from the day after the earliest slot to today + 30; this studio's live rows only (`backFrom`). A cache's answer is "can't tell". Read again only when the clients or the day change | (clientId, startTime) |
| The month was read in full today | the sync lease (`useSyncLease`, `leaseOf`, `monthReadToday`); `null` while the lease is still coming, which the offers read as "Checking the coming weeks…", never "can't check" | none (by id) |
| The coming weeks | ONE `getDocs` of the studio's bookings, days 7 to 27 (`comingRange`), when A new regular time opens and only when the month was read in full today; a cache's answer is `offline` | (studioId, startTime) |

```ts
const week = useNextSevenDays(data, { bookedAgain: false }); // the Wrap-up needs no client read
const times = timesWithRoom(week.input, forTrainer, week.next.lines);
const coming = useComingWeeks(data, week.monthRead === true);
if (data.marks.read !== "ready") /* say it's looking, or can't tell: offer nothing */;
const most = offers({ ...,
  marks: data.marks.byTime,
  thisWeek: { read: week.read, bookings: week.input.bookings },
  coming: week.monthRead === null ? null : coming,
  monthRead: week.monthRead !== false,
});
```

No new index: every query starts with a field an existing index in
`firestore.indexes.json` starts with. Nothing here asks Mindbody anything.

## Whose times

The chips are `present.ts`'s `chips`: "With you", "Anyone", then one per
trainer with an agreed week here, in name order, with no count beside a name
(everyone gets the trainers' chips: AJ's relaxed answer). The choice is
remembered on the iPad (`part-memory.ts`) and shared by Next 7 days and A new
regular time. With nothing chosen, a trainer with an agreed week here starts
on their own times ("With you"), everyone else on "Anyone". A door that
arrives with a count of the studio's free slots (Team's line) sets "Anyone":
`showOpenings("next", { kind: "anyone" })` before `openMyStudioSection("openings")`.

The chips narrow the list, never the sentence about the studio. When a chip
alone empties a list that Anyone still has lines in, the part says so by the
chip ("Nothing has opened up with you in the next 7 days. Anyone shows the
rest of the studio.", "Pat has no usual times with room to offer right
now."); "Nothing has opened up in the next 7 days" and "No usual times with
room right now" are said only when that is true of the whole studio.

## Who's usually in

AJ, Sep 27 2026: "schedules are open to all". A colleague's profile can't be
opened today, so the read-only `ColleagueStandingWeek` card had nowhere to be
seen; Openings is where colleagues' weeks become reachable. Everyone who works
at the studio (`data.team`, the standing weeks' own `teamWeeks`) is listed in
name order, each with their AGREED week, read only: where it stands ("Agreed
by Lee Leader on Sep 1."), each day's blocks and regulars, and the days away
that haven't ended. A proposal nobody has agreed reads "No agreed week yet";
the week's note stays the leader's; nothing is ranked and no count sits beside
a name (no "4 days · 9 regulars").

It draws `ColleagueStandingWeek`'s pure parts (`daysOf`, `blocksLabel`,
`teamWeekSentence`, `upcomingAway`, `awayLabel`) from the one read of the
studio's weeks the section already holds, not the card itself: the card reads
one trainer's week per card, so a list of them would be a read per person.
A regular shows as "a regular" until "Show the regulars' names".

## Marks — "Mark this time"

A mark is a person's word on a time, in the grid's own words: **Always
full** (AJ's "that spot's just always taken") or **Usually has room**, with
a short note (up to 200 characters). What it changes is the core's
(`../marks.ts`: `countsAsFull`, `offerable`), and every part already reads
it: Always full counts as usually full on Next 7 days and is never offered
as a new regular time. The form says what the chosen word changes for THIS
time (`markChangeLine`, decided by `offerable`), and never promises an offer
on a time that reads Always full.

- **Where**: the foot of a time's sheet. The sheet shows the mark FIRST, in
  `markLines`' words: the bookings' disagreement when they clearly disagree,
  then "Marked Always full by Jo, Oct 3." with the note under it in
  quotation marks, then "The bookings say: …". While a mark is being
  written, choosing a word the bookings disagree with shows that same
  disagreement line, in the caution plum, before the Save.
- **Who**: anyone who works at the studio (and franchise owners and
  administrators) sets, changes or removes a mark, always as themselves:
  `by.id` is the Auth uid, never the trainers/{id}; `by.name` the whole
  name; `at` the server's time. Changing a colleague's mark signs it as the
  person changing it. One mark per time (the document id is the time key).
- **The write** (`marks-store.ts`) is the WHOLE mark, never a merge, so a
  note taken out is gone. No read first, one small document; nothing pings
  anyone and nothing reaches Mindbody.
- **Remove** asks once ("Remove this mark? It goes for everyone at
  Westlake."), in the app's critical colour.
- **The 60-day review**: "Marked 64 days ago. Still true?" (present.ts) with
  **Keep** (the solid blue: it signs the mark again, as the person keeping
  it, today) and **Remove** right under it. The mark keeps working while it
  waits; nothing drops on its own.
- **Only with the marks known**: "Mark this time" is offered only once the
  marks listener has the server's answer (`data.marks.read === "ready"`).
  Refused, offline or only this iPad's cache, and the sheet says it can't
  tell whether anyone has marked the time, with nothing to tap. A form
  already open stays open.
- **Typing**: a half-written mark registers with the leave warning
  (`useUnsavedChanges`, "the mark on Monday 8:00 AM"), so the app's
  navigation, My Studio's sections and Openings' parts ask first, and the
  form's own Cancel asks too. It isn't counted as unsaved while its save is
  on its way. The sheet's body is keyed by the time, so a note typed for
  Monday 8:00 can never be saved onto another time. Every write goes through
  `settleOrQueue`: offline, the form or question closes at once and the foot
  says "Saved/Kept/Removed on this iPad. It goes to the studio when the
  connection is back.", and a refusal that comes later is shown there too.
- **Closing and switching ask too**: the Context Panel's X and Escape, and a
  tap on another time in the grid, go through the parts' leave scope
  (`OpeningsSection`'s `closeSheet`, `UsualWeekPart`'s `guard`), like My
  Studio → Machines' door; tapping the time already open asks nothing.

## Client names only after a tap

A line of the next 7 days is a button: its sentence (`lineSentence`) names no
client; a tap shows `lineDetail` (who, whose regular, what happened) and then
"Check it in Mindbody before you promise it." A new regular time names no
client at all, which is why it says "Safe to show a client". Who's usually in
names a regular only after "Show the regulars' names".

## Tests

- `OpeningsSection.render.test.tsx`: the usual week drawn from a summary the
  Sunday job would write (the core's fixtures folded by `foldSummary`), a
  time's sheet, a mark shown first, and every way the summary can't be
  used (loading, never built, failed, a cache with no copy, an old one, a
  document of another version, not linked, which reads neither the summary
  nor the marks); the summary read again while the screen stays open (back
  online after a cache with no copy, a held copy a day old, "never built"
  not held); the one sentence before four weeks; no week agreed; a trainer's
  view and a leader's.
- `NextDaysPart.render.test.tsx`: Next 7 days and A new regular time, with
  every read the part makes faked at `firebase/firestore`: a client name only
  after a tap, "booked again from" and its one read, the chips (and a chip
  that empties the list saying so by its name), cancellations only with
  nothing agreed, not linked, and never an open slot off a read still
  loading, failed, answered by the cache alone, or offline; the offers, the
  coming weeks read or not, the foot, a trainer with nothing to offer, the
  studio with nothing to offer, and never a time marked Always full, whether
  the marks were answered, refused, never answered, or answered by the cache
  alone.
- `MarkThisTime.render.test.tsx`: "Mark this time" in the real section, with
  the marks listener answering again after each write: the form and the
  bookings' disagreement shown first, what the chosen word changes for the
  time, the write as the person signed in at the server's time (never a
  merge), a colleague's mark changed (signed again, a note taken out gone)
  and removed after one question, the 60-day review's Keep, the leave
  warning from Openings' parts, from Cancel, from the sheet's X and Escape
  and from a tap on another time (and none from the time already open), a
  failed, slow or offline write, and nothing to mark while the marks can't
  be read.
- `marks-store.test.ts`: what each write sends. The rules are
  `tests/firestore.rules.test.ts`, "marks on a time".
- `TimesWithRoomSheet.render.test.tsx`: the Wrap-up's sheet: times only and
  no name, With you and Anyone, the one line when both parts would say the
  same thing, nothing offered off unread marks, and the foot.
- `WhosInPart.render.test.tsx`: the people in name order, their agreed weeks
  read only, the days away, names after a tap, and a failed read.
- `MyStudioOpenings.render.test.tsx`: the real `MyStudioView`: the sections'
  order, who sees Openings, every part mounting in the shell, a door from
  another section (and "Keep editing" keeping the section and its memory),
  and sign-out forgetting the part.
- The screens' own words are quoted in `../present.test.ts` with the rest.
