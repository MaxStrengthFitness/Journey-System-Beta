# The Relay Board rebuild — Oct 3 2026

Branch `oct3/relay-board` in the profile-head worktree, on `oct3/front-door` (live as 969ce169) plus that day's Client Directory live-edit (below). One commit per phase, each typechecked on its own.

## Why

AJ, on My Studio → Relay → Board, Oct 3 2026:

> "this screen is right now, I think, awful. It's really hard to understand what I'm looking at. There's so many different box sizes, text sizes, and there's nothing is consistent on the screen. Realistically, this is replacing the uh, laminated paper of a to-do list of daily things to do at a studio. Right now, when I open this, I don't even know what the heck to look at first ... I don't know what I can interact with, what's not interactable, what's information. This just needs a complete redesign."

He asked for research first: "theories or some renowned tasks designers ... task planners that you would buy at a store ... how do companies really track like, hey, are we getting all the little stuff done?"

**What was wrong, counted from the code:** 12 kinds of box, 17 kinds of button, 5 heading styles and about 15 corner sizes from 10 stylesheets; the doors, the Close out card and the side notices all had the same border, so tappable and information looked alike; no order of the day (the screen opened on a writing box, then five doors, then one dealt card, with the rest behind the doors); about nine sections before the first checkbox.

**The research** (`harness/research-relay-board.md`, git-ignored): Gawande's checklists (pause points, DO-CONFIRM, a handful of killer items), paper planners (one column, the box on the left, identical rows, done stays visible), frontline operations apps (Jolt, Zipline, YOOBIC, 7shifts: a tick records who and when), lean visual management (the kamishibai board: rows by when, columns by area, red/green cards readable from across the room), Things 3 and Linear (one row design, calm), NN/g's flat-design study (weak tap cues make people hesitate).

## AJ's choices (his words)

From a clickable comparison page (`harness/relay-board.html`, git-ignored): three directions, five card styles, four upright layouts, three headers.

| Question | AJ |
| --- | --- |
| The shape | "I think i like C" — the kamishibai board |
| The card | "Checkbox card." |
| Upright iPad | "One part of the day at a time" |
| The header | "Tabs are the header" ("lets clean the top header up theres just a a lot going on up here its hard to not just skim read everything") |
| Does Relay still pick a job for you? | "No, the board is the plan" |
| How much this round | "Board, Tracker and Journal" |
| The header's time button and Tracking chip | "Drop both" |
| The Playbook (was behind Help a teammate) | "Journal tab" — it already was: the Journal's Studio shelf is the studio's Playbook |
| A team job's checkbox | "Box opens the job" (no parts and no note: it finishes in one tap, with Undo) |

## What was built

1. **The cards** (`relay/board/cards.ts` + test). Every chore, ask, team job, client task, initiative and renewal talk the Board already holds becomes one card: a part of the day (Opening · Between clients · Close · This week; a chore's shift says which, an ask or a job for a later day is This week), a column (Floor · Desk · Clients · Team: where the work happens), a state (to do, taken, started 5 of 8, waiting, not yet, done with who and when) and what its box does. Pure; nothing stored.
2. **The calm header** (`my-studio/StudioHeader`). One row: My Studio · Relay ▾, Board · Tracker · Journal, the day, "● 2 new" (Since you were in, drawn by the Board into the header's slot), Ask, +. Under it, the bar each tab fills with its parts (`RelayContext.slots`). The time button, the day strip and the Tracking chip went.
3. **The Board** (`relay/board/Board.tsx`, `BoardCardView.tsx`, `board.css`). The parts of the day as tabs under the header, opening on the part it is now, each with "4/5", a blue dot for now and an orange dot when someone is waiting; four columns of checkbox cards (four down to an upright iPad, two beside an open panel, one on a phone). The box finishes the work in one tap with the eight-second Undo, or, dashed, opens it where one tap can't. The words open the work beside the board: a chore's machines, Mark all, I'm on it and a leader's Put a name on it; an ask or an initiative whole (the asks lane drawn for one ask: take it, answer, replies, quick replies, Log mine); a client task the client's own flow; a team job its sheet. "I can't" on work with your name on it, as before. Nothing is dealt.
4. **The Tracker** (`MyTasksPanel`, `tracker.css`). Its lists are tabs under the header; each row is drawn as the Board's card; + To-do, New reminder and All my tasks on the list's first line. The Tracking box went.
5. **The Journal** (`NotesPanel`, `JournalToday.tsx`, `journal-today.css`). Tabs: Today · Notes · Day logs · On this day · Studio shelf. Today holds Things to carry and One line for yourself (from the Board's Opening and Close out cards, the same private day log) and the Write row; Notes keeps the list and the editor.
6. **What the old Board left behind** went: the doors and their decks, the dealt card, Not now's snoozes, Tracking, the swipe row, the shift rings and strip, Team today, Opening and Close out, the lanes behind the doors. **Kept, with a new home**: the Floor Map, under today's cards, folded to its line until a machine wants a wipe, is due a deep clean or is flagged (it is the studio cleaning log's reader); the studio's quiet-floor number, now the status row's "Quiet floor right now (…): a good time for floor work."

**No new data, no Firestore structure or rules change, no index, no Mindbody call, no Function.** Every write is one the work already had.

## Checked

Typecheck at the baseline (2). The full suite under `TZ=America/New_York npx vitest run --dir src` in the worktree on AJ's PC (count in the commit and CLAUDE.md); build clean. In the preview on the PC, against Strongsville's real data (looked at, nothing ticked): landscape, an upright iPad (820: one header row, four 188px columns, no sideways scroll) and a phone (375: one column; the part tabs scroll sideways rather than cut a name).

## For AJ on the iPad

- Walk Opening, Between clients and Close at the studio's real times; tick a chore and use the Undo.
- A teammate's cover should be the one orange card; its box opens it ("I can") rather than closing it.
- Strongsville's Floor Map opens by itself: all 19 machines show "due a deep clean" because none has been logged there yet. Logging one folds it.
- The Journal opens on Today; Notes is one tab over.

## Open

- The Board shows today's instances only; a weekly chore planned for another day this week isn't on This week (it would need reads of other days).
- `MachineUpkeepCard.tsx` (studio-tasks) was already unused before this round; left as it was.
- Some old stylesheet rules for the removed lanes (`sh__` in studio-hub.css, `shr_`, `gb_`) remain; they style nothing now.

---

## Before the Board, the same day: the Client Directory (live-edit)

Five commits on `oct3/front-door` (4ae90986 … 45d6f2c0), in AJ's words:

- The sort is a pill and a panel of tiles ("this drop down menu is so basic and just an eye sore to open"), on the Hub's scale.
- **Renewal**: a sort, a column and a search filter ("can we also filter by renewal date for their contract?"; "yes, add that filter"): the nightly snapshot's `focusDate` (the day the package effectively ends, as Operations → Month reads it), else the end of the contract Mindbody is billing; "renewing this month", "renewing next week", "in 3 weeks", "in November", "soon" in the search.
- Cells wrap between words ("words are wrapping weird here").
- **Paid in full** ("These are paid in full. We need a way to mark that on a client's profile"): the mark already exists (Notes & Profile → Account → The package → the lock); the Directory now reads it, and Mindbody's own names ("96 PIF"), and says "Paid in full · ends when sessions run out". At Strongsville that answered 43 of 92 Unknowns; 49 still need marking. Strongsville has no nightly renewal snapshots because it has no cutover date (`studioIsLive`).
