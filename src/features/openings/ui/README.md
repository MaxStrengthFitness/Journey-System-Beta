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
tabs: **The usual week** (it opens here). Each iPad remembers the part it was
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
| `part-memory.ts` | Which part this iPad was on; how a door from elsewhere opens a part |
| `openings.css` (one folder up) | The section's own look, on My Studio's `--st-*` tokens |
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
const data = useOpeningsData({ studio: activeStudio, trainers, authTrainer });
```

and then call the core with it, never a rule of its own.
