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
| `DayHeader.tsx` + `day-header.css` | `DayHeader` (the command bar: layers, chips, Today, Tasks, Key; then the week), `DaySummary` (the spotlight's line, an unread day, the phone's Focus), `KeySheet` (prefix `hd-`) |
| `peek-model.ts` | What the peek says, from the same entry as an opened Opportunities row. Pure |
| `Peek.tsx` + `peek.css` | The peek (prefix `hp-`) |
| `your-day.ts` | Your own column, in words: the head's line ("12 sessions · 6:00 AM – 12:00 PM · 8 to go"), in parts so a narrow head can drop the span. Pure (hub cherry round) |
| `next-half-hour.ts` | Who is on the Next 30 minutes strip and when it shows: today only, from half an hour before the first booking to the end of the last; never a booking that is over. Pure (hub cherry round) |
| `NextStrip.tsx` + `next-strip.css` | The Next 30 minutes strip (prefix `hn-`): one quiet row under the top; a tap opens the peek (hub cherry round) |
| `focus.ts` | Focus: Me or Everyone, on a phone only since Oct 3 2026, remembered on the device (local storage, cleared at sign-out); the focus column's id (hub cherry round) |
| `hub-day.ts` | The Hub's day: the studio's today, the week strip from it, a day picked on purpose or "follow today", the day's title. Pure (hub fixes, Oct 1 2026) |
| `columns.ts` | Which column a booking goes in: the trainer id, else the Mindbody staff id at this studio's site, else **Unassigned**; never a name. Which trainers have a column. The staff name an Unassigned card may say. Pure (hub fixes) |

`components/ClientsView.tsx` is still the screen: it asks `columns.ts` for the columns and which booking goes in which, and hands the grid its cards. `ClientsView.render.test.tsx` mounts it.

## Decisions

- **One engine.** The card's marks are the Opportunities list's moments (`cardMarks(entry.moments)`), asked about the booking's day. The old card's own rules — every 25th session, 21 calendar days for "back", birthdays counted from today, away/medical from `client.events` (which nothing writes) — are retired on the Hub. `lib/hub-markers.ts` stays for the briefing, which still uses them (see the round's open items).
- **The Key's order decides which marks make the card** (Read first › Watch › Welcome › Celebrate › Renew › Get to know); among the two chosen, one that can say a word goes first. Words beside a glyph are only sayable ones — "100th", "turns 80", "1st session", "back", "Consult" — because clients stand next to the iPad (research-hub §7 rule 9). A Pulse flag, a waiver or a renewal talk is a glyph alone; its words are in the peek and the list.
- **Get to know** (wave 2 hub, Sep 28 2026): the ✎ "Ask about" from FORD is a blue speech bubble ALONE — no word beside it in anyone's column, your own included, and its label (a screen reader's, the "+N"'s) is only "Something to ask about", so a client's home life is never on the grid. Last in the Key's order: on a card with two other marks it is part of the "+N". Its sentence is in the peek (the last of the lines) and the list; it lights from the day summary's "Get to know" chip ("Showing 2 to ask about on the grid"), and the Key has its row. A finished card drops it with every other mark. When the studio's FORD couldn't be checked, the peek says so quietly at its foot.
- **All stars** (wave 2 hub, AJ's Hub question 6) never touches the grid: no glyph, no word on a card. The peek says "All star: in 25 of the last 26 weeks, about twice a week." in one sentence under the marks (`.hp-star`, the lines' own ink), only for a client the nightly marks name; the Opportunities list gives her a section on its Sessions sort.
- **Colour means one thing per channel.** The left edge is the booking's state (coming up, in session, over); the glyph colour is its family (Watch plum, Welcome blue, Celebrate orange, Renew green); crimson is the Critical triangle alone. The Pulse flag moved from rose to plum. The amber clinical-history dot left the card (Hub question 3's default) — the peek and the Opportunities row say it quietly, and the briefing holds the detail.
- **"No waiver signed"** (AJ, Sep 28: Mindbody's "nw" corner): a plum glyph, a Watch moment, only for a definite "not signed" (`lib/client-waiver.ts`); "not synced yet" says nothing. It never blocks a session (Hub question 9's default). **Only where the studio keeps its waivers in Mindbody at all** (hub fixes, Oct 1 2026: Strongsville's Hub flagged 32 of 32): with no client the Hub holds for the studio signed in Mindbody, "not signed" is unknown and no card is flagged (`waiversKeptInMindbody`, `waiverFlagState`).
- **Done goes quiet** (AJ, Hub question 2: "once the session is done it should make a lot less noise so trainers can focus on the rest of their day"): a card that is over recedes and drops every mark, the triangle included. Done means logged is unchanged (`lib/hub-card-state.ts`).
- **"Didn't come"** (Operations room, wave 3, Sep 29 2026): a leader's mark on a booking nobody logged (`studios/{s}/bookingMarks`, `admin/attention/booking-marks.ts`) is read by the Hub with ONE listener for the day on screen (`useBookingMarks` in `ClientsView`, for someone who works at the studio), handed to every card (`noShows`), the Next 30 minutes strip and the day's moments engine. A marked booking recedes with a quiet "Didn't come" (`hubCardState` → `didnt-come`), never "Not logged"; a session logged that day still beats the mark (done means logged); unread or refused marks change nothing. Mindbody's own No-Show, should the sync ever carry it, reads the same.
- **Names whole** (Hub question 8's default): the name she goes by (`clientDisplayName`), wrapping, never cut; columns at least 156px.
- **Her number** from #4, and only when it may be quoted (`canQuoteSessionNumber` through the engine); 1–3 are the Welcome glyph's to say; not repeated when the milestone glyph says it; "New to Journey" in its place when her story began before the cutover (AJ, Sep 22). **In the card's top-right, quietly** (AJ, Oct 1 2026: "i do wish the top right of the card said what session number they were on in a very subtle manner"): 11px, the muted ink, tabular, floated at the right of the name's first line (`cornerNumber`); the Critical triangle keeps its own slot at the far right. A client who started on Journey keeps it as her Mindbody count grows (`visitsBeforeJourney`, lib/prior-history.ts).

### The hub fixes (Oct 1 2026, `docs/rounds/2026-10-01-hub-fixes.md`)

AJ, on the Screen Atlas's list of what looks off on the Hub: "these very much need to be addressed."

- **Today is the studio's day** (`hub-day.ts`): from the minute clock, which also ticks when Journey comes back on screen. Left on today, the Hub moves to the new today at the studio's midnight; a day picked on purpose stays picked. The strip and the title move with it.
- **A failed read is unknown, never a quiet day** (`useLiveSchedule`'s `dayState`): one plum line above the grid with Try again (40px); "Nobody is booked" only for a day that was read; with the client list unread, no card says "Not synced yet" (kind `unknown`).
- **Columns by id, never a name** (`columns.ts`): Unassigned holds what no trainer can claim, saying Mindbody's staff name whole; "You" by trainer id; two names that read alike show the full names.
- **The card's second line is never cut**: "Not logged", "Didn't come" and "Left open" sit with the time; "New to Journey" and a service show whole or not at all, and the peek says them in full (`cardRestWords`).
- **Left open**: a session gone quiet for an hour (the app's one staleness rule, `isSessionValid`) is never "In session" all day; it recedes with a plum edge.
- **The peek says what happened** and its button follows it (`peekState`): Edit session opens the Activity Archive's own session pop-up for that day's session (AJ: "switching 'start session' to 'edit session'"); Open session or Resume or start new go to the Active Session; Log past session opens her Activity Archive; Didn't come has no Start.
- **A tap on a column head** opens Opportunities narrowed to that trainer's bookings (AJ approved), with Show everyone.
- **The first time label** sits below its line, never half under the trainer row.
- **The service** only when it isn't the day's usual one (`usualServiceOf`: the name most of the day's bookings carry).
- **Real lengths.** A booking is drawn from its own start to its own end: a 30-minute session is 64px, a 45-minute consult 97px. Overlaps share the column in lanes.
- **Folding.** An hour or more with nothing booked in ANY column is one band ("No sessions 1:00 – 2:00 PM"); a tap opens it for the day on screen. Never over a booking; a booking starting where a band ends starts below it.
- **Who's working** (AJ's Keep): the agreed standing week hatches the hours a trainer isn't on, and a day away hatches the column and says "Away". No agreed week, or no answer, hatches nothing (a failed read is unknown, never "off"). It only shades: a booking in a hatched stretch is still drawn, and Journey books nothing.
- **The top** (AJ: "very jumbled"; then, Oct 3 2026, "it's getting cut off ... use some creative design", and he picked direction B of three): **one command bar**, the way Linear's and Arc's toolbars hold a screen's controls. The layers, a hairline, the list's own chips (six since Get to know, wave 2 hub; each its family's icon and count), then Today when you are elsewhere, Tasks with its count and the Key, on one surface; the week with each day's count and a dot for a day to celebrate under it. Six bordered boxes of equal weight became one strip. On an iPad on its side the chips and tools say their words too ("Celebrate 1", "Tasks 41"); upright they are icon and count (every one keeps its whole name for a screen reader); the bar never wraps on an iPad, the chips scroll first. On a phone it is two rows: the layers, then the chips and the tools. The line under the top is drawn only for what neither says: the spotlight, a day whose bookings aren't read yet, and the phone's Focus. Zero is left out, never drawn as "0". Tasks opens Relay and never shows a grey 0 while it loads.
- **The spotlight** (research-hub §6.1): a chip lights its cards and dims the rest; the bar says what it shows in words, steps to the next card, opens the same group as a list (the Run-sheet's `request`), or is done.
- **The tap opens a peek** (Hub question 1's default), not the profile: every mark in words with its proof, where she is, and Open profile / Start session. Beside the card when the Hub is wide; centred when narrow, so it never covers the bottom bar and pays no inset.

### The cherry on top (hub cherry round, Sep 28 2026)

- **Your own column, in words** (Hub direction B's focus column). Your column takes four shares of the SPARE room to every other column's one, up to 420px, and never more than there is: its least is every column's least (156px), so it pushes no column off an iPad the others would have fit. On an iPad on its side with five trainers that is about 330px. Its head says your day in words (`your-day.ts`): "12 sessions · 6:00 AM – 12:00 PM · 8 to go" — "to go" is the clock's answer (a slot not over yet), never "done", which the cards say; the span gives way first in a narrow head. Its cards (`HubCard wordy`) say every mark's sayable word once they have about 280px inside, not only the first, and "first with you" joins the sayable words there (`sayableWord(m, { yours: true })`). A Pulse flag, a waiver or a renewal talk is still a glyph alone.
- **A number is never cut.** The card's time and her number (`.hs-card-when`) never shrink; "Not logged", "New to Journey" and a service (`.hs-card-rest`) give way first, with an ellipsis. Before, a card with two glyphs and "+N" in a narrow column could clip "#212" to "#2" — a confident wrong number.
- **The Next 30 minutes strip** (`next-half-hour.ts`, `NextStrip`): who is due across the floor, with whole names, in one quiet row UNDER the top — the top keeps its two rows (AJ: "very jumbled"). Today only; from half an hour before the day's first booking until its last one ends, so the row doesn't come and go under the trainer's finger ("Nobody due in the next 30 minutes." in a quiet gap). A booking is on it while its slot overlaps the next half hour: "In session" (a Journey session open), "Now · 9:30" (under way, none open yet) or "9:45" — the Opportunities list's "Now and the next 30 min", asked of each booking. Never one that is over (AJ, Hub question 2), by the card's own state. Soonest first; yours first at the same time; then the columns left to right. Each item: when, the name she goes by, who with, the triangle (the only red) and the card's own marks with their sayable words. A tap opens the same peek; a booking with no profile is shown and opens nothing.
- **Focus: Me | Everyone** (`focus.ts`). **Off the iPad since Oct 3 2026** (AJ: "this is useless now with our auto filter, remove it"): the columns run yours first, then everyone with sessions (`columns.ts`), so on the iPad your column is always the focus column. It stays on a phone, where Me narrows the list to your own bookings. As it was: at the end of the day summary's own line (the chips scroll rather than push it onto a line of its own), offered only to someone with a column that day. Me is the focus column; Everyone is every column alike — the calm Hub as it was, for a leader watching the whole floor. Me by default; remembered on the iPad in local storage, which a sign-out clears (no module memory, so no `forgetOnSignOut`).

## Reads

Beyond what the Hub already streams: **one listener on the studio's standing weeks** (`useStandingWeeks`, `studios/{s}/standingWeeks`, for the hatching) and **the studio's package table** (`useRenewalSettings`, one document, for the peek's Package line — the read the profile and the directory make). No per-client query, no Mindbody call, no new index, no write.

The cherry on top adds no read: the focus column, the strip and the switch work from the bookings, the sessions and the one engine the Hub already has, and the choice of focus is kept in the iPad's local storage.

Wave 2 hub (Sep 28 2026) adds **the studio's FORD, once per studio visit**, for Get to know — ONE collection group query, read by the engine's side (`hub-opportunities/use-hub-ford.ts` over `ford/hub-read.ts`) — and **the nightly marks**, for All stars — ONE document by id (`hub-opportunities/use-hub-marks.ts`, `studios/{s}/watch/hubMarks`), both only for someone who works at the studio (`mayReadWeeks`, asked once in ClientsView as `readsStudio`, the same answer the standing weeks' listener asks).

## The roster's scope (hub fixes, Oct 1 2026)

Every iPad watches every client whose home is the studio (`useStudioRoster`, one listener on `clients where homeStudioId == <studio>`), cut at `STUDIO_ROSTER_LIMIT` (1,500) in no particular order. Until Oct 1 the cut was silent: a console warning. Now the hook says so (`cut`), the Client Directory says it in words (`rosterCutWords`), and a typed name is also asked of Firestore there, so nobody past the cut is out of reach. The Hub's cards don't need the cut lifted: a booked client the listener didn't hold is read by id as a visitor.

The listener's scope was left as it is, on purpose. Narrowing it to "clients who matter to the Hub" (active ones, or those booked in the window) would take clients away from screens that need every one:

- **The Client Directory** lists the studio's clients, inactive ones included (All · Mine · Kaizen · In today, the sorts and the descriptions), and trusts the roster for the current studio.
- **My Profile → My clients**, **Relay's Since you were in** and **the auto-sync** (`useAutoSync`) read the same list.
- **The Hub's search** (the header's box) filters the roster before it asks Firestore by name prefix.

What a later fix needs, before a historical import (FileMaker) adds years of former clients with the same `homeStudioId`:

1. A field the listener can filter on that the sync keeps true, e.g. `isActive` or a "seen in the last N months" day the nightly job writes, with the composite index (`homeStudioId`, that field). Production is Enterprise edition, which builds no index by itself.
2. Every reader above moved to ask for the rest: the Directory's All view and the descriptions by a server query (it already has `useStudiosNameQuery` for names), My clients and Since you were in by their own bounded reads.
3. The rules unchanged: a narrower query of the same collection proves itself the same way.

## Out of scope (and why)

- **Surgery or away from dated notes**: not asked for in wave 2. Its FORD half could ride on Get to know's read; the dated notes need a journal read of their own.
- **"+N" opening the row**, **"Show on schedule"** from the list: the list has no scroll target yet. (Done on Oct 1 2026, the hub fixes: "Couldn't load, retrying" when a read fails; columns by trainer id only with an Unassigned column; a tap on a column head opening Opportunities for that trainer.)
- **Zoom (Day | Close)** from Hub direction B: not asked for in the cherry round.
- **Words for a Watch or Renew mark in your own column** ("No waiver", "Renewal talk", "Pulse flag", as the blueprint's B drew them): kept a glyph alone, because a client stands at the iPad — a question for AJ.

## The rail and a lone trainer (Oct 3 2026)

AJ, on the time axis: "very dull... not very clear on the half hour marks...
just so flat", and one trainer's column across a whole iPad "looks so fat".
From three looks (`harness/hub-axis.html`, git-ignored) he picked **B, the
rail**: a line down the axis with a dot at each hour and a ring at each half
hour, every half hour named in full ("9:30", never ":30"), the hours 14px
bold; on today the rail is blue up to now and the orange stop sits at now
(`railDoneY`: all of it once the day's last booking is behind us). The axis
is 76px. With one column (`data-solo`), the column stops at 420px, the focus
column's width, and the rest of the row is hatched and says "Nobody else is
booked on this day". `HubGrid.render.test.tsx` holds both.
