# FileMaker parity: does Journey do everything FileMaker did for a trainer?

Read from AJ's 17 screenshots of the live FileMaker app on a studio iPad (FileMaker Go, Sep 16–17 2026), shared Oct 1 2026. No client data is copied here. Each line: what FileMaker does, then where Journey stands — **Done**, **Better**, **Partly**, **Missing**, or **Ask AJ** where the screenshot can't settle what the feature means.

FileMaker has five tabs at the foot of every screen: **Home · Clients · Trainers · Machines · Admin**, plus **Workouts** once a client's chart is open. Home is only the logo ("twenty minutes + twice a week = transformation").

## 1. Finding the client (FileMaker: Clients tab)

| FileMaker | Journey | Where |
| --- | --- | --- |
| Every client in one alphabetical list with a **Filter** box | **Better.** The Client Directory: search by name or nickname (typos forgiven), described searches ("nurses over 60"), sorts, All · Mine · Kaizen · In today | Client (bottom bar), and the header search |
| Getting to today's client | **Better.** The Hub: today's bookings by trainer; tap a card for the peek, then Open profile or Start session | Hub |
| Client details: name, birth date, sex, address, phones (home, work, mobile), email, web, age, weight, height, home location | **Done.** Mindbody owns them; Journey shows them on Account | Client → Notes & Profile → Account |
| "Best place to message" | **Missing**, deliberately: Journey never contacts clients. Keep it out unless trainers used it for something else (**Ask AJ**) | — |
| **Sessions – 48** (total sessions, on the client's page) | **Done.** Completed sessions on the profile header, counting prior history when it is recorded | Profile header |
| **Last InBody scan** date on the client's page | **Done.** Body & Pulse → InBody | Notes & Profile → Body & Pulse |
| **"This client is due for an InBody scan, it has been 51 sessions since their last scan"** — a pop-up when the client is opened | **Missing.** Journey records scans but never says one is due. A trainer would learn it only by looking | Needs a rule (every N sessions — **Ask AJ** for N) and a place: the briefing's "Before you start" and the Hub peek are the natural ones |
| Client Notes: free text, newest first, each with "created … by" and "modified … by", delete | **Better.** Notes are threads with kind, loudness (Note · Heads up · Critical), when they matter, and who wrote each update; nothing is deleted, a thread is resolved | Notes & Profile → Notes; the Note button on the header |
| **Create Chart** for a client who has none (new client) | **Done, differently.** The first-visit set-up (consultation) and Programming → Setup | Profile → Start first-visit set-up |

## 2. The chart: the session grid (FileMaker: Workouts tab)

This is the screen trainers lived in, and the one the Journey tab and the live session grid are built from.

| FileMaker | Journey | Where |
| --- | --- | --- |
| A grid: rows are the studio's machines in walking order, columns are sessions, **12 to a page**, numbered from the client's first session (1, 2, 3 … 60) | **Done.** The Journey tab and the live session's grid: machines down, sessions across, older pages to the left | Profile → Journey; the live session |
| Each column shows the **session number, the date and the trainer's initials** | **Done** (number, date, initials) | Same |
| Each row shows the machine's name and **the client's settings shorthand** (seat, back pad, gap…) | **Done.** Settings under each machine name (G4 · B1) | Same |
| Each cell: **weight**, a small **numbered circle**, a pencil, and a second line (reps, or seconds) | **Partly.** Weight and reps/time are there. **Ask AJ:** what is the numbered circle? It looks like the order the machine was done in that session (1, 2, 3…), not a rating | Same |
| **Today's column highlighted** and the empty future columns ready to fill | **Done.** "Today" column outlined | Live session |
| **Flip ← / Flip →** to page back through the whole history, 12 at a time | **Done.** "Older" | Journey tab, live session |
| A cell's **own note** ("Had to assist on the last few") opened from the cell | **Partly.** Journey keeps a note on each machine's log (`notes` on the exercise log) and notes per machine in the session, but the grid cell doesn't show that a set carries a note, or open it. **To check on the iPad** | Live session grid |
| A **warning triangle** on the chart (yellow when there is something to read) that opens **Customer and Workout Notes**: standing coaching cautions ("Left shoulder issues, be wary on chest fly…") and the client notes | **Better.** The briefing's "Before you start", Critical notes as the Hub card's red triangle, and the shield on the session bar | Briefing; Hub card; live session |
| A session column's menu: **Workout Notes** for that session | **Done.** Session notes and the End Session note for the next trainer | Live session → Notes; End Session |
| **Set As Template / Use Template** | **Done.** Edit Routine → presets (Company standard and the studio's own) and Save current | Programming → Edit routine |
| **Copy This Session** (start today as a copy of a past session) | **Partly.** Today's routine starts from Routine A or B with last loads; there is no "copy session #N" button. **Ask AJ** whether trainers used it, or only to repeat last time | Briefing |
| Highlighted session numbers in the header (e.g. 8 and 33 shown in yellow) | **Ask AJ:** milestones, InBody days, or something else? Journey marks milestones (50th, 100th…) | — |
| A refresh button | Not needed: Journey updates live | — |

## 3. Trainers (FileMaker: Trainers tab)

| FileMaker | Journey | Where |
| --- | --- | --- |
| Trainer list with filter; details: name, job title, phones, address, active, email, **initials**, birth date, hire date | **Done** (name, role, initials, email, studios; My Profile and Edit profile). **Partly:** hire date and birth date are not kept — Month's anniversaries are clients' only | My Profile; Operations → Setup → People & access |
| **Create User Account**, username, privileges | **Done, differently.** People sign in with Google or Microsoft and ask for access; a leader approves and sets the role | My Studio → Team; People & access; Admins → a studio → Team |

## 4. Machines (FileMaker: Machines tab)

| FileMaker | Journey | Where |
| --- | --- | --- |
| The studio's machine list in order, inactive ones in red; a machine's name, order, and **six setting names** | **Better.** The floor editor: walking order, out of service with a reason, the studio's settings per machine, the MSF catalog behind it | My Studio → Machines; Operations → Setup → Floor |
| **Activate / Deactivate Machine** | **Done.** Out of service; "We don't have this" | Same |
| **Update Charts** (push a machine change onto every client's chart) | **Done by design.** Charts read the floor live; nothing to push | — |
| **Import Machines** | **Done.** Add from MSF | My Studio → Machines |

## 5. Admin (FileMaker: Admin tab)

| FileMaker | Journey | Where |
| --- | --- | --- |
| Franchise details: name, company, phone, address, website, number of licences, active users | **Done.** My Studio → Studio; Admins → Studios | — |
| **Sync Mindbody** and the Mindbody API details (site id, username, key) | **Better.** The Mindbody pull and the webhook; keys live on the server, never on a screen. *FileMaker shows the Mindbody key in plain text on the Admin tab — it should be rotated once FileMaker is retired* | Operations → Setup → Mindbody (read only for leaders) |
| Users per location with privileges, active, **Set as Current Location** | **Done.** Roles, the studio picker | Studio picker; Admins |
| **The list of locations**: about 20 MaxStrength studios beyond the four on Journey (e.g. Niceville, West Plano, Spokane, Waukesha, Monument, Flower Mound, Steiner Ranch, Montgomery, Boise, Winter Springs, Fort Walton, Seattle, McKinney, South Park, Little Rock, South Hill) | **Context, not a gap:** every one of these runs on this FileMaker today and is a studio Journey will onboard. **Ask AJ** which are active and when | Admins → Studios / Launches |

## What this means for the trainer flow

Nothing a trainer needs to run a session in FileMaker is missing in Journey. Three things are worth building or confirming before the trainer flow is called perfect:

1. **InBody due** — FileMaker tells the trainer when a client is due a scan (by sessions since the last one). Journey doesn't. A line on the briefing ("Due an InBody: 51 sessions since the last scan") and the Hub peek would match it; it needs AJ's number.
2. **A note on a single set** — FileMaker shows a note on the grid cell itself. Journey's machine note should mark its cell on the grid and open from it, so "had to assist on the last few" is seen next time at that machine.
3. **The numbered circle in each cell** and the **highlighted session numbers** — AJ to say what they meant, so nothing a trainer relied on is lost.
