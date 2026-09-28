# The Operations room — five destinations, the brief and the Journey

*Sep 28 2026. Branch `redesign/operations`: six phases on `1c38174` (voice review notes 3), one commit each, then this document. Built in a worktree on AJ's PC and checked there with the typecheck, the whole suite and the build. Not pushed and not merged: the integrator reviews it and lands it with the other rooms. Nothing in it needs a rules, index or function deploy.*

## What AJ asked for

The redesign's Operations room, the ★ pick **"Brief + Journey"**, which AJ took with every default (`logs/claude-transfer/redesign-2026-09-27/`, the Blueprints page). The research put the ask in AJ's words: a command center "for that day and week". The Screen Atlas pin on the old Overview said what was wrong with it: "It forgets where you were. Every visit starts again on Overview. Tapping a client leaves Operations, so the tab, the list and your scroll are lost."

So Operations answers the question My Studio doesn't ("where are we going wrong, and where are we going right?", AJ, Sep 21) in the order a leader's day runs: what needs me now, who to catch, how the week went, where each client is on her journey, and how the team is doing.

## The picks this round follows

| Question | Used | Whose |
| --- | --- | --- |
| q1 The destinations | Five: **Today · Week · Clients · Team · Setup** ("Setup", never "Studio", which would clash with My Studio) | Default |
| q2 Renewals and the Delight queue | Under Clients, the same screens, moved; the Delight queue is called **Moments** | Default |
| q3 What Needs you counts | Only what a leader can clear on the page: acknowledge pain, an incident or a Critical note; take a gesture nobody owns; review a note that has mattered 60 days | Default |
| q4 The state names | New · Settling in · Steady · Drifting · At risk · Lapsed, and Away · Back · Unknown beside them, on leader screens only | Default |
| q5 The lines | Drifting at twice her usual gap (at least 7 days) with nothing booked; At risk at the studio's own break line (`breakDays`, My Studio → Studio); Lapsed at 45 days. Not approved as studio settings, so they are named constants with a comment (`journey/states.ts`), shown on Setup → Rules | Default |
| q6 A phone call | Counts as in person; the app never contacts anyone, so every next step names a person | Default |
| q7 Who owns a case | Her usual trainer; after 3 days with no step it is the leader's. The case fields weren't approved, so the case is worked out, never stored | Default |
| q8 Trainers' renewals | Counts under 10 renewal points, a rate from 10, a trainer called out only outside the range chance gives; head trainers count as leaders | Default |

## What was built

**Phase 1 — five destinations, a client opened inside, and your place remembered** (`97e5c14`). The nine tabs became five destinations (`shell/places.ts` is the one list the sidebar, the tabs, the page switch and every door ask). On an iPad on its side a two-level sidebar with "Looking at" at its head and Setup folding away; upright, the five across the top with each destination's pages under them. A client tapped anywhere opens **inside** Operations (`shell/ClientPage.tsx`), with the page behind kept mounted and hidden, so Back is instant and lands exactly where the leader was. Where a leader was — the destination, each destination's page, the client, the scroll, whether Setup was open — is remembered for the session (`shell/place-memory.ts`) and forgotten at sign-out. Insights became Clients → Trends and Hours moved to Team; Staff & Roles is Setup → People & access.

**Phase 2 — Today is the brief** (`aa19bc6`). One column, the same sections in the same order every day: the freshness line (when the schedule was read, when the nightly record last changed, who can't be judged and why), **the bottom line** — one sentence written by rules (`overview/brief.ts`), the rules a tap away — then Needs you, Catch today (the Hub's one engine, `hub-opportunities/moments-today`), Slipping away, Since yesterday, Coming up, Going right and Worth a look. Needs you counts only what clears on the page and is Today's badge in the menu. A session nobody logged is a door under the bottom line ("See who to ask"), never a Needs-you row: clearing it would need a no-show mark, which isn't approved. A conversation lookup that failed is "couldn't be read", never "nobody has talked to them" (`useCyclesRead`); a failed Delight queue read says so (`useDelightQueue`'s new `failed`).

**Phase 3 — the rhythm and state engine, as tested rules** (`08be44b`). `journey/rhythm.ts` works out a client's usual gap, judged against her own rhythm and never a studio average: the median of her last six gaps in the last twelve weeks, once there are at least six visits spanning four weeks. On screen today it comes from last night's pace (7 ÷ visits a week), held to the same minimum on an estimate, because the job stores the pace and not the visits behind it; below the minimum it says why. `journey/states.ts` puts every active client in one state with a sentence and its proof. The migration rules hold: a total is quoted only when Journey holds her whole story (`lib/history-claims`), a gap is a Mindbody-backed fact, and a client Journey can't judge is **Unknown**, "too new to judge", never Lapsed off a low Journey count. When the nightly record hasn't changed for 3 days nobody is judged from it. **Setup → Rules** (`journey/RulesPage.tsx`) shows every number behind every sentence.

**Phase 4 — Clients → Journey, and her case on the client page** (`d384e9d`). The state strip (tap a state to list it), three lenses (All clients · Renewal window · New), and each list in the order a leader works it, with "too new to judge" apart. A slipping client is a **case** (`journey/case.ts`): owner, next step, due day, and the one outcome Journey sees by itself (booked again); worked out, never written. Her journey and case open on the client page inside Operations (`JourneyCase.tsx`). The Overview's old attendance watch and its view went: Today's Slipping away and the Journey are one rule, so they never disagree.

**Phase 5 — Week and Trends** (`12a5d0c`). Week has three pages. **Last week** is the Monday review in the SITREP's order: a bottom line by rules (`week/review.ts`), what happened day by day (done means logged, late cancellations), who crossed a line and who booked again after a gap, the renewals decided, the team's facts in name order, and a trust line saying how many days with bookings were read in full (the whole-read record). **This week so far** is the days plus the Changes view; **Week ahead** the busiest day, who is due back, the milestones, the renewal talks due and who to catch. **Clients → Trends** puts the quarter's lines on top of Insights, each with its named minimum (`trends/trends.ts`): renewal outcomes (a rate from 10), a longer package (compared only when both quarters have 10), start groups (by a date Mindbody proves; a share from 10), studio rhythm (an average from 30), lost reasons (from 5); win-back and the signal check say "not enough history yet", because both need stored history that waits on AJ's OK. Insights' By trainer reads in name order with no red.

**Phase 6 — Team this week, the leaders' renewal counts, and huddle mode** (`fb9212e`). **Team → This week** (`team/TeamWeekPage.tsx`): a card per trainer in today's schedule order, then everyone else who works here in name order. Each card: last week's logging by name (the Monday review's own numbers, `teamWeek`), their usual clients who are drifting or at risk (they may know why), and what is worth recognising — their clients booked again after a gap and the kudos the team gave them this week (Relay's existing kudos, the number My Studio → Team shows). **Recognise** sends nothing and writes nothing: it puts the line on today's huddle, in this iPad's memory. **Leaders only** (`canManageRenewals`, so head trainers count): this quarter's renewal points and how many were kept, by trainer in name order, counts under 10 and a rate from 10, and **the chance check** (`team/renewal-counts.ts`): the studio's own share kept is what chance gives anybody; a trainer is called out only when their count falls outside the exact binomial 2.5th–97.5th percentile for their number, from 10 renewal points across the studio and never below 5 for one person. "How we check" says it in words. **Start huddle** on Today opens huddle mode: five items built from the brief's own lines (a concern and a win, who to catch and whose usual trainer may know why, the sessions nobody logged and machine fit, what Team recognised, what the bell is showing), each tapped as it is covered. Week's "This week" is now "This week so far", so the sidebar never shows two pages with one name.

**This document**, the admin README's table, the READMEs of `journey/`, `overview/`, `team/` and `hours/`, eight stale "Operations → Insights → Hours" pointers (the roles page, KNOWN-TRAPS, My Profile's README, comments and a test name, `types.ts`'s comment), and the data dictionary, which now names Operations → Week as a reader of the whole-read record.

## Reads

Every read is a shape that already exists — no new query shape, no new index, no new collection, field or value, and nothing written that wasn't written before:

- Today: the Overview's own reads, unchanged in shape (the week as the server answered it, today's sessions, 14 days of sessions, incidents and notes, the watchlist and acknowledgements, the Delight queue, the renewal settings and cycles, machine fit, Openings' data).
- Week: last week's bookings (`useWeekSchedule`, the Overview's query), the sessions since last Monday (`useSessionsInRange`), last week's renewal outcomes (`useOutcomes`, the Outcomes panel's closedOn range), and one or two whole-read record documents (`studios/{s}/scheduleCoverage/{month}`, by id; its first reader in the app).
- Clients → Journey and Trends: the week, the renewal settings and the watchlist (`useStudioJourneys`), and the quarter's outcomes.
- Team → This week: the same, plus My Studio → Team's three kudos reads (the week's task rows, the team jobs, the answered asks) and, for a leader, the quarter's outcomes.
- The huddle: the bell's own announcement listener (Firestore shares it with the bell), only while it is open.

The renewal outcome rows now carry the cycle's `clientName` and `latestConcerns` (`renewals/useOutcomes.ts`), which the cycle documents already hold. No Mindbody call, no Cloud Function, no rules change.

## Not built — each needs AJ's OK

1. **A no-show mark**: a leader marks a chased booking "didn't come", so it stops counting as a visit. It writes a booking outcome in Journey; until then an unlogged session stays a door on Today.
2. **Client states written by the nightly job** (the state, the day it began, the reasons, on the snapshot). Until then states are worked out on the screen from cheap data, and "who moved toward steady" and the signal check can't be said (they need yesterday's states).
3. **Case fields on the attendance watchlist** (owner, next step, due date, outcome and reason, and "Booked again" set by the sync). Until then a case is worked out, can't be handed on, and past its due day says it is the leader's and to check with the owner first.
4. **A nightly summary per studio.** Not built; every page reads what it needs when it opens.
5. **The lines as studio settings** (Drifting's multiple, Lapsed's 45 days, New's 10 and Settling in's 24): named constants for now, shown on Setup → Rules.
6. **Trainers seeing their own cases in Relay → Mine**: Relay is the Relay room's; the case logic is ready for it.
7. **Note for our 1:1** on a trainer's card: it needs a place for a leader's private note about a person. Relay's private notes could hold one with no new field, but that store belongs to the Relay room and is being reworked beside this round.

## Open, for AJ

1. **The client page inside Operations** replaces the blueprint's landscape master-detail: a tap opens her page in Operations' own space with the list kept behind it, in both orientations. Keep it?
2. **Week → This week so far**: renamed from "This week" so Team's "This week" is the only one. Or another name for Team's page?
3. **The chance check's floors**: 10 renewal points across the studio before a check, and nobody called out below 5 (the Outcomes panel's own least). Right?
4. **Kudos on Team → This week**: the card shows the number the team gave; it never sends one (a kudos belongs to something closed and rings a bell). Good, or should Recognise also say thanks?
5. **Start huddle** is on Today only, and what Team recognised lives on this iPad for the day. A second iPad won't see it: fine for a huddle held around one iPad?

## Choices made inside the defaults

- **One rule for "slipping"**: Today's Slipping away, the Journey, the Week pages, Team's cards and the huddle all read `journey/states.ts`; the old attendance question and its view were deleted rather than kept beside it.
- **Needs you never counts a never-logged session** (it can't be cleared without the no-show mark); the bottom line names it and the door lists who to ask.
- **A stale nightly record judges nobody**: the snapshot's `computedAt` only changes when the job writes, so the studio-wide "last changed" is the test; 3 quiet days makes every state Unknown, and the freshness line says why.
- **Names are whole** everywhere, the studio's Eastern day throughout, admin tokens only, no raw hex, 40px taps, no red on a person's number.

## Left for later (technical)

- **Stale pointers in other rooms' folders** (not touched, by the brief): `admin/data/AdminDataReportsTab.tsx:135` and `admin/data/useStudioExports.ts:6` (Admins room); `my-studio/StudioSection.tsx:217, 252, 316` and `relay/board/relay-floor.render.test.tsx:257–260`, which asserts the old words (Relay room) — each says "Operations → Insights → Hours", now **Operations → Team → Hours**; `docs/ops/TESTING-CHECKLIST.md:1600, 1779` the same.
- `docs/ARCHITECTURE.md` §2.5 still describes nine tabs; the replacement table is below.
- `.adm-ins-bad` in `admin/admin.css` has no reader since By trainer lost its red.
- `team/useKudosThisWeek.ts` is the one file that reaches into Relay's folders (`relay/board/kudos`, `relay/jobs/useTeamJobs`, `relay/team/accountability`, `studio-tasks/useTaskCompliance`, `studio-tasks/useStudioRequests`). It already reads the Relay room's new `failed` flag on the asks when it exists.
- `useHubAnnouncements` treats a failed read as none; the huddle says "None showing in the bell", which is what the bell shows either way.

## Numbers

Measured on AJ's PC in the worktree (`node_modules` a junction to the main checkout's), on the final code commit:

| Check | Result |
| --- | --- |
| Typecheck (`npx tsc --noEmit`) | **4** errors, the baseline, none new |
| Tests (`TZ=America/New_York npx vitest run --dir src`) | **7,223** passing in **487** files, none failing (the brief's baseline: 7,116 in 471) |
| Build (`npx vite build`) | Clean. First download 127.6 kB gzipped; the Operations chunk 325.4 kB (84.4 kB gzipped) |
| Invisible characters | None in `src/features/admin` |

## For the integrator

The exact lines for the four files this round doesn't edit. Renumber the checklist round if another room takes 27 first.

**`CLAUDE.md`** — replace the "Operations (the studio-management area — nine tabs)" row of "Where things are" with:

```
| Operations (the studio-management area — five destinations) | `src/features/admin/AdminDashboardView.tsx` is the shell, wrapped in `OperationsScopeProvider` (`src/features/admin/scope.ts` + `scope-context.tsx`: **this studio · all my studios**, one control every page reads). **Today · Week · Clients · Team · Setup** (the redesign's Operations room, Sep 28 2026): `shell/places.ts` is the one list of destinations and pages, `shell/place-memory.ts` where a leader was (forgotten at sign-out), `shell/ClientPage.tsx` a client opened inside Operations. **Today** is the brief (`overview/`: `TodayBrief.tsx`, `brief.ts` the bottom line by rules; Start huddle opens `team/HuddleSheet.tsx`). **Week** is Last week · This week so far · Week ahead (`week/`, `review.ts`). **Clients** is Journey (`journey/`: `rhythm.ts`, `states.ts` the one rule for every client's state, `case.ts`; read its README first) · Renewals · Moments (the Delight queue) · Trends (`trends/` over `insights/`). **Team** is This week (`team/`: the cards in today's schedule order, Recognise onto the huddle, the leaders-only renewal counts and the chance check) · Hours. **Setup** is Floor · People & access · Announcements · Mindbody · Data · Rules (`journey/RulesPage.tsx`). The network view under "all my studios" is `network/`. `src/features/admin/README.md` is the kit; `docs/rounds/2026-09-28-operations.md` is the round (the Operations overhaul before it: `2026-09-19-operations-overhaul.md`) |
```

In "Commands", at the front of the Tests note, add:

```
**7,223** passing in 487 files on `redesign/operations` (Sep 28 2026: the redesign's Operations room, six phases on `1c38174`; typecheck 4; `TZ=America/New_York npx vitest run --dir src` in a worktree on AJ's PC; `docs/rounds/2026-09-28-operations.md`).
```

In "Decisions already made", in the bullet that begins "**Operations is split in two (Operations overhaul, Sep 19).**", replace "Operations is the studio-management area, always one studio, nine tabs," with "Operations is the studio-management area, always one studio, five destinations since the redesign's Operations room (Sep 28 2026: Today · Week · Clients · Team · Setup),", and replace "The first screen of Operations is the **Overview**" with "The first screen of Operations is **Today** (the Overview until Sep 28 2026)". Then add this bullet after it:

```
- **One rule for where a client is** (the redesign's Operations room, Sep 28 2026, AJ's defaults): New · Settling in · Steady · Drifting · At risk · Lapsed, and Away · Back · Unknown beside them, on leader screens only (`src/features/admin/journey/states.ts`). Drifting at twice her usual gap (at least 7 days) with nothing booked, At risk at the studio's break line, Lapsed at 45 days; a client Journey can't judge is Unknown, "too new to judge", never Lapsed off a low Journey count. Today, the Journey, the Week pages, Team and the huddle all read it. A slipping client is a case her usual trainer owns and a leader takes after 3 days — worked out, never stored, until AJ approves the case fields. Recognise, the huddle and every next step send nothing to anyone.
```

**`docs/rounds/README.md`** — add at the foot of the table:

```
| 2026-09-28 | [2026-09-28-operations.md](2026-09-28-operations.md) — the redesign's Operations room: five destinations (Today · Week · Clients · Team · Setup) with a client opened inside and your place remembered; Today as the brief (a bottom line by rules, Needs you that clears on the page, Catch today from the Hub's engine); one rule for where every client is (`journey/states.ts`: the rhythm, the states, "too new to judge", Setup → Rules) and Clients → Journey with each slipping client's case worked out; Week's Monday review, this week so far and the week ahead; Trends with named minimums; Team → This week with Recognise onto the huddle and the leaders-only renewal counts with the chance check; huddle mode. **No rules, index, function or structure change** |
```

**`docs/ops/TESTING-CHECKLIST.md`** — add before "## Findings log":

```
## Round 27 — Operations, five destinations · *Sep 28 2026, branch `redesign/operations`*

The redesign's Operations room. The round document is
`docs/rounds/2026-09-28-operations.md`. Nothing to deploy first: no rules, no
index, no Cloud Function. Sign in as a **studio leader**, then as a **head
trainer**, **portrait and landscape, light and dark**. Seen so far only in
mounted tests.

- [ ] **Five destinations.** On its side: a sidebar with Looking at, Today,
  Week (Last week, This week so far, Week ahead), Clients (Journey, Renewals,
  Moments, Trends), Team (This week, Hours) and Setup, which folds. Upright:
  the five across the top and each one's pages under them.
- [ ] **Your place is kept.** Open Moments, scroll, leave Operations and come
  back: Moments, at the same scroll. Sign out and in: Today.
- [ ] **A client inside Operations.** Tap a name on Today: her page opens in
  Operations with her state and case; Back returns to the same spot; Open
  full profile, then come back: her page again.
- [ ] **Today's bottom line** is one sentence; "How this line is written"
  shows the rules; the facts under it add up with the Hub.
- [ ] **Needs you** holds only rows you can clear here, and its count is the
  badge on Today. Acknowledge one: it goes, and the count drops.
- [ ] **A session nobody logged** is not a Needs-you row: "See who to ask"
  under the bottom line lists it.
- [ ] **Catch today** matches the Hub's Opportunities for today; **Slipping
  away** names the same clients as Clients → Journey's Drifting and At risk.
- [ ] **Start huddle** opens full screen, clear of the clock and the home
  indicator, in both orientations; each item marks covered on a tap; End
  huddle closes it. Nothing reaches anyone.
- [ ] **Clients → Journey.** Tap a state: its list. The lenses recount. A
  client with years in FileMaker and few Journey sessions is never Lapsed or
  New off her Journey count ("too new to judge" instead).
- [ ] **Setup → Rules** shows the lines the Journey uses (twice her usual gap,
  at least 7 days; the studio's break line; 45 days).
- [ ] **Week → Last week**: the bottom line, each day's logged and not
  logged, who crossed a line, the renewals decided, the team in name order,
  and the trust line.
- [ ] **This week so far** and **Week ahead** say "couldn't be read" when
  offline, never zero.
- [ ] **Clients → Trends**: every line names its minimum; Insights' By trainer
  is in name order with no red.
- [ ] **Team → This week**: the cards run in today's schedule order, then Off
  today in name order; last week's unlogged sessions by name; their slipping
  clients.
- [ ] **Recognise** turns to "On today's huddle"; Start huddle on Today shows
  the line under Recognition.
- [ ] **Leaders only**: renewal points and kept, by trainer in name order, a
  rate only from 10; "How we check" in words. A head trainer sees it.
- [ ] **Names whole**, every tap at least 40px, nothing hidden behind hover.
```

and in the Quick tally table, after the Round 26 row:

```
| 27 — Operations, five destinations (Sep 28) | 17 | | |
```

**`ROADMAP.md`** — add at the foot of "The follow-up pile":

```
**The Operations room (Sep 28 2026)** — to do by hand: walk Round 27 of the
testing checklist. Waiting on AJ's OK, all in the round document's "Not
built": a no-show mark; client states written by the nightly job; case fields
on the attendance watchlist; a nightly summary per studio; the lines as studio
settings; trainers' own cases in Relay → Mine; a place for 1:1 notes. His
questions are the round document's "Open, for AJ" (the client page inside
Operations, "This week so far", the chance check's floors, kudos on Team, the
huddle on one iPad). Technical leftovers: the "Operations → Insights → Hours"
words left in `admin/data`, `my-studio/StudioSection.tsx`, the Relay floor
test and the testing checklist; ARCHITECTURE §2.5; `.adm-ins-bad` has no
reader.
```

**Optional — `docs/ARCHITECTURE.md` §2.5.** Retitle it "The Operations dashboard — five destinations, one scope — and the Admins dashboard" and replace the tab table with:

```
| Destination | Page | Component | Under "All my studios" |
| --- | --- | --- | --- |
| Today | the brief | `features/admin/overview` `TodayBrief` — the freshness line, the bottom line by rules, Needs you (only what clears here; Today's badge), Catch today (the Hub's engine), Slipping away (the Journey's rule), Since yesterday, Coming up (with Openings' line), Going right, Worth a look; Start huddle (`team/HuddleSheet`) | the network view and its actions (`features/admin/network`) |
| Week | Last week · This week so far · Week ahead | `features/admin/week` — the Monday review (`review.ts`), the days with the Changes view (`changes/ChangesView`), the next seven days | pick a studio |
| Clients | Journey · Renewals · Moments · Trends | `features/admin/journey` (the rhythm, the states, the case; `JourneyPage`), `features/admin/renewals`, `features/ford/DelightQueue`, `features/admin/trends` over `insights/AdminInsightsTab` | pick a studio |
| Team | This week · Hours | `features/admin/team` (`TeamWeekPage`: the cards, Recognise, Leaders only), `features/admin/hours` | pick a studio / Hours spans |
| Setup | Floor · People & access · Announcements · Mindbody · Data · Rules | `features/admin/floor`, `staff`, `announcements`, `mindbody`, `data`, `journey/RulesPage` | as before |
```
