# The open session: the FileMaker floor, and settings that go in fast (Oct 9 2026)

**Status: built, reviewed and measured on `oct9/open-session`** (§4), on
master's `546bb0aa` (the first-session rounds), with its ship script,
`scripts/ship/ship-open-session.ps1` (§4.8). It is not pushed and nothing of
it is deployed. It ships after AJ's iPad walk of the first-session round
(Round 65), as agreed: an index and a rules deploy first, then the push, then
this round's own walk (Round 66) before Render's Manual Deploy. The parking
list is §5; what goes into `CLAUDE.md` once its trim is in is §6.

## 1. What AJ asked

> "Lets take a look on how an open sessions decides its routine because that
> still just starts the session with every machine, which honestly we could do
> because thats how filemaker kinda works. you have every machine on the screen
> and you just fill in the ones you did, but to keep consistency with how our
> app is im not sure which direction we should do. i think the open session
> should honestly feel most like a filemaker session, its the barebones but
> also i want to be able to take advantage of our routine builder so we can use
> it if we wanted too. the only thing is with the new routine is a client has no
> settings so you need to be able to adjust the settings quickly while running
> the routine, currently you just click on the machine and then fill it in and
> save"

## 2. What was found

The **open session** is the Client Directory's **Open session** button: a
session started before a client is chosen (`isUnassigned`), assigned to a client
at Finish. The Hub peek's "Open session" is a different thing (it resumes a
client's running session).

The maps are in the build's working notes. These are the findings, each checked
in the code:

1. **It runs the whole floor because it has nothing else.** No routine and no
   recorded list, so the tracker falls back to the studio's floor
   (`WorkoutTrackerView.tsx` ~1519-1523). The six machines its start seeds
   ("Hip Abduction", "Leg Press" …, Title Case) never match the floor's
   UPPERCASE names. Where one does, it seeds a ghost weight "0".
2. **Starting one waits on the network.** `startUnassignedSession` awaits
   `addDoc`, then one `setDoc` per machine. Offline it never moves, and a second
   tap makes a second session. The session lacks `clientStartTime`,
   `lastHeartbeatAt` and `startedByTrainerId`, is signed with `authTrainer.id`
   rather than the Auth uid, and `rememberLiveSession` is never called. Once
   left, there is no way back to it, so it stays In-Progress for ever.
   *(Reconsidered in the build: the trainer document's id is kept on
   purpose. Every reader of `trainerId` and `startedByTrainerId` (a client
   Start, a take-over, the trainer rollups, My Profile) compares that id, and
   no rule pins either to the uid; `features/open-session/README.md`.)*
3. **Assigning half fails, silently.** Assign awaits every step and updates the
   sets one at a time. The rules refuse a set's client changing
   (`firestore.rules` exerciseLogs update: `resource.clientId ==
   request.clientId`), so the session moves and its sets don't. The only sign is
   a `console.error`, and the trainer lands on a blank screen. Assign skips
   Finish: no session number, counters, machine totals, next weights, Wrap-up or
   Next time.
4. **Settings typed in an open session go to a ghost.** They are saved to
   `clientMachineSettings/_{machineId}` with `clientId: ""`. That record is
   shared by every open session and never reaches the client.
5. **Typing into an empty dial breaks** in the machine card, for every session.
   The first digit swaps the editor for a row of positions ("12" costs eleven +
   taps), and the field uses the letter keyboard. A first save on a machine with
   no Gap standard writes Gap 0. Programming → Setup still requires a reason to
   change saved settings, against "asked, never required".
6. **Notes and Pulse are dead buttons** in an open session. The open-session
   listener keeps the old studio's query after a studio switch.

## 3. AJ's picks: "1b 2a 3a"

- **1b. The FileMaker floor, with the routine builder on demand.**
  - Every machine shows, in the studio's walking order. Tap + on the ones you do,
    and each rises into today's numbered list in the order done.
  - The grid's corner gets **Start from a routine…**: one tap lays a routine's
    machines in order (the studio's starting routines, its templates, and once
    the client is known, their Routine A or B), with the rest of the floor still
    below.
  - The floor is a **view**: the session records only what was added, so after
    Assign the Wrap-up's Next time can start Routine A from it.
  - A **client** session with no routine gets the same floor, so every
    routine-less session looks alike.
- **2a. Quick settings through the one machine card.**
  - The Now Bar's read-only setting chips become one 40px button: "Set up · 2 not
    set" on a first time, the settings themselves once set. It opens the machine
    card straight on the first empty dial, on the number pad.
  - Next moves to the next empty dial; "Use studio standard for all" when two or
    more dials have one.
  - Save closes the card, with a 10-second Undo.
  - Setting two dials goes from 6 taps to 3.
- **3a. Settings typed before the client is chosen are kept on the session**
  (`sessions/{id}.heldSetup.{machineId}`) and saved to the client at Assign. This
  is one new field on the session record, and AJ's pick is the OK for it.
- **Who's this?** in the session bar assigns the client at any time, or still at
  Finish. After that it is an ordinary client session: the client's settings,
  history, the Wrap-up and Next time.

## 4. Build log

On `oct9/open-session`, built on master's `546bb0aa` (the first-session
rounds; still master on GitHub on Oct 9 2026, `git ls-remote`). One commit a
phase, each typechecked on its own (baseline 2), so any one can be reverted
alone. The measurements are §4.9; what was not done is §4.11.

| Commit | Subject | What it is |
| --- | --- | --- |
| `8b86ff41` | Docs: the open session, what was found and AJ's picks | This document's §1 to §3: AJ's words, the six findings, his "1b 2a 3a" |
| `aae89ec8` | Open session: Start issues one write and moves on, and the session can be found again | §4.1: one `setDoc`, nothing seeded, the Session tab and the way back (findings 2 and 6) |
| `ce7d9a55` | Open session: the FileMaker floor, every machine showing and today's list built by + | §4.2: AJ's "1b", the floor as a view |
| `bc6be8b6` | Open session: Who's this? at any time, and Assign that writes the session and its sets in one batch | §4.3: finding 3, and the exerciseLogs rule that lets a set take its session's client (8 rules tests) |
| `f98f5976` | Session: Start from a routine in the grid's corner, laying a routine's machines in order | §4.4: the builder on demand, today's list only |
| `88d8afd8` | Session: Set up opens the card on the first empty dial, and the dial takes a typed number | §4.5: AJ's "2a", finding 5 |
| `eb748fb4` | Open session: settings kept on the session until the client is chosen, then saved to them | §4.6: AJ's "3a", finding 4, `heldSetup` (3 rules tests) |
| `95ffb20c` | Review: the open session round's fixes | §4.7: the whole-branch review, the sessions update rule (6 rules tests) |
| `3f5c97e1` | Screens: fixes found in the open-session preview | §4.10: two words on the machine card before Who's this? |
| this commit | Docs and ship-open-session.ps1: the open session round, measured | §4.8, §4.9, §4.11, §6; the READMEs, the traps, Round 66, the roadmap, the index, the changelog; `scripts/ship/ship-open-session.ps1` and `scripts/check-live-rules.ts` |

### 4.1 Start and the way back (findings 2 and 6; `aae89ec8`)

- **One write, never awaited** (`features/open-session/start.ts`,
  `hooks/useClientMutations.ts`): an id made on the iPad, one `setDoc`, and
  the screen moves to the Active Session in the same tap, online or off. A
  refusal is a toast and the device forgets the session.
- **Nothing seeded**: no default machines, no sets, no ghost weight "0"; the
  session records an empty list (`sessionMachineIds: []`).
- **Signed as a client Start signs it**: `trainerId`, `trainerName`,
  `trainerInitials`, `startedByTrainerId` (the trainer document's id, finding
  2's note), `clientStartTime` from the iPad's clock, `lastHeartbeatAt`,
  `pausedAt` / `totalPausedMs`, at this iPad's studio only (with none it
  writes nothing and says so).
- **One open session a trainer**: while the trainer's own is running, Open
  session goes back to it and writes nothing (`runningOpenSessionId`); the
  Directory's button says "Back to the open session", or "Starting…" for a
  moment after a Start.
- **The way back** (`lib/live-session.ts`): `findMyLiveSession` counts the
  trainer's live open session, so the Session tab appears ("Open session")
  and `resumeSession` brings it back; one at another studio is said, not
  followed. `pickOpenSession` records the session on screen, else the
  remembered one while live, else the newest live one of this trainer's; an
  abandoned one is never taken up without asking. Sign-out's question and the
  new-version line say "your open session".
- On the Active Session: the open-session listener follows a studio switch and
  reads the newest twenty; "Opening the session…" until it answers; Notes and
  Pulse are not drawn until there is a client.

### 4.2 The FileMaker floor (AJ's "1b"; `ce7d9a55`)

- An open session, and a client session with no routine and an empty list,
  open the grid's fold: every machine on the floor in its walking order, each
  with the Today column's +; the groups say "Today" and "Rest of the floor".
  For a client, the floor waits until the routines are known and a Start that
  could not decide its routine has, so it never opens for a frame and folds.
- + adds the machine and makes it the one in hand in one tap, and it rises
  into today's numbered group in the order done; a second add inside 400ms is
  the same tap landing on the row that slid under it (`add-bounce.ts`). While
  a + is on screen no row is under 40px. Out of service stays on the floor,
  says so, and has no +.
- The floor is a view: the session records only what was added
  (`ranWholeFloorUnchosen`, so a session with its own list is never Free and
  gets Next time). The empty Now Bar says "Tap + on a machine you're doing."
- Phone: today's machines as cards, then the rest of the floor as names, each
  with a 40px Add.

### 4.3 Who's this? (finding 3; `bc6be8b6`)

- **A RULES CHANGE, deployed before the app.** `firestore.rules`: the
  exerciseLogs update rule gained `logTakesItsSessionsClient` (a set with no
  client may take the client its own session is given in the same batch,
  while that session is still open; nothing else about a set's client
  changes). Without it in production every Who's this? batch is refused and
  the session stays open with a toast. Rules tests: the assign batch passes, a
  twenty-set floor session passes in one batch, a set with a client can't be
  moved, a set can't take a client its session doesn't get or follow on its
  own afterwards.
- Assign is ONE `writeBatch`, never awaited: the session gets the client's
  fields as a client Start writes them, every set gets the client, gathered
  when the batch is built (screen, typing timer, the iPad's copy, the
  server's list when the copy may not hold them all); a Finish tapped while
  the reads are out issues it first. A refusal is a toast, the sets are sent
  again, and the client on screen goes back through AppContent's raw setter.
- Who's this? in the session bar at any time: the session carries on as the
  client's. At Finish the End session question comes back as the client's and
  the ordinary Finish runs (the Wrap-up, Next time).
- Finish straight after Who's this?: a machine missing from settings the
  server hasn't answered writes today's weight only (`settingsOnFileKnown`).
- The picker matches like the Client Directory and shows names only; New
  client is drawn over the session, never waits on the network, and is given
  the session in the same tap.

### 4.4 Start from a routine… (AJ's "1b"; `f98f5976`)

- The grid's corner (and the phone's foot) opens a sheet of routines, each by
  its name and its first machines: the client's Routine A and B once the
  client is known, the studio's starting routines (day one), its templates
  (its trainers' saved ones too) and head office's. One tap lays the routine's
  machines on this floor at the top of today's list in order, what is already
  done kept first; the rest of the floor stays below. What the floor lacks,
  what the client can't do and what is out of service are named, never
  dropped. Nothing writes a routine.
- Nothing is said off a read that hasn't answered: a failed starting-routines
  read is said as Start a plan says it; the client's routines still reading
  hold their place; the item waits while Start decides the client's routine.
  The trainer-saved templates are a third read on the existing (tier, scope)
  index.

### 4.5 Set up and the dial (AJ's "2a"; finding 5; `88d8afd8`)

- The Now Bar's setting tiles are one 40px raised button
  (`journey-grid/setup-button.ts`): "Set up · 2 not set" on a first time, the
  settings themselves once set; the phone's card has the same. It opens the
  machine card on the first empty dial, on the number pad; Next to the next
  empty dial; "Use studio standard for all" from two empty dials with a
  standard; Save set-up closes the card with a ten-second Undo in the toast.
  Seat 12 and Back pad 3 on a first time: three taps and the digits.
- Finding 5: the editor is judged once as it opens and held; an empty dial is
  always typed; the field asks for the number pad; no Gap 0. Programming →
  Setup asks a reason for changing saved settings, never requires one.
- From the phase's review: the toast's Undo is laid onto what this iPad knows
  the settings are at the tap (`known-settings.ts`, `undoOnto`); Set up is
  said only off the server's answer.

### 4.6 Settings held on the session until Assign (3a; finding 4; `eb748fb4`)

- **The card's Save in an open session keeps the set-up on the session**:
  `sessions/{id}.heldSetup.{machineId}` = `{ values, sources?, at, byUid }`
  (the Auth uid, the server's time; `sources` only for a value taken from a
  suggestion), one update, issued and never awaited
  (`features/open-session/held-store.ts` `keepHeldSetup`). The card says
  "Kept on this session · saved to the client when you choose them" where
  "Last changed" would be, asks no reason (nothing would carry it) and offers
  no fit review. It reads the held values back as what is saved, so reopening
  shows them; the Now Bar's Set up counts them and is offered in an open
  session again; each set typed after it carries them as its settings. No
  setting history, journal copy or machine-fit row is written for them: there
  is no client yet.
- **At Assign** (Who's this?, or at Finish) every held machine's settings
  document and history row for the chosen client go **into the assign's own
  batch** (`equipment/mutations.ts` `queueSettingsSave`), and `heldSetup` is
  deleted in the session's write in that batch: all of it lands, or none of it
  does and the values are still on the session. A held value wins only for
  the dials it set (`heldOverSaved`), and the write names only those dials, by
  name, whatever this iPad read (`dialsOnly` with `writeDials`), so every
  other dial the client already has stays as the database holds it, and a
  stale copy can't drop a held value either. A suggested value reaches the
  client as suggested. The **journal copy and the machine-fit row go only once
  that batch has committed** (`afterCommit`): a refused assign leaves neither,
  and choosing the client again files no second copy.
- **Only the server's word says what the client had.** The client's settings
  are read beside the sets (the iPad's copy, then the server's for 3 seconds
  at most) when the session holds a set-up at the tap. Only the server's
  answer, in by the time the batch is built, lets a move say "Initial setup"
  or write the client's machine-fit row (it is written whole, `rows.{clientId}`,
  and would otherwise replace her other dials and their reviews with the held
  ones). Off the iPad's copy, a slow server, Finish inside the 3 seconds, or a
  set-up kept after the tap (no read at all), the history row says "Settings
  update" and the fit row waits for the rebuild or the next save.
- **No write names an empty client any more.** `saveSettings` throws before
  writing anything with no client, `acknowledgeFlag` the same, and
  `addMachineNote` refuses a note with no client (the journal used to drop it
  and still answer "saved"). A note about the client before Who's this? says
  "Choose who this is first (Who's this?) · your words stay here", writing
  nothing and offering no Try again; "The machine itself" still files. A card
  with no client and nowhere to keep its settings reads only.
- **Old ghost records may exist in production**:
  `clientMachineSettings/_{machineId}` documents with `clientId: ""`, and
  setting-history rows with `clientId: ""`, written by open sessions before
  this round. They are harmless: nothing reads an empty client (every reader
  queries by a client's id). They are left alone; nothing deletes data.
- No rule changed in THIS phase: the sessions update rule already let the
  session's trainer (or anyone at its studio) write `heldSetup` (the
  whole-branch review then held it to an open session, §4.7). The rules did
  change in the Who's this? phase (§4.3): a rules deploy, before the app.
  Rules tests: the trainer keeps a set-up (with a suggested value's source),
  a trainer the session is nothing to is refused, and the assign batch that
  saves the held set-up to the client and deletes `heldSetup` passes.

**The review's fixes (Oct 9 2026).** Two reviewers read the phase before it
was committed; what they found and what was done:

- The journal copy and the fit row were issued while the assign's batch was
  being built, so a refused assign half-wrote: they wait for the commit now.
- A move off an unread or cache-only answer claimed a first set-up and
  replaced the client's machine-fit row with only the held dials: only the
  server's answer claims either now.
- A held value a stale copy already showed was left out of the write and
  then cleared with the hold: the held dials are written by name.
- A suggested value was saved to the client as typed, so machine fit could
  learn from its own suggestion: the held entry keeps `sources` beside the
  values (inside the one new field AJ OK'd; flagged for him) and Assign passes
  them on.
- **An Undo that outlived Assign** (the toast's ten seconds, or a card still
  open as the session got its client) wrote `heldSetup` onto a session that had
  its client, where nothing moves it, or wrote the client's whole map from the
  open session's save. An Undo now goes where its save went, and a keep is
  refused once the session's assign batch is built: the card says "Already
  saved to Judy · change it here", the toast "Leg Press: already saved to Judy
  · change it on the machine's card".
- After Assign the iPad's copy of the client's settings can hold only the
  moved dials until the server answers, and the card's next whole-map save
  would wipe her others: until the tracker's settings listener has had the
  server's answer for the client (`settingsUnsure`), the session card writes
  only the dials it changes, no fit row and no first set-up claim.
- A failed held set-up stopped the whole assign: the held part is worked out
  in its own `try`, and on a throw the values stay on the session while the
  session and its sets still get the client.
- A refused keep, once the card had closed, was said "for the client": it says
  "on this session" now (`refusedHeldWords`). A note about the client before
  Who's this? said "Couldn't save" with a Try again that could never work: it
  says to choose who this is.

### 4.7 The whole-branch review's fixes (Oct 9 2026)

Five reviewers read the whole branch. AJ's step-by-step protocol (Oct 9 2026):
finish one area completely, and put anything noticed outside it on a parking
list (§5) rather than into the build. Fixed here, inside the open session's
area:

- **Finish and the starting weight.** Only the server's answer says what the
  client has on file: an entry on the iPad may be a partial document a merge
  left (the assign's held set-up, the card's dials-only save), so no starting
  weight is written off it. The starting weight is today's only on the
  client's FIRST performed set on the machine (their totals answered and hold
  no earlier one): a Finish whose settings weren't known wrote none, and the
  next Finish backfilled the second session's weight as the start; with none
  on file the figure falls back to the first counted set
  (`lib/sync-utils.ts`). A client added here (New client) has nothing on file
  anywhere, so every machine is a first time (`newClient`).
- **The last client's settings.** The tracker's settings are kept with whose
  they are: a client chosen a moment before Finish (or the open session
  reached from another client's briefing) got the last client's seat and
  positions written onto theirs. The last client is let go of when the screen
  goes to no client: the open session's bar said their name.
- **Next time after Who's this?** Finish before the client's routines answer
  freezes Next time's inputs and works the card out on the Wrap-up once they
  do (`nextTimeLater`); a client added here has their empty routines known
  even from the iPad's copy, so a walk-in's Routine A comes offline too. The
  Wrap-up's ticks start as the late card says. The Wrap-up's lines compare
  nothing and call nothing a first until the client's earlier sessions are
  the server's (`priorKnown`, `todayLines`).
- **Laying the client's Routine A or B** on a session with no routine: the
  session ran it, so Next time offers today's machines to that routine
  (`laidRoutineRef`, never written on the session).
- **Assign.** Discard while the reads are out drops the assign; the client's
  first Journey day is marked only once the batch has landed; the screen the
  trainer is on now is never switched to the client once they left the
  session. A refused assign sends the session's sets again LETTING GO of the
  client (a set typed after the tap landed with it), so a different client
  can be chosen and Finish is never refused for them every time. Each held
  set-up is signed by whoever kept it.
- **The rules** (a rules deploy, §4.8): a set's client may be given only by
  the write that also closes its session (`isUnassigned` false), and Finish
  closes a session that was ever open; a set of a still-open session may let
  go of a client; an open session is given only a client on record once the
  write lands (a refused New client refuses the assign with it, never a
  session naming a client that doesn't exist); `heldSetup` only while the
  session is open (and the card's hold door only for one).
- **Start and the way back.** Open session finds the trainer's live open
  session whatever else of theirs runs; never follows one started at another
  studio after a switch; after a reload offline goes back to the device's
  remembered session read from the iPad's copy instead of starting a second;
  and goes back to the trainer's ABANDONED open session (an hour with nothing
  typed), where the Active Session asks: Resume it (Who's this? still there),
  or Start a new session, leaving it as it is. A refused Start is said by the
  screen holding it, with its typed sets kept. A failed read of the studio's
  open sessions says so with Try again, never "No session is open here".
  The open-session listener's sort has its own index (§4.8).
- **Words and looks.** Finish's question says "Choose the client" and "New
  client", as the bar and the picker do. "Why?" is asked only when a saved
  value changes, as Programming → Setup asks (a blank dial filled isn't a
  change). A Start from a routine… choice with nothing to lay lies flat; its
  line says "None of its machines can go on today's list". On a phone with
  nothing on today's list, the doors (Start from a routine…) come before the
  floor. The picker says it is reading the clients, or couldn't, never "No
  clients found" off a roster that hasn't answered; it writes names with the
  Directory's one function (`clientDirectoryName`). Add a client's duplicate
  warning is in the caution plum, never Tailwind amber, and Force create is
  an ordinary button.
- **Tidy.** `startUnassignedSession` is `startOpenSession`; sign-out's
  `ownSessionClientName`; the Set up alias gone; the held source type
  declared once; `known-settings` names its key an owner (a client or
  `held:{sessionId}`); the stale notes in `next-time.ts`, ARCHITECTURE,
  KNOWN-TRAPS, the features index, `setup-plan.ts`, `undoOnto` and the
  unsaved-changes README corrected.

### 4.8 How to ship

A push reaches no iPad (Render deploys by hand, `CLAUDE.md` → Environments),
and nothing of this round is on master yet. The ship script is
`scripts/ship/ship-open-session.ps1`, run from this branch's folder,
`.claude\worktrees\first-session-routine-plan-ui-2f8dc1` (on
`oct9/open-session`; do not switch branches by hand).

**Where production stood when this was written** (Oct 9 2026, about 8:50 PM
Eastern, read only): the web service serves `546bb0a` (`/version.json`
says `2026-10-09T16:31:34Z-546bb0a`), so the first-session rounds are live;
the rules live on the named database are master `546bb0aa`'s
`firestore.rules`, the same text (released 12:15 PM Eastern; read with
`scripts/check-live-rules.ts`), so the first-session golive ran; the
starting routines' index (`routinePresets`, tier and scope) is READY; this
round's `sessions` index is not there yet. Whether the seed ran and Round 65
was walked is not recorded here: ask AJ.

1. **Round 65 first.** AJ agreed this round ships after his iPad walk of the
   first-session round (`docs/ops/TESTING-CHECKLIST.md`, Round 65). Since
   Render serves those rounds now, it can be walked on the live app.
2. **Prepare.** `powershell -ExecutionPolicy Bypass -File
   .\scripts\ship\ship-open-session.ps1 -Stage prepare`. It changes nothing
   in production or in git (it writes only `logs\`, `dist\` and `build\`): the
   branch and a clean tree; master on GitHub, read with `git ls-remote`,
   `546bb0aa` or already this branch's head (anything else stops it); the
   branch fast-forwards it; the rules and the index changed and holding this
   round's; no function changed; the Firebase login; the restore tag free;
   with the service-account key, the live rules read and found to be
   `546bb0aa`'s or this branch's (anything else stops it: rules from
   somewhere else were deployed); no Windows line ends; the case check; the
   typecheck count; the suite in Eastern time; the functions; the three
   builds and the first screen's budget; no perf lab marker; the rules tests.
   It ends PREPARE PASSED and records the commit it tested; golive refuses
   any other.
3. **Golive.** The same line with `-Stage golive`. It asks for GO, then, in
   this order, stopping at the first failure and saying what is live:
   1. **the index**, `npx firebase deploy --only firestore:indexes --project
      prod --non-interactive`: one new composite on `sessions`
      (`hostedAtStudioId`, `isUnassigned`, `status`, `createdAt` descending),
      the open-session listener's newest twenty. Without it Enterprise sorts
      outside an index on every snapshot. It never deletes an index (never
      `--force`: the two TTL policies are not in the file);
   2. **the rules tests again, then the rules**, `npx firebase deploy --only
      firestore:rules --project prod`: the exerciseLogs update rule, which is
      Assign's (`logTakesItsSessionsClient`: a set with no client takes its
      session's client only in the write that gives the session that client
      and closes it; `logLeavesItsOpenSessionsClient`: a set of a still-open
      session may let go of a client after a refused assign), and the
      sessions update rule (`openSessionWriteOk`: `heldSetup` only while the
      session is open, and an open session given only a client on record).
      Rules FIRST: under the rules live now every Who's this? batch is
      refused and the session stays open with a toast. They are safe for the
      app on Render now: it never writes `heldSetup`, never assigns in a
      batch, and assigns only a client that exists (its sets were refused
      before and still are);
   3. **the live check.** The ship scripts read the live ruleset with
      gcloud's sign-in, and gcloud is not on AJ's PC. So golive runs
      `scripts/check-live-rules.ts` with the service-account key from the
      project folder (read only: every request a GET, no file written; the
      check Claude ran by hand for the first-session golive on Oct 9 2026),
      which must say the live ruleset is this branch's `firestore.rules`.
      It also prints the console check: Firebase console → Firestore → the
      named database (`ai-studio-32cbbdcc-…`) → Rules → the newest release
      (today), Ctrl F `logTakesItsSessionsClient` and `openSessionWriteOk`.
      Without the key, or if the script can't run, AJ makes the console check
      and types LIVE;
   4. **the restore tag** `restore/2026-10-09-before-open-session` =
      `546bb0aa`, pushed if it isn't on GitHub;
   5. **the push**, `git push origin oct9/open-session:master`, fast-forward
      only, and only while master is still `546bb0aa` (asked of GitHub again
      just before); when master is already the branch, nothing is pushed.
4. **The index built**, in minutes: the same check with `--index
   "sessions(hostedAtStudioId, isUnassigned, status, createdAt desc)"` says
   READY (golive prints the line), or Firebase console → Firestore → the
   named database → Indexes says Enabled. Until then the listener scans, as
   any query without its index does: nothing breaks.
5. **This round's iPad walk, FIRST, before Render**: Round 66 of
   `docs/ops/TESTING-CHECKLIST.md`, against this PC (`npm run dev` in this
   folder; Safari at `http://<the PC's Wi-Fi address>:3000`, never the Home
   Screen icon, which is the live app). The dev server writes to production,
   whose rules are now this round's, so Who's this? works there. AJ's rule
   is at most two rounds shipped before an iPad walk.
6. **Render**: Manual Deploy on the web service (then `curl.exe -s
   https://maxstrength-app-beta.onrender.com/version.json` names the new
   build), and Manual Build on BOTH cron jobs, `journey-cron-renewals` and
   `journey-cron-leaderboards`. Of what this round changed, the server's and
   the crons' bundles take in only the Directory's row and the name it
   moved into `lib/client-name.ts` (`clientDirectoryName`, the same words),
   so nothing they do changes; build them anyway, because a cron left out
   keeps running its old commit, and all three stay on one. A push deploys
   nothing there.
7. The iPads pick the new version up by themselves on the Hub, never over a
   session or while typing. Front-desk computers: reload the page.

**To undo**: `git push --force origin
restore/2026-10-09-before-open-session:master`, then the same three Render
buttons. The rules and the index can stay: the app before this round never
writes what they refuse. A session the new app left holding `heldSetup` is
harmless to the old app (it never reads the field); its values stay on the
session, unsaved to any client.

No Cloud Function; no Mindbody call, timer or cadence change; nothing
contacts anyone. The one new stored field is `sessions/{id}.heldSetup`
(AJ's "3a" OK).

### 4.9 Measurements

| Phase | Typecheck | Suite | Rules tests |
| --- | --- | --- | --- |
| master `546bb0aa` (the first-session rounds) | 2 | 13,132 in 802 files | 334 |
| 4.2 the FileMaker floor (`ce7d9a55`) | 2 | 13,216 in 806 files | — |
| 4.3 Who's this? (`bc6be8b6`) | 2 | 13,262 in 808 files | 342 |
| 4.6 settings held (`eb748fb4`) | 2 | 13,419 in 814 files | 345 |
| 4.7 the whole-branch review's fixes (`95ffb20c`) | 2 | 13,454 in 814 files | 351 |
| 4.10 the screens preview's fixes (`3f5c97e1`) | 2 | 13,456 in 814 files | — (no rule changed) |

**Measured for the ship** on Oct 9 2026, 8:40 to 8:55 PM Eastern, on
`3f5c97e1` (this commit adds a script under `scripts/` and changes no app
code), in this worktree on AJ's PC with its files in LF:

| Check | Result |
| --- | --- |
| The suite, `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` | **13,456** passing in **814** files (master `546bb0aa`: 13,132 in 802) |
| Typecheck, `npx tsc --noEmit` | **2**, the baseline (`clinical-review/charts.tsx`, `EditTrainerModal.tsx`) |
| Rules tests, `npm run test:rules` | **351** passing (334 on master: 8 for Who's this?, 3 for the held set-up, 6 from the review) |
| The functions, typecheck and tests | Clean; **263** passing and 1 skipped in 14 files (none of theirs changed) |
| Production build, `npx vite build`, then `npm run check:bundle` | Clean; the first screen **464.1 KB gzip** of the 480 budget (8 files, 1,605.8 KB raw; 462.2 on master) |
| The crons and the server, `npm run build:backend` and the server's esbuild | Clean |
| The perf lab's markers in `dist/` | None |
| Windows line ends, `git ls-files --eol \| grep -c w/crlf` | **0** |
| Two names differing only by case | None |

AJ's own `npm run test:rules` is the run that counts; the ship script runs
it twice (prepare, and golive before the rules go out). On this PC every
rules run leaves its emulator on port 8080 (seen again on Oct 9 2026): stop
it before the next run, as the script offers to.

### 4.10 The screens preview (Oct 9 2026)

The round's screens were shot from the real components over example data
(the git-ignored `harness/screens/`, its Firestore stub now applying writes
in memory so +, Set up, Save, Who's this? and Finish run through the app's
own code; nothing reaches Firebase). Two things the shots showed on the
machine card in an open session, before Who's this?, both fixed with a
mounted test (`MachineMenu.render.test.tsx`):

- The list of notes said "Loading notes…" for as long as the session had
  no client: there is no client journal to wait for. It says "The client's
  notes show here once you choose who this is (Who's this?)"
  (`note-target.ts` `NOTES_NEED_CLIENT`, `MenuNotes`).
- The chart's heading read "How This client has done here": the fallback
  name sits mid-sentence in every sentence that uses it, so it is "the
  client" (`useMachineMenuData` `ctxName`).

### 4.11 Not done, and why

- **Nothing is pushed or deployed.** The push, the index and the rules are
  golive's, which AJ runs; Render's three buttons are his. The round ships
  after his Round 65 walk, as agreed, and its own walk (Round 66) comes before
  Render (§4.8).
- **The old ghost settings records stay where they are.** Open sessions
  before this round saved their settings to
  `clientMachineSettings/_{machineId}` with `clientId: ""`, and their
  setting-history rows with `clientId: ""` (finding 4). Nothing writes them
  any more (`saveSettings`, `acknowledgeFlag` and `addMachineNote` refuse an
  empty client), and nothing reads them: every reader asks for a client's id,
  and no client's id is empty. They are harmless and are left in place;
  nothing deletes data, and their values belonged to no one, so there is
  nothing to move.
- **No production data was read for this round's work** beyond the live
  rules' text, the indexes' states and `/version.json` (§4.8), all read only.
- **`CLAUDE.md` is not edited.** Its trim is waiting for AJ's review on
  `oct9/claude-md`; §6 holds this round's lines in the trim's short form, to
  go in after it.
- **The parking list (§5)** was left as found, by AJ's protocol: each item
  is outside this round's area or needs his call. Two are his to answer:
  whether Next time builds Routine A with a laid starting routine's plan,
  and whether a never-read client's floor opens offline.
- **The Hub peek's "Open session"** keeps its name: renaming it is the Hub's
  next round (§5).
- **No new Cloud Function, Mindbody call, timer or cadence.** Practice
  profiles and free-form sessions stay a round of their own (the
  first-session round's §7.5).

## 5. Parking list

Noticed by the whole-branch review outside this round's area, or needing AJ's
call; left unfixed (AJ's protocol, Oct 9 2026). One line each: what, where,
why it matters.

- **A set can still be moved by deleting and re-creating it.** `firestore.rules`
  exerciseLogs `create` accepts any `clientId` for any session, and any
  trainer may delete any set: "a set's client never changes" holds only for
  update; create should match its session's client, and delete should be the
  session's trainer's or studio's (pre-existing).
- **The Hub peek's "Open session" is a different thing.**
  `hub-schedule/peek-model.ts` (kind `open-session`) resumes a client's
  running session under the words that now name the session with no client;
  rename it ("Go to session") when the Hub is next touched.
- **Operations → Today's "Left open" row has no action for an open session.**
  `admin/overview/TodayBrief.tsx` draws "Open the session" only with a
  client: a leader can't take up or clear an abandoned open session from
  there (the trainer is now asked, through Open session).
- **The Session tab is for live sessions only.** `lib/live-session.ts`
  `findMyLiveSession`: after an hour with no heartbeat the tab disappears, for
  a client's session as for an open one; Open session now asks about an
  abandoned open session, but the tab says nothing of it.
- **Offline, a session just started is in no sessions stream.**
  `hooks/useSessions.ts` ranges over `createdAt`, and a write the server
  hasn't stamped matches no range: the phone's Session tab, the Directory's
  "Back to the open session" and sign-out's question don't know of it until
  the server answers (client Starts too). Open session itself now finds it
  from the device.
- **A starting routine laid in an open session carries no plan.**
  `routine-plan/start-from.ts`, `next-time.ts`: laying the Academy's start for
  a client new to the studio puts only its day one on today's list, and Next
  time makes Routine A with no plan (no "3 of 6", no road), where the
  briefing's Start a plan gives one. AJ's call: should Next time build
  Routine A with that start's plan (`startingPlanFromRoutine`)? The round says
  "Today's list only".
- **Offline, a never-read client gets no floor.** `WorkoutTrackerView`
  `floorView` and `startFromOffered`: an empty cached routines answer is not
  trusted, so a routine-less client session never opens the floor or offers
  Start from a routine… until the server answers (the corner's All machines
  still opens it). The earlier review chose "never opens for a frame and
  folds again"; AJ's call between the two.
- **`heldSetup.{m}.at` has no reader.** `open-session/held-setup.ts`: the
  history row and the journal copy are dated at Assign; date them from `at`,
  or stop writing it (AJ OK'd the field's shape).
- **Add a client offers home studios the trainer can't add a client at.**
  `components/CreateClientModal.tsx` (`studiosInRealm`): the rules refuse the
  write; the assign now fails with it, but the form shouldn't offer them.
- **CLAUDE.md has no row for `src/features/open-session/`.** The row, the
  decision and the Tests figure are written in §6, in the trim's short form,
  for after AJ's review of the trim (the features index has the row now).

## 6. For CLAUDE.md after the trim

`CLAUDE.md` is not edited in this round: its trim is waiting for AJ's review
on `oct9/claude-md` (the full decisions move to `docs/DECISIONS.md`;
`CLAUDE.md` keeps one map line per area of at most 320 characters, and each
decision at most 650 characters with ONE short AJ quote and a "More" link).
Once the trim is in, these go in, in that form. Each line below was measured
against those limits.

**The map ("Where things are").** One new row, and the clause this round
adds to two rows the trim keeps (if the trimmed row reads differently, keep
its words and add the clause in its place):

```
| The open session | `src/features/open-session/` (Oct 9 2026, AJ's "1b 2a 3a"): Start (`start.ts`); Who's this? (`tracker/ClientSelectionDialog`) and Assign's one batch (`assign.ts`); `heldSetup` until then (`held-setup.ts`); the floor a view (`journey-grid`). README first; `docs/rounds/2026-10-09-open-session.md` |
```

```
| The machine menu (one card per client and machine) | `src/features/machine-menu/` (Oct 4 2026): safety, the settings, Notes, the Staircase, in a session and on the profile. The Now Bar's **Set up** opens it on the first empty dial, on the number pad (`journey-grid/setup-button.ts`, Oct 9 2026). README first |
```

```
| A new client's first session and a routine's plan | `src/features/routine-plan/` (Oct 7 to 9 2026): the plan, starting routines, Can't do, B, Next time. **Start from a routine…** in the session's corner lays one on today's list and writes no routine (`start-from.ts`, Oct 9 2026). README first |
```

**The decision** ("Decisions already made", Product):

```
- **An open session is a FileMaker session, with the routine builder on demand** (AJ, Oct 9 2026: "feel most like a filemaker session"; "1b 2a 3a"). Every machine on the floor shows and + builds today's list; the session records only what was added, never the floor. Start from a routine… lays one on today's list and writes no routine. Set up opens the machine card on the first empty dial. Settings typed before the client is chosen stay on the session (`heldSetup`) and reach the client with the sets in Who's this?'s one batch. [More](docs/DECISIONS.md#the-open-session)
```

**Its full text, for `docs/DECISIONS.md`:**

```
### The open session

**An open session is a FileMaker session, with the routine builder on demand** (AJ, Oct 9 2026: "i think the open session should honestly feel most like a filemaker session, its the barebones but also i want to be able to take advantage of our routine builder so we can use it if we wanted too. the only thing is with the new routine is a client has no settings so you need to be able to adjust the settings quickly while running the routine"; his picks "1b 2a 3a"; `docs/rounds/2026-10-09-open-session.md`). The open session is the Client Directory's Open session: a session started before the client is chosen (`isUnassigned`), in `src/features/open-session/`. **1b, the FileMaker floor:** every machine on the studio's floor shows, in its walking order, and + adds one to today's numbered list in the order done; out of service stays on the floor with no +; a client session with no routine gets the same floor, so every routine-less session looks alike. The floor is a VIEW: the session records only what was added (`sessionMachineIds`), never the floor, so after Who's this? the Wrap-up's Next time can start Routine A from it. **Start from a routine…** in the grid's corner lays a routine's machines on today's list in one tap (the client's Routine A or B once known, the studio's starting routines, its templates, head office's), naming what the floor lacks, what the client can't do and what is out of service; it writes no routine, and Routine A still comes only through Next time. **2a, quick settings through the one machine card:** the Now Bar's **Set up** ("Set up · 2 not set" on a first time, the settings once set) opens the card on the first empty dial, on the number pad; Next walks the empty dials; "Use studio standard for all" from two empty dials with a standard; Save set-up closes the card with a ten-second Undo (two dials: three taps and the digits, from six). An empty dial is always typed, and the editor is judged once as it opens. **3a, settings held on the session:** before the client is chosen, the card keeps its values at `sessions/{id}.heldSetup.{machineId}` (AJ's pick is the OK for that one new field), never on a ghost record; Who's this? (any time from the session bar, or at Finish) gives the session, every set and the held settings to the client in ONE batch, never awaited, deleting `heldSetup` in it, and the session carries on as theirs: their settings, history, the ordinary Finish, the Wrap-up and Next time. The rules hold it: a set's client changes only in the write that gives its open session that client and closes it; `heldSetup` only while the session is open; an open session is given only a client on record. Start is one write, never awaited, one open session a trainer, and an abandoned one is asked about, never taken up silently. No write names an empty client. A reason for changing saved settings is asked, never required, on Programming → Setup too.
```

**The Tests figure** (the Commands table's Tests row; the row it replaces
moves to `docs/KNOWN-TRAPS.md#baselines` word for word, as each round does):

```
**13,456** passing in 814 files on `oct9/open-session` (Oct 9 2026: the open session on master's `546bb0aa`; typecheck 2; rules tests **351**; functions 263 passing and 1 skipped; first screen 464.1 KB gzip; `TZ=America/New_York npx vitest run --dir src --testTimeout=30000` in a worktree on AJ's PC, its files in LF; ships with `scripts/ship/ship-open-session.ps1`)
```
