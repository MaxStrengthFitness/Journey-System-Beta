# The Operations room, wave 2 — the lines, "didn't come", the stored case, the night's states

*Sep 28 2026. Branch `redesign/operations-2`, four commits on `redesign/wave2`'s `b8b83a4b` (the studio settings), then this document. AJ approved the first wave's asks ("all yes") and added "let the admins assign the default within the app". Stopped early at the coordinator's wrap-up: items 5 and 6 are not built.*

## Built

1. **The Journey's lines from the studio settings** (`a6117833`). Drifting's multiple and least, Lapsed, New and Settling in are `driftMultiple`, `driftMinDays`, `lapsedDays`, `newMax`, `settlingMax`: the studio's own, else Max Strength's default, else the app's. `journey/states.ts` keeps no number (`JourneyLines`, `linesOf`, `APP_LINES` from the registry). Setup → Rules shows each line with where it came from and a door to My Studio → Studio; it edits nothing.
2. **A leader's "didn't come"** (`5c0b20e0`). `studios/{s}/bookingMarks/{bookingId}`; `lib/booking-state.ts` reads a mark as a no-show (a session logged that day still beats it). A session nobody logged is now a Needs-you row on Today, cleared by **Didn't come** or by the trainer logging it; today's marks sit under the bottom line with **Take back**. The Week pages, Team and the nightly job read the marks too.
3. **The case, stored** (`11818dfc`). `studios/{s}/cases/{clientId}` in exactly the agreed shape (`journey/case-store.ts`). `case.ts` reads it first: the team's owner, step and due day; "the leader's after 3 days" from `updatedAt`; "Booked again" worked out on read, never written by the sync. The Journey's rows say who owns a stored case.
4. **Client states and a summary, written nightly** (`a618a1e5`). Step 5 of the renewals job (`server/journey-step.ts` over `journey/nightly.ts`) writes `clientStates`, `watch/hubMarks` (All stars, the 26-week read) and `watch/journey` (written last) for each live studio. Operations uses them while they are today's with today's lines, and works a client out itself when it knows something newer.

## Not built

- **5. 1:1 notes** on Team → This week (the rules, store and composer).
- **6. The case form** (owner, step, due, outcome, reason) in the Journey and on the client page: cases are read and shown, but nothing in Operations writes one yet (Relay can).
- The Hub, the client calendar and My Profile don't read "didn't come" marks yet (their folders weren't mine).

## Open for AJ (defaults applied)

1. **Who may mark "didn't come"**: the studio's leaders, the grant included (the renewals rule). *Default: yes.*
2. **A marked no-show counts as a miss in the renewal pace**, before the cutover as after it. *Default: yes.*
3. **Nothing ever deletes a case**; an outcome closes it and a leader reopens it. *Default: yes.*

## For the integrator

**Deploy.** Indexes (appended): `bookingMarks (day, clientId)` and `cases (owner.id, outcome, dueOn)`. Rules: four `WAVE 2 OPERATIONS` blocks (`bookingMarks`, `cases`, `watch/journey`, `clientStates`), two helpers (`wave2Leads`, `wave2WorksHere`), and the `watch/{watchId}` read now excludes `journey`; tests in `describe("wave 2 operations")` (not run here). Server: step 5 runs from master's next build of the renewals cron; it writes `clientStates`, `watch/journey` and `watch/hubMarks` for studios whose cutover date has come. Dry run: `npx tsx scripts/run-renewals.ts` (no `--commit`) logs "Edoras: N client states (M would change…)". No one-off script.

**Files outside my folders:** `src/features/renewals/attendance.ts` and its test (a `marks` option passed to `bookingState`).

**Checks:** typecheck 4; `vitest --dir src` over `admin`, `renewals` and `lib/booking-state`: 1,321 passing in 102 files; `npm run build:backend` clean. Full suite and `vite build` left to the integrator.

**`CLAUDE.md`**, replace the "One rule for where a client is" bullet with:

```
- **One rule for where a client is** (the redesign's Operations room, Sep 28 2026, AJ's defaults; wave 2 the same night): New · Settling in · Steady · Drifting · At risk · Lapsed, and Away · Back · Unknown beside them, on leader screens only (`src/features/admin/journey/states.ts`). The lines are studio settings (`driftMultiple` 2 × her usual gap, at least `driftMinDays` 7; At risk at the studio's break line; `lapsedDays` 45; `newMax` 10, `settlingMax` 24 — the studio's own, else Max Strength's default, else the app's); a client Journey can't judge is Unknown, "too new to judge", never Lapsed off a low Journey count. The nightly renewals job writes each client's state (`studios/{s}/clientStates`, `watch/journey`, leaders only; `server/journey-step.ts`), and Operations uses it while it is today's. A slipping client's case is stored (`studios/{s}/cases/{clientId}`: owner by sign-in uid, next step, due day, outcome, reason); it is the leader's after 3 days with no step, and "Booked again" is worked out on read, never set by the sync. A leader's "didn't come" (`studios/{s}/bookingMarks`) makes a booking a no-show in `lib/booking-state.ts`. Recognise, the huddle and every next step send nothing to anyone.
```

**`docs/rounds/README.md`**, at the foot:

```
| 2026-09-28 | [2026-09-28-operations-2.md](2026-09-28-operations-2.md) — the Operations room's wave 2: the Journey's lines from the studio settings (Setup → Rules says where each came from); a leader's "didn't come" on a session nobody logged (`bookingMarks`, read by `lib/booking-state.ts`); the case stored (`cases`); client states, the Journey summary and All stars written nightly by the renewals job. **Rules and two indexes to deploy** |
```

**`docs/ops/TESTING-CHECKLIST.md`**, before "## Findings log":

```
## Round N — Operations, wave 2 · *Sep 28 2026, branch `redesign/operations-2`*

Deploy the two indexes and the rules first. Sign in as a studio leader.

- [ ] **Setup → Rules** lists Drifting, Drifting's least, Lapsed, New and Settling in, each saying "This studio's own", "Max Strength's default" or "The app's default". Change one on My Studio → Studio: Rules and the Journey follow.
- [ ] **Today → Needs you** lists a finished session nobody logged. **Didn't come** clears it; it appears under the bottom line with **Take back**, which brings it back.
- [ ] **Week → Last week** says "didn't come" for a marked session, not "not logged".
- [ ] After the nightly job runs: **Clients → Journey**'s header says "states from last night's run"; the this-week line says who moved back toward steady.
- [ ] A trainer can't open another trainer's case; a stored case shows "case: … owns it" on the Journey.
```

**`ROADMAP.md`**, at the foot of "The follow-up pile":

```
**Operations wave 2 (Sep 28 2026)** — walk Round N of the testing checklist after the rules and indexes deploy. Not built: 1:1 notes on Team → This week; the case form (owner, step, due, outcome, reason) in the Journey and on the client page; the Hub, the client calendar and My Profile reading "didn't come" marks.
```
