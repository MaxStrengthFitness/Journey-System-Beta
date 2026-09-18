# The migration, and history that happened before Journey

**Read this before building anything that counts, dates, averages or trends a
client's history.** It is the single assumption most likely to make a screen
lie.

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

## Open

- The FileMaker export's shape decides how much can be imported and whether
  per-machine history comes with it. Until it arrives, `importedCount` stays 0
  everywhere and every prior history is a bare number.
- Machine-level prior history has no record yet. A client may have used a
  machine four hundred times and Journey's `machineStats` will say zero. The
  Programming tab's "never tried" is unsafe during migration for this reason.
