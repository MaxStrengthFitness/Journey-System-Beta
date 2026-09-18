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
  session. Four causes, §1. Typecheck at the 12-error baseline.
- **Phase 2 — one-tap capture.** The header capture control, context-aware
  default category, `machineId` and `sessionId` attached automatically. Retire
  the `sessionNotes` write path so nothing new is created read-only.
- **Phase 3 — machine ↔ catalog.** Thread `openLearning` into the profile and
  the machine window; make every machine reference a link; give the catalog
  page its client-side back-references.
- **Phase 4 — session ↔ note.** Render `sessionId`: a note says which session,
  a session lists its notes. Make the Pulse pain-point links navigable.
- **Phase 5 — the counter gaps.** §3.1 (wrap-up note into the journal), §3.2
  (stop gating on backfill markers when the totals are live), §3.3 (walk-in
  assignment), §3.4/§3.5 (post-session reads live totals). Each of these
  touches client rollups, so this phase gets its own careful pass.

### Open, needs AJ

- **§3.6** — should a trainer's manual session-count edit win over the
  reconciler, or should the edit be removed? It cannot be both.
- **§3.9** — `startedLateByMinutes` is computed and discarded. Surface it, or
  stop computing it?
- **Studio vs client machine notes** — one box with a "this client / whole
  studio" switch, or two boxes that link to each other?
