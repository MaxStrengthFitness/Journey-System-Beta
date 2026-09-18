# Fluidity audit — Sep 17 2026

AJ's brief: *"the app needs to be more fluid… we need to make sure all the loose
ends are being wrapped back in."* Three complaints, one instruction to audit.

This document is the audit. It is written to be read next to AJ's own
Operations-dashboard audit, which is being drafted in parallel and is
deliberately not covered here.

**One sentence:** the app's data is almost all there and almost all correct —
what is missing is the *rendering* of connections that are already stored, and
a handful of screens that refuse to read totals the app is faithfully keeping.

---

## Decisions taken (AJ, Sep 17)

| Question | Decision |
| --- | --- |
| Where a client opens | **Always Journey, pinned to the newest session.** No per-client resume. |
| When the newest-session pin comes off | **Only a real scroll.** Tapping anything never counts. Re-pins on every arrival. |
| Quick note capture | **An always-there button on the client profile** — present on every tab, including Journey. |
| How much filing it asks for | **Smart default, override if wrong.** Context picks the category; one tap saves; the chip is there when the guess is wrong. |
| First link to close | **Note / machine ↔ catalog page.** |
| Session linkage | AJ: *"audit it and tell me."* — §3. |

### Round two of decisions (AJ, Sep 17, evening)

| Question | Decision |
| --- | --- |
| The session-count edit | **An offset the reconciler adds to**, not a total it overwrites. Recorded as `client.priorHistory` — a count with a date range, a source and a note, not a bare number. See §0. |
| Booked vs started | **Build it.** Surface on the session card and the client's history, as a per-client attendance read, and as a trainer-side read. The Operations surface waits for AJ's own audit. |
| Studio vs client machine notes | **Two linked boxes, one direction.** A client's machine notes ALSO show the studio's notes for that machine; the catalog shows only studio notes and never client notes. |
| FORD entries | Gain a **calendar presence** (a marker on the day AND a cue in that day's briefing), an **effective window** (starts/stops mattering), and a **Loudness**, like the rest of the app. |
| Quick capture | Must be **non-invasive** — always reachable, never in the way. |

---

## 0. The context everything else sits inside

**Journey is not a fresh start.** The original studio has been open over twelve
years — longer than the FileMaker system being replaced, which itself replaced
something earlier. The rollout is a migration measured in months: beta at a few
studios, then studio by studio, then FileMaker is discontinued. Throughout that
period a roster is a mix of brand-new clients, clients with fifty sessions
behind them, and clients with several hundred. The FileMaker export has been
requested and not yet received, so how much history can be imported "within
reason" is unknown.

This is now `docs/business/migration-and-prior-history.md` and is pointed at
from the top of `CLAUDE.md`, because it is the assumption most likely to make a
screen lie. The rule it forces:

> A client's history did not begin when Journey first saw them. An empty
> Journey history means "we have no detail here", never "this never happened".

It also settles §3.6, the session-count question. The manual edit and the
reconciler were fighting over one field. They now own different things:
`client.priorHistory` owns what Journey cannot see, the reconciler owns what it
can, and `total = journey count + (sessions − importedCount)`. Any importer of
historical sessions must raise `importedCount`, which is how an import stops
being double-counted without anyone re-doing arithmetic.

**It reopens §3.2 as something larger than a bug.** "Never tried" on the
Programming tab is unsafe during migration for a second reason: even with
`machineStats` read correctly, a client may have used a machine four hundred
times in FileMaker. There is no machine-level prior history record yet.

---

## 1. Opening a client — why it wasn't landing on the newest session

Four separate causes, all now fixed on `fluidity-round` (commit 1).

1. **The profile resumed a per-client tab.** `useProfileNav` stored the
   trainer's location in `sessionStorage` on *every* change and read it back on
   arrival; `{ tab: "journey" }` was only the fallback for a client not opened
   yet in that browser session. So a client glanced at on Programming reopened
   on Programming, days later, with no way to predict it.
   The stored location is now a **one-shot handoff**: consumed on read, and
   written only by a screen deliberately sending the trainer somewhere else.
   Operations → Machine fit is the only such screen today, and it still works.

2. **Tapping was being read as scrolling.** One ref, `userTouched`, was doing
   two unrelated jobs — "the trainer is driving, don't auto-pin" and "the first
   frame is behind us, the older-page autoload may arm". It was set on
   `pointerdown`, and a `pointerdown` in the grid is how the profile opens a
   machine window. One tap on a machine name permanently disabled the pin for
   the rest of that client's visit. Now split: `userScrolled` comes on only
   when the scroller is genuinely parked more than half a column back from the
   newest session.

3. **The auto-fit re-measured after the scroll was set.** Within one commit the
   scroll effect runs, then the fit effect solves the column width and triggers
   a second render. Nothing re-pinned. Benign while a measure could only
   *narrow* columns; not benign on rotation, on a panel opening, or when a
   client with fewer sessions widens them. Re-pin on the solved size.

4. **Switching clients handed the new client the old one's history.**
   `ClientProfileView` is not remounted per client, and the initial session
   fetch *merges* into what is loaded (deliberately — so paging back survives a
   tab switch). Nothing cleared it on a client change. The grid then found its
   own previous first session still in the array, read that as "older columns
   were prepended", and held its scroll position — on another client's columns,
   with both clients' logs interleaved. This is latent rather than constant
   today, because most routes out of a profile unmount it; it would have become
   permanent the moment any screen swapped the client in place.

---

## 2. Writing a note — the efficiency complaint, measured

From a client open on Journey, the tap counts to record something:

| What you want to write | Taps | Path |
| --- | --- | --- |
| A machine note | **2** | tap the machine cell → note box in the machine window (+ a scroll past five panes) |
| A general note | **4** | Notes & Profile → Notes rail → category chip → Save |
| Something personal (FORD) | **3+** | Notes & Profile → Life rail → scroll past two baselines → add |
| A Pulse reading | **3+** | Notes & Profile → Pulse rail → pick a topic → Dial |
| A private jot | **2 + a long scroll** | Notes & Profile → Goals rail → scroll past goals, coach strategy, Mindbody indexes and shared notes |

**The machine note is the only capture on the whole profile that does not cost
a tab change**, and it is the one that is hardest to find. The profile header —
the one thing on screen on every tab — carries Back, Kaizen, Sync and Start
Session, and no way to write anything down.

There are **eighteen** distinct surfaces that record something about a client,
writing into seven collections. Two of them are duplicates that never see each
other, and one is a live path that produces records nobody can edit afterwards:

- `sessionNotes` is **still being written** by `SessionNotesSidebar`, mounted
  from `ClientHistoryView`. Those entries arrive in the journal as `isLegacy` —
  read-only. A trainer can create a note today that cannot be edited tomorrow.
- `studios/{s}/machineNotes` (studio-wide) and
  `clientMachineSettings.machineNotes` (this client) are two boxes both
  labelled "notes", about the same machine, with no cross-reference.

**The plan (decided):** one capture control on the profile header, on every
tab. Context picks the category — pressed while a machine window is open →
Equipment with that `machineId`; mid-session → Coaching with the `sessionId`;
otherwise a general note. One tap saves; the chip is there when the guess is
wrong; nothing is ever *blocked* on filing, because the To-file tray and the
teardown sweep already exist and work.

---

## 3. What a session writes, and who reads it — the gaps

Ranked by how visible each is to a trainer standing on the floor.

### 3.1 The End-Session wrap-up note reaches nobody
The box is labelled *"something the next trainer should know"*. It is written to
`sessions/{id}.notes`. **It is never written to `journalEntries`** — and the
pre-session briefing reads only the journal. So the note written *for* the next
trainer is the one note the next trainer's briefing does not show. Meanwhile the
closing note typed on the post-session screen thirty seconds later *does* reach
the journal, the briefing and the catalog. Two boxes, two worlds.

### 3.2 Three screens refuse to read totals the app is keeping
Every finished session increments `client.machineStats.<id>.timesPerformed`,
`firstWeight`, `lastWeight`, `firstPerformedDate`, `lastPerformedDate`. But the
Programming tab's "performed / never tried" and the routine rows' `%` and `×`
all gate on a separate one-time marker, `machineStatsBackfilledAt` — and that
marker is written by exactly one place: a backfill that only runs when the
**Equipment tab** is opened.

A client with eighty sessions therefore reads "40 on roster" instead of
"12 of 40 performed", and every routine row shows `0×`, until somebody happens
to open Equipment. The data has been sitting on the document the whole time.
(The trainer profile's lifetime "Sessions Coached" has exactly the same shape —
withheld behind an admin-only backfill marker.)

Worse, the Journey grid is built from raw `exerciseLogs` and reads none of this,
so the grid can show a full row of sets for a machine the Programming tab next
door calls never tried.

### 3.3 Assigning a walk-in session completes it without any counters
`assignSessionToClient` sets the session to Completed and rewrites the logs'
client, but touches nothing on `clients/{id}` — no `completedSessions`, no
`sessionCount`, no `trainerTally`, no `machineStats`. The Cloud Function still
fires on the status change, so the **trainer's** count goes up while the
client's does not. And if that session is later deleted from History,
`ownsClientCounters` says it owns them, so the delete decrements totals that
were never incremented. Each assigned walk-in leaves the client permanently one
session light.

### 3.4 The post-session screen shows last session's lifetime totals
The "Lifetime" tile reads the client snapshot captured *before* the finish
batch's `increment()`s land. The trainer walks the client out reading a number
that is one session stale.

### 3.5 The post-session strength sentence is computed from a 30-session window
`client.machineStats` holds the exact lifetime `timesPerformed` and
`firstWeight`. The post-session journey sentence ignores both and derives from
the loaded window, then gates on a minimum session count — so a long-standing
client can be told there is "not enough history yet to call a trend".

### 3.6 `sessionCount` has three writers and a reconciler that beats them all
The finish batch sets it, the History dialogs move it ±1, and the profile
re-derives the true count from an aggregation query on every open and writes it
back. The trainer's manual session-count edit is silently reverted on the next
profile open. `completedSessions` has no reconciler at all and drifts for good.

### 3.7 Writes that can half-succeed
The finish is correctly one batch. **Session start is not**: routine → client
→ session → client → arrival note → *N separate writes*, one per machine, for
the seeded logs. A failure partway leaves an In-Progress session with a partial
machine list. The post-session screen is four unbatched writes across four
documents; a mid-session settings save is three sequential writes, so the audit
trail can be missing for a setting that saved.

### 3.8 The Equipment backfill can eat a concurrent finish
It whole-field replaces `machineStats`. A session finishing on another iPad
between that backfill's read and its write loses its increments.

### 3.9 Written and read by nothing
`sessions.clientAge`, `clientOccupation`, `clientIsRetired`,
`clientActivityLevel`, `clientClinicalProfile`, `bookingStartTime`,
`startedLateByMinutes`; `client.currentMachineMetrics.*.lastSessionId`,
`.lastPerformedSessionNumber`, `.totalTimeUnderLoad`, `.averageTimePerRep`;
`exerciseLogs.machineStartedAt`. Also dead: the whole `PostSessionData` branch
of `completeWorkoutSession` (its only caller passes `undefined`), and the
`sessionNotes` prop handed to `BriefingScreen` and never used.

`startedLateByMinutes` is worth a decision rather than a deletion — it is
computed and thrown away, and lateness is a real studio fact.

---

## 4. The loose ends — links stored but never drawn

1. **`journalEntries.sessionId` is written by every in-session writer and
   rendered nowhere.** One query reads it, and only while that session is live.
   No note says which session it came from; no session lists the notes taken
   in it.
2. **The machine name on a note is a `<span>`.** It cannot open the catalog
   article, the client's settings for that machine, or the machine's history.
3. **There is no route from a client to the catalog at all.** `openLearning` —
   the app's one "open that page" function, with a proper `LearningRef` type
   behind it — is threaded into the notification bell and trainer settings, and
   into nothing on the client profile.
4. **No route from the catalog back to a client.** A machine's page cannot say
   who trains on it, what settings are common, or what was recently noted about
   it — although `journalEntries` already carries `machineId` and a
   `machine:<id>` search tag put there for exactly this.
5. **Pulse pain points carry `aggravatingMachineIds` and
   `linkedJournalEntryIds`** and render them as prose. "on Leg Press" is not a
   link; "linked to 2 session notes" does not open them.
6. **FORD entries carry `sessionId`, no `machineId`, and render neither.**
7. **Comments exist only on Learning pages** — never on a client note, a focus,
   a FORD detail or a session.
8. **Planner notes cannot link to a page in this app** — only to raw URLs.
9. **`profileSection` on a journal entry is written by nothing**; the "file
   this under Body instead" escape hatch has no UI.

---

## 5. The round, in phases

One branch, `fluidity-round`, one commit per phase, each typechecked alone so
any phase can be reverted on its own.

- **Phase 1 — done.** A client always opens on Journey, pinned to the newest
  session. Four causes, §1.
- **Phase 2 — done.** The migration written into the knowledge base: the
  business page, and the pointers from `CLAUDE.md`.
- **Phase 3 — done.** `client.priorHistory`: the session count is an offset,
  not a fight. Pure module `src/lib/prior-history.ts` with `totalSessions`,
  `recordImportedSessions` (the importer's contract) and `historyCoverage`
  (which names "unknown" — a long-standing client nobody has recorded, which
  looks exactly like a new one). The profile's dialog asks for sessions
  *before* Journey rather than a total, and the header carries the split.
- **Phase 4 — one-tap capture.** The header capture control, context-aware
  default category, `machineId` and `sessionId` attached automatically.
  Non-invasive: reachable from every tab, never covering the grid or the
  Start Session button. Retire the `sessionNotes` write path.
- **Phase 5 — machine ↔ catalog, and the two linked note boxes.** Thread
  `openLearning` into the profile and the machine window; make every machine
  reference a link. A client's machine notes also show the studio's notes for
  that machine, so a leader warns everyone once ("machine has been squeaky")
  instead of writing on every client — and the catalog stays free of client
  notes, which is not what a trainer reading the catalog wants.
- **Phase 6 — session ↔ note.** Render `sessionId`: a note says which session,
  a session lists its notes. Make Pulse pain-point links navigable.
- **Phase 7 — booked vs started.** `bookingStartTime` and
  `startedLateByMinutes` are already computed and thrown away. Surface them on
  the session card, as a per-client attendance read, and on the trainer
  profile — recognition, never ranking. Operations waits for AJ's audit.
- **Phase 8 — FORD grows up.** An effective window (starts / stops mattering),
  a Loudness matching the rest of the app, and a calendar presence: a quiet
  marker on the day in the Calendar view AND a cue in that day's briefing.
- **Phase 9 — the counter gaps.** §3.1 (wrap-up note into the journal), §3.2
  (stop gating on backfill markers when the totals are live), §3.3 (walk-in
  assignment), §3.4/§3.5 (post-session reads live totals). Each touches client
  rollups, so this phase gets its own careful pass.

### Both open questions, answered (AJ, Sep 17)

**Machine-level prior history is not coming across.** So the app never claims a
client has not used a machine. A client with history before their studio's
`journeyCutoverDate` gets **"nothing recorded"**; a client who started on
Journey gets **"never attempted"**; unknown gets the cautious wording, because
during migration unknown and partial look identical. Done in Phase 5, which
also retired `machineStatsBackfilledAt` as a gate and so closed §3.2.

**The session's demographic snapshot stays, and needs a reader.** It is the
substrate for cohort analytics — what weight people of a similar age and
activity level actually start at, which machines suit whom, pace, and the
studio's own claims. It lives on the session because those facts change. The
standing rule it produced:

> **Every number has a reader.** A field we write must be read by at least one
> screen, report or job. A write with no reader is a bug to fix, not a field to
> delete.

`docs/business/data-and-metrics.md`. §3.9 is therefore a work list, not a delete
list — and it grows: height, wingspan and gender are NOT on the snapshot,
although machine fit already treats height and gender as the axes that matter.

### Still open

- **Each studio's `journeyCutoverDate` has to be set as that studio goes live.**
  Until it is, that studio's clients all read as unknown — safe, but it means
  no client anywhere gets "never attempted" or a quoted lifetime figure until
  the first date is entered. There is no UI for it yet; Operations is the
  natural home, so it waits for AJ's audit.
- **Where the cohort reader lives.** Phase 9 or a round of its own. The fields
  have been accumulating since August and cannot be backfilled, so there is no
  rush — but nothing reads them yet, which is exactly what the rule above says
  not to leave alone.
