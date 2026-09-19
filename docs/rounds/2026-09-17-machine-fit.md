# Machine fit — predictive set-up, bulk entry, the passive check and the Kaizen report — Sep 17 2026

Branch `machine-fit`, off `sep17-history-edit-ipad` at `4ed501b` (the history-editing
docs). Five phases, one commit each, each typechecked on its own so any phase can
be reverted alone; then one commit of fixes from an independent review, then this
documentation. **Nothing is on `master`.**

AJ's brief, in his words:

> "A trainer has to individually click into up to 30 different machine profiles
> for a single client to set the starting weight, repetitions, and highly
> specific machine settings… I want to build a 'Predictive Setup & Bulk
> Configuration' feature."

and the part he called the one to get right:

> "We may never be able to export the FileMaker data. Worst case trainers
> manually enter old settings — that needs to be quick and intuitive, as few
> clicks as we can."

Five things were asked for: settings suggested as **cohesive clusters** (move the
seat and the pad has to move too), an **adjustable tolerance** (exact height
first, then ±1–2", on one factor or several, wingspan included), a **passive
check** that never forces a setting but marks one that is unusual for a client's
build, **Kaizen analytics in two tiers** (light and live for a studio, heavy and
company-wide for administrators), and a **bulk screen** with a fast manual
fallback that can read FileMaker's shorthand (`Gap:4 Seat:3`, `G:4,S:3`,
`Gap:6, Handles:in, seat: up, Chest:3 PILLOW`, `GAP:4, S:4 C:4 H:W`).

Three decisions AJ made before the work started:

- **Build the whole round** — the design and the working code, not a proposal
  to come back to.
- **OK to all four additions to Firestore** (listed in §1). All additive;
  nothing existing changes shape.
- **"Accept all" fills drafts, then one Save.** Accepting suggestions fills the
  boxes on screen and writes nothing. An accepted value is saved marked
  `suggested`, and **does not count as evidence for anyone else until that
  client has actually trained on the machine.**

The feature is called **machine fit** in the code (`src/features/machine-fit/`):
"fit" is how a machine is set for a body.

---

## 1. Data structure

### What was already there, and what it could not do

`clientMachineSettings/{clientId}_{machineId}` holds one client's settings on
one machine, keyed the machine's own way (`"Back Pad": "6"` on an old machine,
`"back-pad": "6"` on a catalog one). Since the cost round a weekly job builds
`machineTrends/{machineId}`: for each setting and each value, how many clients
of each height use it. The Settings card has offered a per-field suggestion
from that since Sep 16.

Per field is the problem. The most common seat and the most common pad, picked
separately, can be a pair nobody in the building uses — the short clients' seat
beside the tall clients' pad. And to ask "who like her is set to what, on every
machine, right now" there was no read that was not thirty queries per client.

### The four additions

**1. `clients/{id}.wingspan`** — optional, typed like height (`"66"`, `"66 in"`,
`5'6"`). It sits beside Height on the record's General section.

**2. Two optional fields on `clientMachineSettings`:**

```ts
interface ClientMachineSetting {
  // …everything it had…

  /** Where each saved value came from, keyed like `settings`. Absent = typed. */
  sources?: Record<string, "typed" | "suggested" | "legacy">;

  /** "Right for this client": a review of a value the check marked. Keyed by
      the NORMALISED field key; tied to the value, so it lapses if the value changes. */
  fitAcks?: Record<string, { value: string; by: string; byName: string; at: string; note?: string }>;
}
```

`typed` — a trainer chose it. `suggested` — accepted from a suggestion and not
changed since. `legacy` — copied from the FileMaker chart (Quick entry, the
shorthand box, a pasted chart).

**3. The studio index — `studios/{studioId}/machineFit/{machineId}`.** One
document per machine per studio: who is set to what.

```ts
interface MachineFitDoc {
  machineId: string;
  studioId: string;
  rows: {
    [clientId: string]: {
      s: Record<string, string>;                    // settings, NORMALISED keys and values
      src?: Record<string, "suggested" | "legacy">;  // only the non-"typed" ones
      a?: Record<string, string>;                    // reviews that still apply: key → value
      t: number;                                     // when saved, ms
    };
  };
  updatedAt: Timestamp;
  rebuiltAt?: string;                                // set by the rebuild script
}
```

Three things about it are decisions:

- **It holds no body data.** No height, no weight, nothing from InBody. A row is
  joined to the client's record **at read time**, from the studio client list
  the app already has in memory (`useStudioRoster`). So a corrected height is
  right everywhere at once with nothing to re-index, health data is never copied
  out of the client record, and the document stays small.
- **One row per write.** Every save writes exactly one key
  (`rows.<clientId>`) by field path, so two iPads setting up two clients on the
  same machine never overwrite each other, and a cleared setting really goes
  (the row is replaced, not merged). The rules enforce it:
  `rows.diff(old).affectedKeys().size() <= 1`.
- **It is a copy.** `clientMachineSettings` is the record. The index write is
  caught and never fails a save, and `scripts/rebuild-machine-fit.ts` rebuilds
  every studio's index whole from the record.

Readable and writable by the people who work at that studio
(`writesForStudio(studioId)`), and nobody else.

**4. The company tier, from the weekly job.** Two outputs per machine:

```ts
// machineTrends/{machineId}.fit — any signed-in trainer
interface CompanyFitBlock {
  clients: number;
  heldBack?: number;          // left out to keep every cell anonymous (below)
  studios: number;
  cells: { [cell: string]: { [signature: string]: number } };
  //        "64|f"            "gap=0;seat=5"           6
  builtAt: string;
}

// kaizenReports/{machineId} — administrators and founders only
interface KaizenReport { /* §4 */ }
```

A **cell** is a height and a gender; a **signature** is a whole set-up; the
number is how many clients. No ids, no studios. It is what a brand-new studio
leans on until it has clients of its own.

**Every published cell describes at least five people** (`CELL_MIN_CLIENTS`).
Without that rule nearly every cell in a small company is one person — "the
6'7" man: Gap 0, Seat 1" — in a document any trainer at any studio can read. A
gender too small at a height is pooled with the unknowns (`64|x`); if the pool
is still too small the whole height is pooled; a height with fewer than five
clients company-wide is left out and counted in `heldBack`. It comes back by
itself as the company grows — and four clients at a height could never have
reached the suggestion engine's minimum of five anyway.

### The vocabulary rule

Inside the engine every setting key and value is **normalised**
(`normalizeSettingKey` / `normalizeSettingValue`, shared with machine trends):
`"Back Pad"` and `"back-pad"` are one field, `"Seat 6"` under Seat is `6`,
`6.5` is `6_5`, and — new this round — `2.`, `2.0` and `02` are all `2`. Screens
translate back to the machine's own spelling at the edge
(`ui/field-values.ts`). That is what lets the old label-keyed machines and the
catalog's slug-keyed ones count together.

---

## 2. Algorithm

All of it is pure — plain objects in, plain objects out, no Firebase, no React —
so it is tested on plain objects (231 tests) and the weekly job bundles the same
code the screens run.

### 2.1 Who counts as "similar": the tolerance ladder (`cohort.ts`)

```
ring 0   5'7"            2 clients
ring 1   5'6" – 5'8"     4 clients
ring 2   5'5" – 5'9"     9 clients   ← stops here (minimum 5)
```

Start as tight as the match allows, count, and widen **one step at a time —
every switched-on factor together — until the band holds five clients** or the
ladder runs out. Stopping at the *first* ring that is big enough is the whole
trade: the tightest band that can still be trusted. A wider band is never used
just because it is there.

Each factor has its own tolerance (`match-spec.ts`):

| Factor | Default | Starts at | Step | Steps |
| --- | --- | --- | --- | --- |
| Height | **on** | exact | 1" | 3 |
| Wingspan | off | ±1" | 1" | 3 |
| Weight | off | ±10 lb | 10 lb | 3 |
| Age | off | ±5 yr | 5 yr | 3 |
| Body fat (InBody) | off | ±3 pts | 3 | 3 |
| Muscle mass (InBody) | off | ±5 lb | 5 lb | 3 |
| Gender | off | same | — | — |

A trainer changes them on the Setup screen's **Similar to** panel; the choice is
remembered on that iPad. Three rules inside it:

- A factor that is on but that **this client** has no value for is set aside and
  said so ("No wingspan on file for this client, so it was left out of the
  match"). It does not empty the band.
- A **sample** with no value for a factor in use is left out. An unknown height
  is not evidence about 5'7" clients.
- **She is never in her own comparison group.** At the studio tier by id; at
  the company tier, where cells are anonymous, one client who agrees with her on
  every setting they share is taken out of her height's cell (`withoutSelf`).

### 2.2 Clusters, not averages (`clusters.ts`)

The set-up is built the way a head trainer would say it out loud:

> "People her height mostly sit at Seat 3. **The ones at Seat 3** mostly use
> Pad 2. **The ones at Seat 3 and Pad 2** are mostly at Gap 0."

Each pick narrows the group the next pick is read from, so every value offered
sits beside the others in real clients. The field the group **agrees on most**
(by share, among fields at least half the group has filled in) goes first,
because narrowing by a coin-flip splits the group for nothing. When the narrowed
group drops under three clients the chain stops narrowing and says so.

**Anything the trainer has already set is a fact, not a suggestion, and the
chain starts from it.** Type Seat 4 and the pad offered is the pad of Seat-4
clients — that is what makes the screen re-suggest as they type. If too few
clients her height sit at that seat, the link is read across every height
instead: given the seat, the pad depends far more on the seat than on the height
that chose it.

Why not just count whole combinations? With five fields of eight values the full
combination is almost always unique, and charts rarely have every field filled
in. The chain uses whatever each client has. `seenTogether` still reports how
many similar clients hold the **whole** offered combination — the number a
trainer trusts — and a set-up is only **strong** (eligible for a bulk accept)
when every pick is, *and* at least 30% of the similar clients hold the whole
thing. Four 50% steps is one client in sixteen; "most similar clients sit like
this" has to be true of the set-up, not just of its parts.

A value **nearly everyone uses whatever their build** (Gap 0: 70% of at least ten
clients) is offered even when there is no band to speak of — a client with no
height on file is still going to be at Gap 0.

### 2.3 Two tiers, one answer (`engine.ts`)

The **studio** answers when its ladder found five clients within one step of her
— its own floor, its own habits, the freshest data, and every factor available.
Otherwise whichever tier reached five in the **tighter** band; a tie goes to the
studio. So a new studio starts on company data and moves onto its own as it
fills in, without anyone flipping a switch. The company tier can only match on
height and gender, because that is all an anonymous cell is. A tier only
qualifies when it actually matched on something.

### 2.4 The passive check (`audit.ts`)

It never says *wrong*. It compares each **saved** value with what similar
clients use and, when nobody similar is anywhere near it, marks it "worth a
look" with the evidence attached.

- A **numbered** setting is judged by distance from the middle of the group, in
  notches, scaled by how spread out the group is (a robust z-score: distance ÷
  the larger of MAD × 1.4826 and one notch). Seat 5 when the group runs 3–7 is
  nothing; Seat 9 when the group is all 4s and 5s is worth a look. The scale
  never drops below one notch, and a notch needs two values that more than one
  client is on — one client at Seat 3.75 does not make quarter-steps the scale.
- A **lettered** setting (Handles: In / Out) has no distance, so it is judged by
  share alone, and only called rare in a group big enough for "nobody" to mean
  something (ten).
- A **combination**: two values that are each ordinary but that no similar
  client uses together — the seat was moved and the pad was not.
- **Rare needs a second opinion.** Her comparison group is often six or seven
  people. "None of her six closest matches use Gap 4" is weak when one client in
  ten, at every height, uses Gap 4. So a value is only marked when it is *also*
  rare across the widest band the ladder could have reached. A setting that
  follows height is still rare out there; one that follows nothing is not, and
  gets the faint dot instead. *A confident wrong mark is worse than a missing
  one.*

Two levels and only one is ever counted: **rare** draws the plum diamond and adds
to "n to review"; **uncommon** is a faint dot inside the row. Plum, never red —
red is rep quality's.

A trainer who looks and taps **Right for this client** quiets the mark for as
long as the value stays the same.

### 2.5 The engine cannot learn from its own guesses (`fit-index.ts`)

A value a trainer typed, or copied from FileMaker, is evidence the day it is
saved: a person chose it for that body. A value that was only **accepted** is
not — until `client.machineStats[machineId].lastPerformedDate` is on or after
the day it was saved. Without that rule the engine suggests Seat 3, sees Seat 3
accepted, grows more sure of Seat 3, for ever.

### 2.6 Reading FileMaker's shorthand (`shorthand.ts`)

Journey has one list of setting fields per machine. FileMaker let every chart
spell them its own way. `parseShorthand(text, fields)` is the bridge: it is
**machine-aware** (the same `S` is Seat on one machine and nothing on another),
scores a label against the machine's own fields (the whole name, initials of a
two-word name, a prefix, a single letter with the chart convention as
tie-break), reads `S4`, `S- 8`, `Seat: 5`, `seat up` and `WT:112`, and knows that
the grid prints a label even when the setting is empty (`Gap  S- 8` is an empty
gap and a seat of 8).

**Nothing is thrown away.** Anything it cannot place — `PILLOW`, a label no
field answers to — comes back as `leftovers` and is kept as a note on the
machine. It would rather place too little than guess: a wrong seat is worse than
a seat somebody has to type.

---

## 3. The screens

### 3.1 Programming → Setup (the "Global Setup & Audit View")

A **fourth segment** on the client profile's Programming tab:
Routine A · Routine B · All Machines · **Setup**. Its meta line reads
"12 of 20 set up · 2 to review", with a dot only when a machine she is
*prescribed* has nothing set. Nothing is read until the segment is opened; it
stays mounted afterwards, so drafts survive a look at Routine A.

**One continuous list, in the floor's own order** — the FileMaker grid's order —
and three modes of the same list:

| Mode | For | What a row shows |
| --- | --- | --- |
| **Check** | "is anything odd?" | What is saved. A marked value gets the plum diamond and one sentence — "Seat Angle 2 — none of the 9 clients 5'3"–5'5" at this studio use it. Most use 7 (6) or 6 (2)." — with **Right for this client** and **Adjust**. Machines with nothing saved collapse to one line. |
| **Set up** | a new client | Cells to fill. What similar clients use is shown as a **placeholder** in each empty cell, with one sentence beside it ("4 of 5 clients use exactly this — clients 5'4" at this studio"), **Use all**, and **Why** (the ladder, the order it was reasoned in, the distribution, use-one-value picks). **Accept strong suggestions (14)** fills every strong row at once; **Undo accept** takes it back. |
| **Quick entry** | copying a chart | The same cells, plus an **abc** box per row that reads a line of shorthand, and **Paste a chart** for a whole block. |

It opens on **Check** once everything she is prescribed is set up, and on
**Set up** otherwise — a trainer opening this before a first session is there to
fill in.

The rules the screen keeps:

- **Nothing is a value until someone taps it, and nothing is written until
  Save.** A suggestion is a placeholder. "Accept strong" fills drafts. One Save
  writes every changed machine in one batch (`setup-save.ts`), with the same
  documents, fields and audit rows the Settings card writes — a machine set up
  here is indistinguishable from one set up there. Changing a value that was
  already saved asks for a reason, once; a first-time set-up or a chart copy
  does not.
- **Passive.** The check never blocks, never pops up, never leaves this
  segment: no bell, no Hub marker.
- **Inline panels, no dialogs** — nothing for the iPad to get stuck behind.

**The docked keypad.** Thirty machines is about ninety cells, and with the
iPad's own keyboard every cell costs a tap, a keyboard sliding over half the
screen and a hunt for the number row. The pad sits at the bottom, never covers
the row being typed into, and offers exactly what the active cell takes: digits
for a numbered setting; the options as keys for a setting that has them; the
**words other clients use there** (In, Out, D) for an old free-text field; and
**Back / Next** so a trainer reading down a chart never aims at the next box.
Like a spreadsheet, the first key replaces what was there. A single-key field
(a scale that stops below ten) moves on by itself. **abc** hands one cell to the
system keyboard. On by default on a touch device; a hardware keyboard works the
whole time.

Component map (`src/features/machine-fit/ui/`):

```
SetupView            the shell: modes, filter, the match, drafts, the cells in reading order, Save
  useSetupModel      everything a row shows, derived in one place (rows, offers, audits, counts)
  setup-draft        the drafts reducer — module scope, closes over nothing
  MatchPanel         "Similar to": the factors and their ceilings, inline
  PastePanel         paste a whole FileMaker chart
  SetupRow           one machine: cells, the one-line suggestion, Why, flags
  QuickPad           the docked keypad
  sentences          every sentence, pure and tested
  field-values       between the machine's spelling and the engine's
  open-hint          "open her Setup on Check" (from the report, below)
```

### 3.2 Operations → Machine fit (the Kaizen report)

The Setup screen looks at one **client** across every machine. This looks at one
**machine** across every client — what AJ asked a head trainer to be able to
see: *"what clients who are 5'7" are set to versus 5'4"… and for each setting,
how many clients use it, what body types and their average height."*

| Panel | Says |
| --- | --- |
| **Worth a look** *(this studio only)* | The clients set somewhere nobody of a similar build is, and not yet reviewed — by name, with the sentence. A tap opens **that client's Setup, on Check**. |
| **What follows what** | Whether each setting can be predicted from a client's build — in words: "Seat follows height closely: about one lower for every 2 inches of height (73 clients)", or "Gap does not follow height on this machine". Never a coefficient. A measure that only echoes height (weight, usually) is not credited. |
| **By height** | Rows are height bands as narrow as the data allows (5'4" where there are plenty, 5'11"–6'0" in the tails), columns are the machine's settings: the most used value, "6 of 9", and the runner-up. A band under five clients says *not enough data yet*. |
| **By setting** | For one setting, each value: how many clients, a bar, and who they are — "avg 5'7" (5'0"–6'3") · 39 women, 25 men · avg 165 lb · avg 57 yr". An average needs five clients behind it. |
| **Set-ups seen together** | Whole combinations more than one client shares — the settings that move together. |
| **By studio** *(All MSF only)* | Per studio: set up, compared, set somewhere unusual — and where a studio's usual value differs from the others' on a setting that does not follow height ("mostly Gap 2 here, mostly Gap 0 at the other studios: a different machine, a different habit, or the same thing written two ways"). Counts, never a ranking. |

Two scopes on one screen: **This studio** is live, for studio leaders and up,
built in the browser by the same function the weekly job runs. **All MSF
studios** is the weekly report, for administrators and founders only (the rule
is `isSuperAdmin()`); it names studios and never a client.

---

## 4. Edge cases

| Case | What happens |
| --- | --- |
| **A brand-new studio, nobody set up** | The studio tier is empty (`[]`, read fine), so the company tier answers. If that is thin too: "Nobody is set up on this machine yet, so there is nothing to suggest from." Quick entry works with no data at all. |
| **A few clients at a new studio** | The ladder says "Only 3 clients of a similar build are set up on this so far" rather than quoting three people; values nearly everyone uses (Gap 0) are still offered from the company. As the studio fills in, it takes over by itself. |
| **No height on the client's record** | Nothing to match on: "Add a height to this client's record". Universal values are still offered. The check says the same, not "fine". |
| **A factor is on but she has no value for it** | Set aside and said so; the rest of the match still runs. |
| **A very tall or very short client** | The ladder widens to ±3" and stops. Thin is thin: it says how many it found. At the company tier, heights with fewer than five clients are not published at all. |
| **Enough similar clients, nothing in common** | "6 clients of a similar build are set up on this, but no two of them use the same value." |
| **The read failed** | *Unknown, never empty.* "What similar clients use could not be loaded just now." The studio tier failing falls through to the company tier; the company report failing says so. |
| **Still loading** | Rows say nothing until both tiers have answered. |
| **Interdependent settings** | The chain (§2.2) and the combination flag (§2.4). |
| **The trainer disagrees with the suggestion** | They type over it; it is saved as `typed` and is evidence from that day. Nothing is ever forced. |
| **An accepted suggestion nobody has trained on** | Saved, shown, checked — but not evidence for anyone else yet (§2.5). The report says how many such clients there are. |
| **An unusual setting that is right** | **Right for this client**: one tap, tied to the value, copied onto her index row so the studio report leaves it alone too. |
| **Old label-keyed machines beside catalog ones** | Normalised keys (§1). |
| **Free-text values** ("up", "D", "In") | Counted by share like any lettered value; offered as one-tap keys on the pad. |
| **Half and quarter steps** | `6.5` is `6_5`; a notch is only a notch once two such values are in real use. |
| **Shorthand it cannot read** | Kept as a note on the machine, never dropped; an ambiguous label says so and places nothing. |
| **Two iPads on one machine** | One row per write, so two clients never collide. Two trainers on the *same* client and machine: last save wins in the record; the index may briefly hold the loser's row until the next save or a rebuild. |
| **A client moves studio** | Her row at the old studio is ignored (she is not on that list any more) and her new studio gets one at her next save, or at a rebuild. The weekly job counts her once, at her home studio. |
| **A trainer covering at another studio** | Saving a visiting client's settings works; the *index* write may be refused by the rules (not their studio) and is caught. A rebuild heals it. |
| **The legacy importer and the old full-screen grid** | They write settings without touching the index. The rebuild script is the answer; run it after an import. |
| **The weekly job's fit step fails** | The trends are still written; last week's fit blocks are carried over; the reports are left as they were. |

---

## 5. What an independent review found

Before the documents were written the branch was handed to a separate reviewer
with the code and the constraints but not my view of it. It reproduced eight
defects, all fixed in commit `898074f`, each with the test that would have
caught it. The two that mattered most:

- **Quick entry could file a value under the wrong field.** The FileMaker grid
  prints Gap with no dash, so an empty gap sits straight in front of the next
  label, and `Gap  S- 8` read as **Gap 8**. Exactly the failure this feature
  cannot afford, in exactly the path built for the worst case.
- **The company block was nearly one row per person.** No ids and no studios,
  but a height, a gender and a whole set-up with a count of 1 is a row about a
  person, in a document any trainer can read. Now k-anonymous at five (§1).

The others: one client on a quarter-step shrinking "one notch"; an unmatched
company crowd beating a studio cohort that had really matched; leave-one-out at
the company tier quietly removing nobody; the chain narrowing by head count and a
dead heat being settled by row order; a failed read reported as "nobody is set
up"; and "only 6 clients… not enough" contradicting the minimum of five.

---

## Files

```
src/features/machine-fit/
  types.ts  factors.ts  match-spec.ts            the body, the match
  cohort.ts                                       the tolerance ladder            (10 tests)
  clusters.ts                                     the conditional chain           (18)
  audit.ts                                        the passive check               (20)
  engine.ts                                       two tiers, one answer           (23)
  fit-index.ts                                    the two stores as plain data,
                                                  what counts as evidence,
                                                  the anonymity floor             (22)
  kaizen.ts                                       the report                      (39)
  company.ts                                      the weekly job's fit step       (6)
  shorthand.ts                                    FileMaker's shorthand           (25)
  setup-plan.ts  settings-write.ts                what one Save writes            (11)
  rebuild.ts                                      the rebuild plan                (4)
  weekly-job.test.ts                              the job against an in-memory Firestore (5)
  fit-store.ts  setup-save.ts                     the Firestore half
  fixtures.ts                                     a Compound Row studio, for tests
  ui/                                             the Setup screen (3.1)          (41, 11 mounted)
src/features/admin/machine-fit/                   Operations → Machine fit (3.2)  (9 mounted)
server/machine-trends-job.ts                      + the company fit step
server/machine-fit-company.ts                     reads every studio's index
server/machine-fit-rebuild.ts                     rebuilds the index from the record
scripts/rebuild-machine-fit.ts                    …from the PC, dry run by default
firestore.rules                                   machineFit, kaizenReports
tests/firestore.rules.test.ts                     six cases
src/features/equipment/mutations.ts               saveSettings: sources, the index row, and a fix —
                                                  `merge: true` never removed a cleared setting
src/features/equipment/useMachineTrend.ts         a failed read is told from an absent document
src/features/machine-trends/trends.ts             "2.", "2.0" and "02" are one value
src/features/client-profile/ProgrammingTab.tsx    the fourth segment
src/features/client-profile/profile-nav.ts        the `setup` view
src/features/admin/AdminDashboardView.tsx             the Machine fit tab
src/components/client-dossier/ClientDossier.tsx   Wingspan, beside Height
src/types.ts                                      wingspan, sources, fitAcks
```

## Verified

- `npx tsc --noEmit` — **11 errors**, the same 11 as the branch it came off.
- `TZ=America/New_York npx vitest run src` — **206 files, 3,268 tests, all
  passing** (was 189 / 3,028).
- `npx vite build` and `npm run build:backend` — clean; the cron still bundles.
- `git ls-files | tr A-Z a-z | sort | uniq -d` — empty.
- The Setup screen and the report were **looked at**, not just tested: a
  throwaway harness mounted both with synthetic studios and they were
  screenshotted in landscape, portrait, light and dark. (That found two bugs no
  test had: the portrait header centring every machine name, and the report
  opening on an empty machine because it chose before the counts arrived.)
- An independent review (§5).
- **Not run: `npm run test:rules`.** The emulator jar's host is blocked from the
  cloud container, so **AJ's run is the one that counts** — and it matters this
  round: a new rules block, six new cases.
- **Not yet on a real iPad.** The docked keypad in particular
  (`inputMode="none"` to keep the system keyboard down) is the thing to try
  first.

## Left for AJ

In this order. Steps 1–2 are safe at any time — the rules only *add* access.

1. **`npm run test:rules`** in PowerShell, from the project folder. If anything
   in the "MACHINE FIT" block fails, stop and send me the output.
2. **`firebase deploy --only firestore:rules`**. Until this is live the index
   writes are refused (and caught — saving still works), so suggestions have
   nothing to read.
3. **Merge and push when you are happy** — the app goes live on the push.
4. **Build the index once**, from the PC:
   `npx tsx scripts/rebuild-machine-fit.ts` (a dry run — read what it says),
   then the same with `--commit`. Every set-up saved before this round is in the
   record but not in the index until this has run.
5. **Build the company tier once:**
   `npx tsx scripts/run-machine-trends.ts` (dry run), then `--commit`. After
   that it rebuilds itself on Sunday nights.
6. **On an iPad:** the walkthrough in `docs/ops/TESTING-CHECKLIST.md`
   (section "Machine fit").

No index deploy, no Cloud Functions deploy.

## Follow-ups

- **The Settings card still uses the old per-field suggestion** (company trends
  by height, no clusters). The engine is ready for it; the card would need the
  studio client list passed down through the machine sheet. Until then a
  machine set up mid-session gets the old suggestion and the Setup screen the
  new one.
- **Reconcile with `beta-prep`.** That branch is a 25-commit refactor that has
  diverged from the one this came off. This round is almost all new files, so
  the conflicts will be in `ProgrammingTab.tsx`, `AdminDashboardView.tsx`,
  `mutations.ts`, `SettingsCard.tsx` and `firestore.rules`.
- **The legacy importer and `WorkoutChartGrid` do not update the index.** Run
  the rebuild after an import; better, have both call `upsertFitRow`.
- **A big studio's index document.** Firestore indexes every leaf of `rows`, and
  a document may hold 40,000 index entries — about 2,500 clients on one machine
  at one studio. Long before that, add single-field exemptions to
  `firestore.indexes.json`:
  `{"collectionGroup":"machineFit","fieldPath":"rows","indexes":[]}` and the
  same for `machineTrends` / `fit`. Left out now to keep this round to one
  deploy.
- **`result.indexed`** from the Setup save is not shown to anyone. If index
  writes turn out to be refused often (covering trainers), say so quietly.
- **Franchise owners and the company report.** It is administrators-only, as
  asked. Widening it is one line in `firestore.rules` and one in the tab.
- **Repetitions.** The brief mentions a starting rep count; Journey has no
  per-machine rep target to set (reps are recorded per set, in a session). The
  Setup screen sets settings and the load.
- **Suggesting a starting load.** Deliberately not done: a load is a coaching
  decision with a safety side, and "clients like her start at 60 lb" is a
  confident number of the kind this app avoids. `machineTrends` has the
  distributions if that changes.
