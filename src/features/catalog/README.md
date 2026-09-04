# Catalog — anatomy-first redesign

Round: **Catalog Redesign, Sep 2026.** Branch `catalog-redesign`, one commit per phase.

Replaces `src/components/MachineAnatomyCatalogView.tsx` (956 lines, one file, two
near-duplicate render trees for portrait and landscape, three competing scroll
containers).

The screenshots that started this round circled seven things. Six of them are
layout. **One of them is a live multi-tenant data leak.** That one goes first.

---

## 1. What is actually wrong (root-caused, not guessed)

### 1.1 🔴 Studio Notes write to the GLOBAL catalog doc — Circle 7

`MachineAnatomyCatalogView.tsx`, `handleSaveTip`:

```ts
const docRef = doc(db, "machines", selectedMachineId);
await updateDoc(docRef, { trainerTips: trainerTips });
```

`machines/{machineId}` is the **shared, cross-franchise catalog**. A note typed at
Solon is written onto the document every studio in the system reads. There is no
`studioId` anywhere in that write.

It is also failing silently for most users. `firestore.rules`:

```
match /machines/{machineId} {
  allow read: if isAuthenticated();
  allow create, update: if isSuperAdmin();     // ← trainers cannot write this
}
```

So a trainer taps **Save Notes**, the button says *"Stored Successfully"*, and
either nothing was saved (rules enforced) or it was saved to all 100 locations
(rules not deployed on that path). Both outcomes are wrong, and the success toast
is a lie in both.

The correct home already exists and is already documented. `src/types/machines.ts`:

```ts
/** The Catalog view's "Studio Notes" box writes HERE, not to the global
 *  catalog doc — that write was leaking one studio's notes to all of them. */
studioNotes?: string;
```

on `RosterEntryBase` → `studios/{studioId}/roster/{machineId}`. `ResolvedMachine`
already surfaces `studioNotes`. The plumbing was built; this view was never moved
onto it.

> **Caveat for phase 1:** the roster backfill has not run, so
> `studios/{id}/roster` is empty and `useStudioMachines` returns nothing today.
> Do **not** gate the fix on that hook. Write with
> `setDoc(ref, { studioId, machineId, studioNotes, updatedAt, updatedBy }, { merge: true })`
> — which *creates* the roster doc if absent — and read it back with a small
> dedicated `onSnapshot`. The backfill then finds a doc already there and merges
> cleanly.

### 1.2 The diagram reads the wrong data source — Circle 1

There are **four** descriptions of "which muscles does this machine work" in the
repo, and the figure reads the oldest one.

| Source | Vocabulary | Read by |
|---|---|---|
| `data/machineMuscleMap.ts` | legacy `react-body-highlighter` slugs | **the figure** |
| `data/machine-anatomy-map.ts` (`MACHINE_ANATOMY`) | `MuscleId` — correct | grouping + clinical note only |
| `MachineDefinition.primaryMuscles / secondaryMuscles / synergistMuscles` | `MuscleId` — the real future home | nothing in this view |
| `MACHINE_DATABASE.targetMuscles / synergists` | free text | the Musculature list |

Hip Abduction, side by side:

```ts
// machine-anatomy-map.ts — CORRECT, and ignored by the figure
'm-hip-abd': { preferredView: 'back', primary: ['abductors'], secondary: ['glutes'], ... }

// machineMuscleMap.ts — what the figure actually renders
"m-hip-abd": { primary: ["gluteal"], synergist: ["lower-back", "obliques"] }
```

Two failures stack up to produce the screenshot:

1. **The figure is on the anterior view**, where `gluteal` and `lower-back` do not
   exist. The only thing left to paint is `obliques` — hence a lit-up core on a
   glute machine.
2. **`preferredView` is never applied when you swipe.** `handleSelectMachine()`
   does apply it, and the rail and the click-the-figure path both go through it —
   but the carousel's scroll-spy calls `setSelectedMachineId()` directly:

```ts
if (closestCardId && closestCardId !== selectedMachineId) {
  setSelectedMachineId(closestCardId);   // bypasses handleSelectMachine — no view flip
}
```

So the correct answer was in the repo the whole time. This is a wiring bug, not a
data-authoring problem. The audit of all 22 machines is still worth doing
(§6.3) — but the fix is to delete a file, not to re-key one.

`lower-back` and `obliques` as *synergists of hip abduction* are also just wrong.
The stabilizers there are the contralateral QL and TFL; the app's own
`MACHINE_DATABASE` entry lists Gluteus Minimus, Gluteus Maximus (lateral fibers)
and Piriformis, which is what the detail panel in the screenshot correctly shows.
The figure and the text list disagreed on the same screen.

### 1.3 The navigation carousel — Circle 2

`extendedMachines = [...machines, ...machines, ...machines]` renders the roster
three times, then wraps by mutating `scrollLeft` mid-scroll, and identifies the
selection with a 100ms-debounced spy that measures every card's `offsetLeft` on
every scroll event, coordinated by two `setTimeout` refs and an
`isProgrammaticScroll` boolean.

That is ~90 lines of state coordination to answer "which machine". Costs:

- **No stable state indication.** The active card can sit half-scrolled. The
  circled screenshot shows exactly that — the ring is there, but the card is not
  centred and two neighbours look nearly as prominent.
- **Not accessible.** Selection changes on scroll position, not on activation.
  Keyboard and VoiceOver users have no way to choose a machine.
- **Fights momentum scroll.** `scrollBehavior` is toggled imperatively while iOS
  is still decelerating; the 600ms guard and the 100ms debounce race.
- **Three times the DOM** for a 22-item list.

### 1.4 Header truncation — Circle 3

`AppHeader.tsx`:

```tsx
className="... text-left truncate max-w-37.5 sm:max-w-none"
```

`max-w-37.5` is 150px. Below `sm` the name is hard-clipped mid-word. Above `sm`
the cap is removed but the left cluster has no `min-w-0`, so it competes with the
`flex-1` search band and clips anyway. There is no `title` attribute, so the full
name is unrecoverable — and the control is a **studio switcher**, which makes a
half-rendered name genuinely ambiguous in a franchise with similar location names.

### 1.5 The model vanishes on scroll — Circle 4

The figure lives in a block sized `min-h-[50vh] max-h-[60vh]` inside a page-level
scroller. It is a normal-flow element, so it scrolls away like anything else. In
landscape it is `lg:absolute lg:inset-0` behind two floating `<aside>` overlays —
which is why nothing in that layout can size itself to its content.

### 1.6 Nested scrolling and dead space — Circles 5 & 6

Three scroll containers are nested on the portrait path:

```
outer      h-[calc(100vh-5rem)] overflow-y-auto      ← the page
detail     max-h-[50vh] overflow-y-auto              ← the inner box (circles 5 & 6)
sections   the browser's own scroll on long lists
```

`max-h-[50vh]` is what buries Clinical Warnings — the safety content is inside a
half-screen box on a screen that already scrolls. The dead space below is
`pb-28 sm:pb-32` (112–128px) applied to a block already at natural height, plus a
`-mt-20` negative margin pulling the carousel up over the figure. Neither reacts
to content length, so a short machine gets a huge void and a long one gets a
scrollbar inside a scrollbar.

`100vh` is also the wrong unit on iPad Safari — it does not account for the
collapsing toolbar. The roadmap already records this exact bug biting the progress
report print path.

---

## 2. The layout

Two modes, one breakpoint, chosen by one `matchMedia` — the same decision the
`equipment` feature already makes, so the two features behave identically.

```ts
// useLayoutMode.ts
export type LayoutMode = "stack" | "split";
// split at >= 1024px. iPad Pro 11" landscape = 1194, portrait = 834.
```

### 2.1 Landscape / desktop — `split`

Three real grid columns. The figure column **never scrolls**, because only the
rail and the detail column overflow. That is the whole fix for Circle 4 — no
sticky positioning, no scroll listener, no mini model needed here.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AppHeader — studio name renders in full                                      │
├──────────────┬──────────────────────────────┬────────────────────────────────┤
│ MachinePicker│  AnatomyStage                │  MachineDetail                 │
│   (280px)    │  (fluid, never scrolls)      │  (380px / 420px ≥1280, scrolls)│
│  ┌─────────┐ │                              │ ┌────────────────────────────┐ │
│  │ search  │ │        ANTERIOR  POSTERIOR   │ │ LOWER BODY: POSTERIOR CHAIN│ │
│  ├─────────┤ │           ⌐  human  ¬        │ │ HIP ABDUCTION              │ │
│  │ POSTERIOR│ │          │  figure │        │ ├────────────────────────────┤ │
│  │ CHAIN  3 │ │          └─────────┘        │ │ ⚠ CLINICAL WARNINGS        │ │
│  │▍HIP ABD ✓│ │       glutes lit, back view │ │   always expanded, pinned  │ │
│  │ LEG CURL │ │                              │ ├────────────────────────────┤ │
│  │ ...      │ │        TYPE M   TYPE F       │ │ ▸ Musculature              │ │
│  └─────────┘ │                              │ │ ▾ Setup notes              │ │
│              │                              │ │ ▾ Execution                │ │
│              │                              │ │ ▸ Studio notes  (SOLON)    │ │
│              │                              │ │ ▸ Upkeep        (cleaned)  │ │
└──────────────┴──────────────────────────────┴────────────────────────────────┘
   scrolls          fixed, always visible          scrolls — the only one
```

### 2.2 Portrait — `stack`

The page is the **only** scroller. The figure condenses instead of disappearing.

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ AppHeader                    │   │ AppHeader                    │
├──────────────────────────────┤   ├──────────────────────────────┤
│ ANTERIOR │ POSTERIOR  M │ F  │   │ ▉ HIP ABDUCTION      ▲ back  │ ← sticky mini,
├──────────────────────────────┤   │   ●glutes ○piriformis        │   ~72px, appears
│                              │   ├──────────────────────────────┤   on scroll
│         human figure         │   │ ⚠ CLINICAL WARNINGS          │
│         (aspect-locked)      │   │ • Watch for pinch points...  │
│                              │   │ • Hands clear of thigh pads  │
├──────────────────────────────┤   │ • Hip replacements may not.. │
│ ▍HIP ABDUCTION          ▾    │ ← │ ▾ SETUP NOTES                │
│  Lower body: posterior chain │   │   Thigh pads snug, no gap.   │
├──────────────────────────────┤   │   • Seat back position 6-7   │
│ ⚠ CLINICAL WARNINGS          │   │   • Pad width sets start...  │
│ • Watch for pinch points...  │   │ ▾ EXECUTION                  │
│ ...page continues...         │   │ ...continues to real bottom  │
└──────────────────────────────┘   └──────────────────────────────┘
     at rest                            scrolled
```

**MachinePickerBar** (`▍HIP ABDUCTION ▾`) replaces the carousel. It is always
legible, states the selection unambiguously, and opens a sheet on tap:

```
┌──────────────────────────────┐
│  SELECT MACHINE          ✕   │
│  [ search 22 machines...  ]  │
├──────────────────────────────┤
│  LOWER BODY: POSTERIOR CHAIN │
│  ┌────────────┬────────────┐ │
│  │▍HIP ABD  ✓ │ LEG CURL   │ │   two-up grid, 44px targets,
│  ├────────────┼────────────┤ │   grouped by movement pattern,
│  │ LUMBAR EXT │ ...        │ │   studio display order preserved
│  └────────────┴────────────┘ │
│  UPPER BODY: HORIZONTAL PUSH │
│  ...                         │
└──────────────────────────────┘
```

One tap to open, one to choose, sheet closes. No momentum, no spy, no triple DOM,
and it is a plain list of `<button>`s — keyboard and VoiceOver work for free. The
**same list component** renders as the landscape rail; only the host differs.

### 2.3 The sticky mini model

Portrait only. Not a scroll listener — an `IntersectionObserver` on a sentinel
below the full figure, flipping one boolean. No rAF loop, no jank.

```tsx
const [condensed, setCondensed] = useState(false);
useEffect(() => {
  const el = sentinelRef.current;
  if (!el) return;
  const io = new IntersectionObserver(([e]) => setCondensed(!e.isIntersecting), {
    rootMargin: "-56px 0px 0px 0px",   // the app header's height
  });
  io.observe(el);
  return () => io.disconnect();
}, []);
```

The condensed bar shows the figure at ~64px, the machine name, the lit primary
muscles as chips, and the current view. Tapping it scrolls back to the full
figure. Landscape never mounts it — the figure is already permanent there.

---

## 3. The one-scroller rule

> **Portrait: the page scrolls, nothing inside it scrolls.
> Landscape: each column scrolls, the page does not.**

Everything in circles 5 and 6 follows from breaking that rule. Three mechanics
make it hold:

**`min-height: 0` on every grid/flex child that contains a scroller.** This is the
one people miss. A grid or flex item defaults to `min-height: auto`, which refuses
to shrink below its content — so the child's `overflow-y: auto` never receives a
bounded height, and the overflow escapes to the page instead. Every nested
scrollbar in the current file traces back to a missing `min-height: 0`.

**`100dvh`, never `100vh`.** `dvh` follows iPad Safari's collapsing toolbar; `vh`
assumes it is always collapsed, which is what puts content under the bottom nav.

**Bottom clearance from the environment, not a magic number.** Replace
`pb-28 sm:pb-32` with:

```css
padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 1rem);
```

It shrinks to nothing when there is no bottom nav, which is what removes the dead
space rather than merely relocating it.

### 3.1 Accordions — one deliberate exception

Collapsible sections, as proposed. With one carve-out:

**Clinical Warnings is never collapsible.** It is pinned directly under the
machine title, always expanded. Safety content behind a tap is a worse failure
than a slightly longer page — "Ensure client's hands are clear of rocking thigh
pads" has to be readable without an interaction, mid-set, on the first screen.

If a machine carries more than four warnings, show the first four and disclose the
rest behind "+3 more" — never hide the first one.

Everything else collapses. Default open: Setup Notes, Execution. Default closed:
Musculature, Body-type adjustments, Alignment checkpoints, Studio Notes, Upkeep.
Persist the open/closed state **per section in `localStorage`, not per machine** —
a trainer who always wants Execution open wants it open on every machine.

Build on `<details>`/`<summary>` with a custom marker: free keyboard support,
free screen-reader semantics, works with in-page find, and it survives with
JavaScript mid-hydration.

---

## 4. Component architecture

Mirrors `src/features/equipment/` exactly, so there is one house pattern rather
than two.

```
src/features/catalog/
  README.md                 this spec
  catalog.tokens.css        light/dark tokens, scoped to .cat
  catalog.css               layout + component styles
  types.ts                  CatalogMachine — the view model
  adapters.ts               ResolvedMachine + MACHINE_DATABASE + MACHINE_ANATOMY -> CatalogMachine
  mutations.ts              every Firestore write this feature makes
  useLayoutMode.ts          'stack' | 'split'
  useStudioRosterDoc.ts     direct roster read/write, backfill-independent

  CatalogView.tsx           shell: layout + selection state ONLY
  MachinePicker.tsx         the grouped list — rail in split, sheet body in stack
  MachinePickerBar.tsx      stack: current machine + sheet trigger
  AnatomyStage.tsx          figure + view/gender segmented controls
  AnatomyMini.tsx           stack: condensed sticky figure
  MachineDetail.tsx         header + section composition, NO internal scroll
  Section.tsx               the <details> accordion primitive
  sections/
    ClinicalWarnings.tsx    always expanded — not a Section
    MusculatureList.tsx
    SetupNotes.tsx
    ExecutionNotes.tsx
    StudioNotesCard.tsx     tenant-scoped; writes to the roster
    MachineUpkeepCard.tsx   cleaning / maintenance check-off (round B)
```

`CatalogView.tsx` should end up around 120 lines. It owns `selectedMachineId`,
`view`, `gender` and the layout mode, and nothing else. The 956-line file exists
because portrait and landscape were written as two independent render trees that
drifted — note that the current file has the machine-detail markup duplicated
almost verbatim, with different colour values (`#F06C22` hardcoded in one,
`bg-cta` token in the other). One `MachineDetail`, two hosts, no drift.

### 4.1 The adapter

Same job as `equipment/adapters.ts`: merge sources that each describe a machine
partially, catalog winning per field, so the UI upgrades itself as the roster
backfill lands.

```ts
export interface CatalogMachine {
  id: string;
  name: string;
  movementPattern: MovementPattern;
  anatomicalRegion: AnatomicalRegion;

  // the diagram — MuscleId, never library slugs
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  preferredView: "front" | "back";

  // the text the coach reads
  musculature: { primary: string[]; secondary: string[]; synergists: string[] };
  clinicalNote: string;
  clinicalWarnings: string[];
  setup: string;
  setupCues: string[];
  execution: string;

  // tenant-scoped
  studioNotes: string;
  rosterStatus: RosterStatus;
}
```

Precedence, highest first: **roster override → catalog doc → `MACHINE_ANATOMY` →
`MACHINE_DATABASE`**. Note what is *not* in that chain: `machineMuscleMap`.

### 4.2 Deleting `machineMuscleMap.ts`

`BodyModel` already accepts `primary`/`secondary` as `MuscleId[]` and translates
through `toBodySlugs()`. The `legacyPrimary`/`legacySecondary` props and the
`LEGACY_SLUG_MAP` table exist purely for this one caller. Once the adapter feeds
real `MuscleId[]`, delete all four: the file, the two props, the map, and
`legacyMuscleToRegion()`.

`handleMuscleClick` (tap a muscle → find a machine) then reverses through
`BODY_SLUG_MAP` in `types/machines.ts` instead, which is already the single
coupling point to the library's vocabulary.

**Three arrays, two intensities.** `MachineDefinition` carries primary, secondary
*and* synergist; `BodyModel` paints two levels. The rule: the diagram shows
`primaryMuscles` at full intensity and `secondaryMuscles ∪ synergistMuscles` at
low. The text list keeps all three distinct, because that distinction is real
coaching information even though the figure cannot render it.

---

## 5. CSS approach

Scoped stylesheet with tokens, per `equipment.css` / `equipment.tokens.css`. Not
Tailwind utilities — the current file is the argument against them for layout
this structural, with `lg:absolute lg:inset-0 ... max-h-[60vh] ... -mt-20` doing
work no reader can hold in their head.

```css
/* catalog.css */
.cat {
  display: grid;
  height: 100%;
  min-height: 0;                     /* the rule from §3 */
  grid-template-rows: auto minmax(0, 1fr);
}

/* stack (portrait): the page scrolls, nothing inside does */
.cat__figure   { display: grid; place-items: center; aspect-ratio: 3 / 4; }
.cat__detail   { padding-bottom: calc(var(--nav-h) + env(safe-area-inset-bottom, 0px) + 1rem); }

/* split (landscape): three columns, only two of them scroll */
@media (min-width: 1024px) {
  .cat {
    grid-template-columns: var(--cat-rail) minmax(0, 1fr) var(--cat-detail);
    grid-template-rows: minmax(0, 1fr);
    height: 100dvh;
  }
  .cat__rail,
  .cat__detail {
    min-height: 0;                   /* without this, both leak to the page */
    overflow-y: auto;
    overscroll-behavior: contain;    /* no scroll chaining between columns */
  }
  .cat__figure { min-height: 0; aspect-ratio: auto; }
  .cat__detail { padding-bottom: 1.5rem; }
}

@media (min-width: 1280px) { .cat { --cat-detail: 26.25rem; } }
```

```css
/* catalog.tokens.css */
.cat {
  --cat-rail: 17.5rem;      /* 280 */
  --cat-detail: 23.75rem;   /* 380 */
  --cat-nav-h: 5rem;

  --cat-muscle-primary: #0A548B;
  --cat-muscle-secondary: #6FB4E4;
  --cat-muscle-base: #4B555C;
}
```

Two rules worth stating outright, because the current file breaks both:

- **No hardcoded hex in components.** `#F06C22` and `#38BDF8` appear inline in the
  portrait tree while the landscape tree uses `bg-cta` / `bg-cyan`. Every colour
  comes from a token.
- **`overscroll-behavior: contain` on every scroller.** Without it, scrolling the
  detail column to its end starts dragging the page underneath — which on iPad
  reads as the layout coming apart.

---

## 6. The anatomy model as a shared component

Stated goal: *"we will be using this model in other parts of the app soon."* That
changes where it lives.

### 6.1 Promote it out of the catalog

```
src/components/anatomy/
  BodyModel.tsx          the render boundary — unchanged, minus the legacy props
  MuscleSelector.tsx     editable variant: click a region to assign it
  useMachineAnatomy.ts   CatalogMachine -> { primary, secondary, view }
```

`BodyModel.tsx` is already written as "the single render boundary for the anatomy
figure" and is the only file that knows the library's slug names. That discipline
is what makes it reusable — keep it absolutely. Likely next consumers: the
pre-session `BodyStateTracker` (which currently uses the flat `BODY_REGIONS` text
list), the progress report's pain map, and the client prescription visualizer.

### 6.2 Editing the mapping from the machine editor

`MachineDefinition` already has `primaryMuscles`, `secondaryMuscles`,
`synergistMuscles` as `MuscleId[]`. `MachineDefinitionForm.tsx` needs a control
for them.

Do **not** use a checkbox list of 19 muscle ids. Use `MuscleSelector` — the same
figure the trainer sees, in edit mode: tap a region to cycle
`none → primary → secondary → none`, with a mirrored text list beside it for the
precise anatomy (`musculature.primary`, which the diagram cannot express). The
admin edits in the exact widget the trainer will read, so a bad mapping is visible
at authoring time. This is the fix for "we need a way to edit and map the correct
active musculature dynamically."

Studio-level override rides the existing mechanism —
`RosterEntryFromCatalog.overrides.primaryMuscles` — so a location with an unusual
unit can correct its own figure without touching the global catalog. That is the
same additive/override policy `resolve-machine.ts` already implements.

### 6.3 Auditing all 22 mappings

Build a throwaway harness page (the codebase already uses `harness/` for this)
that renders **every machine × both views in one grid**, primary and secondary
labelled underneath. Reviewing 22 machines against the literature then costs one
screen and one scroll instead of 44 taps. Delete it after the pass, or keep it
behind the admin route as a regression check.

Flag while auditing: `abductors` and `glutes` both collapse to the library's
single `gluteal` region, so Hip Abduction, Leg Curl and Lumbar Extension all light
the same blob at different intensities. Defensible (gluteus medius *is* an
abductor) and documented in `types/machines.ts`, but if the model is going
app-wide, decide deliberately whether to live with the library's region set or
author an SVG with one region per `MuscleId`. Either way the swap is a one-file
change as long as `BODY_SLUG_MAP` stays the only coupling point.

---

## 7. Header truncation

`AppHeader.tsx`, three changes:

```tsx
{/* left cluster: min-w-0 lets it participate in shrinking at all */}
<div className="flex items-center gap-3 min-w-0">
  <MaxStrengthLogo ... />
  <button
    onClick={onStudioClick}
    title={studioName}
    aria-label={`Studio: ${studioName}. Change studio.`}
    className="... truncate max-w-[14ch] sm:max-w-[22ch] lg:max-w-none"
  >
    {studioName}
  </button>
</div>
```

- `min-w-0` on the cluster — without it the flex item will not shrink and clips
  rather than truncating.
- `ch` units, not px: the cap scales with the font, so it holds across the
  `text-xs sm:text-lg md:text-xl` ramp instead of clipping only at some sizes.
- `title` + `aria-label` — this control *switches studios*; the full name has to
  be recoverable.

If names routinely exceed ~22 characters, add a `shortName` to the studio doc and
render `shortName ?? name`. Abbreviating deliberately beats truncating
arbitrarily. Ellipsis is the floor, not the goal.

---

## 8. Round B — Studio To-Do (cleaning, maintenance, ops)

**This is a separate round on its own branch.** It touches the Hub, the calendar,
`firestore.rules` and two new collections; folding it into a catalog layout pass
would make both harder to review and impossible to revert independently. Spec'd
here so the catalog work leaves the right seams.

### 8.1 Templates and instances — the one modelling decision that matters

Do not store `done` on the task itself. You would lose history, and "reset on
Mondays" becomes a destructive write. Two collections:

```
studios/{studioId}/taskTemplates/{templateId}
  title            "Wipe down and sanitize"
  kind             'machine' | 'facility' | 'client'
  category         'cleaning' | 'maintenance' | 'ops' | 'client-service'
  target           { machineIds: string[] | 'all' } | { area: string } | { clientId }
  recurrence       { type: 'daily'|'weekly'|'monthly'|'once',
                     daysOfWeek?: number[], shift?: 'am'|'pm'|'any' }
  requiresNote     boolean
  assigneeTrainerId?: string
  order, active, createdBy, updatedAt
```

```
studios/{studioId}/taskInstances/{instanceId}
  // id = `${templateId}__${localDate}__${shift}` (+ `__${machineId}` when machine-scoped)
  templateId, studioId, localDate: 'YYYY-MM-DD', shift, machineId?
  status           'open' | 'done' | 'skipped'
  completedBy, completedAt, note
```

**The deterministic id is the important part.** It makes materialization
*idempotent*: the first trainer to open the list today writes the day's instances
with `setDoc(..., { merge: true })`, and every subsequent open is a no-op. No
duplicates, no race, and **no Cloud Function needed to ship.** Add a scheduled
function later to pre-materialize if you want the list warm at open — the ids will
not collide with what the client already wrote.

**Compute `localDate` in the studio's timezone, not the device's.** You already
have `src/lib/studio-time.ts` / `setActiveTimeZone`. A trainer whose iPad is in
another timezone would otherwise mint a second day's worth of instances and the
list would appear to reset at random.

### 8.2 Bulk check-off

"Mark all" and multi-select are a Firestore `writeBatch` — 22 machines is well
inside the 500-op limit, and it commits atomically so a dropped connection cannot
half-complete the list.

UI: a selection mode on the list with a sticky action bar (`4 selected · Mark
done · Add note`), the same interaction shape as the mail apps trainers already
know. Default action is "mark all" as a single primary button, because that is the
common case at close.

### 8.3 Where it connects to what already exists

- **Maintenance flips roster status.** A maintenance task closed with an issue
  should set `rosterStatus: 'maintenance'` on the roster entry and stamp
  `unit.lastServicedAt`. Both fields already exist on `RosterEntryBase`. The
  catalog then badges the machine, and the picker can sort it to the bottom.
- **Reuse the journal path.** `features/equipment/mutations.ts` already writes
  maintenance-flagged notes as `journalEntries` with `kind: 'equipment'` and
  critical importance, which surfaces them in the pre-session briefing. A
  maintenance note from the to-do list should take the same path, not a parallel
  one.
- **Client tasks are calendar events.** InBody scans, assessments and progress
  reports should render in the to-do list *and* the existing calendar, and the
  check-off should deep-link into the real flow (open the progress report editor)
  rather than being a checkbox that claims the work happened. Do not build a
  second scheduling system beside `features/calendar/`.
- **Two entry points, one model.** Managers author templates in the Hub; trainers
  check off from a Studio To-Do screen *and* from `MachineUpkeepCard` in the
  catalog detail panel ("Cleaned 2h ago by AJ · Mark cleaned").

### 8.4 Permissions

Template authoring is a manager capability; add `manageStudioTasks` to
`lib/permissions.ts` rather than checking roles inline. Instance completion is any
authenticated trainer of that studio. Rules go under the existing
`studios/{studioId}` block, matching the roster's posture.

---

## 9. Phasing — branch `catalog-redesign`, one commit per phase

| # | Phase | What lands | Risk |
|---|---|---|---|
| 1 | **Tenant correctness** | Studio Notes write to `studios/{id}/roster/{machineId}`; direct roster read; honest save/error states | 🔴 fixes a live leak |
| 2 | **One source of truth for the figure** | Adapter feeds `MuscleId[]` from `MACHINE_ANATOMY`/catalog; `preferredView` applied on every selection path; delete `machineMuscleMap.ts` + legacy props | fixes Circle 1 |
| 3 | **Layout shell** | Feature folder, tokens, three-column grid, one-scroller rule, `dvh`, safe-area padding; one `MachineDetail` for both modes | fixes Circles 4, 5, 6 |
| 4 | **Navigation** | `MachinePicker` + `MachinePickerBar` + sheet; carousel and its ~90 lines deleted | fixes Circle 2 |
| 5 | **Sections** | `<details>` accordions, Clinical Warnings pinned open, per-section persistence | information hierarchy |
| 6 | **Header + audit** | `AppHeader` truncation fix; anatomy harness; correct all 22 mappings | fixes Circle 3 |
| 7 | **Shared anatomy** | Promote to `components/anatomy/`; `MuscleSelector` into `MachineDefinitionForm` | unblocks reuse |

Then **branch `studio-tasks`** for round B, phased separately.

Order is deliberate: phases 1 and 2 are data-correctness with small diffs and are
worth shipping even if the layout work slips. Phases 3–6 are visual and want your
eyes on an iPad between each one.

### 9.1 Effort strategy

Phases 1, 2 and 7, and all of round B's data model, are decisions that are
expensive to undo — multi-tenant writes, a schema, a shared component's API. Worth
the higher-effort model.

Phases 3, 4, 5 and 6 are layout iteration where you will be sending screenshots
back and forth. Those run fine on a cheaper model, because the feedback loop is
short and a wrong answer costs one more screenshot rather than a migration.

For annotated screenshots: red now collides with the app's own warning semantic
(the amber/red clinical panel) and reads poorly on the navy surfaces. **Lime
(#C6FF00) or magenta (#FF2D95)** stay legible over both themes and never look like
part of the UI.

---

## 10. Verify on the iPad

- Portrait and landscape, both themes.
- Hip Abduction: figure lands on **posterior**, **glutes** lit, core dark — arrived
  at by tapping the rail, by the picker sheet, and by tapping the figure.
- Scroll to the bottom of a long machine (Leg Press, 11 setup cues): **no** inner
  scrollbar, **no** dead space, last line clears the bottom nav.
- Scroll to the bottom of the shortest machine: no void.
- Sticky mini appears in portrait, never in landscape; tapping it returns to the
  figure.
- Studio Notes: type at Solon, save, **sign in at a second studio and confirm the
  note is not there.** This is the acceptance test for phase 1.
- Save Notes with the network off: the button must report failure, not
  "Stored Successfully".
- A long studio name in the header at every breakpoint.
- VoiceOver through the picker sheet.
