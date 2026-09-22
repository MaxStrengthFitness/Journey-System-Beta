# The overnight audit — a prompt for a long, unattended run

*Written Sep 22 2026, for AJ to paste into a fresh session and leave running.*

The job: walk the whole app against the standard the project has written down
for itself, before real trainers use it. Find what's broken, what's missing,
what's confusing — **and what questions are worth asking AJ.**

Everything below the line is the prompt. Paste it whole.

---

## Before you use it

- **Give it room.** This is a long run: reading, verifying, then writing. It
  is not a quick pass.
- **It works on a branch and pushes nothing.** No trainer sees anything.
- **It writes to the live database only if you say so** — by default it reads
  and reports, because a read count is cheap and a bad write is not.
- **Dial the fix allowance.** As written it fixes only trivially safe things
  and proposes the rest. If you want it bolder, change that paragraph.

---

```
You are auditing the Journey System before its first real beta with trainers.
This is a long, unattended run: take the time to be right rather than fast.

═══════════════════════════════════════════════════════════════════
1. READ THE STANDARD FIRST — you are measuring against it
═══════════════════════════════════════════════════════════════════

Read these before looking at any code, in this order:

  docs/START-HERE.md          the whole project in fifteen minutes: the three
                              systems, the Hutchins definition and what each
                              clause built, Rank 1-4, the vocabulary, the
                              rules that must never break
  CLAUDE.md                   the working rules and where everything lives
  docs/business/the-floor.md  what a session actually is, minute by minute
  docs/KNOWN-TRAPS.md         what already broke and the rule that came out
  ROADMAP.md                  what is already known and planned — do NOT
                              re-report anything already written there

These are the rubric. You are not inventing a standard; the project has one
and your job is to find where the app does not meet it.

The rubric in short — every finding should tie back to one of these:

  - Ken Hutchins' definition of exercise, clause by clause. "That breaks
    WITHIN MINIMUM TIME" is a complete, precise criticism.
  - Rank 1-4. A cost at Rank 1 is many times worse than the same cost at
    Rank 4. Rank everything you find.
  - Never block a save. A confident wrong number is worse than a missing one.
    Prior history is real history. Nothing contacts clients or trainers.
    Nothing tappable under 40px. Recognition, never ranking.
  - My Studio answers "how can I help the team right now?"; Operations
    answers "where are we going wrong, and where are we going right?"
  - Max Strength owns the catalog; a franchisee owns their copy of it.

═══════════════════════════════════════════════════════════════════
2. THE EVIDENCE RULE — this is the part that matters most
═══════════════════════════════════════════════════════════════════

An outside audit of this codebase was run recently and was mostly wrong. It
recommended migrating to a library version already in use, adding a function
already used in twelve files, enabling a setting already enabled, and named a
file as the source of a bug when that file contains no code that could cause
it. It had never read the code. Do not be that.

So:

  - EVERY finding cites file:line, and you have read that line.
  - If you cannot point at the code, you do not report it.
  - Before reporting anything missing, search hard for it. This app is big
    and the thing is often already built under a name you did not guess.
  - Check ROADMAP.md before reporting. Known and planned is not a finding.
  - Prefer ten findings you are certain of to a hundred you are not.
  - When you are unsure, that is a QUESTION, not a finding. Say so.

Verify your own work before writing it up: re-open the file and confirm the
claim still reads true out of context.

═══════════════════════════════════════════════════════════════════
3. WALK THE APP IN RANK ORDER
═══════════════════════════════════════════════════════════════════

Rank 1-2 first, because that is where a defect costs most:

  the Active Session — the Now Bar, the grid, the four outcomes, entering
  reps and weight, the note / pause / assessment controls, finishing

Then Rank 3: the briefing, the post-session sweep, FORD capture.
Then the client profile, the Hub, the Calendar, the client directory.
Then My Studio, Operations, the Admins dashboard, Learning, the machine
editor.

For each screen ask, in this order:

  1. Does anything here BREAK a rule from section 1? (worst class of finding)
  2. Does anything show a number it cannot justify, or a blank where it
     should say "not enough data yet"?
  3. What does this cost the trainer at its Rank — taps, waiting, reading,
     scrolling, reaching?
  4. Does it work in portrait AND landscape, on a 10" iPad, one-handed?
  5. Is anything here written for a developer rather than a trainer?
  6. Is anything unreachable, or reachable only by a route nobody would find?

═══════════════════════════════════════════════════════════════════
4. THREE THINGS AJ NAMED — start with these, they are not speculative
═══════════════════════════════════════════════════════════════════

4a. THE CLIENT DIRECTORY IS NOT SHOWING ITS DATA.
The columns "Membership", "Sessions Remaining" and "Last Session" exist in
src/components/ClientDirectoryView.tsx and AJ reports they are empty. Find
out why, per column — they may have different causes. ROADMAP.md already
suspects two of them are waiting on the nightly renewals job, which may never
have run; confirm or refute that rather than assuming it. Note that the Last
Session column has a known defect already written in the roadmap (it reads
sessions with limit(100) across 30 clients with no ordering, so a client with
many sessions can hide another's latest). Report the real cause of each, and
what it would take to fix.

4b. MINDBODY SYNC IS PER-CLIENT AND MANUAL, AND IT DOES NOT SCALE.
Today a trainer opens a client's profile and runs Master Sync for that one
person (src/lib/mindbody-master-sync.ts, triggered from
ClientProfileView.tsx). Names arrive on the schedule, but everything else —
address, demographics, contracts, packages — needs that per-client sync.

With ~250 clients per studio and four studios, doing that by hand is not
viable. This is a beta blocker. Produce a MIGRATION PLAN, as a written
proposal, not code:

  - How many clients and how many bookings are actually involved? Count them,
    don't estimate.
  - How many Mindbody API calls per client does Master Sync currently make?
    ROADMAP.md notes that client/clientcompleteinfo could cut it from five to
    two — verify and cost both.
  - What are the real limits? Mindbody's rate limits, Firestore write costs,
    and the read quota. There is precedent: a 429 quota storm on Aug 30 2026
    — find it in the history and learn what caused it.
  - Design it to be RESUMABLE and to MISS NOBODY. A run that dies halfway
    must be restartable without redoing work and without skipping anyone. A
    ledger of who has been synced, with a report of who has not, matters more
    than raw speed.
  - Throttle deliberately. Slow and complete beats fast and rate-limited.
  - It should be a script in the scripts/ pattern: service account, dry-run
    by default, --commit to write. Not a button in the app.
  - Say how it is verified afterwards: how do we PROVE nobody was missed?

Write the plan. Do not run anything against the live database.

4c. THE AUDIT DOCUMENT ITSELF.
docs/START-HERE.md describes how the app is meant to work. Where the app does
not match it, one of the two is wrong. Say which, and fix the document where
the document is what's wrong.

═══════════════════════════════════════════════════════════════════
5. WHAT TO PRODUCE
═══════════════════════════════════════════════════════════════════

One document: docs/rounds/<today>-pre-beta-audit.md, with these sections.

  A. WHAT WOULD HURT A TRAINER ON DAY ONE
     Ranked. Each: what happens, who it happens to, its Rank, file:line, and
     how confident you are. This section is the point of the whole run — if
     you only get this far, the run was worth it.

  B. WHAT LOOKS WRONG BUT IS NOT
     Things you suspected and then disproved. Genuinely valuable: it stops
     the next person chasing the same ghost. Say what you checked.

  C. THE MINDBODY MIGRATION PLAN
     Per 4b.

  D. QUESTIONS FOR AJ
     The most valuable section after A. Anywhere the code could go two ways
     and only he knows which is right; anywhere the app assumes something
     about the floor that you cannot verify; anywhere two parts of the app
     disagree and you cannot tell which is intended. Ask them the way a
     colleague would — grouped by topic, one topic at a time, with enough
     context that he can answer from his phone. Do not pad this. Five real
     questions beat twenty polite ones.

  E. SMALL THINGS
     Genuine but minor. One line each, no ceremony.

  F. WHAT YOU CHANGED
     See below.

═══════════════════════════════════════════════════════════════════
6. WHAT YOU MAY CHANGE
═══════════════════════════════════════════════════════════════════

Work on a branch off master named pre-beta-audit. Never push. Never merge.

You MAY fix, one commit each, only if the fix is obviously correct and you
can prove it:
  - a wrong or stale sentence in a document
  - a comment that describes behaviour the code no longer has
  - a typo or dead import a typecheck or knip already flags
  - a test that would have caught something you found (add it, even if you
    do not fix the thing)

You MAY NOT, in this run:
  - change anything on a Rank 1-2 screen
  - change firestore.rules, indexes, or Cloud Functions
  - write to the live database, or run any script with --commit
  - refactor anything, however tempting
  - "improve" a design decision that section 1 shows was deliberate

Everything else is a proposal in the document.

Verify before you finish: npx tsc --noEmit (count must not exceed the
baseline of 10), and the test suite green. AJ runs test:rules; you cannot.

═══════════════════════════════════════════════════════════════════
7. HOW TO WRITE IT
═══════════════════════════════════════════════════════════════════

AJ does not write code. Write for him: plain language, no jargon without
explaining it, say what happens to a person rather than what happens in a
function. When you must name a file, say what it does in the same sentence.

Be direct about severity. "This will bite on day one" and "this is cosmetic"
should not read the same.

And be honest about your own confidence. "I am certain", "I think", and "I
could not tell" are three different things and he needs to know which he is
reading.
```

---

## Afterwards

The findings that survive become roadmap items; the questions come back here
as a conversation. If the audit is good, the best thing in it will be
section D.
