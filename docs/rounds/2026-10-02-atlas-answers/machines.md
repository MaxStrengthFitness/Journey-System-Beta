# The Atlas answers: machines, Learning and the Admins dashboard (Oct 2 2026)

Branch `oct2/machines`, on master's `7875a993`. One commit per item. The decisions are AJ's, on the round's page (`docs/rounds/2026-10-02-atlas-answers.md`).

Measured at the end, in a worktree on AJ's PC: typecheck **2** (the baseline), `TZ=America/New_York npx vitest run --dir src` **8,612 passing in 616 files**, `npx vite build` clean, the rules tests **275 passing** (run on a spare emulator port, 8187, which was stopped afterwards), and `git ls-files | tr A-Z a-z | sort | uniq -d` prints nothing.

## For AJ: what has to be deployed

- **Rules** (three small blocks in `firestore.rules`, each with tests in its own `describe` at the end of `tests/firestore.rules.test.ts`): deploy `firestore:rules` **before** pushing the app, after your own `npm run test:rules`.
  1. A roster entry whose `source` is `custom` can't be deleted, by anyone (item 1).
  2. `removedSafetyValid` no longer caps the list at 10; it still checks the reasons in the first ten places (item 6). One existing test changed its eleventh-line assertion from refused to accepted.
  3. `isActive`, `switchedOffAt` and `switchedOffBy` join the trainer "access fields" a trainer can't write on their own record (item 8).
- **No new index.** No Mindbody call. No Cloud Function touched.
- Item 7 makes three existing, unindexed collection-group reads (the Waiting for review page's own) run each time the Admins dashboard opens or Check again is tapped. They scan `roster`, `wiki` and `playbook` across every studio; small today. If they grow, three single-field collection-group indexes on `shareStatus` would stop the scan (not added: "avoid new composite indexes").

## 1. A studio's own machines — done

- **Add from the Catalog** was already there: on a Catalog machine's page in All MSF machines, a leader (`canWriteStudioPages`) sees "Add to {studio}'s floor" (or "Put it back on {studio}'s floor" for one switched off). Kept as it was, plus item 2's order.
- **Edit or remove on My Studio → Machines**: Edit / Set up for us and We don't have this were already on each row.
- **Removing always retires** (`StudioInventoryManager.tsx`): We don't have this on a studio's own machine used to `deleteDoc` its roster entry. It now switches it off (`status: "inactive"`) exactly as a copy of an MSF machine, with a toast saying past sessions keep its name. Nothing on the screen deletes a roster entry any more, and the rules refuse deleting a `custom` one for everyone.
- **It can be brought back**: Add from MSF lists a studio's own switched-off machines under "Switched off at {studio}" (`floor-editor.ts`, `addableFromMsf`), "Put it back".
- **Past sessions keep its name**: the roster entry stays, so any reader that names machines from the studio's roster in every state (Team's Open loops, the floor editor) still names it. Not done here: the client profile's history names machines from the app-wide catalog list, which has never held a studio's own machines, retired or not. That is the history/profile branches' (`oct2/history`, `oct2/profile`), not a change this item made.

## 2. A machine added joins the end; reordering is easy — done (mostly as built)

- The floor editor's Add from MSF already put a new machine at the end of a walking order the studio keeps (`orderForNewMachine`), and Walking order already had **move up / move down buttons at 40px** beside the drag handle.
- Fixed: a Catalog page's "Add to {studio}'s floor" (`machine-db/database.ts`, `planAdoption`) did not, so the machine landed wherever the MSF standard order put it. It now asks the same `orderForNewMachine`, for a new machine and for one switched back on. A studio that keeps no order of its own still places it by the standard order (unchanged, by design).

## 3. One maintenance record — done

- The two stores: Relay's Floor Map flag is `studios/{s}/machineCare/{machineId}.flag` (read by the Floor Map, Team's Open loops, the Catalog and Learning's Overview); the checklist's problem is `taskInstances/{id}.flagged` on a machine row closed with a problem (read by Team's Open loops as "Reported on the shift list", and by the seven-day duty table).
- **The care record is the one source.** Closing a machine row with a problem now also flags the machine in its care record (`useTaskActions.closeWithNote` → `flagMachine`, the note being the trainer's words or which duty found it: `machine-care.ts`, `checklistFlagFor`), signed with the Auth uid. Open loops no longer lists a machine row as a shift-list report (`team/accountability.ts`, `shiftListReports`): a machine's problem is listed once, as the Floor Map's flag, and clearing it on the Floor Map clears it on Team and in the Catalog too. A duty with no machine is still a shift-list report.
- No rules change: the people who close checklist rows are the people who may write the care record (`writesForStudio`).
- Left as it is: the duty table's per-day record still shows that day's row was closed with a problem (it is history, not the flag). Reports filed before this ships (machine rows flagged in the last seven days) stop appearing on Open loops unless someone flags the machine on the Floor Map.

## 4. The Academy's names and quick cards — done

- **Names**: the Academy named machines from the old machine database ("Pec Fly", "Low Back", "Torso Arm"). It now uses the Catalog's: the live catalog's name (Learning passes the catalog documents it already holds to `AcademyWikiView`; `useLearningEntries` uses the catalog it already reads), else the standard's own (`MACHINE_DEFINITIONS`). `academy/academy-machines.ts`, `machineName` / `catalogNamesOf`. The alias index that matches the deep dives still knows the old names, so every deep-dive link still resolves.
- **Quick cards**: the parser turned every short line into a heading, so a card had twenty-odd "sections". `academy/parse.ts`, `parseQuickReference`, now knows the six sections in every spelling the eighteen cards use (Target Muscles · Synergists · Considerations for Setup, also "Setup Considerations" and "Setup" · Posture / Get Set · Execution, Instruction, and Turnarounds, also "Execution & Turnarounds" and "Execution" · Notes, also "NOTES:"), keeps the parts inside one ("Load Up", "Eccentric Phase", "TSC Protocol") as sub-headings, and keeps the opening sentence as the card's lede. `cards.json` regenerated by `npx tsx scripts/build-academy-content.ts` (the other content files came out byte-identical). Two cards (Cx, TR) have no Notes section in the source; they show five.

## 5. The body figure — checked, nothing to change

Every body figure in the app already goes through `components/anatomy/BodyModel` (react-muscle-highlighter's male and female figures), the Catalog's model: the Catalog's machine page and body lens, All MSF machines, the machine editor's muscle picker, the Routine Builder and the client codex's Where it matters. The Academy's own pages draw no figure. A new test (`components/anatomy/one-model.test.ts`) fails if anything else imports the figure library, or if the older react-body-highlighter comes back.

## 6. A removed safety line, crossed out; no limit — done

- On the unit's Catalog page (`catalog/MachineArticle.tsx`, `RemovedLines`): each of Max Strength's safety lines the studio took off its copy is shown struck through in the muted ink (still readable), with "Taken off this unit: {reason} ({who}, {date})". Inside Clinical warnings and Contraindicated for, never folded away; the lists the page doesn't draw (stop rules, watch-outs, sequencing, alignment checkpoints) get a block of their own, each named by its list. The adapter carries the records (`catalog/adapters.ts`, `removedSafetyOf`). Mounted in `MachineArticle.render.test.tsx`.
- **No count limit**: `scopeOverrides` no longer refuses an eleventh removal and still refuses any removal without a reason, at any place (`lib/machine-template.ts`; `MAX_REMOVED_SAFETY` became `RULES_CHECKED_REMOVALS`, which is not a limit). The rules can't loop: they check the reasons in the first ten places and no longer cap the size. The most safety lines any standard machine has today is 11 in all, so the eleventh place is the only one the rules don't check; the app does.

## 7. Waiting for review on the Admins dashboard — done

A count beside Waiting for review in the sidebar and a line on Home ("Solon offered a note on a machine to every MSF studio: “…”", the oldest first, how long it has waited, Open Waiting for review), like Limbo and bug reports; it clears itself when each is decided, and a failed read is "Couldn't check". One read for both (`machine-db/fetch-share-offers.ts`), and a decision on the page counts again. The cost is in "what has to be deployed" above.

## 8. Switching a former trainer's account off — app and rules done; the Auth account needs a Cloud Function

- **Change role** on a studio's Team (Admins dashboard) offers "Switch the account off…" for anyone but yourself; it asks again, saying what happens, then writes `isActive: false`, `switchedOffAt` and `switchedOffBy` on the trainer record and a line in the studio's Activity. Their past sessions keep their name (nothing about them is deleted), and `who-works-here.ts` already leaves them off every team list. The studio's Team lists them under "Accounts switched off" with **Switch back on**.
- **Refused and signed out**: `useAuthInitialization` refuses a switched-off record at sign-in (signed straight out; the sign-in screen says why) and watches the signed-in person's own record (one document), so a switch-off signs them out at once. `features/sign-out/account-off.ts`.
- **Rules**: a trainer can't write their own `isActive`, `switchedOffAt` or `switchedOffBy`.
- **Not done, needs a Cloud Function** (out of scope): the Firebase Auth user stays enabled, so the person can still sign in to Google or Microsoft and, with a token, read whatever any signed-in account may read and write wherever the rules let them (their own record's other fields, say). What it would take: a callable function, administrators only, `setTrainerAccountEnabled({ trainerId, enabled })`, that calls `admin.auth().updateUser(uid, { disabled: !enabled })` and `admin.auth().revokeRefreshTokens(uid)` and writes the same three fields; or a Firestore trigger on `trainers/{id}` that does the same when `isActive` changes. Either way the rules could then also ask `request.auth.token` for a `disabled` claim, but a disabled Auth user can't get a token at all, which is the real lock. Refusing a switched-off trainer in every rule instead would cost a document read per request (the 1,000-expression budget), so it is left for the function.

## 9. Bug statuses in the Admins words — done (mostly as built)

Each of a reporter's reports on Settings already read New · Looking into it · Fixed · Won't fix. The line above them still said "1 open · 2 closed"; it now counts in the same words ("1 looking into it · 1 fixed · 1 won't fix"), from `statusCountsLine` beside the labels (`admin/bugs/reportView.ts`).

## 10. Mindbody "Unavailable" blocks on the Hub — not built: it needs a new Mindbody call

- What is there: the Hub already draws a row whose client name says "Unavailable" as grey staff time (`HubCard`, `data-kind="staff"`, "Unavailable, {span}: not a session"), and every reader already ignores such rows as bookings (`isStaffBlock`). The pull does **not** skip them; there is simply nothing to skip. The schedule pull (`src/lib/mindbody-api-sync.ts` through `server.ts`'s `/api/mindbody/staff-appointments`) reads Mindbody's `appointment/staffappointments`, which returns booked appointments only. A staff member's blocked-off time ("Unavailable" in Mindbody's appointment book) lives behind a different endpoint, `appointment/unavailabilities` (StaffId, StartDateTime, EndDateTime, Description: the note). `scripts/openings-report.ts` counts the "Unavailable" rows on file; expect none from the pull.
- So bringing them in is a **new Mindbody call on every pull**, which this round may not add, and which needs AJ's OK under the freshness rules (a new timer or more calls). What it would take, all app-side (no Cloud Function):
  1. `server/mindbody-client.ts` / `server.ts`: a route `/api/mindbody/staff-unavailabilities` (signed-in staff, same token bucket and breaker) calling `appointment/unavailabilities` for the site, the pull's dates and its staff ids, one page of up to 500.
  2. `src/lib/mindbody-api-sync.ts`: after the appointments, write each one as its own schedule row with an id that can't collide with an appointment's (`unavail-{Id}`), `clientName: "Unavailable"` (so `isStaffBlock` keeps it out of every count, as now), `clientId: null`, the staff's trainer, start and end converted with the studio's timezone like an appointment, `status: "Scheduled"`, and the description as a new field `staffNote` (trimmed, at most 140 characters, `withoutUndefined`). It must be counted separately in the sync result, never in `created` / `updated`, and the "deleted in Mindbody" sweep must treat these ids on their own (a block removed in Mindbody is removed here), so the appointment sweep can never delete one or be confused by one.
  3. The Hub: `HubCard`'s staff card says the note under "Unavailable" when there is one.
  4. Before trusting it: run `scripts/openings-report.ts` for a week and check every count that reads the schedule (Openings, Team's check, Changes, the Overview, the Directory, Opportunities) is unchanged with the blocks in.
- The cost: one more Mindbody request per studio per pull (the pull runs every 30 minutes for today and tomorrow, each morning for days 3–30), on the site's call allowance.
