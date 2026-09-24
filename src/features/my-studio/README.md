# My Studio — the studio's home on the bottom bar

*My Studio round, Sep 2026. `docs/rounds/2026-09-19-my-studio.md` is the round; `docs/rounds/2026-09-18-operations-audit-prep.md` is the audit it came from.*

The Relay tab became **My Studio** (AJ, Sep 18): "each studio should have full insight and control over its own studio", and a studio's own settings were scattered across Operations → Studios, the Studio setup card under Learning, and Relay → Team → Standards — with the Studios tab shaped as a company registry that listed every studio to every leader.

## The question it answers

AJ, Sep 21 2026, and the test for whether something belongs here or on
Operations:

> My Studio is a place the team can actively go when they need to ask
> themselves **how can I help the team right now** … Operations is more of
> let's locate the problems, let's locate the things we can catch, and where
> can we take advantage of small opportunities and turn them into big rewards.

So: **My Studio is present tense and participatory** — what is going on at my
studio today, what is everyone doing, what is coming up, and our machines.
**Operations is investigative** — where are we going wrong, where are we going
right. A panel that diagnoses belongs there; a panel that helps someone pitch
in belongs here.

**Why Relay is a board and not a thread.** Not every trainer is on the floor at
the same time — mid-session, different shifts, in and out — so you cannot get
the team in a room, and coordination has to work when nobody is waiting on
anybody. A task is picked up, assigned, handed to someone and finished by
whoever is actually there. That constraint is the shape of the feature; don't
redesign it into something that assumes people are simultaneously present.

## The four sections

| Section | Who | What |
| --- | --- | --- |
| **Relay** | everyone at the studio | the board, untouched: Floor · Mine · Notes · Network, the Now Bar, Capture (`features/planner/PlannerView`) |
| **Machines** | everyone reads and leaves machine notes; leaders edit | the floor, what is new in the MSF standard (adopted, never pushed), the machine's door (the studio's standard settings, the floor's notes, local set-up, upkeep), "Offer to the MSF catalog" on the studio's own machines, machines shared by other MSF studios |
| **Team** | the studio tier | the Team cockpit (was Relay's Team tab) and this studio's staff: who is waiting for an account, roles up to studio leader, the grant, the Mindbody link, temporary profiles |
| **Studio** | the studio tier | the studio's own record: details, the Mindbody link, the Journey cutover date, shift hours and the deep-clean interval, the InBody variation (how big a change the scanner must see before any screen calls it one — `InBodyVariationPanel`, client codex Sep 2026; `features/inbody/README.md`), renewal settings and packages, the studio's announcements, sync status |

**The studio tier** is a head trainer, studio leader or studio owner *at this studio* (home or owned), or a trainer the studio's leadership has granted `managedStudioIds` for it — `leadsHere()` in `features/planner/leads.ts`, which is the answer `firestore.rules` gives (`trainerLeads`). Hiding a section is a convenience; the rules are the boundary. The grant opens My Studio's leader sections, not the Operations dashboard.

## Who owns what

- `MyStudioView` owns the masthead, the section, the clock (`useNowContext`), and the two doors — the Capture sheet and the Context Panel — through `RelayContext`. PlannerView used to own these; it is a consumer now, so a card on any section can `openCapture()` or `openPanel()`.
- Each section draws its own frame (`SectionFrame` = `.pl__frame` + the Context Panel beside it); Relay's frame is PlannerView's own, under its tabs and the Now Bar.
- The section is module memory (`rememberedSection`), like Relay's tab: the iPad reopens where it was. An arriving Planner intent (a client's profile, a notification) always lands on Relay.
- The view id is still `studio-tasks` and the folder for the board is still `features/planner`: notifications in trainers' bells link to the id, and thirty imports point at the folder.

## Rules of the round

- **My Studio is where you run the studio; Operations is where you look at it** (AJ, Sep 18). A studio's own settings live here, once, with one save bar; the Monday tools stay on Operations.
- **Nothing here is a second editor.** When a panel moves in (the Studio setup card, Relay's Standards, the renewal settings), it moves — the old place links here or is deleted in the same round.
- **Adopted, not pushed** (machines) and **inherited unless overridden** (fields, settings, routines) — the two update rules for the MSF standard. See `docs/rounds/2026-09-19-my-studio.md`.
