# Note threads — the Notes round

**Sep 20 2026 · branch `note-threads` · five commits, one per phase**

AJ's spec for this round is *Pre-Session Briefing & Notes — Build Spec* (20 Sep
2026). He chose the thread model as where to start, over the per-weight rep
averages and over a thin briefing, on the reasoning that it unblocks the rest:
dismissal, the Notes layout, the body pain map and "matters until resolved" all
need a note to be something that can have a history.

**This round does not widen what the briefing says.** The selection is exactly
what it was — a Critical note that matters today, a Heads up still inside its
window. The briefing has one way to fail and it is the quiet one: be noisy, and
trainers stop opening it without ever saying why. So the round changed how the
briefing says what it already said, and left what it says alone.

---

## What the code checks found

The spec lists four things to check before building. All four were checked
against the working copy first.

**1 — The stiff/fatigued body-region marks persist, and more is built behind
them than the spec assumed.** `BodyStateTracker.tsx` writes
`{ region, state, dial, until? }` per region. Since the reporting round it is
not two buttons but the full Dial (Pain · Stiff · As usual · Better ·
Recovered), and a below-centre value can carry a "matters until" day. They are
saved on the check-in, the briefing carries a region forward from the last
session until its day (`carriedRegions`), and the Kaizen Deep Dive reads their
history. They are genuinely *state* markers and not threads — the spec guessed
right — but the plumbing under them is real, and the body pain map can sit on
top of both without rebuilding either.

**2 — "Not synced" is a schedule-block state, not a client-tab error.** Under
strict resolution a booking resolves to `clients/{mindbodyClientId}` or to
nothing; if the client document does not exist yet, the block greys out until
the next sync creates it. There is deliberately no manual fallback — creating
profiles by hand is what produced the duplicate documents. It reads as
undecipherable because it names the symptom and not the cause or the wait.

**3 — The set quality ranking exists, but it is the trainer's, not the
client's.** Every `ExerciseLog` carries `repQuality: 1 | 2 | 3` — the trainer's
mark for how the reps went. There is no field anywhere for the client's own
easy/hard ranking. AJ's call (Sep 20): question 3 reads `repQuality`. It works
on every historical set, including the FileMaker imports, and a new field would
be blank for months.

**4 — Per-weight rep history does not exist and has to be derived.** Nothing in
the codebase averages reps per weight. The raw material is all on the logs
(`weight`, `reps`, `outcome`, `repQuality`) and `set-outcome.ts` already rules
that only `performed` counts, so it is a new pure module over data already
there. Not built in this round.

**And the finding that changed the build order:** the spec's four timing
classifiers already shipped, in the Operations overhaul on Sep 19.
`client-notes/mattering.ts` is Always (matters until someone resolves it),
Range (from / until), Day with a yearly repeat, plus the 60-day review. What
was actually missing was the thread.

---

## What was built

### 1 — The model (`features/client-notes/threads.ts`)

An update is an ordinary `journalEntries` document carrying `threadId`, the
root note's id. No second collection and no denormalised copy: exactly the
shape a trainer focus already uses for its check-ins (`focusId`), for the same
reason — the thread and the client's timeline are the same records.

The window, the loudness and `resolvedAt` live on the **root** and nowhere
else, so `mattering.ts` is asked about one entry per thread and a thread can
never have two answers to "when does this matter". An update carries a body, an
author and a time. That is the whole model.

An orphaned update — root archived, or older than the read window — becomes a
root of its own rather than disappearing.

### 2 — The writes (`thread-write.ts`, `NoteThreadCard.tsx`)

An update inherits the root's client, studio, kind, category and machine, and
is written at plain loudness always. Closing stamps the root; any trainer may
(AJ: the person who heard "it's all healed up" is the one standing there), and
"It's back" undoes it.

**Contradicting a note adds to it.** The card offers "Add an update" even on a
note the session just contradicted, because the good outcome may have happened
*because* of the note — the trainer was careful. Closing would delete the
reason it went well and the next trainer would never see it.

`useClientJournal` now returns `threads` beside `entries`, and `entries` has
thread updates taken out of it, so every screen that already reads the flat
list keeps working and no update renders twice.

### 3 — The three zones (the Notes catalog)

Notes had inherited the Recent Journey grid — right for a record you *survey*,
wrong for a place you go *looking in*, where everything being equally quiet
means you read all of it to remember any of it.

So the catalog is a catalog of threads, and its structure is:

| Zone | What lands there |
| --- | --- |
| **Open** | a live or still-coming dated window, or an "always" note that shouts (Heads up / Critical) and waits to be closed |
| **Standing context** | an "always" note at plain loudness — known, not news |
| **Resolved** | someone closed it, or its window ran out |

**The zone is not a status anybody sets.** It falls out of the timing already
chosen in the composer, which is AJ's decision and the thing that keeps one
vocabulary instead of two that drift apart. Reading a plain "always" note as
standing context rather than an open thread is the same call `needsReview`
already makes: a note that never shouted has nothing to retire.

The seven categories stay as a filter across the zones. Open and Standing are
never cut short; Resolved shows three with "See all", and expanded reads month
by month. A search matches a thread by any of its updates, so "MRI" finds the
shoulder note whose third update is the one that says it.

### 4 — Per-trainer dismissal (`dismissals.ts`, `noteDismissals/{uid}`)

Loudness is binary and the briefing needs a third state: familiar context
getting quieter once known. The app could have guessed by counting how many
times it had shown something. AJ's call was that the trainer decides, and the
reason it is better is that "I've read this" is only half of it — the other
half is "that's not my part of this client", a trainer who only runs the B
routine hiding something that belongs to A. No amount of counting impressions
finds that out.

Three rules, each load-bearing:

- **per trainer** — one person saying what they already know, never an edit to
  the note;
- **any update brings it back, for everyone** — which is what makes offering it
  safe at all. `lastTouchedAt` counts an edit as well as a new update;
- **private** — nobody sees who dismissed what. Rules apply to whole documents,
  so privacy means a document of its own, keyed by the **Auth uid**.

### 5 — The briefing

The same selection, read out as threads and with this trainer's dismissals
applied. A note whose latest update is "MRI on the 31st" is read with that
update attached, because the update *is* the new information.

"Before you start · N" counts what is actually shown, and a line under the
heads ups says how many the trainer hushed, one tap from showing them again.
**Nothing is hidden without a way back to it** — a briefing that quietly
withholds something is the failure AJ named.

---

## Deploying

**This round adds a rules block** (`noteDismissals/{uid}`) and no indexes. So:

1. `npm run test:rules` — AJ's run is the one that counts.
2. `firebase deploy --only firestore:rules`
3. merge `note-threads` and `git push origin master` — which deploys to
   trainers.

Rules go first: they only add access, so the running app is unaffected and the
new screen finds its rules waiting. Without them a dismissal fails silently and
the note simply stays on the briefing — the safe direction, but the button
would do nothing.

## Verified

- `npx tsc --noEmit` — **10**, the `machine-authoring` baseline, unchanged.
- `TZ=America/New_York npx vitest run src` — **3,717 passing in 251 files**
  (one skipped), up from 3,683 in 247.
- `npx vite build` — clean.
- `npm run test:rules` — **not run.** It needs JDK 21 and is AJ's to run.

## Not in this round

- **Question 3** — the per-weight rep average and the routine-scoped peek. The
  module it needs does not exist yet (check 4 above); AJ has chosen version B
  and `repQuality` as the quality signal.
- **The body pain map.** Both halves are now real — the Dial's region state on
  one side, threads on the other — so it is a screen, not a data model.
- **The new-client briefing variant**, the post-session briefing, the client
  directory, and the Catalog's search.
