# The Hub's Schedule layer — the calm Hub

*Calm Hub round, Sep 28 2026 — `docs/rounds/2026-09-28-calm-hub.md`. Design: the Redesign Blueprints' Hub room (★ "Calm schedule + Run-sheet", picked by AJ on Sep 27) and research-hub §5–§8 (S1, "Calm Mindbody"). The cherry on top — your own column in words, the Next 30 minutes strip and Focus: Me | Everyone, from Hub direction B (research-hub §6.2, S2) — is the hub cherry round, Sep 28 2026: `docs/rounds/2026-09-28-hub-cherry.md`.*

AJ, on Mindbody's staff schedule (his screenshots, Sep 28): **"I don't want it to look like this but the layout is the foundation."** Kept: time down the left, trainers across the top, the week strip with each day's count, blocks at their real length, who's working at a glance, one tap back to today. Changed: names cut to fit, the service repeated on every block, the unexplained red "nw" corner, everything in one colour. And on the Blueprints page (Sep 27): the top bar **"is very jumbled"**.

This folder is the Hub's Schedule layer: the grid, its cards, the top, the spotlight, the peek and the Key. The Opportunities layer is `features/hub-opportunities/`; both read ONE engine (`moments-today.ts`, worked out once per day by `use-day-moments.ts`), so the grid, the peek and the list can never disagree.

## Files

| File | What it is |
| --- | --- |
| `card-marks.ts` | What a card shows: the Critical triangle's own slot, at most two glyphs in the Key's order, "+N" with its words, a sayable word beside the first; the per-booking number (`bookingSessionNumber`), "New to Journey" (`isNewToJourney`), the day's usual service (`usualServiceOf`). Pure |
| `HubCard.tsx` + `hub-card.css` | One booking (prefix `hs-card`, `hs-g`, `hs-tri`). Replaces `components/schedule/ScheduleBlock` |
| `grid-model.ts` | The geometry: 2.2px a minute, the day's extent, folds, lanes for overlaps, the axis's words. Pure |
| `off-hours.ts` | When a trainer isn't on, from the AGREED standing week and days away. Pure |
| `HubGrid.tsx` + `hub-grid.css` | The grid (prefix `hs-`). One scroller for both axes; your column pinned |
| `day-summary.ts` | The week strip's counts and dots, the chips, the spotlight's words. Pure |
| `DayHeader.tsx` + `day-header.css` | `DayHeader` (layers, week, Today, Tasks, Key), `DaySummary` (the day in words, the chips, the spotlight's bar), `KeySheet` (prefix `hd-`) |
| `peek-model.ts` | What the peek says, from the same entry as an opened Opportunities row. Pure |
| `Peek.tsx` + `peek.css` | The peek (prefix `hp-`) |
| `your-day.ts` | Your own column, in words: the head's line ("12 sessions · 6:00 AM – 12:00 PM · 8 to go"), in parts so a narrow head can drop the span. Pure (hub cherry round) |
| `next-half-hour.ts` | Who is on the Next 30 minutes strip and when it shows: today only, from half an hour before the first booking to the end of the last; never a booking that is over. Pure (hub cherry round) |
| `NextStrip.tsx` + `next-strip.css` | The Next 30 minutes strip (prefix `hn-`): one quiet row under the top; a tap opens the peek (hub cherry round) |
| `focus.ts` | Focus: Me or Everyone, remembered on the iPad (local storage, cleared at sign-out); the focus column's id (hub cherry round) |

`components/ClientsView.tsx` is still the screen: it decides the columns (`visibleTrainersList`) and which booking goes in which (one column each, the first trainer it matches), and hands the grid its cards. `ClientsView.render.test.tsx` mounts it.

## Decisions

- **One engine.** The card's marks are the Opportunities list's moments (`cardMarks(entry.moments)`), asked about the booking's day. The old card's own rules — every 25th session, 21 calendar days for "back", birthdays counted from today, away/medical from `client.events` (which nothing writes) — are retired on the Hub. `lib/hub-markers.ts` stays for the briefing, which still uses them (see the round's open items).
- **The Key's order decides which marks make the card** (Read first › Watch › Welcome › Celebrate › Renew › Get to know); among the two chosen, one that can say a word goes first. Words beside a glyph are only sayable ones — "100th", "turns 80", "1st session", "back", "Consult" — because clients stand next to the iPad (research-hub §7 rule 9). A Pulse flag, a waiver or a renewal talk is a glyph alone; its words are in the peek and the list.
- **Get to know** (wave 2 hub, Sep 28 2026): the ✎ "Ask about" from FORD is a blue speech bubble ALONE — no word beside it in anyone's column, your own included, and its label (a screen reader's, the "+N"'s) is only "Something to ask about", so a client's home life is never on the grid. Last in the Key's order: on a card with two other marks it is part of the "+N". Its sentence is in the peek (the last of the lines) and the list; it lights from the day summary's "Get to know" chip ("Showing 2 to ask about on the grid"), and the Key has its row. A finished card drops it with every other mark. When the studio's FORD couldn't be checked, the peek says so quietly at its foot.
- **All stars** (wave 2 hub, AJ's Hub question 6) never touches the grid: no glyph, no word on a card. The peek says "All star: in 25 of the last 26 weeks, about twice a week." in one sentence under the marks (`.hp-star`, the lines' own ink), only for a client the nightly marks name; the Opportunities list gives her a section on its Sessions sort.
- **Colour means one thing per channel.** The left edge is the booking's state (coming up, in session, over); the glyph colour is its family (Watch plum, Welcome blue, Celebrate orange, Renew green); crimson is the Critical triangle alone. The Pulse flag moved from rose to plum. The amber clinical-history dot left the card (Hub question 3's default) — the peek and the Opportunities row say it quietly, and the briefing holds the detail.
- **"No waiver signed"** (AJ, Sep 28: Mindbody's "nw" corner): a plum glyph, a Watch moment, only for a definite "not signed" (`lib/client-waiver.ts`); "not synced yet" says nothing. It never blocks a session (Hub question 9's default).
- **Done goes quiet** (AJ, Hub question 2: "once the session is done it should make a lot less noise so trainers can focus on the rest of their day"): a card that is over recedes and drops every mark, the triangle included. Done means logged is unchanged (`lib/hub-card-state.ts`).
- **Names whole** (Hub question 8's default): the name she goes by (`clientDisplayName`), wrapping, never cut; columns at least 156px.
- **Her number** from #4, and only when it may be quoted (`canQuoteSessionNumber` through the engine); 1–3 are the Welcome glyph's to say; not repeated when the milestone glyph says it; "New to Journey" in its place when her story began before the cutover (AJ, Sep 22).
- **The service** only when it isn't the day's usual one (`usualServiceOf`: the name most of the day's bookings carry).
- **Real lengths.** A booking is drawn from its own start to its own end: a 30-minute session is 64px, a 45-minute consult 97px. Overlaps share the column in lanes.
- **Folding.** An hour or more with nothing booked in ANY column is one band ("No sessions 1:00 – 2:00 PM"); a tap opens it for the day on screen. Never over a booking; a booking starting where a band ends starts below it.
- **Who's working** (AJ's Keep): the agreed standing week hatches the hours a trainer isn't on, and a day away hatches the column and says "Away". No agreed week, or no answer, hatches nothing (a failed read is unknown, never "off"). It only shades: a booking in a hatched stretch is still drawn, and Journey books nothing.
- **The top** (AJ: "very jumbled"): one row (the layers, the week with each day's count and a dot for a day to celebrate, Today when you are elsewhere, Tasks and Key); on Schedule, one line with the day in words and the list's own chips (six since Get to know, wave 2 hub). Zero is left out, never drawn as "0". Tasks opens Relay and never shows a grey 0 while it loads.
- **The spotlight** (research-hub §6.1): a chip lights its cards and dims the rest; the bar says what it shows in words, steps to the next card, opens the same group as a list (the Run-sheet's `request`), or is done.
- **The tap opens a peek** (Hub question 1's default), not the profile: every mark in words with its proof, where she is, and Open profile / Start session. Beside the card when the Hub is wide; centred when narrow, so it never covers the bottom bar and pays no inset.

### The cherry on top (hub cherry round, Sep 28 2026)

- **Your own column, in words** (Hub direction B's focus column). Your column takes four shares of the SPARE room to every other column's one, up to 420px, and never more than there is: its least is every column's least (156px), so it pushes no column off an iPad the others would have fit. On an iPad on its side with five trainers that is about 330px. Its head says your day in words (`your-day.ts`): "12 sessions · 6:00 AM – 12:00 PM · 8 to go" — "to go" is the clock's answer (a slot not over yet), never "done", which the cards say; the span gives way first in a narrow head. Its cards (`HubCard wordy`) say every mark's sayable word once they have about 280px inside, not only the first, and "first with you" joins the sayable words there (`sayableWord(m, { yours: true })`). A Pulse flag, a waiver or a renewal talk is still a glyph alone.
- **A number is never cut.** The card's time and her number (`.hs-card-when`) never shrink; "Not logged", "New to Journey" and a service (`.hs-card-rest`) give way first, with an ellipsis. Before, a card with two glyphs and "+N" in a narrow column could clip "#212" to "#2" — a confident wrong number.
- **The Next 30 minutes strip** (`next-half-hour.ts`, `NextStrip`): who is due across the floor, with whole names, in one quiet row UNDER the top — the top keeps its two rows (AJ: "very jumbled"). Today only; from half an hour before the day's first booking until its last one ends, so the row doesn't come and go under the trainer's finger ("Nobody due in the next 30 minutes." in a quiet gap). A booking is on it while its slot overlaps the next half hour: "In session" (a Journey session open), "Now · 9:30" (under way, none open yet) or "9:45" — the Opportunities list's "Now and the next 30 min", asked of each booking. Never one that is over (AJ, Hub question 2), by the card's own state. Soonest first; yours first at the same time; then the columns left to right. Each item: when, the name she goes by, who with, the triangle (the only red) and the card's own marks with their sayable words. A tap opens the same peek; a booking with no profile is shown and opens nothing.
- **Focus: Me | Everyone** (`focus.ts`): at the end of the day summary's own line (the chips scroll rather than push it onto a line of its own), offered only to someone with a column that day. Me is the focus column; Everyone is every column alike — the calm Hub as it was, for a leader watching the whole floor. Me by default; remembered on the iPad in local storage, which a sign-out clears (no module memory, so no `forgetOnSignOut`).

## Reads

Beyond what the Hub already streams: **one listener on the studio's standing weeks** (`useStandingWeeks`, `studios/{s}/standingWeeks`, for the hatching) and **the studio's package table** (`useRenewalSettings`, one document, for the peek's Package line — the read the profile and the directory make). No per-client query, no Mindbody call, no new index, no write.

The cherry on top adds no read: the focus column, the strip and the switch work from the bookings, the sessions and the one engine the Hub already has, and the choice of focus is kept in the iPad's local storage.

Wave 2 hub (Sep 28 2026) adds **the studio's FORD, once per studio visit**, for Get to know — ONE collection group query, read by the engine's side (`hub-opportunities/use-hub-ford.ts` over `ford/hub-read.ts`) — and **the nightly marks**, for All stars — ONE document by id (`hub-opportunities/use-hub-marks.ts`, `studios/{s}/watch/hubMarks`), both only for someone who works at the studio (`mayReadWeeks`, asked once in ClientsView as `readsStudio`, the same answer the standing weeks' listener asks).

## Out of scope (and why)

- **Surgery or away from dated notes**: not asked for in wave 2. Its FORD half could ride on Get to know's read; the dated notes need a journal read of their own.
- **"Couldn't load, retrying"** when the schedule read fails: `useLiveSchedule` doesn't say so yet; it needs the hook to expose the failure.
- **Columns by trainer id only** and an "Unassigned" column (the Screen Atlas): the matching is the old `isTrainerMatch`, unchanged, until the sync's staff ids are checked.
- **A tap on a column header** opening Opportunities for that trainer, **"+N" opening the row**, **"Show on schedule"** from the list: the list has no trainer filter or scroll target yet.
- **Zoom (Day | Close)** from Hub direction B: not asked for in the cherry round.
- **Words for a Watch or Renew mark in your own column** ("No waiver", "Renewal talk", "Pulse flag", as the blueprint's B drew them): kept a glyph alone, because a client stands at the iPad — a question for AJ.
