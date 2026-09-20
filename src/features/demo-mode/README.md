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

This is the part a generated history gets wrong by default, and gets wrong in
the way that would embarrass the demo. A naive "+5 lb every third session" has
a 72-year-old more than doubling her leg press inside a year.

What really happens here (AJ, Sep 20 2026): clients train **twice a week for
twenty minutes**, one set to failure, and they are typically **over forty**.
So most sessions the weight does not move at all; when it does it moves **2 to
6 lb**, and not often; and the only large corrections are early, while the
trainer is still **finding** the client's working weight for that machine —
those can be up to 20 lb, because the starting guess was a guess.

Two things the model has to get right beyond the rates:

- **Routines alternate A and B, and a machine lives in only one of them.** A
  client with 45 sessions has performed each machine about 22 times, not 45.
  Every rate is per performance of that machine.
- **The increment scales with the load.** A flat 2-to-6 lb is right on a leg
  press starting at 160 and nonsense on an overhead press starting at 15,
  where six pounds is a forty per cent jump no trainer would make. Five per
  cent of the starting load lands inside AJ's band on every machine in the
  catalog; the finding correction is a fifth of it, capped at 20.

The result reads like a real client: `50 → 50 → 50 → 50 → 50 → 50 → 50 → 50 →
50 → 50 → 50 → 50 → 50 → 50 → 53 → 53 → 53 → 53 → 53 → 53 → 53`. Six tests
police it, including one that fails if weights move on more than 30% of
performances and one that fails if anybody doubles.

## Tests

`demo-mode.test.ts` (recognising and guarding), `access.test.ts` (who may do
what, and the realm rule), `seed.test.ts` (the documents themselves),
`week.test.ts` (the standing week, the ids that never orphan, the wall clock
across the change to standard time, and the fields the rules require),
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
