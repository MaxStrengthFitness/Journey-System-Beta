# features/studio-settings — a studio's own numbers, with head office's default

AJ, Sep 28 2026, approving the rooms' new settings: *"let the admins assign the default within the app"*.

Until then every one of these was a constant in the code: "2 sessions or fewer is a quiet floor", "Lapsed at 45 days", "a deep clean every 14 days". Now each is a **setting** with three layers, and the first that holds a usable value wins:

| Layer | Where | Who writes it |
| --- | --- | --- |
| This studio's own | `studios/{s}/config/settings` → `values` | the studio's leaders (the renewal settings' rule: `renewalsManageable`) |
| Max Strength's default | `system/studioDefaults` → `values` | administrators (`isSuperAdmin`) |
| The app's default | `SETTINGS[].appDefault` in `registry.ts` | the code |

- **`registry.ts` is the list.** Each setting has a key (plain words, no dots, so a key is never mistaken for a path), a group, the words a leader reads, its kind and range, the app's default, one sentence of what changes, and **its reader** (every number has one). Add a setting here and it appears on both editors.
- **`resolve.ts` is the one answer** to "what is this studio's value, and where did it come from" (`resolveSetting`, `resolveAll`). A value that isn't usable (the wrong type, out of range, a fraction where a whole number belongs, Settling in not past New) is skipped, never bent into one nobody chose: the next layer answers. A read that failed falls through the same way, and `failed` travels with it so an editor can say it couldn't check.
- **`deepCleanDays` also reads the studio's own `deepCleanIntervalDays`** (the field The studio's day edited until Sep 28 2026) until its settings document holds one. The studio's day no longer edits it: This studio's settings shows it as the studio's own, and clearing the box clears both, so the studio really follows the default. One editor, not two.
- **`store.ts` is the only place either document is written** (`saveCompanyDefaults`, `saveStudioSettings`): only what changed, a cleared key removed (`deleteField`), signed with the Auth uid.
- **`useStudioSettings(studioId, studioDoc)`** gives a screen `value(key)`, `source(key)`, `loading` and `failed`. Until the layers answer, every value is the app's default, so no screen waits on its settings to draw. Max Strength's defaults are one listener for the whole app, however many screens ask, forgotten at sign-out.
- **firestore.rules** holds the shape (`values`, `updatedAt`, `updatedBy` = the Auth uid, at most 40 keys) and who may write; the registry holds what is usable.

## The settings (Sep 28 2026)

| Key | Group | App default | Reader |
| --- | --- | --- | --- |
| `quietFloorSessions` | Relay | 2 | Relay's Right now |
| `driftMultiple`, `driftMinDays`, `lapsedDays`, `newMax`, `settlingMax` | Where a client is | 2, 7, 45, 10, 24 | Operations → Clients → Journey (`admin/journey/states.ts`); `driftMultiple` and `driftMinDays` also fold a long gap on the machine menu's chart (`machine-menu/timeline-model.ts`, Oct 2026) |
| `inactiveDays` (Oct 1 2026) | Where a client is | 90 (30 to 730, and always past `lapsedDays`: `resolve.ts` skips one that isn't and both editors refuse it) | The Journey's Inactive line (`admin/journey/states.ts`), the nightly sweep (`renewals/job-plan.ts`) and the Client Directory's All (`client-directory/views.ts`); `docs/rounds/2026-10-01-inactive.md` |
| `deepCleanDays`, `wipeAfterSessions`, `weeklyMaintenanceDay` | The machines' care | 14, 4, none | Relay's Floor Map (`relay/board/machine-care.ts`) |
| `inbodyEverySessions` (Oct 1 2026) | InBody scans | 50 (4 to 200) | The briefing's Before you start and the InBody card (`inbody/due.ts`), for the client's HOME studio; a client's own `inbodyEvery` comes first |
| `newClientsStart` (the first-session round, item 8) | New clients | 1, A alone (a choice: 1 A alone, 2 A and B together) | Start a plan on Programming (the profile reads it into the plan host, `components/ClientProfileView.tsx` → `routine-plan/ui/StartPlanPanel.tsx`) and the briefing's walk-in card (`features/briefing/BriefingScreen.tsx` → `routine-plan/ui/useBriefingPlan.ts`), for the studio whose starting routines they offer, both through `routine-plan/ui/useNewClientsStart.ts`: true or false only once the value has answered (the studio's own, or both layers read), else "loading" (Keep waits, the briefing says so and Start keeps no B) or "failed" (B offered, left for later), never A alone off a read that didn't answer. With A and B together they plan Routine B beside the starting lineup, kept with no machines, and the Wrap-up that starts Routine A starts B (`routine-plan/README.md`) |

## A choice (the first-session round, item 8)

AJ, Oct 7 2026: *"Some studios may start building an A and B routine immediately for a client. So we need to be able to have that customization."* The registry held numbers only, so a setting of a few named choices is the kind `"choice"`: its `choices` (`{ value, label, sub? }`) in the order the editors draw them, its value still a NUMBER (`newClientsStart`: 1 A alone, 2 A and B together), so `SettingValue`, `store.ts`, the rules (a map of numbers) and `resolve.ts` stay as they were. `usable` takes only one of its own choices' numbers (anything else is skipped, never bent to the nearest), `parseSetting` reads the editors' text ("1", "2", "" to follow the default) and `formatSetting` says the choice's words ("A alone"). Both editors draw it as `ChoiceSegments` (side by side, each a 40px button on the firm 3:1 edge, the picked one blue; `choice-segments.css`, held by `firm-chips.test.ts`), inside each editor's dirty-tracked form: a first segment for no value of its own ("Follow the default (A alone)" on the studio's, "Not set" on head office's). A reader compares with `NEW_CLIENTS_START`, never the bare number. The Studio defaults page says a choice in a choice's words: "With Not set picked, studios use it.", and for a stored value that isn't one of its choices, "Pick one, or Not set.", never a box to empty. The research named it `startingRoutines` ("A" | "AB"); that name went to the studio's choice of starting routines (`studios/{s}/config/startingRoutines`).

## The editors

- **Admins → Standard → Studio defaults**: Max Strength's default for each, beside the app's.
- **My Studio → Studio → This studio's settings**: each value with where it came from; a studio's leaders set or clear their own, everyone else who works there reads it.
