# The catalog gate — reading a studio's machine before it becomes the standard

**Branch** `catalog-gate` · **Sep 20, 2026** · four commits, one per phase

AJ, Sep 20:

> I just want to improve how we set the company standard machines and build
> and edit the machines in general and then I just want to let each studio
> have their own version of that (which they can submit built machines).

---

## What was actually wrong

**The template boundary had a hole, and it was on the one path that mattered.**

`src/lib/machine-template.ts` exists to stop a franchise location rewriting
Max Strength's method on its own copy of a catalog machine. It does that
well: the editor hides what a studio may not touch, and `scopeOverrides` is
the last gate before the roster write, deliberately redundant so that a stale
draft or a future call site cannot carry the company's cadence out the door.

The submission path went around both.

A studio's OWN machine (`source: "custom"`) is a copy of nothing, so it
stores a whole `MachineDefinition` — musculature, movement pattern,
kinematics, the cadence, both turnarounds, the handoff, the key cues. That is
correct while the machine is theirs alone: nobody else reads it. But "Offer
to the MSF catalog" sent that definition verbatim to `catalogSubmissions`,
and Publish wrote it straight to `machines/{id}`.

At which point a studio leader's wording of the method became the sentence
every other location reads — live-inherited, on a screen a trainer is told to
trust, about how to take a client to failure safely.

**And the admin tapping Publish had not seen it.** The decision panel showed
a name, a studio, a submitter, a free-text note and an id field. Not one word
of the machine. There was no way to open it, no summary of what was in it,
and no check that it was finished: a submission carrying nothing but a name
would publish, and every floor would inherit a machine with no cadence.

Nothing had gone wrong yet because no studio has offered one. That is the
only reason.

---

## The gate — `src/features/admin/catalog/review.ts`

Three questions corporate actually has, answered before the tap.

| | |
| --- | --- |
| **What did the studio write that becomes ours?** | `authoredMethod` walks `METHOD_DEFINITION_FIELDS` — derived from the template boundary, not restated — and names the method fields the submission fills in. A field that moves from studio-owned to corporate-owned starts being reviewed on the same commit that moves it. |
| **Is it finished enough to be the standard?** | `blockingGaps` filters the completeness checks to a short list. Everything else is named on screen and left to judgement. |
| **Is this a new machine, or ours with different hardware?** | `likenessTo` compares against the catalog machine the studio named in `basedOn`, splitting the differences into method and hardware. A submission that differs only on hardware is probably an override, not a second catalog entry, and the panel says so. |

### The bar is the catalog's own

`BLOCKING_GAPS` is eleven checks, and `review.test.ts` asserts **all twenty
generated MSF definitions clear every one of them**. That test is the point of
the list. A gate a studio's machine must pass and Max Strength's own machines
would fail is not a standard, it is a grudge — and the first time an admin hit
it they would stop reading the queue.

So the test for membership is not "a finished machine would have it". Eleven
of the twenty have no dial defaults and nineteen no secondary musculature,
because the Academy's guides do not state them and the generator refuses to
guess (machine authoring round). None of that blocks. What blocks is **what
the app would render wrong, or the floor would coach wrong, if it were
blank**: the grouping keys (region, movement pattern, kinematic class — the
last one decides the turnaround style the tracker shows), the diagram's
muscles, both cadence counts, both turnarounds, the key cues, and the reason
behind a never-to-failure flag. An unexplained prohibition gets ignored.

### Why this blocks at all

`docs/KNOWN-TRAPS.md` opens with **never block a save**. This is not that
rule, and the distinction is worth keeping straight.

That rule protects a trainer on the floor, mid-session, whose work must never
be held hostage to a missing field — End Session confirms, it does not refuse.
Corporate publishing the company standard is the opposite case in every
respect: every location inherits a catalog machine, so an incomplete one is
not a draft sitting in a queue, it is a wrong setup card on twenty iPads. And
unlike the trainer, the person tapping Publish has time, and a fix is one
screen away. This is where **a confident wrong number is worse than a missing
one** applies.

The refusal names the fields and says where to fill them, rather than greying
a button out.

---

## Read it, correct it, then publish

**Read the machine** opens the submission in `MachineEditor` at
`scope="catalog"` — the same editor the catalog uses, another door, the
pattern `StudioInventoryManager` already follows across three. All eight
sections in the Academy's order, the warnings pinned, and "Read it as a
trainer" to see exactly what the floor would see. The method is editable,
because the only honest way to decide whether a studio's words should become
the standard is to read them as the standard and rewrite what is not house
language.

**Saving there is not publishing.** It writes `reviewedDefinition` onto the
submission, so a correction survives a closed tab, a second admin can pick
the review up, and both versions are kept. Publishing stays one deliberate
tap back on the queue, and sends the reviewed text.

`definitionUnderReview()` is the single answer to "which definition" —
corporate's corrections when they exist, what arrived when they do not — so
the row, the suggested id, the gate and the actual write can never describe
different machines.

**`definition` is never edited in place.** That is what makes
`correctedFields` true, and with it the sentence the studio reads on its own
floor: *"Published to the MSF catalog — corporate adjusted execution and
cadence"*, rather than a bare "Published". Sharing that outcome is cheap;
letting a studio believe its wording went in when it did not is not.

---

## The studio's half

Two things a studio could not do with its own offer, both one step from
already working.

**Take it back.** The `withdrawn` status existed in the type and the rule for
it existed in `firestore.rules` — a studio's leader gets exactly the
`pending → withdrawn` transition, carrying only `status` and `updatedAt`. No
code ever wrote it, so a machine offered by mistake sat in corporate's queue
until someone there passed on it, and the studio watched it happen. The write
is those two keys and nothing else, because a third would be refused by the
rule silently, from the studio's side.

**Hear why.** `decisionNote` was written on every decision and a studio's
leaders could already read it. It was simply never shown — so a studio
learned that corporate passed and never learned why, which is the one thing
that would let them fix the machine and offer it again. One `getDoc` when the
machine's door opens, not a listener: a decision is made once. A refused read
stays silent rather than implying corporate said nothing.

Offering again writes a **new** submission document. The old one is the record
of what corporate saw and decided; editing it in place would turn "Corporate
passed: too close to the pullover" into a note about a machine that no longer
exists.

---

## Two from an outside audit

AJ had Gemini review the codebase against a fourteen-page modernization plan.
Most of it was wrong about this repo — it recommended migrating to Tailwind v4
(already on 4.3), adopting `FieldValue.increment()` (already in twelve files),
enabling offline persistence (already on), adopting JWT custom claims (role
and studioId have been on the token since the cost round), and named
`src/lib/set-outcome.ts` as the source of a transaction bug in a file that
contains no Firestore calls at all. Its works-cited list is forty-nine blog
posts and two project documents; it never read the code.

Two things in it were right.

**The last legacy writer.** `ConsultationWizard` still wrote the setup note to
`sessionNotes`. The floor round moved the other two in September and missed
this one, and it was invisible because `useClientJournal` *adapts* old
sessionNotes documents for reading — so the note still showed up. What it
could not do was thread, carry a mattering window, reach the briefing, or be
dismissed: everything built on notes since. It writes `journalEntries` now,
with the **Auth uid** as the author rather than `authTrainer.id`, and it never
blocks the consultation. `sessionNotes` now has no writers anywhere; what is
left is the read adapter and two cleanup deletes, both correct.

**A 34px tap target.** `.adm-btn--sm` was under the app's own floor ("nothing
tappable under 40px") and it is not a rare control — it is the button on the
catalog rows, the Overview's panels and the attendance watch, all operated
one-thumbed on an iPad. Raised to 40. Not swept to Apple's 44: that is a real
question, but it is a design decision across forty declarations in a
deliberately consistent system, not a bug fix, and it is AJ's call.

---

## Verified

| | |
| --- | --- |
| Typecheck | **10** — unchanged from master's baseline |
| Tests | **3,584 passing in 238 files** (master: 3,545 in 237). 39 new, one new file |
| Rules tests | **not run** — needs JDK 21 on AJ's PC. **Nothing in this round touches `firestore.rules`** |
| Build | not run |

**No rules change and no deploy.** `catalogSubmissions`' update rule is
unconditional for administrators, so `reviewedDefinition`, `reviewedAt`,
`reviewedBy` and `correctedFields` need no rule change; `rosterWriteValid`
has no `hasOnly`, so the marker's new `corrected` field needs none either.
The withdrawal writes exactly the two keys the existing rule already allows.

---

## For AJ

1. **Nothing to deploy and nothing to run.** No rules, no indexes, no scripts.
   It is a branch; `npm run test:rules` is not needed because the rules did
   not change.
2. **Worth trying end to end**, because no studio has ever actually offered a
   machine: on a studio floor, make a custom machine, offer it, then go to
   Admin → Catalog and read it, correct a cue, publish, and check the studio's
   floor says corporate adjusted it.
3. **Open, and still yours to decide:** whether to raise the app's tap-target
   floor from 40px to Apple's 44px; and whether the twenty catalog machines
   should take their Academy names (Cervical Extension, Biceps Curl,
   Abdominals) with the current floor abbreviations kept as `shortName` — the
   machine authoring round left that question open and it is still one line in
   the generator.
4. **The rules still do not enforce the template boundary** — the app does, at
   the write, and now at the publish too. That was already noted as worth
   doing before trainers are on it, and it wants care with the expression
   budget.
