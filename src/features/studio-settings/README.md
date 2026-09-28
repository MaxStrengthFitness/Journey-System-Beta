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
| `driftMultiple`, `driftMinDays`, `lapsedDays`, `newMax`, `settlingMax` | Where a client is | 2, 7, 45, 10, 24 | Operations → Clients → Journey (`admin/journey/states.ts`) |
| `deepCleanDays`, `wipeAfterSessions`, `weeklyMaintenanceDay` | The machines' care | 14, 4, none | Relay's Floor Map (`relay/board/machine-care.ts`) |

## The editors

- **Admins → Standard → Studio defaults**: Max Strength's default for each, beside the app's.
- **My Studio → Studio → This studio's settings**: each value with where it came from; a studio's leaders set or clear their own, everyone else who works there reads it.
