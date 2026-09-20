# Realistic demo loads — Sep 20 2026

**A 72-year-old woman was leg-pressing fifty-three pounds, and her rep count
was a random number.**

The third round of the day on Demo Mode, after the demo week. One new file
(`src/features/demo-mode/loads.ts`), one new test file, and the weight half of
the seeder rewritten.

AJ's brief:

> Our demo mode is not as realistic as it can be. Evaluate the academy
> consultations and how intensely to push a client and other documents within
> our academy documents to better gauge how to create better demo sessions, as
> well as notating that our machines can only move up in two pound increments.
> As some of the current weights have 35 pounds, 32.5, 37, 53. And for some
> machines like the leg press, for instance, the client only has 53 pounds …
> reference the suggested weights and start them out on the more novice weights
> that have them slowly progress up to the intermediate weights.

---

## Three faults, and only one of them was rounding

1. **The numbers were not on the machine.** The old model rounded to 2.5 lb and
   added 2-to-6 lb steps, which is how you get 32.5, 35, 37 and 53 — none of
   which an MSF machine can be set to.
2. **The loads were far too light.** They came from the catalog's
   `baselineLoad` (leg press: 160 male / **60 female**) and were then scaled
   *down* again for age, so Eowyn opened on 50 and finished on 53.
3. **Reps had nothing to do with weight.** A random 6-to-12 on every set, so
   the grid could show a weight going up while the rep count went up with it —
   backwards from how this method works, and the first thing a trainer would
   notice.

The third is the one that mattered most, and it is the one that fixed the
other two once it was modelled properly.

---

## What the Academy actually says

The corpus was read end to end for this. Four things came back, and all four
are quoted in `loads.ts` beside the constant they produced.

**The machines move in two-pound increments**, which AJ said and the corpus
confirms:

> "Because our machines can be progressed in two pound increments, we can make
> very small, precise increases as the client adapts and gets stronger."
> — `Academy 2/Training with pain (arthritis, fibro myalgia, …).txt`

**Twenty pounds is the floor**, on more machines than one:

> "Most clients will start with 20 pounds, the lightest increment available on
> this exercise." — `…/Cervical Extension.txt`
> "Even with the minimal load of twenty pounds, some subjects will be unable to
> produce enough force to start the exercise." — `…/Triceps Extension.txt`

**A new client is started deliberately under what they can do**, and the rep
count is how you know:

> "we should be intentionally underestimating the strength of the new client in
> an effort to allow them to learn how to control their movement without being
> completely overwhelmed. It should still be challenging as the set progresses,
> which would most likely land them at a 10 - 12 or more rep set."
> — `Academy 2/Exercise Selection Template.txt`

> "< 6 reps → Load may be too heavy. 6–10 reps → Typically appropriate
> challenge. > 10 reps → Load may be too light. ~15 reps → Practical upper
> limit. … If 15+ reps are possible with proper quality: End the set. Increase
> weight next session." — `Academy 2/How Intensely to Push a Client.txt`

**Load is the last thing you change, and only a clean set earns it:**

> "Repetition count – if a subject has yet to reach muscular fatigue and is
> still within an acceptable rep count range, the number of reps should be
> progressed in an effort to approach failure, **before resistance is added**.
> … Resistance – weight increases are only considered after the previous four
> factors are optimized."
> — `Academy 6/… Programming and Progression 5 - Workout Progressions.txt`

> "If you accept these less than optimal reps, there is a likelihood that they
> would accumulate enough reps to warrant a weight increase. And with the
> subpar execution that they are currently using, an increase in weight is only
> going to exacerbate the situation."
> — `Academy/Academy - Registering Performance - Use of the Clicker.txt`

---

## The model

**The load is a consequence of the rep count, never a schedule.** That one
sentence is the whole round.

A client is given a starting load three quarters of their settled capability,
so their first sets come out at thirteen or fourteen reps. That is too long,
so the trainer corrects — and each correction closes a share of what is
**left**, not a flat percentage, so the corrections shrink on their own: twenty,
then eighteen, then ten, then four. That is what homing in looks like, and it
is why the opening no longer reads as four identical twenty-pound jumps.

Once the reps sit in the six-to-ten band the load stops moving. It only picks
up again because **capability itself grows** — fast at first, then flattening,
fifteen per cent across a whole history — and each time the client grows into
their weight the reps drift up past ten and earn another two pounds.

A set marked poor earns nothing, per the clicker document.

The two held machines (lumbar, abdominals) progress on **time first, load
second** — the same double progression in a different unit, straight out of the
static-hold guidance: introduced at 30–45 seconds, worked up to 120, and at 120
the load goes up and the time comes back down. A settled hold sits around 75
seconds, because forty-five is where a hold is *introduced*, not where anybody
stays.

### What it produces

| Client | Leg press, first → last |
| --- | --- |
| Eowyn Rohan, 72 F, 42 sessions | 104 × 14 → 140 × 9 |
| Rosie Cotton, 68 F, 45 sessions | 132 × 13 → 178 × 10 |
| Sam Gamgee, 58 M, 14 sessions | 226 × 13 → 284 × 11 |
| Merry Brandybuck, 54 M, 19 sessions | 236 × 15 → 298 × 12 |
| Frodo Baggins, 45 M, 2 sessions | 230 × 15 — one set, because he is new |
| Arwen Evenstar, 81 F, 8 + **304** prior | 148 × 7, and it barely moves |

Eowyn's opening reads `104×14 118×11 126×11 132×9 132×9 132×9 132×9 132×9
132×11 134×11 136×11 138×8 …` — the gap closes, then the weight sits still for
five sessions, then it creeps. Across the whole demo: **28% of performances
move the weight, 15% once past the learning curve, and the largest gain any
client makes on any machine is ×1.44.**

### Arwen is the one to look at twice

A model that only knew her age would have had an 81-year-old opening *lighter
than a sedentary 81-year-old who had never trained* — the exact opposite of the
point she is in the roster to make. Twelve years of training is worth a quarter
on capability, and more importantly it means she does not get a novice's
opening at all: she starts where she left off, at eight reps, and her grid is
flat because she is not learning anything. The migration case now reads
correctly on the weights as well as on the session count.

---

## The numbers are ours, and that needs saying out loud

`DEMO_LOADS` is **not a Max Strength standard and must never be shown as one.**

The real table is `MSF - Suggested Starting Weights.xlsx`. It is Drive-only and
not in this repo — `docs/msf-academy/README.md` says so explicitly, and the Leg
Press document refers to "the suggested weight" without reproducing it. The
whole corpus was searched: there is no per-machine starting-weight table, no
percentage-of-bodyweight rule, and no percentage-of-1RM rule anywhere in it.
The only hard numbers are the 20 lb floor and the Leg Press's 18 lb accessory /
38 lb combined footplate pressure.

So these are considered demo figures, in the catalog's own relative order, and
they are laid out in the shape of the **empty**
`standardWeights: { Beginner, Intermediate, Advanced }` slot on a catalog
machine — so the real numbers drop into the catalog when they arrive and this
table is deleted in favour of reading them.

### Two things this found that are not demo problems

1. **`baselineLoad` on the catalog is the same unvetted guess**, and it is not
   only the demo that reads it. `suggestedWeight()` in
   `features/equipment/adapters.ts` falls back to it for every real client on
   every real floor, so a trainer setting up a new client on the leg press is
   being offered 60 lb for a woman. Nothing was changed there in this round —
   that is Max Strength's standard to set, not ours to invent — but it needs
   the spreadsheet.
2. **`standardWeights` is empty for all twenty machines.** It is the field the
   app already prefers over `baselineLoad`, it is per level (Beginner /
   Intermediate / Advanced), and filling it is exactly what AJ described as
   "start them out on the more novice weights … progress up to the
   intermediate". The slot is built and waiting.

---

## Verification

- `npx vitest run src` — **3,683** passing in 247 files, one skipped (**+29**).
- `npx tsc --noEmit` — **10**, the baseline, none in `demo-mode/`.
- `npx vite build` — clean.
- A test asserts that **no load anywhere in the seed is odd or under twenty**,
  which is the assertion that makes 32.5, 35, 37 and 53 unreachable rather than
  merely absent.

`DEMO_SEED_VERSION` is **4**. Pressing Set up again is what applies any of this
— the weights live in Firestore, not in the build.
