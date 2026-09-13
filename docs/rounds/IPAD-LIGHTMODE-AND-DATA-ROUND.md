# iPad, light mode and data-mapping round — Sep 9 2026

Five items, all on the working tree (NOT committed — see "What to do first").
14 files touched, 4 of them new. Every file parses; **nothing has been
typechecked, tested or built** — the Linux shell could not mount the project
folders this session, so that is the first thing you run.

---

## What to do first

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master

git checkout -b ipad-lightmode-round     # carries the uncommitted changes over
git status                               # expect 10 modified, 4 new

npx tsc --noEmit                         # baseline was 20 errors (2 in harness/)
npm test                                 # baseline was 1142 passing, 43 files
npm run build
```

Then commit one item at a time so any single one can be reverted:

```powershell
git add src/lib/scroll-lock.ts src/AppContent.tsx src/components/StudioSelectionView.tsx src/index.css
git commit -m "fix(ipad): release leaked modal scroll lock so the studio switcher scrolls on touch"

git add src/index.css
git commit -m "feat(ui): retune light-mode palette, add an elevation scale"

git add src/lib/client-since.ts src/features/client-profile/ProfileHeader.tsx src/lib/mindbody-api-sync.ts src/types.ts scripts/backfill-client-since.ts
git commit -m "fix(mindbody): map Client Since to Mindbody dates, not the Journey createdAt"

git add src/features/trainer-profile/KaizenToggle.tsx src/components/ClientDirectoryView.tsx
git commit -m "feat(kaizen): add/remove from the client directory with a reason"

git add src/features/admin/studios/registry.ts src/features/admin/equipment/StudioEquipmentPanel.tsx src/components/machines/StudioInventoryManager.tsx
git commit -m "fix(admin): standard-set seeding no longer silently adds zero machines"
```

`src/index.css` appears in two commits because it carries both the `.touch-pane`
utility and the palette. Stage it with the first, then again with the second —
git will only take what is left.

---

## 1. iPad studio switcher would not scroll

**It was never a CSS problem.** "Switch Studio" is a Radix `DropdownMenuItem`,
and `AppContent` answers `isChangingStudio` with an **early return** — so in the
same React commit the whole menu, still open, is torn out of the tree.

A modal Radix layer sets `document.body.style.pointerEvents = "none"` while it
is open and undoes it on close. Unmount it mid-open and that cleanup can be
skipped, and `pointer-events: none` stays on `<body>` for the life of the page.

That is why it looked like a tablet bug and not a bug:

| input | what happens with `pointer-events:none` on body |
|---|---|
| mouse wheel | still scrolls — wheel does not hit-test the same way. **Looks fine on a PC.** |
| finger | cannot hit-test to the scroll container. **Nothing to pan. Frozen.** |

Same broken state on both machines; one input device happens to survive it.

**Fix, in three layers:**

1. `src/AppContent.tsx` — the trainer menu is now **controlled**, and every item
   in it closes the menu and then navigates on the next two animation frames
   (`afterOverlayClose`). All items, not just Switch Studio, because they all
   land on a screen reached by an early return.
2. `src/lib/scroll-lock.ts` (new) — `releaseUiScrollLock()`, an idempotent
   safety net that clears a leaked `pointer-events` / `data-scroll-locked` /
   body overflow. `StudioSelectionView` calls it on mount. It refuses to act
   while a modal layer is legitimately open.
3. `src/index.css` — a `.touch-pane` utility: `touch-action: pan-y` (Safari
   commits to vertical panning instead of holding the gesture open ~300ms),
   `-webkit-overflow-scrolling: touch` for older iPadOS, and `height: 100vh`
   upgraded to `100dvh` only under `@supports`. That last one matters: an
   unsupported unit invalidates the whole declaration, and a pane with
   `height:auto` inside `html{overflow:hidden}` cannot scroll at all.

**Diagnostic if it still sticks:** tap the **studio name in the header** instead
of using the menu. That path never opens a Radix layer. If the name works and
the menu does not, something is still leaking a lock — tell me and I will find
which overlay. If both fail, it is the viewport-height path instead.

---

## 2. Light mode

Four things were wrong, and only one of them was "grey".

1. **The ground and the cards were the same colour.** Ground `#F8FAFC`, card
   `#FFFFFF` — a 2% step. Nothing read as raised, so every card edge had to be
   carried by a border. Ground is now `#EDF0F5`, a real step below white.
2. **The Journey token ladder was upside down in light mode.** In dark,
   `bg-dark` → `-2` → `-3` goes page → card → raised, each step lighter. In
   light it went white → grey → greyer, so a component written as `bg-bg-dark-2`
   (a *card* in dark mode) rendered as a grey wash on a white page. **This is
   the specific reason client cards had no contrast.** Light now keeps the same
   meaning per rung: `bg-dark` = page (tinted), `bg-dark-2` = card (white),
   `bg-dark-3` = raised.
3. **No elevation scale existed.** Added `--elev-1..5`, each a tight contact
   shadow plus a wide ambient one, tinted with the ink colour rather than pure
   black. These **override Tailwind's built-in** `shadow-sm/md/lg/xl/2xl`, so
   every shadow already written across the app softens with no component edits.
   In dark mode they collapse to near-nothing — a shadow on a near-black ground
   is wasted paint.
4. **Contrast.** `--ink-d3` 4.6:1 → 5.9:1, `--input` now 3.1:1 (WCAG 1.4.11
   wants 3:1 for a control's own boundary), `--destructive` 3.3:1 → 4.6:1.

**One change to watch:** `--cta-strong` moved `#E45F0F` → `#BC2C00`. White on
the bright orange is 3.5:1, below AA for small text; the admin round already
made this call locally and this lifts it to the app-wide token. Any orange
button carrying a **label** should use `--cta-strong`; `--cta` is for fills.
If a button somewhere now looks too dark, that is this, and it is deliberate.

`StudioSelectionView` also had ~30 hardcoded `slate-800` / `zinc-500` classes
from when it was a dark-only screen. Left alone, the new white cards would have
had near-black borders, so those are swapped to tokens. **Other screens still
have this problem** — see Follow-ups.

### Portrait vs landscape checklist

Run per screen, on the real iPad, in both orientations. Rotate *while the screen
is open* rather than reloading — most breakage is in the re-layout, not the
first paint.

**Layout**
- [ ] Nothing scrolls horizontally. Body never moves sideways at all.
- [ ] The bottom nav is reachable without the page rubber-banding under it.
- [ ] Rotating does not lose scroll position or collapse an open panel.
- [ ] Sticky headers stay stuck; the content under them is not clipped.
- [ ] Dialogs fit at 1024px tall (portrait) — the tightest case. Check the
      machine and routine modals specifically; `DialogContent` has bitten
      before with `sm:max-w-sm`.

**Readability**
- [ ] Smallest text on screen is legible at arm's length, standing, in studio
      lighting. The `text-[9px]` / `text-[10px]` uppercase labels are the risk.
- [ ] Numbers in a row stay column-aligned (`tabular-nums`) when values change.
- [ ] No truncated machine or client names — full labels, wrap if needed.
- [ ] Cards are distinguishable from the page **without** relying on their
      border. Squint: you should still see the card.

**Touch**
- [ ] Every tappable thing is at least 44×44pt, including icon-only buttons.
- [ ] Tapping a row's inner control does not also trigger the row.
- [ ] After closing any menu or dialog, the page behind still scrolls **by
      finger**. This is the regression class from item 1 — worth one pass per
      screen that has an overlay.

**Both themes**
- [ ] Every screen in light and dark. The dark-only hardcoded classes mean a
      screen can look right in one and be unreadable in the other.

---

## 3. "Client Since" showed the Journey creation date

**The display code was already correct.** `clientSince()` preferred
`firstSessionDate` → `firstAppointmentDate` → `mindbodyCreatedAt` and only then
fell back to `createdAt`. The problem is that the two Mindbody fields are empty
on nearly every document, so the fallback fired every time and looked
authoritative.

Why they are empty:

- `functions/src/mindbody/index.ts:489-493` **does** write both — but only from
  the `client.created` / `client.updated` webhook, and Mindbody fires that when
  a record **changes**. A client not edited since the integration went live has
  never produced one.
- The pull-sync creates clients from appointment payloads
  (`buildCanonicalClientPayload`) and wrote **neither field at all**.

**Fix, three parts:**

1. `src/lib/client-since.ts` (new) — one pure rule, with **provenance**. It also
   consults `mindbodyContracts` / `mindbodyMemberships`, which are already on
   the document (the commercial sync writes them) and carry real Mindbody dates.
   A Journey-only date now renders as **"In Journey since"**, not "Client since"
   — a confident wrong date is worse than an honest missing one.
2. `src/lib/mindbody-api-sync.ts` — the pull-sync now records the **earliest
   appointment across the whole window** per client (not whichever booking
   happened to create them, which is arbitrary) as `firstAppointmentDate`,
   tagged `firstAppointmentDateSource`. It is a **ceiling**, not the truth —
   their real first visit may predate the window — which is why the webhook's
   value always wins and why the backfill exists.
3. `scripts/backfill-client-since.ts` (new) — fixes the clients already in the
   database. **Dry run by default.**

```powershell
npx firebase login
npx tsx scripts/backfill-client-since.ts --limit 25      # look first
npx tsx scripts/backfill-client-since.ts                 # full dry run
npx tsx scripts/backfill-client-since.ts --commit        # apply
```

It never overwrites a client that already has `firstAppointmentDate` or
`mindbodyCreatedAt` (webhook data is authoritative), patches exactly one field
via `updateMask`, writes a JSON report to `backups/` either way, and is safe to
re-run. Read the dry-run's "biggest corrections" list before committing — if the
years look wrong, the evidence is wrong and I would rather know before the write.

---

## 4. Kaizen list

**Most of it already worked.** The engine (`roster.ts`, `useKaizenRoster`), the
profile toggle, the directory mark and the "My Kaizen Roster (n)" filter are all
built and wired. The structure is also already right, and I would not change it:

```
trainers/{trainerId}
  kaizenRoster: [                     # array on the trainer doc, not a subcollection
    { clientId, clientName, reason, addedAt, addedByTrainerId, note?, reviewBy? }
  ]
```

An array is correct here at ~40 entries: `useTrainers` already streams every
trainer document to every device, so membership badges work everywhere for zero
extra reads. A subcollection would be right at ~500 and is a second listener for
nothing at 40. `roster.ts` keeps the cap, dedupe and sort **pure** so they are
tested rather than clicked through.

**What was actually missing:**

1. **No way to add from the client list.** You had to leave the client you were
   thinking about, go to your own profile, open a dialog and search for them by
   name. That is why it read as "can't track Kaizen clients" — the plumbing was
   there and no tap led to it. Fixed: `KaizenToggle` (new) on every directory
   row, with reason, note and check-back date.
2. **A stale-write hazard I closed while I was there.** `useKaizenRoster`
   rewrites the **whole array**. `authTrainer` is captured at sign-in and never
   re-read, so adding from it would silently drop every entry added since
   sign-in. `AppContent` now derives `liveAuthTrainer` from the streamed
   `trainers` snapshot and passes that to anything that writes. Reading stale is
   cosmetic; writing stale is destructive.

**Still open — read this before deciding it works:**

- **`useKaizenRoster.update` is never called from any UI.** So the reason set at
  add time can never be changed, and the profile's one-tap add hardcodes
  `"Progression"` — its own code comment says "the reason is editable on the
  profile", and that is not currently true. The new directory toggle asks for a
  reason properly; the profile button does not.
- **Live rules do not have the Sep 6 trainer-identity fix.** I read
  `live-rules-ai-studio-*.rules` in the repo root: it has **no `ownsTrainerDoc`
  and no `kaizenRoster` guard**, and its `trainers` update rule still requires
  `request.auth.uid == trainerId`. So a trainer whose Firestore doc id is not
  their Auth uid **cannot write their own roster in production** — and it works
  for you, because your doc is created at `trainers/{uid}` by the bootstrap.
  That is the "still failing" symptom, and no front-end change can fix it.

  Check: Firebase Auth uids are 28 characters, Firestore auto-ids are 20.
  Compare trainer doc ids against the Authentication tab. Then deploy rules —
  `firebase deploy --only firestore:rules` — after `npm run test:rules` passes.
  (Good news, unrelated: those live rules **do** already cover
  `studios/{id}/roster`, so that is not a blocker for item 5.)

---

## 5. "Add standard set" loaded no machines

Two separate causes, both of which fail **silently as success**.

**a) The two implementations of this button disagreed about the same question.**

| where | filter | catalog doc with no `inStandardSet` |
|---|---|---|
| `registry.standardSetSeed` | `inStandardSet === false` → skip | **included** |
| `StudioInventoryManager:130` | `c.inStandardSet && …` → keep | **excluded** |

Catalog documents written before the flag existed do not carry it. So the same
catalog produced "every active machine" from one button and "nothing at all"
from the other. Both now share one exported predicate, `isStandardSetMachine`.
Absent means **included** — the flag exists to keep an oddity *out* of the
baseline, so opting out is the thing you should have to say.

It also compares `status` **case-insensitively** now. Mindbody, the seed scripts
and the machine editor have each written a different casing; an exact `"active"`
match silently drops every record that says `"Active"`, seeding nothing and
reporting success.

**b) The button did not wait for the catalog to load.** `useMachineCatalog` is
an `onSnapshot` subscription — first render returns an **empty array** and it
fills in when Firestore answers. `StudioEquipmentPanel` destructured only
`catalog` and never `loading`, so the button was live from the first paint. A
tap in that window ran the seed over `[]`, wrote nothing, threw nothing, and
printed "0 added" as though that were the answer. On studio wifi that window is
comfortably long enough to click through. **This is the most likely one you hit.**

Now: disabled while loading, refuses an empty catalog with a message that says
*why* ("the catalog is empty… or check that your account can read /machines"),
and if the catalog has entries but none qualify it says that instead of a bare
zero.

### Inherit-then-override structure

You already have this, and it is the right shape — no migration needed:

```
machines/{machineId}                       # THE CATALOG — one row per machine model
  name, status, inStandardSet?, settingFields, clinicalWarnings, …
  # writes: admins only. A studio-level quirk does NOT belong here, because
  # every studio inherits any field it has not overridden.

studios/{studioId}/roster/{machineId}      # WHAT THIS FLOOR ACTUALLY HAS
  machineId, studioId
  source:   "catalog" | "custom"
  basedOn:  machineId                      # which catalog row it inherits from
  status:   "active" | "inactive" | "retired"
  overrides?: { … }                        # ONLY the fields this unit differs on
  unit?:      { serialNumber, … }
  definition?: { … }                       # source:"custom" only — no catalog parent
  # writes: isSuperAdmin() || isStudioOwnerOrHeadTrainer(studioId)

studios/{studioId}/machineNotes/{machineId}  # floor notes, any trainer may write
```

The three operations you asked about map onto it directly:

- **Inherit the baseline** — "Add the standard set" writes one roster doc per
  catalog machine with `source:"catalog"`, `basedOn: id` and no `overrides`.
  Idempotent: anything already rostered is counted as `alreadyPresent`, so the
  button is safe to press twice.
- **Add a machine this studio has and others do not** — `source:"custom"` with
  an inline `definition`. It has no catalog parent, so nothing upstream can
  change it.
- **Delete / retire** — set `status`, do not delete the document. Every
  `exerciseLog` ever written references that machine id, and a studio may still
  physically own a machine it has stopped programming.
- **Modify one unit** — put *only the differing fields* in `overrides`. That is
  what lets an Academy correction still reach every field nobody overrode.
  `describeOverrides` / `overriddenSafetyFields` already surface when a studio
  has overridden something safety-bearing, which is worth keeping visible.

**Multi-tenant note:** the roster is scoped by path, so tenancy costs no `get()`
and a trainer at studio A cannot write studio B's floor. Reads are deliberately
open to any authenticated trainer (the multi-studio trainer case). Narrowing
that to `isTrainerOfStudio(studioId)` is still on the pre-launch list.

---

## Follow-ups (not done, in the order I would do them)

1. **Deploy rules.** Until then item 4 stays broken in production for anyone
   whose trainer doc id is not their Auth uid, and you cannot tell from the UI.
   `npm run test:rules` first — expect 37 passing.
2. **Run the client-since backfill** and read the dry run before committing.
3. **Wire `useKaizenRoster.update`** to something, or drop the profile's
   hardcoded `"Progression"` in favour of the reason dialog. Right now the
   reason is write-once and the code comment claims otherwise.
4. **Sweep the remaining dark-only screens.** `StudioSelectionView` is fixed;
   grep for `slate-[5-9]00` and `zinc-[4-9]00` without a `dark:` prefix to find
   the rest. Those are the screens where light mode will still look wrong, and
   no token change can reach them.
5. **Audit the per-feature `*.tokens.css` files** (equipment, admin, calendar,
   journey-grid, catalog…) for hardcoded greys that bypass the light palette.
   You declined this for now; it is the difference between "light mode is
   better" and "light mode is finished".
