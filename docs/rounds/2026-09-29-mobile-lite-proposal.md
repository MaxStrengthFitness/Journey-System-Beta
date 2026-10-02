# Proposal — Journey Lite on a phone

*Sep 29 2026. A proposal, not built. AJ: "i want to possibly look into a mobile view run that is a Lite version of the app, not really meant to run sessions on but more to view all the information and data and also look at your own schedule for the day."*

## AJ's direction, Oct 1 2026

> "Mobile lite mode is not limited only to viewing clients profiles but should mainly focus on those view for operations and schedule. we could make running a session just show the routine and current weight and reps but it is not advised to run a session on your phone"

What that changes in the plan below:

- **The phone leads with the schedule and Operations, not the client.** The bottom bar becomes **Schedule · Operations · Clients · My Studio** (Operations for whoever `mayOpenOperations` allows; a trainer without it gets Schedule · Clients · My Studio). A client's codex is something you reach from the schedule or a search, not the heart of Lite.
- **Schedule is the Hub's day, not only your own.** The same day engine (`hub-opportunities/use-day-moments.ts`, `hub-schedule/`) drawn as a list of times rather than the grid: Focus starts on **Me** and **Everyone** is a tap (the Focus switch already exists and is remembered), any day of the week, the peek on a tap. Open question 1 below is answered by this: both, Me first.
- **Operations is all of it** (open question 3, answered): Today · Week · Month · Clients · Team, one column. Setup stays on the iPad (it is editors: the floor, people and access, the Mindbody settings).
- **A session on a phone exists, but small, and says it isn't the way.** Not the Active Session: a **phone session sheet** that lists the routine in order and, for each machine, the current weight and the last reps, with the set's outcome recorded through the same session write the iPad uses (one write path, `session-record`'s Finish). Before it opens: "Sessions are meant to be run on the iPad. Use this only if the iPad isn't available." No briefing panel, no Now Bar, no Wrap-up beyond Finish; the set-up details, notes and Pulse wait for the iPad. The row "Never on a phone" below loses Start session.

AJ, later the same day: "its not that its a serperat app its just the phone style of it ... just showing one session at a time will not do, seeing at least 5 sessions at a time is actually meaningful" — and recording on a phone is allowed ("its not that a trainer isnt allowed to i just dont know how well we can fit sizing", then "take creative control"). So the session sheet shows each machine with its **last five sessions** side by side, and records.

## The shape (Sep 29, before AJ's direction)

Journey is one app, one build, one sign-in. **Lite is not a second app**: it is what Journey shows when it is opened on a phone (a viewport under about 600px wide), and it is read-first. Nothing is built twice — every screen Lite shows is the iPad's screen, laid out for a phone — and what a phone must not do (run a session) is a rule on the screen, not a missing file.

| On a phone | What it shows | Source |
| --- | --- | --- |
| **Today** (opens here) | your own day: your sessions in order with the time, the client, the service and the card's marks (the Critical triangle, the Key's glyphs); one tap opens the client. Tomorrow below it. | the Hub's ONE engine (`hub-schedule/your-day.ts`, `card-marks.ts`) with Focus fixed to **Me** |
| **Clients** | the Client Directory's search and rows (All · Mine · In today), one column | `client-directory/` (`row.ts`, `search.ts`) |
| **A client** | the codex, page by page: Overview, then Journey (her last sessions and the machine window read only), Programming (read), Notes & Profile (read, and a note may be added — typing is fine on a phone), Activity Archive (read) | `client-codex/`, with `codexAccess` unchanged |
| **My Studio** | Relay's Board read-first (Right now, what is dealt to you, Just now; asks and takes allowed, they are a tap), Openings' Next 7 days, Team's who is away | `relay/board/`, `openings/ui/` |
| **Operations** (leaders) | Today's brief, Month, the Journey's list — the same pages, one column | `admin/` (already one column under 760px) |
| **Never on a phone** | Start session, the Active Session, the Wrap-up, the floor editor, the catalog editor, the machine editor, Admins | `whenToLoad`-style rule: `isPhone()` in one place |

## Why it is cheap

- **The app is already iPad-first in portrait**, so most screens are one column at 768px and need only their gutters and type checked at 390px. The redesign's rooms (Operations, the Hub, the Directory, the codex) were built with `overflow-wrap: anywhere` and 40px controls; the names-wrap round (Sep 29 2026) took the last clipped names out.
- **The Home Screen app is done** (`features/home-screen/`): the manifest, the status bar, the safe areas. On a phone it is the same Add to Home Screen.
- **The data is the same reads.** Lite adds no query shape: your day is the Hub's, the client is the codex's, Operations' pages are their own.

## What it needs

1. **One rule, `src/lib/device.ts`: `isPhone()`** (viewport width under 600px, remembered per session) and a `PhoneOnly` guard component that says "Open this on the iPad" for the screens above, the way `mayOpenOperations` gates Operations on the screen rather than only in the menu.
2. **A phone shell**: the bottom bar with four tabs (Today · Clients · My Studio · Operations for leaders), the top strip, and the app-mode switch hidden. `AppContent.tsx` already switches on `currentView`; the phone shell is a second `AppShell` layout, not a second router.
3. **Today on a phone**: a new `features/phone-today/` (pure `today-list.ts` over the Hub's engine, `PhoneToday.tsx`), the only new screen. The rest is layout.
4. **A phone pass per room**: the codex, the Directory, Relay's Board, Operations' Today and Month, each checked at 390 × 844 in the harness and given the few CSS rules it needs. The `look.test.ts` pattern (no name cut short, 40px controls) extends to a `phone.test.ts` per room that holds the rules at that width.
5. **Sign-in and the studio pick** on a phone: already one column; verify.

Roughly: one day for the shell, the rule and Today; one to two days for the room passes; a walkthrough round on a real phone.

## What it deliberately does not do

- **Run a session.** The definition of exercise (the floor doc) has the iPad set down at every machine; a phone in a hand is not that. Start session is not offered, and a running session is not shown as more than "Sam is in a session with Rosie, machine 4 of 7" (the watching view, read only).
- **Book, ping or contact anyone.** Unchanged.
- **A second data model or a second write path.** A note added from a phone is the same thread-write as the iPad's.

## Open for AJ

Answered Oct 1 2026: the first screen is the schedule (Me first, Everyone a tap), and Operations is on a phone. Still open:

1. On the phone session sheet, does a trainer **record** the weight and reps (so the session counts and Finish logs it), or only **read** them to guide a session someone else logs on the iPad?
2. May a trainer **add a note or a FORD detail** from a phone, or is the rest of Lite read-only?
3. A phone's **Add to Home Screen** icon: the same J, or a marked one?
