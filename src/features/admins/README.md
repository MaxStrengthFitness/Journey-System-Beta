# The Admins dashboard — the Command Center

Where the app is managed: administrators and the founder only (`isAdmin`: `Admin`, `Founder`), the third position on the app-mode switch (Trainer · Operations · Admin), view id `admins-dashboard`. Operations is where a studio is run; this is everything corporate-only. The round that made it what it is: `docs/rounds/2026-09-28-admins.md` (the Admins room of the Redesign Blueprints, AJ's pick "Command Center"), and its second wave, `docs/rounds/2026-09-28-admins-2.md` (the new data AJ approved: "all yes"). The split from Operations: `docs/rounds/2026-09-19-operations-overhaul.md`.

## The shape

Four **places** (`nav.ts`), each a set of **pages**. A sidebar lists every page under its place's name in landscape, two levels at most; in portrait a bar of the four places sits at the top with the current place's pages as chips under it. Nothing runs off the side of a portrait iPad.

| Place | Pages | Where |
| --- | --- | --- |
| Home | What needs you (with Take it · Snooze · Dismiss), the network and the standard | `home/` |
| Studios | All studios · Launches (the studios opening) · a studio's own page (reached from the list, Launches or the search) · Franchises | `studios/`, `launches/` (and `features/admin/studios/` for the registry's editors) |
| Standard | Machines (the catalog, with Where studios set their own above it) · Standard template · Studio defaults · Waiting for review | `features/admin/machines/`, `standard/`, `StandardTemplateTab.tsx`, `ReviewQueuePage.tsx` |
| Machinery | Limbo · Mindbody sync · Bug reports · Data · System tools · Activity | `features/admin/limbo/`, `machinery/`, `features/admin/bugs/`, `AdminsDataPage.tsx`, `features/admin/system/`, `activity/` |

A studio's page has five tabs: **Setup** (where it stands — its stage, its Mindbody link, its cutover; its **Opening**, stage and opening day; its **setup checklist** while it is setting up or handed over; its details, the same form My Studio → Studio uses; its franchise; the danger zone), **Mindbody**, **Floor** (the one floor editor), **Team** (who works there, with **Change role**) and **Activity** (what was changed there from here).

`AdminsDashboardView.tsx` is the shell: the gate, the sidebar and the bar, the search, Home's reads and marks, and the page. Every page move goes through one leave scope (`features/unsaved-changes`), because a catalog machine mid-edit, a studio's half-typed details or half-typed studio defaults unmount when the page changes; a studio's page has its own scope for its tabs.

## The second wave's data (Sep 28 2026, AJ "all yes")

Every record is written only from this folder (or `features/admin/bugs/` for the reply), signed with the **Auth uid** and the **server's time**, and its rules block in `firestore.rules` starts `WAVE 2 ADMINS:`.

| Record | What | Written by | Read by |
| --- | --- | --- | --- |
| `activity/{id}` | `{ at, by: { uid, name }, studioId, kind, what, before?, after? }` — one line per change made from here; append-only | administrators, through `logActivity()` | administrators; a studio's leaders, their own studio's entries |
| `studios/{id}.stage`, `.openingDay` | `setting-up` · `handed-over` · `running`; yyyy-mm-dd | administrators (Setup → Opening, Mark it handed over) | everyone who reads the studio |
| `studios/{id}/setupItems/{item}` | `{ block, title, dueOn, doneAt, doneBy, skipReason? }` — a tick, a skip with its reason, or an item added; the template is `launches/checklist.ts` | administrators | administrators, the studio's leaders |
| `bug_reports/{id}.reply` | `{ text, by: { uid, name }, at }` | administrators (Bug reports) | administrators; the reporter, on Settings → Your reports |
| `adminHome/{itemKey}` | `{ state, by, until?, reason?, at }` — Take it, Snooze, Dismiss; the key is the item's kind and a hash of its condition | administrators | administrators |

**`logActivity()`** (`activity/log-activity.ts`, exported from `activity/index.ts`) is the one writer of the Activity record, for any admin action to call once its own write has landed: `void logActivity({ kind, what, studioId?, before?, after?, byName })`. It never throws (a record that couldn't be written must not undo a change) and resolves `true` when written. `what` is one sentence starting with a verb; the row puts the name first. The kinds are `ACTIVITY_KINDS` (the rules name the same seven): `standard-edit`, `standard-set`, `publish` (for the catalog's screens to call), `admin-grant`, `assisted-change`, `setting-default`, `studio-stage` (written here).

## The rules this room keeps

- **Sentences, not scores.** A status is a word with a mark whose shape carries the meaning (`kit.tsx`, `HqStatus`): a filled dot is fine, a plum diamond wants a look, a dashed ring is "couldn't check", a hollow ring is waiting. Colour is never the only signal.
- **Unknown is never nothing.** Every read here says whether it was read. A failed lease read is "Couldn't check", never "hasn't pulled"; a failed Limbo or bug-report read says so with Try again; a studio's client count that failed is "Active clients unknown", never 0; Home turns every failed read into its own "Couldn't check" item. The second wave keeps it: a failed read of the studio defaults draws no boxes (an empty box would read as "not set"), a checklist or the Activity record that couldn't be read says so, a floor that couldn't be read is "Couldn't check" on its checklist item, never "no machines", and Home's marks that couldn't be read show every item.
- **Names are never cut short.** A row (`HqRow`) is the whole name, which wraps, one sentence of state, and at most one action of its own; tapping the row opens the thing, and no button sits inside another.
- **The confirmation rules.** A reversible act is done at once and offers Undo (dismissing a Limbo event; snoozing or dismissing a Home item). A consequential one asks, listing what will happen (the admin kit's `ConfirmDialog`: retiring a machine, deleting a franchise; `studios/RoleDialog.tsx` for a role). A destructive one asks you to type the name (deleting a studio, `studios/DeleteStudioDialog.tsx`).
- **It reads what its pages already read.** Once when the dashboard opens, and again on Check again: each real studio's sync lease (`machinery/useStudioLeases.ts`), Limbo, the newest hundred bug reports, the catalog's pending offers (`home/useHomeSignals.ts`) and Home's marks (`home/useHomeMarks.ts`). Every other page reads its own data when it opens: the Machines page each studio's floor; Studio defaults each studio's own settings; Launches and a studio's checklist its setup items and floor; Activity its entries. No listener of its own but the machine catalog and the company's studio defaults (the one shared listener, `features/studio-settings`), no timer, no Mindbody call (Add a studio's location lookup is the same server call the details form makes). Every new query ships with its index (Firestore here is the Enterprise edition, which builds none by itself).
- **Studios are grouped by what Journey knows** (`studios/stages.ts`): the Mindbody link and the Journey cutover date, which every studio carries. A studio's **stage**, where one is recorded, is said on its row and on its page (`launches/checklist.ts`, `stageLine`); the studios opening have their board on **Launches**, named so it never clashes with My Studio → Openings. The practice studio is listed in a group of its own, and left out of the search, Home, Launches and the sync check (the realm rule, `features/demo-mode/access.ts`).
- **Only failures are called failures** (`machinery/sync-check.ts`). A pull runs only while an iPad at the studio has Journey open in its hours, so a long gap is said as the fact it is ("No pull since Sat, Sep 26").
- **Quiet about studios' own settings, and about who changed what** (AJ, Sep 27: "I don't want there to be five markings on the document"). Where studios set their own is one line per machine, from two studios up, on the Machines page; on Studio defaults it is one quiet line per setting. The Activity record is a list you go and read; nothing is ever marked on the thing that was changed.
- **No owners on a studio's setup** (AJ, q1: "we dont need to track who set up a studio"): no item names one, and adding a studio is not recorded in the Activity record.
- **Nobody changes their own role here**, and a role that makes or unmakes an administrator is an `admin-grant`, recorded for the company.
- **The look.** `admins.css` owns every `hq-` class and nothing else; colours are the admin palette (`features/admin/admin.tokens.css`); nothing tappable is under 40px. `look.test.ts` holds it.

## Where the review queue mounts

"Waiting for review" (Standard) is the queue AJ asked for on Sep 28: "sharing with all MSF studios should submit to admins first for review, we can review in admin dashboard". `ReviewQueuePage.tsx` hosts `features/machine-db/ShareReviewPanel` (a studio's note, tip or own machine, offered to every studio, shared or not by an administrator). A waiting count for the sidebar and a Home item are not wired yet: they would go the same way as Limbo's (a count in `counts`, an item in `home/needs.ts` with its `condition`), and cost the queue's three collection-group reads on every Admins visit rather than only on the page.

## Not built, and why

- **See as**: drawing a studio's own screens inside Admins. The studio screens read the app's active studio, so they would have to take a studio as an input: a large refactor, not tonight.
- **The MSF Standard's dated changes and the divergence view**, with the Sep 21 rule (q7): a merge and data change; and **q4** (the catalog changing under studios that adopted a machine), which AJ wants to talk through.
- **Ask the leader**: a setup item sent to the top of a leader's My Studio (it would write into Relay's data).
- **Setup items on Home**: an overdue item would cost each studio opening two reads on every Admins visit; Launches says what is overdue.
- **A studio's Activity on My Studio** for its leaders: the rules let them read it; the screen is My Studio's to build.

## Tests

The pure halves: `nav.test.ts`, `search.test.ts`, `studios/stages.test.ts`, `studios/role-change.test.ts` (roles and the details and franchise records), `machinery/sync-check.test.ts`, `home/home.test.ts`, `home/home-marks.test.ts`, `standard/studio-defaults.test.ts`, `standard/setting-defaults.test.ts`, `activity/activity.test.ts` (it also reads `firestore.rules` for the seven kinds) and `launches/checklist.test.ts`. The mounted ones: `AdminsDashboardView.render.test.tsx` (every page, the portrait bar, the search opening a studio, a person and a machine, a Home mark whose condition ended), `kit.render.test.tsx`, `studios/studios.render.test.tsx` (the grouped list, a studio's five tabs, the tabs asking before a half-typed detail is lost, the danger zone, the checklist on Setup, a details save recorded, Change role), `machinery/SyncCheck.render.test.tsx`, `home/AdminsHome.render.test.tsx` (with Take it, Snooze, Dismiss, Undo, Set aside), `standard/StudioDefaultsCard.render.test.tsx`, `standard/SettingDefaultsPage.render.test.tsx`, `activity/ActivityPage.render.test.tsx`, `launches/launches.render.test.tsx` (Launches, Add a studio, the checklist, the Opening panel), and beside their screens `admin/limbo/AdminLimboQueue.render.test.tsx` and `admin/bugs/AdminBugReportsTab.render.test.tsx` (with the reply). The rules: the `describe("wave 2 admins", ...)` block at the end of `tests/firestore.rules.test.ts`.
