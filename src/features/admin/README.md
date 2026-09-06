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
