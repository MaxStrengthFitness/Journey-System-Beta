# Beta prep, Step 1 — the trim (Sep 17 2026)

**Branch `beta-prep`, off master `33ad0ed`. Nothing here goes to master** (AJ,
Sep 17: "we are heavily editing the code so things really could break"). Master
is what is live on Render and it stays frozen until he says otherwise: no
`golive`, no push to master, no `firebase deploy`. One commit per item; tags
`beta-prep-step1a-deletes`, `-step1b-moves`, `-step1c-giants`, `-step1-trim`.

## Why this round exists

AJ's plan for getting to beta, in his order:

1. **Phase 1 — organize and polish.** Step 1 the trim (this round), Step 2 the
   Operations dashboard and Settings, Step 3 the polish: transitions between
   screens, loading states, how buttons look when pressed / disabled / focused,
   speed.
2. **Phase 2 — reconcile `ROADMAP.md` with what is built, and a full feature
   test** before any mock data exists.
3. **Phase 3 — Demo Mode and Tutorial Mode. Locked until 1 and 2 are done.**
   Mock client names are Lord of the Rings deep cuts, never the Fellowship or
   the obvious ones (his examples: Barliman Butterbur, Lobelia
   Sackville-Baggins, Imrahil, Glorfindel, Ioreth, Mablung, Damrod, Beregond,
   Haldir, Morwen).

How beta will work (AJ, Sep 17): FileMaker stays in use throughout. Not every
studio, and not every session, moves at once - it is a slow transition so
trainers get comfortable. The first studios are tenured corporate ones;
franchisees come in over time. Feedback, bug reports and ideas are collected
throughout. **No trainer runs sessions on the app today**; the FileMaker data
has been requested from the old developer and is delayed. The goal of this
work is that every minor fix is handled and every issue is KNOWN before beta.

The audit behind this round is the Claude doc "Journey System — The Trim
Report (Phase 1, Step 1)". Item numbers below (A1, B3, F1...) are its.

## What shipped, by commit

| Commit | Item | What |
| --- | --- | --- |
| `968d5e9` | — | CLAUDE.md: nothing from this branch goes to master |
| `55be506` | F1, C2 | The Academy's 20 lb neck ceiling moved into the ONE `calculateStartingWeight` the app calls; the spare copy deleted; its four pins moved |
| `ef41581` | A1 | The pre-wiki Catalog and Academy screens: 12 files, 2,684 lines |
| `a98d5f3` | A2 | `catalog.css` 1,474 → 246 lines; all 29 surviving selectors proved identical |
| `33ee707` | A3 | `ActiveSessionView` (never wired) |
| `8644da0` | A4 | `ReminderStrip` (replaced by `RelayStrip`) |
| `86bf0e8` | A5 | Three unused barrels; 284 unused re-export names in 26 live barrels |
| `7ab28c2` | A6 | The legacy History view; the Hub's History button opens the profile at Activity Archive → Sessions (`openProfileAt`) |
| `39fe299` | A7 | `mockDataGenerator` and the profile's unreachable mock dialog |
| `ed8a064` | A8 | The "John Demo" seeder |
| `4325f7a` | A10 | Six dead `View` ids and two impossible `"dashboard"` checks |
| `1c50fa0` | A11 | Seven large functions nothing calls (~700 lines) |
| `ab979b9` | A12 | 203 unused imports, 20 dead `useState` pairs, dead handlers - and three sets of Firestore reads nobody used |
| `9ad3838` | B1 | Eight Operations screens from `src/components/` into `features/admin/` |
| `7b728f5` | B2 | `features/admin-data/` → `features/admin/data/` |
| `6f11546` | B3, C1 | One `utils`, one `cn()`; `components/ui/` into `src/`; `@/` now means `src/` |
| `5ab27e5` | B4 | `EditTrainerModal`, `ActiveStudioContext`, `DEFAULT_MACHINES` moved beside their users |
| `9d6f40c` | F1 | The ceiling ignores name casing; the tracker's seed is recorded as never firing |
| `6e4eabf` | B5 | `features/notes/` → `features/client-notes/` |
| `a9ddf4d` | B6 | `features/planner/` → `features/relay/` (its `relay/` → `board/`) |
| `b28face` | D1 | The tracker's three dialogs → `features/tracker/`, byte-identical |
| `2c42aee` | D2 | `LoginScreen`, `NavButton`, `getMachineImageUrl` out of `AppContent`; a render test for the login screen |
| (this commit) | E1, E3, E4 | `docs/KNOWN-TRAPS.md`, a 14 KB `CLAUDE.md`, `src/features/README.md`, this document |

**Size.** 321 files changed, 2,073 lines added, 9,234 removed.
`AppContent` 3,197 → 2,555 lines; `WorkoutTrackerView` 4,175 → 3,209;
`ClientProfileView` 1,972 → 1,665. Production bundle: JS 5,013 → 4,986 KB,
CSS 737 → 703 KB (the first-paint `index.css` 427 → 402 KB). The bundle barely
moved because the build already dropped dead JavaScript; the dead CSS was the
part iPads were actually downloading. The win is in what a person has to read.

## Verification

After EVERY commit, in the cloud: `npx tsc --noEmit` = **11** (master's
baseline), `TZ=America/New_York npx vitest run src` all passing, `npx vite
build` clean, and `git ls-files | tr A-Z a-z | sort | uniq -d` empty (the
Windows case trap). Tests went 2,977 → **2,982**, all five additions
deliberate: `openProfileAt` (1), the starting-weight casing pins (2), the
`LoginScreen` render test (2). The four Academy starting-weight pins MOVED
with their rule; none was dropped.

Before anything was deleted, the delete list was checked twice: all 16
unreachable files removed in a scratch copy (11 / 2,977 / clean build), and an
independent reviewer told to prove each delete WRONG, who found no live
reference and several things the first pass missed.

Extra proofs where a number cannot see the change: `catalog.css` selectors
compared declaration by declaration; the three tracker dialogs parsed and
compared to the originals; every string, template literal and JSX text in the
eight files the unused-code sweep touched compared before and after.

**Not verified: anything on an iPad, and `npm run test:rules` (no rules
changed).** The trim is meant to change nothing a trainer can see except the
Hub's History button.

## Found on the way — for AJ

### Decisions that are his

1. **A9, App Cleanse.** Operations → System Tools → "Wipe and
   re-initialize": one admin tap deletes every document in 11 collections of
   the production database (clients, sessions, trainers, studios...). It made
   sense on test data; the database now holds the Mindbody roster.
   `scripts/purge-database.ts` (dry-run by default) is the deliberate route.
   Recommendation: delete. **Left in place, waiting for his yes.**
2. **A13, server and Mindbody leftovers** (needs an explicit OK by the project
   rules): (a) `/api/parse-ical`, `/api/sync-calendar`,
   `/api/trigger-master-sync` sit OUTSIDE the sign-in gate, have no caller,
   and the first two fetch any URL a stranger sends them; (b)
   `/api/mindbody/issueUserToken`, `/client-demographics`,
   `/client-commercial` and `syncClientCommercialData`, callers removed Sep
   15; (c) three Gemini routes with their client functions, and the unused
   server copy of `sanitizeImportedSessions`; (d) `mapMindbodySessions`,
   `cleanAlphanumeric`, `daysUntil`. **Untouched.**
3. **Should the tracker suggest a starting weight at all?** It was written to
   (`startNewSession` seeds a machine the client has never done) and it never
   has: all 20 standard machine names are UPPERCASE and the weight table is
   keyed in Title Case. Turning it on is a one-line change - and needs a head
   trainer first, because the two tables in the code disagreed (Leg Press 100
   vs 160 lb for a man; skill multipliers 0.8 / 1.0 / 1.3 vs 1.0 / 1.15 /
   1.3). Pinned by a test marked KNOWN, LEFT AS FOUND.
4. **F2.** Three Academy safety rules the routine builder never imports:
   `HANDS_FREE_MACHINES`, `PAIN_PROTOCOL`, `ADD_EXERCISE_CHECKLIST`. Should
   the builder warn on them?

### For the Operations and Settings inventory (Step 2)

Finished code with no control - "settings with no way to interact with them":

- **Studio task categories.** Read all over Relay's Floor
  (`studioCategories`); `saveStudioCategory`, `deleteStudioCategory` and
  `newCategoryId` exist and nothing calls them. A studio cannot edit its own
  categories.
- **Routine-template tiers.** `visibleToStudio`, `highestAuthorableTier`,
  `TIER_LABEL` are written and unused: the global / studio template
  visibility AJ asked for on Sep 12 is half built.
- **The trainer PIN.** Edit Trainer can SET one (`hashPin`); nothing ever
  checks it (`comparePin` has no caller). A setting with no effect.
- **Props handed down and ignored.** `AppContent` passes props that their
  screens never read (`trainers`, `onSearchTermChange` to the Hub;
  `authTrainer`, `activeStudioId` to Franchise team management;
  `setClientFormData`, `onOpenInfo` to the tracker). They were dropped from
  the destructuring only; the prop types still declare them.
- Writers with no button: FORD's `setGestureStatus` and
  `promoteToOpportunity`; `setRequestExpiry`, `reopenRequest`,
  `deleteRequest`, `restorePlaybookEntry`, `restoreStudioWikiDoc`,
  `editJobDetails`, `deleteRenewalTouch`, `updateFocusIntent`,
  `useMachinePlaybook`, Relay's `RoleGate` component.
- The second `AccessRequestView` branch in `AppContent` cannot run, but it is
  what narrows `authTrainer` to non-null for TypeScript below it. Left alone.

### For the polish step (Step 3)

- **The sign-in screen in light mode.** Its button labels and footer are
  `text-slate-900 dark:text-white/..` on a surface that is dark in both
  themes: near-black on near-black when the theme is light. And its root is
  `min-h-screen overflow-hidden` with no scroller - the last pre-shell
  "scroll trap" (ROADMAP, Sep 5).
- `catalog.tokens.css`: 21 of its 39 tokens are now unused. Eleven token
  files in all; one shared file with per-feature aliases is C6.
- Two consultation wizards (`ConsultationWizard`, 64 raw hex colours, the most
  in the app; `ConsultationSetupWizard`). **Question for AJ:** two different
  moments, or an old and a new version of one thing?
- Drift counted on Sep 16: 367 raw hex colours in 39 files, 21 files with a
  hand-rolled spinner beside `LoadingMark`, 311 colour classes that ignore
  the theme (the `neutral-ramp` budget), 136 card recipes.

### Costs the trim removed without being asked

- The tracker held two live, unbounded listeners on the legacy `sessionNotes`
  and `focusRecords` collections for every client it opened. Their only
  consumer was `BriefingScreen`, which ignored both props.
- The profile fetched up to 50 `sessionNotes` documents on every open and
  every tab change, into state nothing read.
- The profile ran four `useMemo` blocks over every exercise log on every
  render, for charts that no longer exist.

## Narrower than the Trim Report said, on purpose

- **A11.** Deleted the seven large leftovers; KEPT the ~70 small ones. On a
  closer read many are finished writers and label tables for live things with
  no control yet (see Step 2 above). They cost nothing where they are.
- **B6.** Renamed `planner` → `relay` but left `features/studio-tasks/` where
  it is. It is the task data layer for the Catalog, the Hub and Operations as
  well as the Floor tab, and its name matches the view id and the Firestore
  collections. Moving it would have touched 71 more files to make a name less
  accurate.
- **D2.** Moved the whole, self-contained pieces out of `AppContent`. Did NOT
  break the 1,100-line screen switch into a file per view: that is prop
  plumbing, which Step 2 has to redesign anyway.
- **E1.** `CLAUDE.md` is 14 KB, not the 10 KB target. What remains is the
  where-things-are table and the decisions list, which earn their place.

## A correction

The Trim Report and commit `55be506` said the tracker was seeding clients at
28 lb on the neck machine "today". It was not. The casing trap (decision 3
above) means the heuristic returned nothing for that machine in the tracker;
the danger was real but latent, one rename away. `9d6f40c` is the correction
and the hardening. The `getLatestMachinePerformance` "target-weight fallback"
named as a third caller was itself dead code (A11).

## How it was done (repeatable)

- Cloud container: clone from GitHub, `npm ci`, `node
  scripts/setup-firebase-config.cjs`. It can run `tsc`, `vitest` and `vite`;
  not `test:rules`.
- `npx knip@5` finds only files NOTHING imports. A re-export is an import, so
  trim the unused re-export names from every barrel first, then re-run, delete
  what turns up, and repeat until nothing new (two rounds here). A production
  config (entries and globs suffixed `!`, tests excluded) shows code kept alive
  only by its tests.
- `npx tsc --noEmit --noUnusedLocals` lists unused names. TypeScript's own
  language-service fixes (`unusedIdentifier_deleteImports`, then
  `unusedIdentifier_delete`) remove them; it will not touch array
  destructuring, so dead `useState` pairs need a separate pass. REVIEW the
  second fix's diff: deleting a declaration deletes its initializer, and an
  initializer can be a hook that subscribes to something.
- File moves: rewrite every relative specifier from the OLD layout to the NEW
  one (imports, re-exports, `import()`, `vi.mock`, CSS `@import`), then `git
  mv`. Then grep for the old PATH as a string - `neutral-ramp.test.ts` lists
  screens by path and would have gone quietly wrong.
- Delivery to AJ's PC without touching master or his working tree: `git bundle
  create x.bundle master..beta-prep` in the cloud, commit the file into
  `backups\beta-prep\`, then on the PC `git fetch x.bundle
  beta-prep:beta-prep`. Use a NEW bundle file name each time. The fetch leaves
  `tmp_pack_*` files it cannot unlink; move them aside.
- On the PC mount use `git --no-optional-locks` for anything read-only. A plain
  `git status` leaves `.git/index.lock`, which blocks AJ's next git command and
  cannot be deleted without delete permission. (A `maintenance.lock` from Sep 2
  had been blocking git's auto-maintenance there for two weeks; moved aside.)

## Next

Step 2: the Operations dashboard and Settings, from a numbered inventory (AJ's
choice, Sep 16), with a closer look at how studio leaders and head trainers
use the app. Trainer usage is "almost fully locked in" (AJ, Sep 17).
