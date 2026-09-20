# Demo Mode

**A real studio that everybody can enter, full of people who do not exist.**

Demo Mode is how a trainer learns the app without touching a client's record,
how a studio leader rehearses a Monday, and — tomorrow — how AJ shows the app to
his boss on the live Render URL without opening a real client's history in front
of him.

Round: **Demo Mode, Sep 20 2026** (branch `claude-experiment`). The design is
carried over from the retired `demo-mode-foundation` branch (Sep 6, tag
`archive/demo-mode-foundation`), which proved it and then fell 259 commits
behind. This is a rebuild against current `master`, not a merge.

---

## The one decision everything else follows from

**The demo studio is a real studio document, and demo data lives in the ordinary
collections.**

The alternative — a parallel set of `demo*` collections, or a client-side
fixture layer — was rejected on the earlier branch and is rejected again, for
the same reason: every screen in this app reads real collections scoped by a
studio id. A parallel store means a second code path through every screen, and a
second code path is a second thing to keep true. Within a month the demo would
be showing a version of the app that no longer exists.

So `studios/demo-studio` is a studio like Solon is a studio. The Journey grid,
the renewal pipeline, the attendance watch, Machine fit, Operations — all of it
works inside Demo Mode because none of it knows it is in Demo Mode.

What keeps it separate is not a wall around the data. It is three things:

1. **The id.** `demo-studio`, fixed, never generated. A fixed id makes the
   seeder idempotent (re-running updates the same documents rather than
   creating a second demo studio), lets every environment agree on what "the
   demo studio" means, and lets the Firestore rules name it as a literal
   without spending a document read on a lookup.
2. **`guards.ts`,** which blocks the two crossings in opposite directions.
3. **The Firestore rules,** which are the boundary that cannot be bypassed.
   `guards.ts` is the boundary that produces a readable English sentence
   instead of `PERMISSION_DENIED`.

## The two crossings, and why they fail differently

| Crossing | Example | What it costs | How it fails |
| --- | --- | --- | --- |
| Real data reached **from** Demo Mode | A trainer practising deletes a client, and it is a real one | Destroys something | **Throws** (`DemoBoundaryError`) |
| Demo data reaching **real** systems | Practice sessions in a studio's numbers; a demo client pushed to Mindbody | The numbers quietly stop being true | **Skips** (`skipsForDemo`) |

The second one is the more dangerous of the two in practice, because nobody
notices. It skips rather than throwing because a nightly job that threw on the
demo studio would take the real studios queued behind it down with it.

`isDemoRecord` checks **four** field names, not one — `studioId`,
`homeStudioId`, `hostedAtStudioId`, `clientHomeStudioId` — because the app
genuinely spells "the studio this belongs to" four different ways on documents,
and a guard that checked one of them would leak. A cross-train session names the
studio twice; either half makes it demo.

## The files

| File | What it is |
| --- | --- |
| `constants.ts` | The id, the name, the seed version, the email domain |
| `is-demo.ts` | Recognising demo: the four scope fields, `excludeDemo` / `onlyDemo` for the point where data leaves the app, `withDemoFlag` for the write |
| `guards.ts` | The two crossings above |
| `access.ts` | Who may do what: `canEnterDemo`, `hasRunOfDemo`, `studiosInRealm`, `splitOutDemo` |
| `roster.ts` | Six clients and three trainers, each there to teach something |
| `loads.ts` | Pure. What a client lifts and how it moves — the stack, the bands, the double progression |
| `seed-core.ts` | Pure. The 1,202 documents the demo studio is made of, as `{ path, data }` |
| `week.ts` | Pure. The standing week the Hub reads — eleven appointments, repeated for eight weeks |
| `seed-write.ts` | Lays that list down with the client SDK, in batches |
| `DemoBanner.tsx` | One line across every screen, the Active Session included |
| `SetUpDemoCard.tsx` | Set up and reset, from the studio selection screen |

## The week ahead

Round: **the demo week, Sep 20 2026** (`docs/rounds/2026-09-20-demo-week.md`).

Everything the seeder lays down is HISTORY, and every screen that reads
backwards worked from day one. The Hub reads FORWARDS, out of `schedules`, and
had nothing — so the first screen a trainer opens in Demo Mode was blank in a
studio otherwise full of people.

`DEMO_WEEK` is eleven standing appointments (a weekday, a wall-clock time, a
client, a trainer), laid down again for eight weeks from the day the seeder
runs. Clients train twice a week, so every pair is three or four days apart —
Mon/Thu, Tue/Fri, Wed/Sat. Merry is the exception on purpose: forty-three days
away and one Sunday make-up with the studio leader, so the attendance anomaly
and the booking that answers it sit on the same screen.

Three decisions hold it up:

1. **The ids count occurrences, never days.** The seeder has no wipe, so an id
   it writes today and not tomorrow is a document nobody will ever clean up.
   `demo-booking-eowyn-003` is "this client's third upcoming appointment", and
   any 56-day window holds exactly eight of every weekday — so the run is the
   same size and the same set of ids whichever day somebody presses the button.
2. **Nothing is laid down in the past.** `renewals/attendance.ts` reads a past
   booking that was not cancelled as a VISIT, so filling in last week to make
   the Hub look busy would tell the renewals engine that Rosie came in when she
   did not.
3. **The wall clock, not a UTC hour.** The history sidesteps timezones by only
   using UTC hours 13–21; a 7 AM standing appointment cannot, because it has to
   read as 7 AM in November too. `wallClockToInstant` resolves the real offset,
   and a test crosses the change to standard time.

Every day of the week carries at least one booking, **Sunday included**, and
that is the one place the pattern is arranged for the demo rather than for
realism: the Hub opens on today, and a trainer who lands on an empty grid
concludes the demo is broken rather than that the studio is shut.

One booking in the run is **cancelled**, so Operations → Overview → Changes has
something to find. It lands on a client with another booking that week, so it
reads as a reschedule rather than a cancellation — the more useful of the two.

The Hub resolves a block STRICTLY (`clients/{clientId}` or "Not synced", never
a name match), so `clientId` is the field the whole round is about.
`trainerName` picks the column. `source` is `"Manual"`, because the demo studio
is `mindbodyMode: "offline"` and saying Mindbody sent these would be the one
lie in the seed a trainer could catch. **No rules or index change**: `schedules`
already allows an authenticated trainer to write one, and a test pins the seven
fields `isValidSchedule` requires.

The schedule is the only thing in Demo Mode that expires, so `SetUpDemoCard`
says how many bookings went in and what date they run through.

## Full access is authorisation, never membership

The tempting one-liner was to make `worksAt()` and `leadsStudio()` return true
for the demo studio. It is wrong: those two answer a different question
depending on who is asking. "May I act here?" is about the signed-in trainer;
"is this person on this studio's team?" is asked of every trainer in the
company, filtered. Operations → Renewals and the Delight queue build their
people lists the second way, so a blanket true would have put the whole staff
directory on Demo Mode's team screens.

Membership therefore stays honest, and `hasRunOfDemo()` widens authorisation
at six call sites. `access.ts` has the list and the reasoning.

**One realm at a time.** `studiosInRealm()`, applied last in
`operationsStudios()`: from inside Demo Mode you see Demo Mode and nothing
else; from anywhere else you do not see it at all. That one rule is the whole
demo boundary in Operations — no check in any of the nine tabs.

## Two leaks guarded elsewhere

Two jobs read across the WHOLE COMPANY on purpose, so a studio-scoped guard
would never have caught them. Both drop demo rows in their pure aggregator:

- `features/machine-trends/trends.ts` — the weekly "how this machine is used"
  roll-up reads `exerciseLogs` with no studio filter.
- `features/machine-fit/company.ts` — the company fit tier pools every
  studio's index, and its cells are k-anonymous at five clients, which six
  demo clients at one height would be enough to form.

## How a weight actually moves

Round: **realistic demo loads, Sep 20 2026** (`docs/rounds/2026-09-20-demo-loads.md`).
The model is `loads.ts`, with the Academy passage it comes from quoted beside
each constant.

AJ, looking at the first seeded history: *"our machines can only move up in two
pound increments. As some of the current weights have 35 pounds, 32.5, 37, 53.
And for some machines like the leg press, the client only has 53 pounds."*

Three separate things were wrong and only one of them was rounding:

1. **The numbers were not on the machine.** The old model rounded to 2.5 lb and
   added 2-to-6 lb steps, which produces 32.5, 35, 37 and 53.
2. **The loads were far too light**, because they came from the catalog's
   `baselineLoad` (leg press: 160 male / **60 female**) and were then scaled
   DOWN again for age.
3. **Reps had nothing to do with weight** — a random 6-to-12 on every set, so
   the grid could show a weight going up while the rep count went up with it.

### The rule that kills the first one

Every load passes through `onTheStack()`: **an even whole number of at least
twenty.** The Academy: *"Because our machines can be progressed in two pound
increments, we can make very small, precise increases"*, and *"Most clients will
start with 20 pounds, the lightest increment available on this exercise."*

### The model that fixes the other two

**The load is a consequence of the rep count, never a schedule.** That is the
Academy's own double progression:

> "Repetition count – if a subject has yet to reach muscular fatigue and is
> still within an acceptable rep count range, the number of reps should be
> progressed … **before resistance is added**. … Resistance – weight increases
> are only considered after the previous four factors are optimized."

So a client is started **deliberately under what they can do** (*"we should be
intentionally underestimating the strength of the new client … which would most
likely land them at a 10 - 12 or more rep set"*), their sets come out long, and
the trainer closes the gap across the learning curve — in corrections that
shrink, because each one takes a share of what is LEFT rather than a flat
percentage. Once the reps sit in the six-to-ten band the load only moves when
the client has actually got stronger, and capability grows on a curve that
flattens.

Two things fall out of that which the old coin-flip could only fake: weights
stand still most of the time without anybody deciding they should (28% of
performances move, 15% after the learning curve), and **the rep count on the
grid means something** — it falls as the weight rises, which is the first thing
a trainer looks at when they open a client.

A poor-quality set earns nothing. *"If you accept these less than optimal reps,
there is a likelihood that they would accumulate enough reps to warrant a weight
increase. And with the subpar execution … an increase in weight is only going to
exacerbate the situation."*

The two held machines progress on **time first, load second**, the same rule in
a different unit: *"introduced at … 30 to 45 seconds … progress up to 120
seconds … Once a client can sustain an effort for 120 seconds, it may be
advisable to increase the load, decrease the time."*

### What it produces

| Client | Leg press, first → last |
| --- | --- |
| Eowyn Rohan, 72 F, 42 sessions | 104 × 14 → 140 × 9 |
| Rosie Cotton, 68 F, 45 sessions | 132 × 13 → 178 × 10 |
| Sam Gamgee, 58 M, 14 sessions | 226 × 13 → 284 × 11 |
| Merry Brandybuck, 54 M, 19 sessions | 236 × 15 → 298 × 12 |
| Frodo Baggins, 45 M, 2 sessions | 230 × 15 (one set; he is new) |
| Arwen Evenstar, 81 F, 8 + **304** prior | 148 × 7, and it barely moves |

Arwen is the one to look at twice. A model that only knew her age would have
had an 81-year-old opening lighter than a sedentary 81-year-old who had never
trained — the opposite of the point she is in the roster to make. Twelve years
of training is worth a quarter on capability and, more importantly, means she
does **not** get a novice's opening: she starts where she left off, at eight
reps, and her grid is flat because she is not learning anything.

### The numbers are ours, not Max Strength's

`DEMO_LOADS` is **not a company standard and must never be shown as one.** The
real table is `MSF - Suggested Starting Weights.xlsx`, which is Drive-only —
`docs/msf-academy/README.md` says so, and nothing in the committed corpus gives
a per-machine starting load. These are considered demo figures in the catalog's
own relative order, laid out in the shape of the **empty**
`standardWeights: { Beginner, Intermediate, Advanced }` slot on a catalog
machine, so the real numbers drop straight into the catalog when they arrive
and this table can be deleted in favour of reading them.

## Tests

`demo-mode.test.ts` (recognising and guarding), `access.test.ts` (who may do
what, and the realm rule), `seed.test.ts` (the documents themselves),
`week.test.ts` (the standing week, the ids that never orphan, the wall clock
across the change to standard time, and the fields the rules require),
`loads.test.ts` (the stack, the table, the rep bands and the progression),
`leaks.test.ts` (the two above), `DemoBanner.render.test.tsx`. Plus 13
assertions in `tests/firestore.rules.test.ts`, which need the emulator.

## The roster earns its place

A demo studio full of interchangeable people proves nothing. Between them these
six cover the whole app:

| Client | | Teaches |
| --- | --- | --- |
| Eowyn Rohan | 72 F, 42 sessions | a long clean journey — the grid at its best |
| Sam Gamgee | 58 M, rough sets | mixed rep quality, the red kaizen mark, the machine note |
| Rosie Cotton | 68 F, **3 left of 48** | the renewal conversation, and the pipeline |
| Frodo Baggins | 45 M, 2 sessions | brand new — first set-up, honest empty states |
| Arwen Evenstar | 81 F, **304 before Journey** | the migration: her profile reads 312, never "new" |
| Merry Brandybuck | 54 M, **43 days away** | the attendance anomaly a leader catches on a Monday |

Arwen is the most important client in the demo. She is
`docs/business/migration-and-prior-history.md` on one screen, and the answer to
"did we lose twelve years of records".

**Demo trainers get their own records** (AJ, Sep 20) rather than demo sessions
being coached by the real team. `trainers` is shared across studios and is not
studio-scoped, so a demo session coached by a real trainer would land on that
person's real career totals — with demo trainers, the rollups write to demo
trainer documents and the leak closes itself, with no Cloud Functions change.
It also means the studio-leader half of the app (Team, Staff & Roles, the
Overview's team panel) has somebody on it, which is exactly the half a studio
leader is being shown.

**The names** are Lord of the Rings, from the **films** rather than the books,
using the most ordinary names the Fellowship has — Frodo, Sam, Merry, Pippin,
Rosie — and, where the films leave a character with no surname, the name the
films themselves attach: Arwen *Evenstar*, Éowyn *of Rohan* (Rohan is an
ordinary surname in its own right), Aragorn *Strider*. A demo can be a little
silly; it just must not be a joke, so Gandalf and Legolas are out on AJ's word
and so is every title. A test enforces it. Every email is `@demo.invalid`, a
reserved TLD (RFC 2606) that can never route anywhere.
