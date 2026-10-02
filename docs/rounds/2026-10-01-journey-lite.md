# Journey Lite: Journey on a phone (Oct 1 2026)

**Branch** `lite/phone`, on master's `e0b08204`. **Deploy:** the push alone (no rules, no index, no Mindbody, no Cloud Function).

## The brief

The Sep 29 proposal (`2026-09-29-mobile-lite-proposal.md`) and AJ's answers on Oct 1:

- "Mobile lite mode is not limited only to viewing clients profiles but should mainly focus on those view for operations and schedule. we could make running a session just show the routine and current weight and reps but it is not advised to run a session on your phone"
- "its not that a trainer isnt allowed to i just dont know how well we can fit sizing, i guess take creative control and see what you can fit"
- "its not that its a serperat app its just the phone style of it, i just dont think you can fit an entire history for the client, just showing one session at a time will not do, seeing at least 5 sessions at a time is actually meaningful"

## What was built

One answer to "is this a phone" (`src/features/phone/device.ts`: under 600px wide, or a short touch screen), and the same app laid out for it. Nothing reads or writes differently on a phone. `src/features/phone/README.md` is the detail.

| Where | On a phone |
| --- | --- |
| **The shell** | The bottom bar is **Schedule · Operations · Clients · My Studio**, plus **Session** while one runs; Operations for whoever may open it, and a tap switches the app mode itself. Learning, Calendar, Settings, Refresh, the theme and feedback are in the avatar menu (a 40px avatar), so the header keeps the studio's name, the bell and the avatar. The shell pads 12px, not 24px. Toasts sit inside the edges, above the bar. Every text field is 16px on a touch phone, so iOS never zooms the page on a tap (pinch zoom stays). |
| **Schedule (the Hub)** | The day as **one list in time order**: the grid's own blocks and its own cards, the same Peek. Me narrows to your bookings, Everyone shows "with Sam" under each time, a Now line on today. The top keeps the layers and the two doors (icons) on one row, the week under them, and Me / Everyone across the phone's width with the chips scrolling under it. |
| **A session** | The briefing says once, above Start, that sessions are meant for the iPad; never a gate. Live, one **card per machine** in today's order: the name (opens the machine sheet), its settings, its **last five times side by side** (date, weight, count, star or kaizen; a practice grey with a P, a skip says Skip), today's weight pre-filled and stepped by 2, the count ghosted and never pre-filled (L and R on a sided machine, seconds on a timed one), the star and the kaizen, Timed, Practice, Skip, and Next. Every change is the grid's own write; the card in hand is the Now Bar's machine; Finish and the Wrap-up are the iPad's. The session bar wraps: the name first, whole. |
| **Operations** | The six destinations in one row, a destination's pages sharing a row, the freshness line's clock beside its words, the Journey's stops two to a row, the trainer-by-week tables keeping the name fixed while the numbers scroll in their panel, Staff & roles' name and meta one under the other. |
| **A client's profile** | The header on three rows (the name whole), the tabs wrapping instead of an ellipsis, Notes & Profile's pages two rows of four, and the Journey tab's grid showing the **newest five sessions** (a narrower machine column; Highest scrolls with the timeline). |
| **Clients (the Directory)** | Each row a card: the name across, then Last in · Next · Left side by side. |
| **My Studio** | Relay's header on three rows (nothing off the screen), the doors two across, the usual week's day chips on one row, the Calendar month's counts under their dates. |

### Found on the iPad too, and fixed at every width

- Operations' tabs were a five-column grid for six destinations (since Month, Sep 29), so Setup sat alone on a second row upright.
- My Studio → Team: the scroller kept the screen's height, so the staff panels were drawn over the last half of Team.
- The studio task list's starter buttons sat on the panel's edge.
- `relay/planner.render.test.tsx` read the real clock and failed every evening ("Solon is closed now"); it now holds a Thursday mid-morning.

## Checks

Typecheck 2 (the baseline); `TZ=America/New_York npx vitest run --dir src` **8,595 passing in 614 files** (31 new tests in 4 files under `features/phone`); `npm run build` clean; case check clean. Each room was looked at in a harness at 390 × 844 and 360 wide, dark and light, by headless Chrome (an iframe or the DevTools protocol at the true width: headless Chrome on Windows will not draw a window under 500px). No iPad layout changed but for the fixes above.

## Left for later, or for AJ

- **The Calendar's Day timeline** draws a 7:00 booking inside the trainer-name column and spells a half-hour block's name a letter a line, on the iPad as well. Not a phone problem; not touched.
- **Wide tables** (Hours, Insights' By trainer, the Renewal Brief's options) scroll inside their panel on a phone, with the name fixed. Honest for a grid; say if you want them as cards.
- **Relay's header** is three rows on a phone (about 215px). Hiding an empty "Tracking: nothing yet" would save a row, but changes what the header says.
- A walk on a real phone: sign in, the four tabs, a client, a session start to Finish. The harness can't sign in.
