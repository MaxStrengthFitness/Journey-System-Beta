# Admin surface — house rules

The read-only audit before this round (`ADMIN-OVERHAUL-PREP.md`) counted
twenty admin screens and 197 controls, and found the screens disagreeing on
**twelve separate axes**. Not one of them was wrong on its own; the problem
was that no two agreed, so every screen had to be learned separately and
every new screen invented a thirteenth answer.

This folder is the answer to all twelve, once. **Read this before adding an
admin screen.** Re-deciding one of these locally is exactly how the surface
fragmented the first time.

---

## Where each Operations tab lives

Every Operations screen is in this folder since the beta-prep trim (Sep 17
2026). The Operations overhaul (Sep 19) cut the tabs to nine and moved the
company tier to the Admins dashboard (`src/features/admins/`), which mounts
this folder's screens too — moved, not rewritten.

| Tab (group) | Folder or file |
| --- | --- |
| The shell - the sidebar and which tab is showing | `AdminDashboardView.tsx` (`AdminDashboardView.render.test.tsx` opens every tab) |
| Overview (Every day) | `overview/` (today, Needs you, the panels, the week; `floor.ts` is the day's arithmetic), `changes/` (the week's cancellations and moves), `attention/` (the watchlist and acknowledgements) |
| Renewals (Clients) | `renewals/` (the engine is `src/features/renewals/`) |
| Delight queue (Clients) | `src/features/ford/` (drawn by the shell) |
| Floor (Studio) | `floor/` — mounts `src/features/my-studio/MachinesSection` (the one floor editor), `machine-fit/` and `routines/` |
| Staff & Roles (Studio) | `staff/`, `provisional/` |
| Insights (Studio) | `insights/` (`InsightsAndHours.tsx` puts `hours/` inside it) |
| Announcements (Studio) | `announcements/` (the audiences follow the tier) |
| Mindbody (Behind the scenes) | `mindbody/` (`company` off = a leader's own studio), `useAutoSync.ts`, `syncPolicy.ts` |
| Data (Behind the scenes) | `data/` |
| — on the Admins dashboard — | |
| All locations | `studios/`, `equipment/`, `upkeep/` |
| Catalog | `machines/` (every machine, the submissions queue in `catalog/`) |
| Standard template | `src/features/admins/StandardTemplateTab.tsx` (`catalog/StandardSetPanel` + `routines/`) |
| Limbo | `limbo/` |
| Bug reports | `bugs/` |
| System tools | `system/` |
| Data (any studio) | `data/` |
| Legacy chart importer (its own screen) | `import/` |
| The network view under "All my studios" | `network/`; the old Franchise screen's pieces in `franchise/` |

The kit every tab composes: `primitives.tsx`, `formState.ts`,
`useDirtyForm.ts`, `admin.css`, `admin.tokens.css`.

## The twelve, settled

| Axis | Old state | House answer |
|---|---|---|
| Saving | instant / explicit / dirty-tracked | **dirty-tracked**, via `useDirtyForm` + `<SaveBar>` |
| Did my edit commit? | 1 screen of 20 said so | `<SaveBar>` always says so, in words |
| Form state | controlled, except screen 2 | **controlled only** — no uncontrolled input exists in the kit |
| What gets written | whole object | **only the diff** (`changedPatch`) |
| Confirmation | 5 patterns, incl. none | `<ConfirmDialog>` for anything destructive |
| Lists | 4 shapes | `<AdminRows>` + `<AdminRow>` |
| Selects | shadcn vs raw `<select>` | `<AdminSelect>` |
| Colour | tokens vs `#F06C22` vs indigo | `admin.tokens.css` only — no hex below the token file |
| Voice | "Incorporate Network" | plain studio English (below) |
| Panels / chrome | six bespoke headers | `<AdminScreen>` + `<AdminHeader>` + `<AdminPanel>` |
| Data loading | `getDocs` / `onSnapshot` / props | props from the app's existing streams; `getDocs` only for paged reads |
| Errors | 3 patterns | `<AdminNotice>` inline, or the save bar's error state |

---

## Why the diff matters more than it looks

`AdminStudioManager` read its values back out of `FormData` at save time and
wrote the **whole** studio object. Two fields — `ownerId` and
`headTrainerId` — had been removed from the JSX in an earlier round, so every
studio save quietly wrote them as `null`. Nobody saw an error.

An uncontrolled form that writes everything cannot tell *"the user cleared
this"* from *"this input does not exist"*. `formState.ts` keeps a baseline and
a draft and sends only what changed, so a field the form never rendered is
never in the write. `formState.test.ts` has that exact case as a test.

The other half is `adoptExternal`: several admin screens stream their data.
When a snapshot lands mid-edit it is **three-way merged** — fields the user is
editing keep their draft, fields they have not touched take the incoming
value. Freezing the whole draft looks safer and is not: two admins on one
studio would take turns silently undoing each other.

---

## Voice

Plain studio English. The people using these screens run gyms.

| Don't | Do |
|---|---|
| Incorporate Network | Create network |
| Regional Franchise Builder | New franchise |
| Studio Location Registry | Studios |
| Strict Demographic Adherence | *(delete — it meant nothing)* |
| Corporate Command Center | *(say what the screen is for)* |
| Cross-Studio Infrastructure & Role Mapping Matrix | Studios, staff and Mindbody links |
| Station Security ID | Studio ID |
| Total Foot Traffic (Physical Hosted) | Sessions run here |
| Access Foreign Client Record | Open a client from another studio |

Role names are **not** decoration and do not get reworded: `ROLE_LABELS` in
`types.ts` is the vocabulary — Life Transformer, Studio Leader, Franchise
Owner. "Life Transformer" is what this company calls a trainer.

---

## Colour

`admin.tokens.css` is lifted **byte for byte** from `equipment.tokens.css`,
which the rest of the app already uses. `admin-tokens.test.ts` enforces that:
every `--adm-` token must still equal its `--eq-` original, both themes must
define the same keys, and every pairing the kit renders must clear WCAG 2.1
AA. Adding a colour means adding it to the equipment tokens first.

Two contrast facts worth knowing before you style something:

- Solid `--adm-hero` (#ef5302) is **3.55:1** on white. It is a fill, an accent
  bar, a chart mark — never the ground under a small label. The loud button
  sits on `--adm-hero-text` (6.0:1).
- `--adm-border-strong` is **1.96:1** on the field ground. Fine for a divider;
  below the 3:1 that WCAG 1.4.11 wants for the boundary of a control. Inputs
  use `--adm-ink-muted`.

---

## Touch

The app runs on 10"–13" iPads on a gym floor. Nothing interactive is under
40px tall (`--adm-btn` min-height), hover is never the only affordance, and
`:focus-visible` is always styled — a Bluetooth keyboard is how studio leaders
do admin work at the desk.

---

## Scope (the Operations round, Sep 19 2026)

A thirteenth axis the audit found after the twelve: **which studio am I
looking at.** Four screens answered it four ways (a picker inside the tab,
the app's studio, "every studio to everyone", the Franchise screen). The
house answer is one control in the shell — **Looking at: this studio · All
my studios** — read through `useOperationsScope()` (`scope.ts`,
`scope-context.tsx`):

- **This studio is the app's active studio.** Picking a studio on the bar
  calls `setActiveStudioId`, so the roster, the schedule and today's
  sessions a tab already receives as props follow it. A tab never keeps a
  studio of its own.
- **All my studios** is `operationsStudios(trainer, studios, networks,
  isAdmin)` — the company tier every studio, the owner tier the studios
  that reach them, the studio tier the studios they run. A tab that can
  aggregate reads `ops.studios` and spans them (Hours, Staff & Roles,
  Clients, the Monday page); a tab that reads one studio renders
  `<PickOneStudio what="…" />` under "all" and nothing else.
- Tabs are keyed on `scopeKey(ops.scope)` in the shell, so a switch
  remounts them clean. `useOperationsScope()` outside the provider returns
  a standalone value (the app's studio), never throws.
- **Operations looks; My Studio edits.** A studio's own settings — details,
  its day, renewal settings, its notices — have one editor, on My Studio →
  Studio. An Operations tab that needs one points there
  (`rememberMyStudioSection` from `my-studio/section-memory.ts`, then the
  view switch) rather than rendering the form a second time.
