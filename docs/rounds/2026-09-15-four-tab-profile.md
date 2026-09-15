# The four-tab client profile — Sep 15 2026

Branch `client-profile-4-tabs`. Nine commits: the six from the FORD round
(folded in, unchanged) and three of this round's own, plus this document.
One commit per phase, each typechecked on its own, so any single phase can be
reverted alone.

Depends on and includes [the FORD round](2026-09-15-ford-and-profile-merge.md).
That round's `ship-ford.ps1` was never run — its preflight stopped on
untracked files that had nothing to do with it — so its six commits ride in
this branch rather than being shipped separately.

---

## 0. The brief, and the one-sentence answer

> "This setup forces trainers to jump to multiple spots for similar
> information. I want to consolidate this into a streamlined structure of 4
> tabs without removing any existing features." — AJ

The tabs were named after the **screens that produced them**, not after the
questions a trainer asks. That is the whole problem, and it is why seven felt
like more than seven: every fact on the profile was conditional on already
knowing which team had built the screen it lived on.

Four tabs, each one a question:

| Tab | The question | Was |
| --- | --- | --- |
| **Journey** | what has she done, in order | Journey |
| **Programming** | what is she supposed to do | Routines + Equipment |
| **Notes & Profile** | what do we know, and what did we say | Journal + Details |
| **Clinical History** | what has already happened | Clinical + History |

Nothing was removed. All seven original screens are reachable, and
`legacyLocation()` maps every tab id the profile has ever answered to onto
its new home, so no call site, deep link or trainer's muscle memory breaks.

---

## 1. Ergonomics: what "held tablet" actually rules out

The iPad is **held**. One hand at the edge, in a room, often while the
trainer is looking at the client rather than the screen. Three consequences,
and they are the reason the sub-toggle looks the way it does
(`features/client-profile/ProfileSubnav.tsx`):

- **A control that moves cannot be found without looking.** The sub-toggle is
  always the first thing under the tab row, always the same height, in all
  three tabs that have one. Once the thumb has learnt "second row, first
  third", it is right forever.

- **A control that scrolls away stops being used.** It is sticky. The panes
  under it are long — a year of sessions, twenty-one machines — and a switch
  you have to scroll back up to find is a switch nobody touches twice.

- **Targets sized to their text are targets you have to read.** Segments are
  equal fractions of the full width, never content-width pills, so "All
  Machines" and "B" are the same size and the same distance apart. Position,
  not reading, is what picks a segment when you are not looking at it. At the
  narrowest supported width (744pt portrait) four segments are still 172px
  wide and 48px tall — four times the 40px floor in CLAUDE.md, on both axes.

Colour: brand blue, because it is an interactive control. Hero orange stays
reserved for Start Session and for good findings. The active segment is a
filled block, not an underline — at arm's length on a fingerprinted screen,
fill survives and a 2px rule does not.

**A segment is never hidden.** `meta` carries the state instead: Routine B on
a client who has no B reads "ROUTINE B / OFF", and the switch to turn it on
lives behind that segment. Hiding a control is how a studio forgets a feature
exists.

### The tab row got roomier, not tighter

Four equal tracks at 834pt portrait is ~208px each, against ~115px for seven.
"NOTES & PROFILE" fits at 13px with space to spare, so the row still never
scrolls sideways and no label truncates. Verified at 744 / 834 / 1366.

---

## 2. Programming

Segments: **Routine A · Routine B · All Machines.**

Routines and Equipment already spoke the same visual language — the Routines
round deliberately rebuilt the prescription rows in the Equipment rail's
vocabulary — so they were two tabs and one sentence.

**One prescription at a time is denser, not sparser.** Side by side, each
routine had half of a 1024px screen and the eighth machine ran past the fold.
At full width the whole list fits, and the other routine is a 48px tap away
in a fixed position. The density problem is solved by *removing* the second
column, not by shrinking rows. `RoutinesTab` gained a `view` prop for this,
and the Changes list under a single routine is filtered to that routine — a
trainer reading B does not want A's edit history in the same scroll.

**It opens on today's routine.** `defaultProgrammingView` picks the
prescription the client is actually training. That fact was already on the
old screen; it just had to be read rather than landed on. If A is empty and B
is not, it opens on B — an empty list reads as a broken screen.

A persistent context line above the toggle carries what the old summary bar
carried: *21 machines prescribed · 3 with no load yet · Routine A today ·
last change 2d ago by AJ*. It stays put while the trainer switches segments.

---

## 3. Notes & Profile

The FORD round's spine, renamed. Sections are unchanged —
`general · life · medical · goals · focus · notes · reports · admin` — with
one move:

**Reports split by verb.** Composing an assessment stays here, next to the
notes it draws on; the filed shelf moved to Clinical History, because the
archive is the past and the past has a tab now. So the `reports` section is
titled **Assessment**, renders only the check-in area, and carries one line —
"7 filed reports · Clinical History" — across to the shelf. Count first,
because the number is what decides whether the tap is worth it.

---

## 4. Clinical History

Segments: **Calendar · Sessions · Trends · Reports.**

**Calendar and Sessions are promoted, not nested.** The History tab owned its
own Calendar/List switch. Putting that inside a tab sub-toggle would be two
decisions to reach one screen, so `HistoryView` gained a controlled `view`
and the parent draws that switch one level up. There is exactly one switch on
the screen. *This is the reason the consolidation removes a hop instead of
moving one.*

**The clinical facts are not a segment.** A client's contraindications are
not something you navigate to; they are the frame every other number on this
tab has to be read inside. So they sit above the sub-toggle, on every
segment, and never scroll away. Read-only, naming the Medical section of
Notes & Profile as the one place they are edited — a second editable copy is
how two screens start disagreeing about whether a client has been cleared —
and costing no read, because every fact in the strip is already on the client
document the profile streams.

Trends keeps its generate-gate exactly as it was: nothing is fetched until
the trainer picks a range and presses Generate.

---

## 5. Component strategy

**One reducer, four thin shells, and the panes stay where they are.**

- `profile-nav.ts` is the model: `ProfileLocation` (a tab *and* a position
  inside it), the reducer, the legacy map, the per-client resume. Pure, no
  React, 23 tests.
- `useProfileNav` wraps it with the sessionStorage resume and the context the
  reducer needs to pick a default segment.
- `ProgrammingTab` and `ClinicalHistoryTab` are **shells**. They own their
  sub-toggle and compose existing feature components untouched. No feature
  component learns that it is inside a combined tab.
- `ClientProfileView` still owns every Firestore write. The shells report
  taps. That is why the Routine B dialog, the discard dialog and the Edit
  Routine drawer sit *beside* `ProgrammingTab` rather than inside it.

### Switching a sub-view costs no fetch

This is the load-bearing rule. Every pane reads data the profile has already
loaded, or keeps its own gate. Two reads follow the tabs and both were
re-pointed: the session page is read by Journey and by Clinical History's
calendar; `progressReports` by Clinical History and by the record. Programming
costs neither, as Routines and Equipment never did.

`useRoutinesModel` was lifted out of `RoutinesTab` so the context sentence and
the panel below it are the same numbers from the same walk of the logs, not
two. `RoutinesTab` still computes its own when no model is passed, so it stays
mountable on its own.

### Mount, hide, unmount — the rule

Radix `TabsContent` unmounts by default, which is right for a cheap pane and
wrong for an expensive one.

| Pane | Treatment | Why |
| --- | --- | --- |
| Routine A / B | unmounted when hidden | pure render off a model that is already computed |
| All Machines | **mounted on first use, hidden after** | holds the selected machine, the search and the drill-in position — the trainer's place in it |
| Calendar + Sessions | **one mount for both** | same session history; unmounting between them re-runs the listener |
| Trends | **mounted on first use, hidden after** | holds a generated report; rebuilding it is a re-fetch |
| Reports | unmounted when hidden | a list off props |

"Mounted on first use", not "always mounted": mounting the roster up front
would cost a machine-catalog subscription on every profile open for a pane
most visits never reach. A new client resets both flags.

### Re-entering a tab returns you to the segment you left it on

A trainer reading Routine B, who checks the Journey grid and comes back,
expects Routine B. The reducer remembers the last segment of each tab
separately, and the whole location is remembered **per client** in
sessionStorage — so opening Judy resumes Judy's screen and opening Marcus
straight afterwards does not inherit it. Session storage rather than local: a
tab left open for a week resuming on last Tuesday's segment is surprise, not
service. Every access is wrapped; a private window returns null and the
profile simply opens on Journey.

---

## 6. Data organisation — Mindbody beside trainer notes

Unchanged from the FORD round, and worth restating because it is the answer
to "how do the two sit together":

**Provenance is in the control, not in a badge.** An input means you own it; a
read-only block means Mindbody or the Journal does. `SOURCE_META` in
`types/journal.ts` names the four sources and, more importantly, what each
one means for the trainer: *"Synced from Mindbody. Overwritten on the next
sync — edit it there."* The single most important thing about any field on
that screen is whether you can change it and whether your change will
survive.

**One copy of everything.** The per-section journal rails are gone except on
Medical, where a limitation noticed mid-session is safety information and
belongs beside the clinical fields. Everything else is read in Notes, which is
the one timeline.

---

## 7. Two bugs the harness caught

Both in the sub-toggle, both found by rendering it against the app's real
shape — a bounded column whose inner `p-6` container scrolls — before anyone
saw it. Neither would have shown up in a typecheck.

1. **The sticky bar was transparent.** Its background was a gradient from
   `var(--psub-page)`, and `--psub-page` was never defined, so it resolved to
   `transparent`: the bar stuck, and twenty machine rows scrolled straight
   through it.

2. **`top: 0` pinned it 24px down.** Every engine pins a sticky box inside the
   scroll container's *padding*. This is the same trap the History tab hit
   with its month headers (`--hist-stick-top`), and the fix is the same —
   measure the scroller's padding and negate it.

   And because those month headers stick to the same edge, the bar now
   publishes its own height as `--psub-stuck-h` on the enclosing `.ptab`, and
   `client-history.css` adds it to their offset. Otherwise a month header
   parks underneath the bar and is never seen.

The harness is throwaway and is not in the repo. It is worth rebuilding for
the next UI round; this is the second round running where it caught real
layout bugs that typechecking could not.

---

## 7a. A third bug, found by running the suite at the studio's clock

`ship-4tab.ps1 -Stage check` went red on AJ's PC with one failure the
container never saw: `upcomingFord` said a Sep 20 event was 4 days from
Sep 15, not 5.

The production code was correct. The **test** was wrong, in the worst shape a
date bug can have — green in CI, red on the machine in Ohio. A date-only ISO
string (`"2026-09-20"`) is parsed as UTC midnight; a date-time with no zone
(`"2026-09-15T10:00:00"`) is parsed as local. The test used one of each in the
same assertion, so at America/New_York the event landed at 8pm on the 19th and
the local-calendar day count came out one short.

The app never had the problem: `toDate()` pins a date-only string to local
**noon** precisely to stay clear of both ends of the day. The test was the one
place that bypassed that guard, by handing in a real `Date` built from a bare
date string. Fixed with a `day()` helper that constructs dates the way
`toDate()` does; verified at UTC, Eastern, Pacific, Sydney and UTC+14.

**The lesson for the next round: run the suite with `TZ=America/New_York`
before shipping.** A container that runs in UTC cannot see this class of bug,
and every studio is Eastern.

Logged, not fixed: `src/features/renewals/conversation.test.ts` fails at
UTC+14. It predates this round, is not a file this round touches, and no MSF
studio is east of Eastern.

---

## 7b. The one that got through: a reducer in its temporal dead zone

The round shipped a crash. The profile opened correctly and fell through to
the error boundary the moment a trainer changed tabs:

    ReferenceError: Cannot access 'ctxRef' before initialization

**React does not call a reducer on mount.** It calls it while processing a
queued action, and it does that during the *next render*, at the point of the
`useReducer` call. `useProfileNav` passed a wrapper arrow that read
`ctxRef.current`, and `const ctxRef` was declared a few lines below
`useReducer` — so at the moment React ran it, that const was still in its
temporal dead zone. No action queued, no crash: which is precisely why the
screen looked perfect until the first tap.

Fixed structurally rather than by moving a line. `profileNavReducer` takes two
arguments, lives at module scope, closes over nothing, and the programming
default rides in the action, assembled at dispatch time — safely after render.
A test asserts `profileNavReducer.length === 2`, because restoring the third
parameter is what would reintroduce the wrapper.

Found while proving it: `new ResizeObserver` in `ProfileSubnav`'s layout
effect was unguarded. Anything that throws in a layout effect takes the whole
screen down the same way, and `JourneyGrid` already feature-detects in two of
its three uses — the house convention, missed. Now guarded.

### Why nothing caught it, and what changed

A clean typecheck, 2,069 passing tests and a production build all look at code
that is never mounted. So this round adds **the first render tests in the
repo** — `profile-nav.render.test.tsx`, jsdom and raw `react-dom/client`, no
testing-library, one devDependency. They fail on the old code with the exact
production error.

**Add a render test for any hook or component that does work during render or
in a layout effect.** They cost milliseconds and they are the only check in
the suite that would have caught this.

---

## 8. Verification

- `npx tsc --noEmit` — **18**, unchanged from master.
- `npx vitest run src` — **2,077** passing, 1 skipped, 111 files (2,046
  before this round's 23 new tests). Green at UTC, America/New_York and
  America/Los_Angeles; see 7a.
- `npx vite build` — clean.
- Rendered at 744 / 834 / 1366pt in both themes: segments 48px tall and never
  under 172px wide, no label clipped, no horizontal overflow, the bar pinned
  at exactly 0 relative to the scroller.

### Still to do on a real iPad

- The four-tab row at 1366 landscape with the header's long-client-name case.
- Programming → All Machines: confirm the roster keeps its selected machine
  and search across a switch to Routine A and back.
- Clinical History → Calendar, scrolled: the month headers must stop *under*
  the sub-toggle, not behind it. This is the `--psub-stuck-h` path and it is
  the one thing in this round that is measured at runtime.
- Clinical History → Trends: Generate, then switch to Calendar and back — the
  report must still be there.
- Notes & Profile → Assessment: the "N filed reports · Clinical History" line
  should land on the Reports segment.
- Open a client, leave to the directory, open a different client: the second
  client must open on Journey, not on the first client's segment.
