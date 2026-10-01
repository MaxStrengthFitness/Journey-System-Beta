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
| **"This client is due for an InBody scan, it has been 51 sessions since their last scan"** — a pop-up when the client is opened | **Done** (Oct 1 2026). AJ: *"up to the studio or even that client"*. A studio setting (50 sessions unless head office or the studio sets its own) and a client's own number or "not for her"; one quiet line on the briefing only when she is due, never a block on Start, and the count on the InBody card. With no scan in Journey for a migrating client it says "No InBody scan in Journey yet", never a count. `docs/rounds/2026-10-01-filemaker-parity.md` | Briefing → Before you start; Notes & Profile → Body & Pulse → InBody; My Studio → Studio → This studio's settings; Admins → Standard → Studio defaults |
| Client Notes: free text, newest first, each with "created … by" and "modified … by", delete | **Better.** Notes are threads with kind, loudness (Note · Heads up · Critical), when they matter, and who wrote each update; nothing is deleted, a thread is resolved | Notes & Profile → Notes; the Note button on the header |
| **Create Chart** for a client who has none (new client) | **Done, differently.** The first-visit set-up (consultation) and Programming → Setup | Profile → Start first-visit set-up |

## 2. The chart: the session grid (FileMaker: Workouts tab)

This is the screen trainers lived in, and the one the Journey tab and the live session grid are built from.

| FileMaker | Journey | Where |
| --- | --- | --- |
| A grid: rows are the studio's machines in walking order, columns are sessions, **12 to a page**, numbered from the client's first session (1, 2, 3 … 60) | **Done.** The Journey tab and the live session's grid: machines down, sessions across, older pages to the left | Profile → Journey; the live session |
| Each column shows the **session number, the date and the trainer's initials** | **Done** (number, date, initials) | Same |
| Each row shows the machine's name and **the client's settings shorthand** (seat, back pad, gap…) | **Done.** Settings under each machine name (G4 · B1) | Same |
| Each cell: **weight**, a small **numbered circle**, a pencil, and a second line (reps, or seconds) | **Done.** The circle is *"the order of the routine"* (AJ, Oct 1 2026), which Journey already shows as each machine's order number in today's routine. Weight and reps/time are in the cell | Same |
| **Today's column highlighted** and the empty future columns ready to fill | **Done.** "Today" column outlined | Live session |
| **Flip ← / Flip →** to page back through the whole history, 12 at a time | **Done.** "Older" | Journey tab, live session |
| A cell's **own note** ("Had to assist on the last few") opened from the cell | **Better, by design** (Oct 1 2026): one place to write, every note filed by kind on Notes, linked to its session; the grid only flags a machine that has notes. AJ: *"I more like the idea of having one spot to take the notes at and organize where it goes rather than the current 'notes can be taken on the session number, on the set' this makes it impossible to see all the notes in a organized way and it's a lot of clutter on the screen."* A note written in a session says "From session #12 · Sep 30" and opens that session; Notes has a Machine filter, so every note about one machine is listed with its session | Live session → the machine sheet or Notes; Notes & Profile → Notes |
| A **warning triangle** on the chart (yellow when there is something to read) that opens **Customer and Workout Notes**: standing coaching cautions ("Left shoulder issues, be wary on chest fly…") and the client notes | **Better.** The briefing's "Before you start", Critical notes as the Hub card's red triangle, and the shield on the session bar | Briefing; Hub card; live session |
| A session column's menu: **Workout Notes** for that session | **Done.** Session notes and the End Session note for the next trainer, each linked to its session since Oct 1 2026 ("From session #N · date" on Notes, which opens the session); the session itself opens from Activity Archive | Live session → Notes; End Session; Notes & Profile → Notes; Activity Archive |
| **Set As Template / Use Template** | **Done.** Edit Routine → presets (Company standard and the studio's own) and Save current | Programming → Edit routine |
| **Copy This Session** (start today as a copy of a past session) | **Done, differently.** Replaced by Journey's routine selector (AJ, Oct 1 2026): today starts from Routine A or B, with its last loads, or a routine adjusted on the briefing | Briefing |
| Highlighted session numbers in the header (e.g. 8 and 33 shown in yellow) | **Better, by design** (Oct 1 2026). They meant *"these sessions have session notes"* (AJ). Journey keeps one place to write, every note filed by kind on Notes, linked to its session; the grid only flags a machine that has notes — AJ: *"if made within a session it should link that session and that solves that and then I can see all notes about a clients machine performance and see the session it was associated with."* | Notes & Profile → Notes ("From session #N · date") |
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

Nothing a trainer needs to run a session in FileMaker is missing in Journey. AJ answered the three open questions on Oct 1 2026, and the round that followed (`docs/rounds/2026-10-01-filemaker-parity.md`) closed them:

1. **InBody due** — **Done.** A studio setting (50 sessions by default) and a client's own number; one quiet line on the briefing when she is due, and the count on the InBody card.
2. **Notes on a set and on a session number** — **Better, by design.** Not built on the grids: one place to write, every note filed by kind on Notes, linked to the session it was written in, with a Machine filter; the grid only flags a machine that has notes.
3. **The numbered circle** is the routine's order (already shown) and the **highlighted session numbers** meant "has session notes" (now the session link on Notes). **Copy This Session** is the routine selector.
