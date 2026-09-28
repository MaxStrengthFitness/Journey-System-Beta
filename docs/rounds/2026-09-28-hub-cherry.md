# The Hub's cherry on top — your column in words, the Next 30 minutes, Me or Everyone

*Sep 28 2026, afternoon. Branch `redesign/hub-cherry`: five phases on `voice-review-notes` at `1c38174` (master's `b5c8a35`, the calm Hub, plus three voice-review commits), one commit each, then this document. Built in a worktree on AJ's PC while four other rooms were built on their own branches; checked with typecheck, the whole suite and the build, and in render tests only: nobody has seen it in a browser or on an iPad yet. It is the Hub room's last two rounds on the Redesign Blueprints: round 8, "Later: the cherry on top", and round 7, "Get to know".*

## What AJ asked for

> The Hub: "keep the Mindbody-style grid but clean it up … and add the second layer". The Hub gets its own "cherry on top" round **last**. (The redesign brief, Sep 26)

> Picking the Hub's ★ on the Blueprints page: "i like it but the top bar with the info … is very jumbled". (Sep 27)

> Hub question 2: "once the session is done it should make a lot less noise so trainers can focus on the rest of their day". (Sep 27)

> Hub question 6: "New is 1 to 3, building is 4 to 49, regulars are 50 and up. we could aslo add a catagory for our all stars for the clients that come 2 times a week almost every week of the year for over 6 months". (Sep 27)

The handoff names the cherry on top exactly: "his own column in words, the Next 30 minutes strip and the Me / Everyone focus from Hub direction B". Direction B ("Focus and context", research-hub §6.2) was the one alternative the ★ took nothing from: "From B: nothing yet. Its focus column waits for the final round."

## The picks this round follows

From AJ's `decisions` on the Blueprints page (`logs/claude-transfer/redesign-2026-09-27/decisions.json`, the Hub room, **pick**), and the calm Hub round's six open questions, still unanswered, kept at their defaults.

| Question | Used | Whose |
| --- | --- | --- |
| q2 A finished session | Makes less noise: it recedes and drops its marks (the calm Hub), and nothing this round adds brings it back — the Next 30 minutes never shows a session that is over | AJ |
| q6 Tenure words and All stars | New 1–3, Building 4–49, Regulars 50+ (already the Sessions sort's). All stars: the rule proposed back to him, built and tested, **not on screen** (below) | AJ |
| Note: the top bar is "very jumbled" | The top keeps the calm Hub's two rows. The Next 30 minutes is a row of the schedule UNDER the top; Me · Everyone sits at the end of the summary's own line | AJ |
| The calm Hub's six open questions (the tap, All stars, the hatching, grey staff time, the briefing's markers, the top in portrait) | Their defaults, unchanged | Defaults |

## What was built

**Phase 1 — your own column, in words** (`ca21ef5`). Hub direction B's focus column. Your column takes four shares of the SPARE room to every other column's one, up to 420px, and never more than there is: its least is every column's least, so it pushes no column off an iPad the others would have fit. On an iPad on its side with five trainers it is about 330px; upright, or on a day with more trainers than fit, it is as wide as the rest. Its head says your day in words under your name — "12 sessions · 6:00 AM – 12:00 PM · 8 to go" (`hub-schedule/your-day.ts`); "to go" is the clock's answer, a slot not over yet, never "done", which the cards say (done means logged). Its cards say every mark's sayable word once they have the room, not only the first, and "first with you" joins the sayable words there. A Pulse flag, a waiver or a renewal talk is still a glyph alone: a client stands at the iPad.

On the way it found a real fault: a card's time and number could be cut when its glyphs needed the room — two glyphs and a "+1" in a narrow column clipped "#212" to "#2", a confident wrong number. The time and the number now never shrink; "Not logged", "New to Journey" and a service give way first, with an ellipsis.

**Phase 2 — the Next 30 minutes strip** (`3b28e4f`). Who is due across the floor, whole names, in one quiet row under the Hub's top, like a bay of flight strips (research-hub source 23). On today only. From half an hour before the day's first booking until its last one ends, the row stays, and says "Nobody due in the next 30 minutes." in a quiet gap, so nothing comes and goes under the trainer's finger. A booking is on it while its slot overlaps the next half hour — "In session" when a Journey session is open, "Now · 9:30" when its time has come and none is open yet, "9:45" when it starts within the half hour — the Opportunities list's own "Now and the next 30 min", asked of each booking. Never a booking that is over, by the card's own state (`lib/hub-card-state`). Soonest first; at the same time yours first, then the columns left to right. Each item: when, the name she goes by, who with, the Critical triangle (the only red) and the card's own marks with their sayable words. A tap opens the same peek a card opens; a booking with no profile yet is shown and opens nothing (`hub-schedule/next-half-hour.ts`, `NextStrip.tsx`).

**Phase 3 — Focus: Me or Everyone** (`182fab2`). Hub direction B's switch. Me is your own column in words; Everyone makes every column alike, the calm grid as it was, for a leader watching the whole floor. It sits at the end of the day summary's line, after the chips (which scroll rather than push it onto a line of its own), and is offered only to someone with a column on the day. Me by default. The choice is remembered on the iPad in local storage, which a sign-out clears with everything else the person left, so the next trainer on a shared iPad starts on Me (`hub-schedule/focus.ts`).

**Phase 4 — All stars, the rule** (`4bf4e85`). Built and tested, **not on screen**. The rule proposed back to AJ: twice a week on average, in at least 9 of every 10 weeks, for the last 26 weeks — read as the 26 whole weeks before today (a session not logged yet never decides it), a visit in at least 24 of them, and about twice a week over the weeks she came, to the nearest quarter as the renewals pace is. So a two-week holiday keeps the name: that is what "almost every week of the year" is for. Only where Journey holds every visit in the window: the part of her timeline Journey owns (`ownedWindow`, `lib/history-claims.ts`) and the record the visits were read from both reach back past the window's first day. Otherwise "can't tell", which no screen turns into a guess, and no screen ever says who isn't one (`hub-opportunities/all-stars.ts`).

Why it is not wired: twenty-six weeks of a client's visits are in nothing the Hub holds. The app streams one day of sessions, the Hub's bookings run from yesterday to a week ahead, and the nightly renewals job reads 90 days (its proof counts 12 weeks, its pace 8). Reading 26 weeks of a studio's sessions on the Hub is the kind of scan the house rules refuse; having the nightly job keep the answer on the client is a new stored field and a longer read for that job. Both need AJ's OK.

**Phase 5 — Get to know, the Ask about rule** (`d87a7f2`). Built and tested, **not on screen**. The ✎ "Ask about" mark from FORD (research-hub §5 and §7), asked about the booking's day like every Hub moment: a detail whose day comes round within the week (the day and the six after it; an annual one rolled forward from its digits, on the studio's day), or one noted in the last two weeks; never an archived detail, the team's In one line, a legacy `client.events` row, a detail marked no longer true, or one whose window has closed; at most one per client, the soonest dated one first. The chip says the detail's subject or the trainer's first words ("Ask: the recital · Sat"); the sentence says every word with its proof ("Ask about: His granddaughter's piano recital on Saturday — Saturday, Oct 3 (Family, noted Sep 10)."). One studio read's details are sorted into each booked client's one, and nobody else's (`hub-opportunities/get-to-know.ts`).

Why it is not wired: it needs the studio's FORD details read once for the Hub, and the one studio-wide FORD read Journey makes — the Delight queue's collection group query, `studioId` plus `opportunity.status` in idea or planned — gives only details with an open gesture. Every read that can give these is a new read shape: all of a studio's details (a big read on every Hub open), the dated ones by `eventDate` (an index exists, but a range misses an anniversary stored in an earlier year), or the new ones by `occurredAt` (no index). That is the room's Needs OK: "one read-only FORD read per studio".

**Phase 6 — this document** and the two READMEs (`features/hub-schedule/README.md`, `features/hub-opportunities/README.md`).

## Reads

**None new.** The focus column, the strip and the switch work from the bookings, the sessions and the one engine the Hub already has (`use-day-moments.ts`); the choice of focus is kept in the iPad's local storage. All stars and Get to know read nothing: they are rules waiting for data. No Mindbody call, no Cloud Function, no rules change, no index, no write, no Firestore-structure change. Nothing in the room's Needs OK was touched.

## How to review it on an iPad

The checklist round is in "For the integrator" below. In short: open the Hub on today, on a busy morning, in landscape and portrait, light and dark, signed in as a trainer with bookings and as a leader with none.

1. **Your column.** On its side, with five or fewer trainers, your column is the wide one, its head says "12 sessions · 6:00 AM – 12:00 PM · 8 to go", and its cards say "100th" and "turns 80" side by side. Upright it is as wide as the rest and its head keeps two lines.
2. **A number never cut.** Find a card with three marks in a narrow column: "9:30 · #212" is whole; only the words after it give way.
3. **The Next 30 minutes.** Under the top: who is in session, who is due now and who in the next half hour, across every column; a tap opens the peek. A finished session is never on it. Flip to tomorrow: no strip.
4. **Me · Everyone.** Everyone makes the columns alike and your head says "12 sessions" again; sign out and back in: Me.

## Open, for AJ

1. **Focus opens on Me** (your column wide, in words). Or on Everyone, the calm grid as you saw it this morning?
2. **Words for a Watch or Renew mark in your own column.** The blueprint's B wrote "no waiver", "renewal talk" and "Pulse flag" beside the glyphs in your column. They stay a glyph alone, because a client stands at the iPad; their words are in the peek. Keep it that way?
3. **The Next 30 minutes is on all day** while the studio's day runs, and says "Nobody due in the next 30 minutes." in a gap. Keep it always there on today, or let a trainer fold it away? And are "In session", "Now · 9:30" and "9:45" the right words?
4. **All stars, the rule.** "Twice a week on average" is read over the weeks she came, so a two-week holiday keeps the name (the other reading, 52 visits in 26 weeks, would take it away). Twenty-four of twenty-six weeks means a client who started about 24 weeks ago can qualify, a fortnight short of "over 6 months". Right? And where it shows: a section beside New · Building · Regulars on the Sessions sort, and "All star: in 25 of the last 26 weeks, about twice a week." in the peek.
5. **All stars needs a yes to show.** The nightly renewals job would keep the answer on each client: a new stored field and a longer read for that job (26 weeks, not 90 days). Yes?
6. **Get to know needs a yes to show.** One read of the studio's FORD details for the Hub. And two questions for it: should a dated detail that just happened count ("How was the recital?"), and should a "Follow up next time" question count? Built without either, as the design has it.

## Left for later (technical)

- Zoom (Day | Close) from Hub direction B: not asked for.
- The Next 30 minutes is worked out on every render (the day's bookings, a few dozen): cheap, but it could share the grid's blocks memo.
- From the calm Hub, still: "Couldn't load, retrying"; columns by trainer id only; a column header, "+N" and "Show on schedule" as doors; `mayReadWeeks` in a small file of its own; `src/lib/directory-row.ts` has no reader.

## Numbers

Measured on AJ's PC in the worktree (`node_modules` a junction to the main checkout's), on this branch's final code commit.

| Check | Result |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **4** errors, the baseline, none new, after every phase |
| Tests (`TZ=America/New_York npx vitest run --dir src`) | **7,173** passing in **477** files, none failing: the base's 7,116 in 471, plus 57 tests in six new files (`your-day`, `next-half-hour`, `focus`, `all-stars`, `get-to-know`, and the mounted `NextStrip`) and new cases in `card-marks`, `grid-model`, `HubCard`, `HubGrid`, `DayHeader` and the mounted `ClientsView` |
| `npm test` under `TZ=UTC`, as GitHub's check runs it | **7,387** passing, 1 skipped, in 491 files (the base's 7,330 in 485, plus the same 57) |
| The round's own tests under UTC, Pacific and Tokyo | Pass |
| Build (`npx vite build`) | Clean. The first download grew from 131.42 kB to 133.40 kB gzipped (473.36 kB to 479.07 kB), measured against the base built the same way: the strip, the focus column and the switch are on the Hub, which is the first screen. Its stylesheet grew by 4.1 kB before compression |
| Guards | `css-class-owners` (new prefix `hn-`; the other new classes are owned by `hub-card.css`, `hub-grid.css` and `day-header.css`), `neutral-ramp` (no raw colour), `lazy-screens` and `home-screen` (nothing lazy added, no inset paid); no file names that differ only by case |

## For the integrator

The exact lines to add, in the voice of each file. The branch has five code commits and this document on `1c38174`; `voice-review-notes` has moved to `b319bf8` since, touching none of this round's files.

**`CLAUDE.md`**

- In the row **The Hub's Schedule layer**, after "…the screens are `HubCard`, `HubGrid`, `DayHeader` (+ `DaySummary`, `KeySheet`) and `Peek`.", add: "The cherry on top (hub cherry round, Sep 28 2026, Hub direction B): `your-day.ts` (your own column in words: the focus column takes the spare room and its head says your day), `next-half-hour.ts` + `NextStrip` (the Next 30 minutes strip under the top, today only), `focus.ts` (Focus: Me | Everyone, on the summary's line, remembered on the iPad); `docs/rounds/2026-09-28-hub-cherry.md`."
- In the row **The Hub's Opportunities layer**, at the end, add: "All stars (`all-stars.ts`, AJ's Hub question 6) and Get to know (`get-to-know.ts`, the ✎ Ask about from FORD) are built and tested but not wired: each waits on a read AJ has to OK (hub cherry round)."
- In the **Tests** row, first: "**7,173** passing in 477 files on `redesign/hub-cherry` (Sep 28 2026: the Hub's cherry on top — your column in words, the Next 30 minutes, Me or Everyone — and the All stars and Get to know rules, unwired, on `voice-review-notes` at `1c38174`; typecheck 4; `TZ=America/New_York npx vitest run --dir src` in a worktree on AJ's PC, and `npm test` under `TZ=UTC` 7,387 passing and 1 skipped in 491 files; `docs/rounds/2026-09-28-hub-cherry.md`)." — or the count measured after the merge, which should be about 7,198 in 481 with `b319bf8`'s 25 tests.

**`docs/rounds/README.md`**, a row at the end:

`| 2026-09-28 | [2026-09-28-hub-cherry.md](2026-09-28-hub-cherry.md) — the Hub's cherry on top, the redesign's last Hub round: your own column in words (the focus column takes the spare room, its head says "12 sessions · 6:00 AM – 12:00 PM · 8 to go", its cards say their sayable words), a card's time and number that are never cut, the Next 30 minutes strip under the top (today only, never a session that is over, a tap opens the peek), and Focus: Me or Everyone; All stars and Get to know built and tested but not wired, each waiting on a read AJ has to OK. **No rules, index, function or structure change; no new read** |`

**`docs/ops/TESTING-CHECKLIST.md`**, a new round after the last one (Round 27 on `b319bf8`):

```markdown
## Round 27 — The Hub's cherry on top · *Sep 28 2026, branch `redesign/hub-cherry`*

Hub direction B, held for the Hub's last round: your own column in words, the
Next 30 minutes strip and Focus: Me or Everyone. The round document is
`docs/rounds/2026-09-28-hub-cherry.md`. Nothing to deploy first: no rules, no
index, no Cloud Function, no new read. Walk it on TODAY, on a busy morning,
signed in as a **Life Transformer with bookings** and as a **leader with
none**, **portrait and landscape, light and dark**. Nothing in this round has
been seen in a browser or on an iPad yet: render tests only.

**Your column**

- [ ] **Wide on its side.** Landscape, five or fewer trainers: your column is
  the wide one; nobody else's column is pushed off the screen that would have
  fitted before. Upright, or with more trainers than fit, it is as wide as
  the rest.
- [ ] **Your day in words.** Under your name: "12 sessions · 6:00 AM – 12:00
  PM · 8 to go" (no "to go" before your first or after your last); upright the
  times drop and it stays two lines.
- [ ] **Its cards in words.** On its side, a card with two marks says both
  words ("100th", "turns 80"); "first with you" for a client's first session
  with you. Never a Pulse flag's, a waiver's or a renewal's words.
- [ ] **A number is never cut.** A card with three marks in a narrow column
  still reads "9:30 · #212" whole; only "Not logged", "New to Journey" or a
  service gives way, with "…".

**The Next 30 minutes**

- [ ] **Under the top, not in it.** The top keeps its two rows; the strip is
  a row of its own above the grid.
- [ ] **Who is on it.** In session (blue), due now ("Now · 9:30") and due in
  the next half hour ("9:45"), across every column, yours first at the same
  time; whole names; the red triangle only for a Critical note.
- [ ] **Never a session that is over.** Finish a session: it leaves the strip.
- [ ] **A tap opens the peek**, the same one a card opens. A booking with no
  profile says "Not synced yet" and opens nothing.
- [ ] **Its row stays.** In a quiet stretch it says "Nobody due in the next 30
  minutes."; before the first booking's half hour and after the last one, it
  is gone. Tomorrow has no strip.

**Me · Everyone**

- [ ] **At the end of the summary's line.** Landscape: "Focus  Me | Everyone"
  after the chips; upright, without "Focus". Not there for someone with no
  column today, nor on the spotlight's bar.
- [ ] **Everyone** makes every column alike and your head says "12 sessions";
  **Me** brings the wide column back.
- [ ] **Remembered, and forgotten.** Leave and come back: the same focus. Sign
  out and sign in as someone else: Me.
```

**`ROADMAP.md`**, in the follow-up pile: in the paragraph **The calm Hub (Sep 28 2026)**, delete "; the cherry on top, last" from its last sentence, and add after it:

"**The Hub's cherry on top (Sep 28 2026)** — to do by hand: walk the round in the testing checklist (render tests only so far). Decisions for AJ, in the round document's "Open, for AJ": Focus opening on Me or Everyone; words for a Watch or Renew mark in your own column; the Next 30 minutes always there on today, and its words; All stars' reading (the average over the weeks she came; 24 of 26 weeks) and where it shows. **Needs AJ's OK before it can show:** All stars (the nightly renewals job keeping the answer on each client: a new stored field and a 26-week read) and Get to know (one read of the studio's FORD details for the Hub). Technical leftovers: Zoom (Day | Close) from direction B; the strip worked out on every render."

**Optional, `docs/KNOWN-TRAPS.md`, Layout and CSS:** "**A flex row that lets its text shrink can clip a number** (hub cherry round, Sep 28 2026). The Hub card's time line shrank with `overflow: hidden` when its glyphs needed the room, so "#212" could read "#2" — a confident wrong number, and no test sees it, because tests draw no layout. Keep a number in a part that never shrinks (`.hs-card-when`, `flex: none`) and let words give way beside it (`.hs-card-rest`, `text-overflow: ellipsis`)."
