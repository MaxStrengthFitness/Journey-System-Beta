# The Admins dashboard — the Command Center

Where the app is managed: administrators and the founder only (`isAdmin`: `Admin`, `Founder`), the third position on the app-mode switch (Trainer · Operations · Admin), view id `admins-dashboard`. Operations is where a studio is run; this is everything corporate-only. The round that made it what it is: `docs/rounds/2026-09-28-admins.md` (the Admins room of the Redesign Blueprints, AJ's pick "Command Center"). The split from Operations: `docs/rounds/2026-09-19-operations-overhaul.md`.

## The shape

Four **places** (`nav.ts`), each a set of **pages**. A sidebar lists every page under its place's name in landscape, two levels at most; in portrait a bar of the four places sits at the top with the current place's pages as chips under it. Nothing runs off the side of a portrait iPad.

| Place | Pages | Where |
| --- | --- | --- |
| Home | What needs you, the network and the standard | `home/` |
| Studios | All studios · a studio's own page (reached from the list or the search) · Franchises | `studios/` (and `features/admin/studios/` for the registry's editors) |
| Standard | Machines (the catalog, with Where studios set their own above it) · Standard template · Waiting for review | `features/admin/machines/`, `standard/`, `StandardTemplateTab.tsx`, `ReviewQueuePage.tsx` |
| Machinery | Limbo · Mindbody sync · Bug reports · Data · System tools | `features/admin/limbo/`, `machinery/`, `features/admin/bugs/`, `AdminsDataPage.tsx`, `features/admin/system/` |

`AdminsDashboardView.tsx` is the shell: the gate, the sidebar and the bar, the search, and the page. Every page move goes through one leave scope (`features/unsaved-changes`), because a catalog machine mid-edit or a studio's half-typed details unmount when the page changes; a studio's page has its own scope for its tabs.

## The rules this room keeps

- **Sentences, not scores.** A status is a word with a mark whose shape carries the meaning (`kit.tsx`, `HqStatus`): a filled dot is fine, a plum diamond wants a look, a dashed ring is "couldn't check", a hollow ring is waiting. Colour is never the only signal.
- **Unknown is never nothing.** Every read here says whether it was read. A failed lease read is "Couldn't check", never "hasn't pulled"; a failed Limbo or bug-report read says so with Try again, never "Nothing in Limbo" or "No reports yet"; a studio's client count that failed is "Active clients unknown", never 0; Home turns every failed read into its own "Couldn't check" item.
- **Names are never cut short.** A row (`HqRow`) is the whole name, which wraps, one sentence of state, and at most one action of its own; tapping the row opens the thing, and no button sits inside another.
- **The confirmation rules.** A reversible act is done at once and offers Undo (dismissing a Limbo event). A consequential one asks, listing what will happen (the admin kit's `ConfirmDialog`: retiring a machine, deleting a franchise). A destructive one asks you to type the name (deleting a studio, `studios/DeleteStudioDialog.tsx`).
- **It reads what its pages already read.** Once when the dashboard opens, and again on Check again: each real studio's sync lease (`machinery/useStudioLeases.ts`), Limbo, the newest hundred bug reports and the catalog's pending offers (`home/useHomeSignals.ts`). The Machines page reads each studio's floor once for Where studios set their own (a plain read of each studio's own list). No listener of its own but the machine catalog, no timer, no Mindbody call, and no new kind of query: each one is a query a page already made, with the same shape (Firestore here is the Enterprise edition, which builds no index by itself).
- **Studios are grouped by what Journey knows** (`studios/stages.ts`): the Mindbody link and the Journey cutover date, because a studio's stage (setting up, handed over, running) is not recorded. The screen says so. The practice studio is listed in a group of its own and left out of the search, Home and the sync check (the realm rule, `features/demo-mode/access.ts`).
- **Only failures are called failures** (`machinery/sync-check.ts`). A pull runs only while an iPad at the studio has Journey open in its hours, so a long gap is said as the fact it is ("No pull since Sat, Sep 26").
- **Quiet about studios' own settings** (AJ, Sep 27: "I don't want there to be five markings on the document"). Where studios set their own is one line per machine, from two studios up, on the Machines page, and nothing at all while there is nothing to say (`standard/`).
- **The look.** `admins.css` owns every `hq-` class and nothing else; colours are the admin palette (`features/admin/admin.tokens.css`); nothing tappable is under 40px. `look.test.ts` holds it.

## Where the review queue mounts

"Waiting for review" (Standard) is the queue AJ asked for on Sep 28: "sharing with all MSF studios should submit to admins first for review, we can review in admin dashboard". `ReviewQueuePage.tsx` hosts `features/machine-db/ShareReviewPanel` (a studio's note, tip or own machine, offered to every studio, shared or not by an administrator). A waiting count for the sidebar and a Home item are not wired yet: they would go the same way as Limbo's (a count in `counts`, an item in `home/needs.ts`), and cost the queue's three collection-group reads on every Admins visit rather than only on the page.

## Not built, and why

Each needs a stored record or field (AJ's OK), or is a larger refactor the design flagged:

- **Opening a studio**: a studio's stage, its opening day and setup items with owners and due dates (new fields and records); "Ask the leader" tasks.
- **Activity**: a signed record of who changed what (a new collection). AJ, Sep 28: "we dont need to track who set up a studio".
- **See as**: drawing a studio's own screens inside Admins, read only first. The studio screens read the app's active studio, so they would have to take a studio as an input.
- **Take it, Snooze, Dismiss on Home**: each needs a small stored record per item.
- **A reply on a bug report** the reporter reads in the app (a new field).
- **The MSF Standard's dated changes and the divergence view**, and "Launches" (the blueprint's Openings board of new studios, renamed so it doesn't clash with My Studio → Openings).

## Tests

`nav.test.ts`, `search.test.ts`, `studios/stages.test.ts`, `machinery/sync-check.test.ts`, `home/home.test.ts` and `standard/studio-defaults.test.ts` are the pure halves. The mounted ones: `AdminsDashboardView.render.test.tsx` (every page, the portrait bar, the search opening a studio, a person and a machine), `kit.render.test.tsx`, `studios/studios.render.test.tsx` (the grouped list, a studio's four tabs, the tabs asking before a half-typed detail is lost, the danger zone), `machinery/SyncCheck.render.test.tsx`, `home/AdminsHome.render.test.tsx`, `standard/StudioDefaultsCard.render.test.tsx`, and beside their screens `admin/limbo/AdminLimboQueue.render.test.tsx` and `admin/bugs/AdminBugReportsTab.render.test.tsx`.
