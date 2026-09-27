# The app review: what AJ found on the live app, fixed the same evening

*Sep 26 2026, evening. AJ took a break from the Screen Atlas and went through
the live app in the browser pane at iPad size, pointing at things as he went.
Each item below is what he said, what was actually wrong, and what changed.
Everything here went to `master` the same evening. No rules, index or Cloud
Functions change.*

---

## 1. The refresh buttons

**AJ:** the round button in the header should refresh the week ahead, and the
calendar's Refresh should refresh the month you are looking at, "so trainers
can update the schedule if they need to". The automatic updater's timing is
fine as it is.

**What was wrong.** The header's button already asked Mindbody for the next
eight days (`REFRESH_WINDOW_DAYS`) and kept doing so. The calendar's Refresh
never asked Mindbody at all: it re-read what Journey already held. So a
booking made in Mindbody for later in the month waited for the next morning's
whole-month pull, and Refresh could not bring it in.

**What changed.** The calendar's Refresh now asks Mindbody for the days on
screen (the month in Month, the week in Week, the day in Day), from today on,
and re-reads them once the pull has landed:

- `screenSyncWindow` (`src/lib/mindbody-api-sync.ts`) is the window: the days
  on screen, never before today, like every other pull. A screen wholly in the
  past asks Mindbody for nothing and re-reads what Journey holds.
- `settleWindowFor` is where a booking that left the window is settled before
  anyone calls it cancelled: the month ahead, as it always was for the header's
  week, stretched to the calendar's last day when that is further out.
- `AppContent`'s `pullScheduleFromMindbody` is the one function both buttons
  press; the calendar gets it as `scheduleWindow.pullFromMindbody`.

**Cost.** A month is about 2 Mindbody calls at Solon and about 8 on the shared
site, so under 2 cents a press at $0.002 a call. Only a press that finds a
booking gone pays the settle on top.

Tests: `CalendarView.render.test.tsx` (new: the month and the week pulled, the
re-read only after the pull lands, a failed pull still re-reads, the button
says "Updating…"), `mindbody-api-sync.test.ts` (the two windows).

## 2. The Journey grid opens on the newest session

**AJ:** opening a client's profile, the grid is not scrolled to the most
recent session; a trainer should not have to scroll to get to today.

**What was wrong.** The grid did pin itself to the newest column when it
opened. Then the client's sets arrived and every column widened to its widest
cell (session columns are `minmax(col, 1fr)` in a max-content grid), after
the pin, with the scroller's own box unchanged. Nothing re-pinned, and the
profile sat a column or two short: Judy Daus opened at Sep 12 with Sep 16 and
Sep 22 off to the right.

**What changed, first.** The pin watched the timeline's width as well as its
frame (`8db23c0`). Checked on the live app after the deploy, Judy's profile
still opened short (377 of 476).

**What changed, second** (`d87e7b4`). Reproduced in a real browser with her
shape of data (a throwaway harness page: 14 sessions, the sets 400ms later, a
"declined" cell that widens every column from 56 to 63px) and headless Chrome,
because the browser pane was hidden and a hidden tab draws no frames, so no
observer ever reports in it. Two more causes:

- No resize observation reported the widening at all, and the browser moved
  the scroll position itself while laying out the wider columns. The grid now
  re-pins in the same commit as new rows, in a layout effect, where reading
  the width lays the new cells out first.
- The scroll event a pin causes arrives a frame later, and when the sets
  landed in between, that echo read as the trainer having scrolled away and
  switched the pin off. The first event at exactly the spot a pin set is now
  spent as its echo; a pin that did not move the grid owes none, so a
  trainer's own scroll there still counts.

Headless Chrome on the same page: SHORT (377 of 500) before, PINNED (500 of
500) after. A trainer who has scrolled back into history is still left where
they are. Tests: `pin-newest.render.test.tsx` (the two new ones fail without
the fix).

## 3. Sessions before Journey, from Account

**AJ:** a trainer should be able to add sessions before Journey from Notes &
Profile → Account, not just from the main page.

**What was wrong.** The door was there, but at the bottom of the package card,
under the whole contract history: about 1,700px down an iPad held upright.

**What changed.** It is the first thing the Account page offers, in the page's
head beside the lede, once: the header's own door, the same words, the same
rule, the same editor. Tests moved with it to `AccountPage.render.test.tsx`.

## 4. Found on the way: a cancelled booking as the next session

The profile read her upcoming bookings without skipping cancelled rows (which
keep their place in `schedules` with status "Cancelled"), so a cancellation
could show as NEXT SESSION and was counted in "N booked". The list also held
the previous client's bookings for a moment after switching clients. Now
`stillBooked` keeps only bookings still booked, the list is cleared on a
switch, and a read that lands after the switch is dropped.

## 5. The Pulse's body figure is the Catalog's

**AJ:** update the Pulse body visualizer to match the body chart the Catalog
uses.

**What changed.** Where it matters (Body & Pulse) drew a blocky silhouette of
its own. It now draws the Catalog's muscle figure (`BodyModel`, the same one
the Catalog and the Routine Builder use), male or female by her record
(`figureGenderOf`, now shared with the Routine Builder):

- The marks mean what they meant: a plum diamond for a watch-out on file (on
  the midline, since a flag records no side), an ink ring on the side she
  named in the Pulse. They sit in a second svg with the model's own viewBox
  (`FIGURE_VIEWBOX`).
- Their spots were measured from the model's own paths on all four figures
  (male and female, front and back) and are held by tests: inside the figure,
  her right on the viewer's left from the front and on the viewer's right from
  the back, head to foot in order.
- A tapped row now also lights its area on the figure in the codex's blue, as
  the Catalog lights a machine's muscles (`BodyModel`'s new `areas`, translated
  by `areaSlugs` in `types/machines.ts`, the one place the library's names are
  written). The elbow, the hip and the middle of the back have no area on the
  model, so they light nothing; their marks still sit on the spot.
- Colours are the codex's tokens: `--cx-muscle` (the Equipment set's faint ink)
  and `--cx-muscle-lit` (the brand blue, the Catalog's primary exactly in
  light). Safari reads a CSS variable in an SVG `fill`, which the Routine
  Builder already relied on.
- The model stamps every path with an `id`; the codex allows no two elements
  one id, so each moves to `data-part` once drawn.

The Pulse's pain-map INPUT is still the list of regions with L / R buttons. A
figure you tap to mark a spot is a possible next step, not built.

## 6. The client calendar shows her bookings

**AJ** (the Activity Archive's Calendar): show her upcoming sessions too, and
cancellations, reschedules, past sessions — "the whole history ... looking at
it just from above".

**What changed** (`2ff7886`, built in parallel in its own worktree and reviewed
before it was merged; `src/features/client-history/`, its README section 8):

- **One read** per opening of the tab (`useClientBookings`): her `schedules`
  rows from the Monday before the first month drawn, no end date, cancelled
  rows included. The index and the rule already existed; about 115 rows a
  client-year. A failed read, or one answered from the iPad's offline cache,
  is unknown: the legend says the bookings did not load, and nothing is drawn.
- **Booked** days still to come are outlined in the visit blue (read through
  `lib/booking-state.ts`, never from `status` alone). **Cancelled** is a small
  ×, **moved** a small →, quiet beside the visit fill and the orange event dot.
  The legend shows each only when the calendar draws one.
- **The range runs forward** to the month of the last booking, so next month
  shows ("7 booked" in its corner).
- **Words under each month**, one line per mark: "Sep 18 · moved to Tue Sep 22",
  "Sep 20 · cancelled", "Mon Sep 28 · 3:00 PM · booked with Giovanni".
- **Only cancellations Journey saw happen** (a `cancelledAt` stamp). Until about
  Sep 16 an old sweep marked every past booking "Cancelled" and those rows were
  never repaired; drawn, they would cover a client's summer in cancellations
  that never happened.
- **No "missed" mark.** A booking cannot prove a no-show.

**"Rebooked" only for a real rebook** (`08262bc`, AJ's answer). The first cut
followed the Changes list's rule — any other booking that week reads as the
reschedule — and the preview showed what that does to a Tue/Thu client:
"cancelled, rebooked Thu" for the Thursday she had held all along. Now the
other booking is named only when it first appeared around or after the
cancellation (its `createdAt`, at most 12 hours before the cancellation was
stamped), and never when it had already happened. Operations → Changes still
reads it the old way.

## 7. AJ's answers to the review's two questions

**Sessions left** (AJ: "How many left in their contract is the correct
number, but due to the fact clients can be given sessions that also plays a
part, so a left in contract and then extra sessions works"). Judy Daus's
fine print held "96 Sessions - PIF: 36 of 96" and "Session Comp: 12 of 12";
the header printed one Mindbody membership's 36 as "36 LEFT · PIF", Account
added every option up to "48 on hand". Now `sessionsSplit`
(`client-admin/account.ts`) sorts each option: **extra** (the studio's
extra-sessions names, "Session Comp" by default), **contract** (the studio's
package names, or a name that says what package it is — Solon spells it "96
Sessions - PIF", which the default table does not have), or **other**
(never guessed). The profile works it out once with the home studio's table
and hands it to the header ("36 left in contract" · "+12 extra") and to
Account (the card's "36 left · sessions left in the contract · +12 extra
sessions, on top of the contract", the sub-toggle's "36 left +12 extra"). A
contract that comes a payment at a time says "on hand", never left in the
contract, until the renewal counts the payments to come. A renewal the
nightly job worked out still speaks for itself.

**Operations → Changes** (AJ: "100% run it"). The client calendar's real-
rebook rule moved into `changesForDay` itself (`isRealRebook`,
`REBOOK_WINDOW_MS`), so Operations → Changes, the Overview and the calendar
read a booking one way. A cancellation beside her standing booking is a
cancellation whose proof names it: "Already booked Sat 11:00 AM this week,
so not a rebook." An unstamped cancellation cannot be matched to a rebook,
and reads as a cancellation. Demo Mode's seeded cancellation now reads as
one, which is what its data says (every demo booking was made a fortnight
ago).

---

## Found, not fixed

- **Sessions left, still to carry through** (after section 7): the renewal
  snapshot's `sessionsLeft` counts comps, so a worked-out renewal's chip
  ("N left · runs out ~…") and the renewal screens still add the extras in;
  separating them there is the renewal engine's change, and whether extras
  should hold off the renewal conversation is AJ's call. The Hub's search
  results and the trainer profile's Upcoming list still read the stale app
  field `remainingSessions`.
- **The Catalog's figure ignores the theme.** `MachineFigure` passes no colours,
  so `BodyModel` paints its raw-hex defaults in light and dark alike. The codex
  now passes tokens; the Catalog could do the same (`--wk-muscle-*` exist and
  are unused by the figure).
- **Duplicate ids from the anatomy library** remain on the Catalog and the
  Routine Builder pages (the codex handles its own).
- **The client calendar, not yet:** the List view does not show bookings; a
  client with no sessions still gets the empty state rather than her upcoming
  bookings; a month with eight or more bookings ahead grows tall on an upright
  iPad (worth a look on the real thing).
- **Stale comments:** `src/types.ts` (~1452) and `lib/mindbody-api-sync.ts`
  (~377) still say the webhook writes no cancellation stamp; it does
  (`functions/src/mindbody/index.ts` ~942 and ~1223).
- **A booking the old sweep wrongly cancelled that is then really cancelled**
  stays unstamped (the webhook stamps only a row not already "Cancelled"), so
  the calendar does not draw it. The safe direction.

## Measured

| | |
| --- | --- |
| Typecheck | 4 (the baseline) |
| Suite | **5,761** passing in 364 files with AJ's two answers built; 5,744 with the client calendar (`TZ=America/New_York npx vitest run --dir src`, AJ's PC); 5,699 in 362 after the grid's second fix; 5,697 after the body figure; 5,690 after the first four |
| Build | `npx vite build` before every push from the second on, and the server bundle |
| Live | Checked on the live app after the 22:16 deploy: the Hub's button pulled the week (163 bookings at Solon, 0 added, 0 updated, no errors); the grid still short, which led to the second fix |

## Shipped

Pushes to `master`, no rules, index or function change:

1. `54b92a1` calendar Refresh · `8db23c0` the grid's pin · `9e7eb43` the Account
   door · `33ed337` the next session (pushed 21:50; Render served it from 22:16).
2. `55ce329` the body figure (pushed 22:09).
3. `d87e7b4` the grid's second fix (pushed 22:32).
4. `2ff7886` the client calendar · `08262bc` "rebooked" only for a real rebook ·
   this document (pushed 22:39).
5. `c82ecdc` Operations → Changes: a reschedule only for a real rebook · the
   sessions split (header and Account) · section 7.
