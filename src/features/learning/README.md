# features/learning — the Learning tab

Round: Learning + Planner, Sep 2026. AJ's brief:

- "Make the catalog feel a bit more organized, an expert MSF wiki feel. Or feel like I'm browsing an in-depth system catalog."
- "The learning section just doesn't feel like it has a good header and structure to the layout."
- "Announcements need to be able to reference anything in our learning section."

## What the tab is now

| Section | View id | Screen |
| --- | --- | --- |
| Overview | `learning` | `LearningHome` — the front page |
| Catalog | `machine-anatomy` | `features/catalog/CatalogWikiView` |
| Academy | `academy` | `features/academy/AcademyWikiView` |

`LearningView` wires the three together. AppContent lazy-loads it and knows nothing else about the tab. The view ids are the ones the app already used, so old links still work: the settings shortcut, and notifications stored as `{ view: "machine-anatomy", id }`.

The bottom bar's Learning button reopens whichever section was open last. On the first visit that's the Overview.

## Decisions

**A masthead, not a busier bar.** The old single bar held a back arrow, the Catalog | Academy switch, the breadcrumb, page actions and search. On a portrait iPad the breadcrumb gave way first — and it's the one thing that tells you where you are.

When the sections context has a `title`, `WikiShell` renders two rows instead (`MastheadShell` in `features/wiki/WikiShell.tsx`):

- **Row one**, the same on every page: the tab's title (tap it for the Overview), the three sections, and one search.
- **Row two**, only when it has something in it: the trail and the page's actions.

Outside the tab the shell renders exactly as before.

**One search.** `LearningSearch` searches everything in the tab:

- this studio's machines — by name, by Academy code (`CP`), and by muscle and category;
- machines other MSF studios made and shared (a copy is listed by its original);
- the Academy's machine documents, modules, topic titles and glossary terms;
- this studio's pages.

What there is to find is built once, by `useLearningEntries`, which the announcement composer's link picker shares. For an announcement that reaches other studios the picker offers the MSF catalog (`machineScope: "msf"`) instead of the composing studio's floor, whose own machines would open nowhere else.

The matching is pure (`search.ts`): every word must appear somewhere, and results rank by how well the title matches. It doesn't search the text of the curriculum — that would mean downloading all 283,000 words on an iPad.

Search hides the page underneath rather than unmounting it (`.lv__stash`), so closing it returns you exactly where you were.

**A front page that shows the contents.** `LearningHome` has four parts:

- the search;
- every Academy category with **every machine in it** and its code;
- the Academy's four ways in, plus "start with the Executive Summary";
- what this studio has written.

Every machine name on it is a link, so the front page is also the fastest route to any machine. The data shaping is pure (`home.ts`).

**Catalog codes.** Every machine row carries its Academy abbreviation (`CP`, `LP`, `Pd`) in the category colour. Trainers already speak these on the floor; the Academy writes routines as "ADD, SD, CR, TR". On a wide screen the row also gets a primary-muscles column. The grouping switch reads **Category · Kinematics · Region** — it used to say "Academy", a second "Academy" right under the section tab.

**Learning links** (`ref.ts`). One shape for "this page", used by:

- search;
- the bell (`link.learning`);
- announcements (Phase 6);
- Planner notes (Phase 3);
- comments (Phase 5).

Academy ids are slugs of the source files, so a rebuilt corpus can rename one. Every stored ref therefore carries its title, and a page that has moved says so ("This page has moved") instead of showing "Loading…" forever.

**Nothing is concluded from a list that hasn't loaded** (review fixes).

- The Catalog waits for the studio's floor before deciding a machine isn't on it. Until the roster and the catalog have both loaded, `useCatalogMachines` says `loading` and its list can be the whole MSF catalog standing in — which has none of the studio's own machines. A machine that really isn't on the floor then opens in All MSF machines, and that jump isn't remembered as the reader's choice of scope.
- Studio pages (`useStudioWiki`) are held with the studio they belong to: after a studio switch the old studio's pages are never shown or linked, `loading` is true until this studio's arrive, and a failed read gives an `error`. The Overview and a studio page say "Loading…" or "Couldn't load" instead of "Nothing written here" or "That page is gone".
- A link from the bell to something at another studio (a comment tag, a flag, a studio page) doesn't open this studio's page in its place: the app says where it happened (AppContent's `onNavigate`).

**The shell keeps your place.** A top-level page (an index, the Overview) remembers where it was scrolled, for the session, and goes back there when you come back up to it; an article always opens at its top (`PageScroller`). Tapping the section you're already in goes to that section's root, or does nothing on the root itself.

**Buttons follow the rules** (`permissions.ts`). "New page" used to show for anyone `isStudioLeader` accepted, franchise owners included. The studio-page rule refuses them, so it now shows only for super admins and the studio's own StudioOwner, HeadTrainer or StudioLeader.

## Files

| File | What |
| --- | --- |
| `LearningView.tsx` | The tab: masthead context, search, every way into a page |
| `LearningHome.tsx` + `home.ts` | The Overview page and its pure data shaping |
| `LearningSearch.tsx` + `search.ts` | One search, and its pure matching |
| `ref.ts` | Learning links: parse, store, key, label |
| `permissions.ts` | Mirrors of the rules, for buttons: studio pages, and `writesForStudio` |
| `useLearningEntries.ts` | Everything that can be found or linked to, for search and the announcement picker |
| `learning.css` | The front page and the search stash, on the `--wk-*` tokens |
