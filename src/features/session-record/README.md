# The session record

The one thing Journey cannot lose or refuse is a client's session: the machines, their order, the weight, the reps and the quality (AJ, Sep 25 2026). This folder holds what the Active Session uses to keep that promise and to say so. The round is `docs/rounds/2026-09-26-session-record.md`.

## The line under the session bar

`SendStatusStrip` draws one line under the session bar, and only when there is something to say:

- **Offline.** "Everything you enter is saved on this iPad and sends when the connection is back." The sets really are saved there: every set goes into the iPad's own copy of the database as it is sent, and Firestore passes it on when it can.
- **Still sending.** When a save has waited `STILL_SENDING_AFTER_MS` while the iPad thinks it is online (studio Wi-Fi with no internet behind it), the line says the sets are saved on the iPad and still going.
- Otherwise nothing. An ordinary save never shows it.

The line sits at the top so it never covers the Now Bar's buttons at the bottom of the screen. It is never red, because red on the floor is the rep-quality mark. `send-status.ts` is the rule and its words; `useSendState.ts` is where the facts come from:

- the browser's `online` and `offline` events;
- `waitForPendingWrites`, called each time the tracker says `sent()` after issuing a set's write. Only the newest wait may clear the clock.

It reads nothing and writes nothing.

## Finish never hangs, and never counts twice

`finish-wait.ts`, used by `WorkoutTrackerView`'s `commitEndSession` and its post-session note writes:

- `settleOrQueue` waits up to `FINISH_WAIT_MS` for the database's answer, and not at all while offline. Past that, the save is on the iPad, and the Wrap-up says "saved on this iPad" until the answer comes.
- `finishedElsewhere` asks the server whether another iPad already finished the session. Finish then writes nothing, so the client's totals are never counted twice. Offline, or with no answer, it says no and Finish goes ahead.
- What this cannot stop: an offline Finish that replays after another iPad finished the same session online. AJ judged that extremely unlikely (Sep 26 2026), so nothing on the database side guards it. Don't add a guard without asking.

## Start, Discard, Back to Hub and the machine Save never wait on the network

The speed round (Oct 5 2026, R9 in its blueprint). A write is on the iPad the moment it is made; what can take forever is the database's answer, so nothing a trainer taps waits for one.

- **Start** (`start-plan.ts` is the plan, `WorkoutTrackerView` issues it): the ids are made on the iPad, and the session, its new routine (only when one has to be made) and the prefilled sets go in ONE batch, issued and never awaited. The screen switches in the same tap, online or off. A refusal comes back through the batch's promise: it is said, and the session leaves the screen. A refusal can come late, after a whole offline session, so the sets typed meanwhile are KEPT (sent if still waiting, never deleted: they are the only record of what the client lifted, and an administrator can recover them), and only the untouched prefills are taken back (`refusedStartSweep`, the speed round's final review). The client's own fields (Routine B, the first session's day) are a SEPARATE write whose failure is logged, because the clients rules limit what a visiting or cross-train trainer may change and one refused field must never take the session down. The arrival note is its own write too.
- **Known.** The client's routines and machine settings are known once a snapshot has arrived (cache or server), except that an EMPTY routines answer from the iPad's cache is not known (it may only mean this iPad never read them; the routines listener hears metadata changes so the server confirming an empty list is heard). Until the routines are known Start makes no Routine A (an empty list there is "not read yet", which is how a second, empty Routine A got made); until the settings are known the prefilled weights wait. A settings read that fails before any answer counts as "no settings", so the last performed weights still prefill. Neither ever holds Start or Finish: the routine and the weights follow the moment they are known.
- **The seed never writes over a set this iPad holds**, so a weight typed while the seed waited is never overwritten when the connection comes back.
- **Discard** is one batch (the sets this iPad holds, every id the session's machines write under, and the session), never awaited; the Hub comes at once. Sets still waiting to be sent for it are dropped first. The legacy `sessionNotes` are no longer touched: nothing writes them, and only an administrator may delete one.
- **This session's notes** on the Wrap-up's tray and the note sheet come from the tracker's journal stream (`session-journal.ts`, R11); a screen reads them itself when the stream failed, is absent, or is the index-less fallback that came back at its limit (`JournalStream.newest`).
- **Back to Hub** from the Wrap-up issues its note writes side by side and goes; each says its own refusal.
- **Finish** starts the "already finished on another iPad?" read when the End Session dialog opens, and at the tap also reads the client's live sessions stream (`finishedElsewhereAtTap`), so starting early never widens the window in which a session could be counted twice.
- **The machine menu's Save** closes at once: "saved" online, "saved on this iPad" offline or once the answer is still out after `FINISH_WAIT_MS`; a later refusal takes the Undo back as before.

## Sign-out asks first

`sign-out-check.ts`, used by AppContent's `logOut`:

- `sendSetsNow()` has the Active Session send its waiting sets while the person is still signed in.
- `unsentWritesWaiting` checks whether every save has reached the database.
- `signOutQuestion` asks, in the app's one leave dialog, when the trainer's own session is still open or saves are waiting on the iPad.

A question, never a block.

## Never a blank page

`NothingOnScreen` and `nothing-on-screen.ts` cover the Active Session with nothing to draw: a client still loading, a read that failed, no record, or no session. Each gets the app header, one sentence and the way on. The shell passes `clientLookup` and `onRetryClient` so the tracker knows which case it is.

## Watching, and taking over

A session is recorded by the trainer running it, from any iPad they sign in on; anyone else watches it (AJ, Sep 26 2026: leaders "follow along", and a trainer can always get back into their own session).

- **Whose session it is** is `isAnotherTrainersSession` with `myTrainerIds`, in `src/lib/live-session.ts`. It matches every id a trainer's sessions can carry, and fails toward recording: a session with no trainer, or a person the app cannot identify, is never someone else's.
- **`WatchingSession`** is the Active Session drawn read-only: the session bar without its buttons, one line from `watchWords` (`watch.ts`), the grid with a Today column that only reads, and no Now Bar. `WorkoutTrackerView` holds the watched session as `watchedSession`, apart from `currentSession`, so nothing that records runs while watching.
- **Take over** asks first (`takeOverWords`), then writes `takeOverPatch`: the new trainer, with `startedByTrainerId` kept. Finish credits whoever finishes, as it always has. The iPad it was taken from sends its waiting sets and turns to watching.
- `sessionMachineList`, `firstOpenMachine` and `machinesDone` are what the watching screen reads off the session, by the same rules as the recording screen. `whoStartedIt` names the starter after a take-over, for the profile's menu and the session pop-up (Activity Archive → Calendar or Sessions).

## Related pieces elsewhere

- `src/lib/pending-log-edits.ts`: a set whose write is still queued keeps what the trainer typed when another machine's save lands.
- `src/features/journey-grid/send-at-once.ts` and `SessionNowBar`'s `onCommit`: a set is sent the moment it is entered, not after the typing wait.
