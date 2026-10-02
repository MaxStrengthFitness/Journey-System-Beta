# The migration, and history that happened before Journey

**Read this before building anything that counts, dates, averages or trends a
client's history.** It is the single assumption most likely to make a screen
lie.

## Oct 2 2026: no FileMaker — make the app work without it

AJ, Oct 2 2026: **"we need to be smart about this and stop hoping we get the
filemaker data and start being realistic and going 'well lets just make the
app work without it'. it will only take a few weeks to start getting real
data so thats okay."** And: "we dont need to know WHEN people joined journey.
we just need to know how many sessions they have TOTAL and when was their
first session."

This overrides the FileMaker sections below wherever they conflict:

- **Total sessions = sessions before Journey + Journey's** (`src/lib/session-total.ts`).
  Before Journey is guessed from Mindbody's visit count (already stored by the
  sync; no new Mindbody call), less the sessions Journey logged, and a trainer
  confirms or corrects it once on Notes & Profile → Account: "About 306 before
  Journey (from Mindbody)", **Confirm** or **Change**. Confirming writes
  `client.priorHistory` with source `mindbody`, who confirmed and when.
- **Until it is confirmed**, the Hub card, the profile header and the briefing
  show Mindbody's guess as her total ("#312"); the peek and the briefing say
  "from Mindbody, not yet confirmed". **Milestones** (every 25th on the
  briefing, the Hub's milestone list, "first session") wait for a confirmed
  total, or for a client whose whole story is in Journey. Where Mindbody has
  said nothing, a screen says "#6 in Journey".
- **Client since = her first appointment** (Mindbody's `firstAppointmentDate`),
  shown as from Mindbody until a trainer confirms or corrects it; anniversaries
  wait for a confirmed date (`src/lib/client-since.ts`).
- **Sessions left and sessions recorded are different numbers and are never
  mixed.** Left is the contract's (Mindbody). Recorded is visits. "A client
  could have 42 sessions in their package but only have 40 sessions by the end
  of their package due to late cancels." Late cancels are tallied beside
  visits ("40 sessions · 2 late cancels"), never inside them.

## What is actually happening

Journey is not a fresh start. The original Max Strength studio has been open
for **over twelve years** — longer than the FileMaker system it currently runs
on, which itself replaced something earlier. Journey is the third system these
clients' histories have lived in.

The rollout is a **long migration, not a launch**:

1. **Beta (now).** A few studios test Journey while FileMaker stays live.
2. **Migration (months).** Studio by studio, trainers move onto Journey.
   Throughout this period a studio's roster is a mix of:
   - brand-new clients with a real session 1 in Journey,
   - clients with ~50 sessions behind them,
   - clients with **several hundred** sessions behind them.
3. **Steady state.** FileMaker is discontinued. New clients start at 1 in
   Journey and the mix disappears — but the long-standing clients keep their
   prior history forever.

**The FileMaker export has been requested and not yet received.** How much of
it can be migrated, and in what shape, is unknown. The working assumption is
that *some* old sessions will be imported "within reason" and the rest will
exist only as a number.

## The rule this forces on every screen

> **A client's history did not begin when Journey first saw them.**

An empty Journey history means "we have no detail here", never "this never
happened". This is the same instinct as the existing **"In Journey since"**
rule and **"attendance before a studio's first synced booking is unknown, not
zero"** — generalised, because during migration it applies to almost every
client at a studio, not to an edge case.

Concretely, a screen must not:

- call a client new, or say "first session", off a low Journey count;
- draw a trend, a pace or an average across a window that starts at the
  cutover and present it as the client's whole story;
- say "never tried" about a machine when the client's detailed history is in
  FileMaker;
- celebrate a milestone ("Session 50") computed from Journey's rows alone.

## `client.priorHistory` — the record of what came before

One optional record on the client document, `src/lib/prior-history.ts`:

| Field | Meaning |
| --- | --- |
| `sessions` | Total completed sessions before the cutover, as recorded. **Never changes** once set — it is what a human stated. |
| `importedCount` | How many of those now also exist as real session documents in Journey. Starts at 0. |
| `from` | First studio day the prior record covers, when known. Nullable — for a twelve-year client nobody may know. |
| `through` | The last studio day the prior record covers. **Journey owns everything after this date.** |
| `source` | `filemaker` · `paper` · `trainer-estimate` · `other` |
| `note` | Free text: where the number came from, what it excludes. |
| `recordedAt` / `recordedById` / `recordedByName` | Who said so, and when. |

### The one arithmetic rule

```
total sessions = (completed sessions in Journey) + (sessions - importedCount)
```

`sessions - importedCount` is the part of the prior history that exists **only**
as a number. Anything imported has become a real row and is counted by Journey
itself, so it is subtracted here to avoid counting it twice.

**Any importer of historical sessions MUST raise `importedCount` by exactly the
number of session documents it created.** That is the whole contract; get it
wrong and every client's total drifts. `recordImportedSessions()` in
`src/lib/prior-history.ts` is the one way to do it.

### Why an offset and not a manual total

The profile reconciles `client.sessionCount` against a live aggregation count
on every open. Before this, a trainer's manual session-count edit was silently
reverted by that reconciler the next time the profile opened — two writers, one
field, and the automatic one always won.

Now they own different things and never collide: **the reconciler owns what
Journey can see, the prior record owns what it cannot.** The manual edit writes
`priorHistory`, and `client.sessionCount` is the sum — the number a trainer
would say out loud.

### Where a person records it

**Sessions before Journey**, on the client's profile: the line under the
count on the header's Completed sessions tile — "412 before Journey ·
FileMaker", or "Add sessions before Journey" when nothing is recorded yet
(Sep 24 2026; before that the editor existed but nothing opened it). Anyone
who can edit the client — a trainer or leader at their home studio, or an
administrator, exactly the `clients/{id}` update rule — can change it. Anyone
else who can open the profile can read it, with who recorded it and when.
The same door is on **Notes & Profile → Account**, under the contract history
(whose first tile is the years before Journey): the header's own, with its
words and its rule, opening the same editor (landing, Sep 24 2026).

The editor asks for the four things a person can know: how many, counted up
to when, from where, and a note. `statePriorHistory()` in
`src/lib/prior-history.ts` turns them into the record and carries
`importedCount` and `from` over untouched, so re-stating a total never
un-counts an import.

### Session numbering

Sessions are numbered from the total, so a long-standing client's next session
is #413 rather than #4. A trainer reading a session card should see the number
the client would recognise.

## What a screen should say

- **Has a prior record:** show the total, and say where it splits — *"413
  sessions · 412 before Journey (FileMaker, through 12 Sep 2026)"*. The split
  is not a footnote; it is what stops a trend being read as the whole story.
- **No prior record, long-standing client:** this is the dangerous case, and it
  is indistinguishable from a genuinely new client. Prefer "not enough data
  yet" over a confident figure until somebody records the prior history.
- **Genuinely new client:** say so plainly. Session 1 means session 1.

## The cutover date, and the two things a screen may say

Machine-level prior history will not be imported — a client may have used a
machine four hundred times in FileMaker and Journey's `machineStats` will say
zero. So the app never claims they have not, for anyone whose history predates
their studio moving onto Journey. AJ, Sep 2026:

| The client | What a screen says about a machine |
| --- | --- |
| Started on Journey (whole history is here) | **"Never attempted"** — a real fact about them |
| Has history before the cutover | **"Nothing recorded"** — a fact about our records, not about them |
| Nobody has said which | **"Nothing recorded"** — the cautious wording wins |

**`studios/{id}.journeyCutoverDate`** is the studio's day it moved onto Journey
(yyyy-mm-dd). It is per studio because the rollout is staggered, and it is
expected to be pushed while beta runs — an example date AJ gave is
`2027-09-18`. A client whose first session predates their studio's cutover is a
**migration client**; everything before that day is in FileMaker and Journey
knows it does not have it.

Absent a cutover date, every client is "unknown" and gets the cautious wording.
That is the right default: during migration, unknown and migration look
identical and only one of the two wordings is safe.

**"Started on Journey" is known from Mindbody's visit count, never from the
date alone** (the cost plan, Sep 26 2026). A first Journey session on or after
the cutover proves nothing by itself: it is exactly the twelve-year client
whose first Journey session fell in the studio's first week. So a client reads
as a whole story only when Mindbody's lifetime count (from a Master Sync, the
pre-launch sync or the nightly sync of anyone booked who never was) says she is
new; with no count she is "unknown". Before Sep 26 the date alone answered
"complete", on the belief that every schedule pull carried the count; it does
not (`lib/prior-history.ts`).

**Mindbody's count includes the sessions Journey logged** (hub fixes, Oct 1
2026). Every Journey session was booked in Mindbody, so a client who started
on Journey reached six visits after about five sessions and, the next time the
webhook refreshed her count, read as "partial" and lost her "#N" on the Hub.
The line is now drawn on the visits Journey can't account for: Mindbody's count
less Journey's own sessions (`client.sessionCount`, which with no prior record
is exactly what Journey can see), and only once she has a Journey session
(`visitsBeforeJourney`). A Journey count that is stale or unknown takes off
less, so the mistake it can make is the cautious one. Known limits: a visit
count Mindbody refreshed long ago, and Journey sessions on the other Mindbody
site, take off a few sessions too many; a prior record outranks both.

This also retires `machineStatsBackfilledAt` as a gate. That marker existed
because `machineStats` only counts sessions since the running total existed —
true for a migration client, and those clients no longer get a number quoted at
them at all. For a client whose whole history postdates the cutover the rollup
IS the whole story, so the number is quoted without waiting for a backfill
somebody has to remember to run.

## Open

- The FileMaker export's shape decides how many whole sessions can be imported.
  Until it arrives, `importedCount` stays 0 everywhere and every prior history
  is a bare number.
- Each studio's `journeyCutoverDate` has to be set when that studio goes live.
  Until it is set, that studio's clients all read as "unknown".
