# Every number has a reader

AJ, Sep 2026: *"we need to evaluate all the data we collect and make sure each
piece of data is being funneled through at least one metric viewer. numbers are
data and data is money."*

That is a standing rule, not a to-do:

> **A field we write must be read by at least one screen, report or job. A
> field nothing reads is not data — it is storage with a maintenance cost.**

Two consequences, and they point in opposite directions on purpose:

1. **A write with no reader is a bug to fix, not a field to delete.** The
   default response to "nothing reads this" is to build the screen that should.
   Deleting is the answer only when nobody can name the question the field
   answers.
2. **A screen with no data behind it is worse.** Do not invent a reader for a
   field that is wrong, stale or unsafe to show — fix the field first.

`docs/rounds/2026-09-17-fluidity-audit.md` §3.9 is the current list of writes
with no reader. It is a work list.

---

## What the session snapshot is for

Every completed session stores who the client **was at that moment**:
`clientAge`, `clientOccupation`, `clientIsRetired`, `clientActivityLevel`,
`clientClinicalProfile`. Nothing reads them yet, and that is the gap — not the
fields.

They exist so the company can answer questions no single client's history can:

- **A starting point for a new client.** What weight do people of a similar age
  and activity level actually start at on this machine? A trainer's first
  session stops being a guess.
- **Which machines suit whom.** Which machines a cohort performs well on, and
  which they struggle to get in and out of.
- **Pace.** The average strength gain per cohort, so "is she on track" has an
  answer that is not the trainer's memory.
- **The studio's own story.** *"Our retired clients see an average strength
  increase of x%"* — a real claim, from real records.

A snapshot on the session is the right shape for this, because a client's age,
occupation and activity level **change**. Reading today's client document to
explain a session from three years ago would quietly re-label the past. This is
the same instinct as storing a session's legal name rather than resolving it
later.

### What is missing before any of that works

- **Height, wingspan and gender are not on the session snapshot.** Machine fit
  already treats height and gender as the axes that matter
  (`src/features/machine-fit/`). If cohort analytics are going to use them, they
  belong in the snapshot too, at the value they had that day.
- **There is no cohort reader.** No screen, no job. Until one exists the fields
  are accumulating quietly, which is fine — they cost nothing and they cannot be
  backfilled later.

---

## The rules any cohort metric has to keep

These are not new; they are the app's existing rules, applied to cohorts.

**1. A named minimum sample, or the screen says "not enough data yet."**
Sentences, not scores. A confident wrong number is worse than a missing one.

**2. Cohort cells are k-anonymous at five.** `machineTrends/{id}.fit` already
uses `CELL_MIN_CLIENTS = 5` because a cell of height × gender in a document any
trainer can read is otherwise one identifiable person. A cohort of
"retired · 68 · Willoughby" is far narrower than that. **Never add a third key
to a cell**, pool a thin one, and hold back what is still thin. The same code
and the same floor.

**3. `clientClinicalProfile` is health data.** It may appear in an aggregate; it
may never appear in a document a signed-in trainer can read against one person.
`progressReports`, `journalEntries` and `machineTrends` are all readable by any
signed-in user — no clinical snapshot may be copied into them, the same rule
InBody already follows.

**4. Never rank people inside a studio.** Recognition, never ranking. A cohort
comparison is about the cohort; it does not become a leaderboard of trainers or
clients. Studios may be compared.

**5. A migration-era cohort is partial by definition.** During the FileMaker
migration most clients' early sessions are not in Journey, so a "first session
weight" cohort is drawn from whoever happened to start after their studio's
cutover. Any cohort claim must say what it is drawn from — see
`migration-and-prior-history.md`.

---

## The audit this implies

Each field we store should be traceable to a reader. When a round adds a field,
the round says which screen reads it. When a round finds a field nothing reads,
it either builds the reader or records why the field should go.
