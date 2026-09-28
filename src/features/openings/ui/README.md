# Openings — the screens

My Studio → **Openings**: when the studio is usually busy, what opened up, and
what to offer a client. The round is `docs/rounds/2026-09-27-openings.md`;
the rules and every sentence are the pure core one folder up
(`../README.md`). Nothing here works a rule out or words a sentence of its
own: the screens read, call the core, and draw.

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
typing in one (a mark's note, the marks phase) is asked about before another
replaces it.

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
| `TimeSheet.tsx` | A time's sheet: `usualTime` and present.ts's lines; marks shown, never set |
| `useNextSevenDays.ts` | **The live reads** (below): the next 7 days, "booked again from", the month, the coming weeks |
| `NextDaysPart.tsx` | Next 7 days: `nextDays`' lines, a tap for who, "booked again from" |
| `NewRegularPart.tsx` | A new regular time: `offers`, "Safe to show a client", every offer ending `OFFER_FOOT` |
| `WhoseChips.tsx` | "With you · Anyone · With Sam": whose times, remembered on the iPad |
| `WhosInPart.tsx` | Who's usually in: everyone who works here, in name order, each with their agreed week read only |
| `part-memory.ts` | Which part this iPad was on, and whose times; how a door from elsewhere opens a part |
| `openings.css` (one folder up) | The section's own look, on My Studio's `--st-*` tokens |
| `index.ts` | The one door for another feature: the section, the data hook and the live reads, and `showOpenings` |
| `test-shell.tsx` | Test helpers only: the Relay shell's doors, and a summary folded from the core's fixtures |

## The data hook — `useOpeningsData`

```ts
const data = useOpeningsData({ studio, trainers, authTrainer });
```

It reads three things and nothing else (no bookings, no Mindbody):

| Read | How | What the screen may say |
| --- | --- | --- |
| The summary, `studios/{s}/watch/openings` | ONE `getDoc` by id, held per studio for a day and shared by every caller (`loadSummary`), forgotten at sign-out | `data.summary.state`: `loading`, `none` (the server says it was never built), `unreadable` (the read failed, the document isn't version 1, or the iPad is offline with no copy), `ok` (with `fromCache` when the copy is this iPad's; it carries its own date). Never confuse the three: `summaryStateSentence` has one sentence for each |
| The standing weeks | `useStandingWeeks` (Team's read: only the server's answer is one) | `data.weeks.loading` / `data.weeks.error` are "can't tell yet", never "none agreed" |
| The marks, `studios/{s}/openingsMarks` | one live listener on the small collection, read only | `data.marks.read`: only `ready` is an answer; before it (or refused, or offline) no mark is known |

And it gives, worked out once: `usual` (`usualWeek`, when the summary is
readable), `team` (everyone who works here, with their standing week, by name:
the standing weeks' own `teamWeeks`, so Openings and Team check the same
people), `worksHere`, `refs` and `staffIds` (the booking-placing rule's
trainers), `names` (`nameBook`), `viewer`, and the studio's `tz`, `today`,
`now` (a minute clock) and `connected` (`bookingsKnown`).

**The Wrap-up's "Times with room" sheet reuses it** (phase 8). Mount it once
the sheet opens (the reads are the summary, held for a day, the weeks and the
marks; nothing waits for them, so it never slows the Wrap-up):

```ts
import { useOpeningsData, useNextSevenDays, useComingWeeks } from "../features/openings/ui";

const data = useOpeningsData({ studio: activeStudio, trainers, authTrainer });
```

It is an ordinary import (the section is not lazily loaded), so the
new-version rules (`lazy-screens.test.ts`) are untouched.

and then call the core with it, never a rule of its own.

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
const most = offers({ ...,
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

## Client names only after a tap

A line of the next 7 days is a button: its sentence (`lineSentence`) names no
client; a tap shows `lineDetail` (who, whose regular, what happened) and then
"Check it in Mindbody before you promise it." A new regular time names no
client at all, which is why it says "Safe to show a client". Who's usually in
names a regular only after "Show the regulars' names".

## Tests

- `OpeningsSection.render.test.tsx`: the usual week drawn from a summary the
  Sunday job would write (the core's fixtures folded by `foldSummary`), a
  time's sheet, a mark shown read-only, and every way the summary can't be
  used (loading, never built, failed, a cache with no copy, an old one, a
  document of another version, not linked); the one sentence before four
  weeks; no week agreed; a trainer's view and a leader's.
- `NextDaysPart.render.test.tsx`: Next 7 days and A new regular time, with
  every read the part makes faked at `firebase/firestore`: a client name only
  after a tap, "booked again from" and its one read, the chips, cancellations
  only with nothing agreed, not linked, and never an open slot off a read
  still loading, failed, answered by the cache alone, or offline; the offers,
  the coming weeks read or not, and the foot.
- `WhosInPart.render.test.tsx`: the people in name order, their agreed weeks
  read only, the days away, names after a tap, and a failed read.
- `MyStudioOpenings.render.test.tsx`: the real `MyStudioView`: the sections'
  order, who sees Openings, every part mounting in the shell, a door from
  another section, and sign-out forgetting the part.
