# History editing + two iPad fixes — Sep 17 2026

Branch `sep17-history-edit-ipad`, off `master` at `33ad0ed` (the Relay docs).
Four phases and this documentation, one commit each, each typechecked on its
own so any phase can be reverted alone.

AJ's brief, in his words:

1. **Expand session history editing.** "When viewing a client's profile
   history, trainers can edit a previous session's weight, rep count, and
   quality. This does not allow trainers to provide an accurate record. It's
   very rare trainers will be going back and editing a session but just in
   case our migration tool doesn't perform correctly we need to be able to
   correctly edit and adjust data. Trainers may also notice they made a
   mistake in a session and may need to go back and adjust." So: also **add**
   machines to a logged session and **remove** them. "It should 100% notate if
   someone changed a historical log on that session also."
2. **Enhance manual entry for past sessions.** "Trainers need a streamlined
   workflow to manually enter past sessions. This component should allow them
   to inject an entire pre-built routine or select multiple machines first.
   Once injected, they can input the weight, reps, and (if remembered) the
   quality for each machine." Design constraint: match the app, and take
   "specific design and workflow inspiration from our existing Routine
   Builder component".
3. **Disable the native iPad shake-to-undo.**
4. **Fix autocorrect on client search.**

Three decisions AJ made before the work started:

- **Removing a machine deletes its set**, and the rules were opened so a
  trainer can do it (they were super-admin-and-franchise-owner only).
- **The notation is a stamp, not a change log** — who and when, not what
  changed field by field.
- **A manually entered past session counts** toward the client's totals.

---

## 1. Editing a session that already happened

### What was wrong

Edit mode could change the numbers on a set that was already in Firestore. It
could not add a machine or take one off, and it left no mark: a session edited
three weeks later read exactly like one recorded on the floor at the time.

Two things were also quietly broken, and both would have been found by the
first trainer who tried the feature this round adds:

- **`exerciseLogs` could only be deleted by a super admin or a franchise
  owner.** So could `sessions`. The dialog's own **Delete session** button has
  therefore never worked for a Life Transformer or a Studio Leader — the batch
  fails whole on the first refused delete.
- There was no way to tell a "Log past session" backfill that counted from one
  that did not, which matters as soon as backfills start counting (phase 2).

### What it is now

**Add.** In edit mode, *Add a machine to this session* opens the Routine
Builder's own `MachinePicker` **inside** the dialog — grouped by Academy
category, searchable at twelve machines, with live coverage computed from the
session as it will stand once saved. It opens inline rather than as a sheet
because on an iPad a sheet over a dialog leaves the trainer two Back gestures
deep with the session they are editing hidden behind both.

A machine added this way is a **draft**: it renders through the same row as a
saved set (dashed outline, "New" tag) and is written only on Save.

**Remove.** Every row in edit mode carries a bin. A set marked for removal is
**struck through and faded, not hidden**, and the bin becomes an undo arrow. A
row that vanishes on a mis-tap is a row a trainer cannot get back without
already knowing what was in it.

**The stamp.** On Save the session document gets:

| Field | Means |
| --- | --- |
| `editedAt` | when it was last changed |
| `editedById` | the **Auth uid** of whoever changed it |
| `editedByName` / `editedByInitials` | for the badge, so it reads "AJ" and not a 28-character id |
| `editCount` | `increment(1)` — every edit, not just the last |

On screen: an **Edited** badge beside the date in the header (calendar live
blue — crimson stays reserved for rep quality) and *"Edited by AJ on Sep 17"*
in the sub-line, with *"· 3 edits"* once there has been more than one. The
header updates the moment the batch commits rather than waiting for the
listener, because the badge is the whole point of the stamp.

**Rep quality can be cleared.** Tapping the quality that is already set unsets
it. On a session being reconstructed weeks later "I do not remember" is a real
answer, and an invented rep quality is a wrong number in the one place this
app is strictest about them — the red kaizen mark drives the Deep Dive.

### The part that is easy to get wrong

`client.machineStats.<id>.timesPerformed` is a **running total kept at write
time** (`lib/client-rollups.ts`): one vote per machine per completed session,
performed sets only. So adding a performed machine to a past session has to
cast that vote and removing one has to take it back, or the profile's
"performed 14 times" drifts away from the history behind it — silently, one
edit at a time.

`machineVoteDelta(before, after)` in
`src/features/client-history/session-edits.ts` does it, and takes the session's
**whole** set list on both sides rather than the added and removed rows,
because a machine can be voted on by one of its two sets: dropping the
performed one while the other stays takes the vote back even though the
machine is still in the session. An edit that only changed a weight returns
`{}` and costs the client document nothing.

Only sessions that ever cast those votes are adjusted — see
`ownsClientCounters` below.

### Rules

```
match /exerciseLogs/{logId}   allow delete: + (isAuthenticated() && isAnyAuthenticatedTrainer())
match /sessions/{sessionId}   allow delete: + (isAnyAuthenticatedTrainer() && (own trainerId | trainer of hostedAtStudioId | client is readable))
```

Each is scoped the same way that collection's own `update` rule is scoped, so
neither grants reach that `update` did not already grant — a trainer could
already blank any log; now they can delete the empty row instead of leaving
it. Three cases added to `tests/firestore.rules.test.ts`.

**Both need a rules deploy before either button works live.**

---

## 2. "Log past session", rebuilt

### What was wrong

The old dialog asked for a date and a trainer, then wrote a completed session
"backbone" seeded with empty sets for the client's five most recent machines,
to be filled in afterwards from the session pop-up. That made the trainer do
the work twice — create a stub here, find it on the calendar, open it,
discover it had guessed the wrong five machines, fix them one at a time.

Tolerable as a rare correction. Not tolerable as the tool that repairs
whatever the FileMaker migration gets wrong, which is what AJ now needs it to
be.

### What it is now

Three panes with a step header: **When** (date, trainer) · **Machines** ·
**Numbers**. The step buttons are tappable backwards and forwards, but nothing
past the first opens until a real past day and a trainer are named — the date
and the trainer are what everything after them is filed under.

**The Machines pane is the Routine Builder's furniture, deliberately:** its
`MachinePicker`, its `CoverageStrip`, its sortable `SequenceMachineRow` with
drag-to-reorder. Not only for consistency — a trainer reconstructing a session
from memory is doing the same thing they do when they build a routine
(remembering a sequence of machines), so the screen that helps them do that
well already exists. Category coverage is genuinely useful here too: "no
upper-body push" is a good prompt that a machine has been forgotten.

**Start from** injects a whole routine in one tap, one chip per routine the
client has, with its machine count on it. Machines already on the list are
left where the trainer put them rather than being rearranged into the
routine's order.

**The Numbers pane** is one card per machine, in sequence order: a weight
stepper, a reps-or-seconds stepper, the TSC toggle, and the three quality
buttons. Empty fields show "—" rather than 0, because a stepper showing 0
invites a zero being saved as a real set.

### Three decisions

1. **Quality is optional and stays empty.** Unset is the default; tapping the
   selected button clears it again. Same reason as phase 1.
2. **A machine with no reps is not a performed set of zero.** `newSetDoc`
   writes it as `outcome: "skipped"`, `skipReason: "unknown"` — a machine that
   was named and not done. The footer counts them before Save ("4 of 6
   machines with numbers") and each card says so, so nothing is a surprise.
3. **It counts** (AJ's call). `sessionCount`, `completedSessions`, the trainer
   tally and `machineStats` through `completedSessionRollup`, exactly as
   finishing a live session keeps them — and **`countsTowardTotals: true`** on
   the session document so a later delete can take them back.

`ownsClientCounters(session)` in `session-edits.ts` is the **one** place that
decides whether a session owns the client's counters:

- a completed live session → yes
- a backfill written from Sep 17 2026 → yes, because the flag says so
- **a backfill written before this round → no.** It incremented nothing, so
  deleting it must decrement nothing. The old delete path decremented every
  backfill, which pulled the client's counters one lower than the truth each
  time. That is the "In Journey since" rule broken from the other end.

It also writes `trainerId` (the old dialog wrote only initials, so the trainer
tally filed every backfill under an `initials:` key) and `sessionMachineIds`.

---

## 3. Shake to undo

An iPad carried across the studio floor gets read as a shake, and iOS puts up
its **Undo Typing** alert over whatever the trainer was in the middle of. One
tap rolls back the text field they last typed in — a set's weight, a note, a
client's name.

**The alert belongs to iOS and no web page can suppress it.** Nothing in the
DOM, no meta tag, no gesture handler reaches it. The complete fix is on the
device: **Settings → Accessibility → Touch → Shake to Undo, off**, once per
studio iPad. That is now in the testing checklist.

What a page *can* do is in `src/lib/shake-undo.ts`, in two layers:

1. **Refuse the undo.** When the trainer taps Undo, Safari asks the page first
   — a `beforeinput` event with `inputType: "historyUndo"` — and
   `preventDefault()` on it cancels the edit. The alert may still flash; the
   data does not move. Always on, no permission needed. This is the layer that
   actually protects the record.
2. **Take the target away** (`enableShakeMotionWatch`, **not called yet**).
   iOS raises the alert for the field that currently has focus and an undo
   stack, so blurring it the moment a shake is detected usually means there is
   nothing to offer. It needs `devicemotion`, which on iOS 13+ needs the
   "Allow Motion & Orientation Access?" prompt behind a user gesture — so it
   is exported and left switched off. The guard is useful without it.

**Scoped to iPads.** Layer 1 also catches Cmd+Z, which on a studio PC is a
normal thing to press. `looksLikeIpad` reads **touch**, not the user agent,
because iPadOS 13+ reports itself as a Mac: `maxTouchPoints > 1` on a Mac
platform is an iPad, since no Mac has a touchscreen.

The detector is deliberately blunt — three readings 14 m/s² past gravity
inside 800 ms. A cleverer one (axis reversals, frequency) is easy to write and
hard to tune, and the cost of being wrong here is one blurred text field.

---

## 4. Autocorrect on client search

Trainers find clients by typing a name, and the iPad keyboard treats a name as
a misspelling: "Deitrich" becomes "Dietrich", "Rybak" becomes "Ryan". Because
the correction lands as the trainer keeps typing, what they get is an empty
result list for a client standing in front of them.

Four attributes turn it off — `autoCorrect="off"`, `autoCapitalize="none"`,
`autoComplete="off"`, `spellCheck={false}` — stated once in
`src/lib/name-search-input.ts` as `NAME_SEARCH_PROPS` and spread onto the
eight fields that search for a person:

| Where | File |
| --- | --- |
| The header search | `src/AppContent.tsx` |
| The client directory | `src/components/ClientDirectoryView.tsx` |
| Relay's client picker | `src/features/relay/ClientPicker.tsx` |
| The note editor's client search | `src/features/relay/notes/NoteEditor.tsx` |
| The notes panel | `src/features/relay/notes/NotesPanel.tsx` |
| Reconcile (provisional records) | `src/features/admin/provisional/ReconcileDialog.tsx` |
| The admin clients tab | `src/features/admin/clients/AdminClientsTab.tsx` |
| Add to roster (trainers) | `src/features/trainer-profile/AddToRosterDialog.tsx` |

**Not** applied to anything written in sentences — notes, session summaries —
where a correction is wanted. This is for fields whose whole content is a
proper noun. (The Academy and wiki searches already did their own version of
this; they were the precedent.)

---

## Files

```
src/features/client-history/session-edits.ts          pure: the stamp, the machine vote delta,
                                                       who owns the counters, the shape of a set
                                                       added by hand  (25 tests)
src/features/client-history/session-edits.test.ts
src/features/client-history/SessionDetailDialog.tsx   add / remove / stamp
src/features/client-history/SessionDetailDialog.render.test.tsx    mounted, in edit mode (5)
src/features/client-history/LogPastSessionDialog.tsx  the three-pane form
src/features/client-history/LogPastSessionDialog.render.test.tsx   the whole flow walked (4)
src/features/client-history/client-history.css        .hsd-edited / --new / --gone / -add, .lps-*
src/features/client-history/ClientHistoryTab.tsx      the new props
src/lib/shake-undo.ts                                 the undo guard + the shake detector (21 tests)
src/lib/shake-undo.test.ts
src/lib/name-search-input.ts                          NAME_SEARCH_PROPS
src/types.ts                                          editedAt/ById/ByName/ByInitials, editCount,
                                                       countsTowardTotals on WorkoutSession
firestore.rules                                       two delete rules
tests/firestore.rules.test.ts                         three cases
```

## Verified

- `npx tsc --noEmit` — **12 errors**, the same 12 as `master`. (CLAUDE.md said
  13; the count on this working copy is 12 and one of them comes from the
  untracked `Claude outputs/` folder, so it moves with what is on disk.)
- `TZ=America/New_York npx vitest run src` — **175 files, 2,856 tests, all
  passing** (was 173 / 2,801 + 5 files that could not load without a local
  `firebase-applet-config.json`). CLAUDE.md's 2,977 counts the rules suite as
  well; `vitest run src` alone gives this number.
- `npx vite build` — clean.
- `git ls-files | tr A-Z a-z | sort | uniq -d` — empty, so no two files differ
  only by case (the `dial.ts` / `Dial.tsx` trap from the reporting round).
- **Not run:** `npm run test:rules`. The emulator jar's host is blocked from
  this container, so **AJ's run is the one that counts** — and it matters more
  than usual this round, because two delete rules changed.
- **Not yet on a real iPad.**

## Left for AJ

1. **`npm run test:rules`, then deploy the rules.** Neither the Remove button
   nor Delete session works until `firestore.rules` is live:
   `firebase deploy --only firestore:rules`. Nothing else in this round needs
   a deploy beyond the app itself.
2. **Turn Shake to Undo off on each studio iPad** (Settings →
   Accessibility → Touch). The in-app guard makes the alert harmless; the
   setting is what stops it appearing.
3. **Try an edit against a real session** and confirm the client's "performed
   N times" on the Programming tab moves with it.

## Follow-ups

- **A change log, if the stamp turns out not to be enough.** AJ chose "who and
  when" over "what changed"; `session-edits.ts` is where a per-field diff
  would go, and `editCount` is already the hook for it.
- **`sessionNumber` on a backfill** is still "the newest session's number + 1"
  (`orderBy("date", "desc")`), so a session inserted in the middle of a
  client's history gets a number from the end of it. Fine for a correction,
  wrong for a bulk import — the importer should number from the history.
- **The machine picker uses the app-wide machine list**, not the studio's own
  roster, like the session picker (ROADMAP). A studio's adopted machines are
  not offered here either.
- **`enableShakeMotionWatch` is unused.** If the alert still bothers trainers
  after the device setting is off on every iPad, it wants a switch in Settings
  so the motion prompt is asked for on purpose rather than at launch.
- **`machineStats` first/last dates are not recomputed** when an edit changes
  the oldest or newest set on a machine — the same trade the delete path
  already makes, for the same reason (it needs the full history, and a date
  one session early is a far smaller lie than a count one too high).
