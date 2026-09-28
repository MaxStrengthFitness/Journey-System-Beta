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

## The five sections

| Section | Who | What |
| --- | --- | --- |
| **Relay** | everyone at the studio | the board for the trainer between clients: Floor · Mine · Notes, the Now Bar, Capture (`features/relay/PlannerView`). The Network tab moved to Operations → Overview → All my studios on Sep 27 2026, and its ranking of studios was dropped |
| **Openings** | everyone who may read the studio's standing weeks (`mayReadWeeks`: the people who work there, franchise owners, administrators) | when the studio is usually busy, what opened up, and what to offer a client, in sentences, read only (the Openings round, Sep 27 2026; `features/openings/ui/README.md`): **The usual week** (the Sunday job's summary as a grid of words, a time's sheet beside it), **Next 7 days** (what opened up, read live from the server; Team's "next seven days" list moves here), **A new regular time** (times to offer for good, safe to show a client), and **Who's usually in** (everyone who works here, in name order, each with their agreed week read only: AJ's "schedules are open to all", and the only place today a colleague's week can be seen). Trainers' names for everyone (AJ: relaxed for the beta); client names only after a tap. It books nothing, asks Mindbody nothing and pings nobody |
| **Machines** | everyone reads and leaves machine notes; leaders edit | the floor, what is new in the MSF standard (adopted, never pushed), the machine's door (the studio's standard settings, the floor's notes, local set-up, upkeep), "Offer to the MSF catalog" on the studio's own machines, machines shared by other MSF studios |
| **Team** | the studio tier | **people and standards** (voice-review round, Sep 27 2026): who is waiting to be let in (at the top), then **Standing weeks** — each trainer's usual week, proposed on My Profile and agreed here, and the next seven days: who is away, and since the Openings round one line with a door to Openings, which lists the free slots to fill (`src/features/standing-week/`) — each person's week by name, the standing duties and their seven days, initiatives, the loops left open, the vault; then this studio's staff: roles up to studio leader, the grant, the Mindbody link, temporary profiles. Who's in today is the Hub's and the month's client groups are Operations' |
| **Studio** | everyone who works at the studio reads it; the studio tier changes it | the studio's own record: details, the Mindbody link, the Journey cutover date, shift hours and the deep-clean interval, the InBody variation (how big a change the scanner must see before any screen calls it one — `InBodyVariationPanel`, client codex Sep 2026; `features/inbody/README.md`), renewal settings and packages, the studio's announcements, sync status. **Read only for everyone else** since the voice review notes (Sep 28 2026; AJ: "Leaders edit it; trainers can view it read-only. Studio settings are edited here and nowhere else"): each panel draws its fields locked (in full ink, `.ms__readonly`), offers no save bar, defaults button or Publish, and says who changes it; a reader sees the live notices as a list. The details form skips its Mindbody location lookup for a reader, so a trainer's visit costs no Mindbody call. Until then the section was hidden from trainers |

**The studio tier** is a head trainer, studio leader or studio owner *at this studio* (home or owned), or a trainer the studio's leadership has granted `managedStudioIds` for it — `leadsHere()` in `features/relay/leads.ts`, which `MyStudioView` asks directly and which is the answer `firestore.rules` gives (`trainerLeads`). Hiding a section is a convenience; the rules are the boundary. The grant opens Team and lets its holder change Studio and the floor; it does not open the Operations dashboard. Studio's reader gate is `leadsHere || mayReadWeeks` (the people who work there, franchise owners, administrators): the rules already let exactly them read the studio, its renewal settings and its notices, and refuse their writes.

## Who owns what

- `MyStudioView` owns the header, the section, Relay's tab, the clock (`useNowContext`), and the two doors — the Capture sheet and the Context Panel — through `RelayContext`. PlannerView used to own these; it is a consumer now, so a card on any section can `openCapture()` or `openPanel()`.
- **The one header** (`StudioHeader`, Relay room, Sep 28 2026): the masthead, Relay's tabs and the Now Bar in one bar. "My Studio · RELAY ▾" opens a menu of the sections this person may open (a tap, never a hover); on Relay the bar carries Relay's tabs, the time (the shift, minutes free, the next session; a tap unfolds the day strip under the bar) and Tracking (the one job taken, `relay/board/tracked.ts`); every section has Ask (the team) and + (your own to-do, reminder or note, and for the studio tier a studio task or a team job). One row on a landscape iPad; upright, two. The section's label keeps the old tab's id (`ms-tab-{section}`), so each section's panel is still labelled by it. The floating Capture button is gone.
- Each section draws its own frame (`SectionFrame` = `.pl__frame` + the Context Panel beside it); Relay's frame is PlannerView's own, under its tabs and the Now Bar.
- The section is module memory (`section-memory.ts`), like Relay's tab, and a sign-out forgets it: the iPad reopens where it was. An arriving Planner intent (a client's profile, a notification) always lands on Relay.
- A door on one section to another (Team's line about the free slots opens Openings) calls `openMyStudioSection(next)`: the mounted shell moves there through the same choice as a tap on the tab, so typing in the section being left is asked about first, and the section is remembered only once the move happens (a "Keep editing" leaves the memory where it was). From outside My Studio, a door sets `rememberMyStudioSection(next)` and switches the app's view, as Operations → Renewals does for Studio.
- The masthead had five sections once Openings joined, and its portrait rule moved the studio-and-date line under the tabs. The one header replaced it (Sep 28 2026); its portrait rule (`.ms > .msh--relay`: the time and Tracking on a second row below 900px) is My Studio's own, in `my-studio.css`, so the header never depends on a section sharing its chunk (`css-imports.test.ts` holds it). Its first row at 744px (an iPad mini upright) is about 600px wide.
- The view id is still `studio-tasks`: notifications in trainers' bells link to it. The board's folder is `features/relay` (it was `features/planner` until the beta-prep trim renamed it, Sep 17 2026); file names inside still say Planner (`PlannerView`, `planner.css`).

## How My Studio looks

Since the voice review follow-up (Sep 27 2026, under AJ's "I trust your color choices and font choices"; `docs/rounds/2026-09-27-voice-review-followup.md`) My Studio speaks the app's look, as Learning does (`../learning/README.md`, "How Learning looks"):

- **Colours are the app's.** The `--st-*` tokens carry `equipment.tokens.css`'s values, light and dark (`studio-tasks/studio-tokens.test.ts`). Caution (flags, late jobs, tight gaps) is plum; delete is crimson; anything selected is blue; every Save is solid blue; Capture keeps its orange, on the deep orange so its words read; the Floor Map's heat is one orange ramp.
- **Type is the app's.** Titles are the display face; every heading of My Studio's own is the same 12px small upright capitals (`.pl__h2`, `.pl__list-head`, `.rl-h__title`, `.stm__title`, `.ms__door-h`, the standing weeks' `.stw-team__head` and `.stw-away__head`, and Just now's `.rjn__title`); the Operations-kit panels (`AdminPanel` / `AdminButton` on Machines, Studio and Team's Standing weeks and staff) still draw `admin.css`'s 13px titles and 12px capital buttons until the kit itself moves; buttons are 14px bold sentence case and chips 12px bold; sizes sit on 11 / 12 / 14 / 17 / 30. The header's section name is 17px, not the codex's 30px, because it sits in a 64px bar. Relay's tabs in the header are 14px bold, 44px; Openings' parts stay the lighter second level (`.pl__subbar`).
- **Taps and names.** The listed controls are 40px or more, and no name class is cut short. Team's cards are the header-strip card (`.tm-card`, `.tc`, `.stm__panel`), and Machines' floor list is the Operations kit's rows, buttons and badges. A floor row stacks its buttons under the name by the LIST's width, not the screen's (a container query, `@container` on the list and `@2xl:` on the row): with the machine's door open beside it on a landscape iPad the list is about 420px wide, and the buttons alone are about 480px.
- **The machine's door asks before it drops typing.** Its X, Escape and a tap on another machine in the list go through the door's leave scope, and the door is keyed by machine (`MachinesSection.render.test.tsx`).
- **Nothing only on hover, and portrait works.** The teammates' lines ("Just now", with the kudos hearts; a still list on the Floor since the one header) are never hidden.

`look.test.ts` holds My Studio's stylesheets (the standing weeks' `standing-week.css` included, since the final review, and Openings' `openings.css` since the Openings round) to these rules (no raw hex outside a token definition, no name cut short, 40px controls, slanted capitals only in the display face, and an off-scale size budget of 3 that only goes down). `css-imports.test.ts` holds `MachinesSection`, `StudioSection`, `TeamSection`, `InBodyVariationPanel`, the Context Panel, and Openings' section and parts to the stylesheets they draw with, because Operations → Floor mounts Machines without this shell (and marks its frame `.ms__frame--hosted` so the machine's door stays on screen). If one fails, the fix is the stylesheet, not the test.

## Rules of the round

- **My Studio is where you run the studio; Operations is where you look at it** (AJ, Sep 18). A studio's own settings live here, once, with one save bar; the looking (the Overview, Insights, the watchlists) stays on Operations.
- **Nothing here is a second editor.** When a panel moves in (the Studio setup card, Relay's Standards, the renewal settings), it moves — the old place links here or is deleted in the same round.
- **Adopted, not pushed** (machines) and **inherited unless overridden** (fields, settings, routines) — the two update rules for the MSF standard. See `docs/rounds/2026-09-19-my-studio.md`.
