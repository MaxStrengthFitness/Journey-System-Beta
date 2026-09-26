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

- `settleOrQueue` waits up to `FINISH_WAIT_MS` for the database's answer, and not at all while offline. Past that, the save is on the iPad, and the post-session screen says "saved on this iPad" until the answer comes.
- `finishedElsewhere` asks the server whether another iPad already finished the session. Finish then writes nothing, so the client's totals are never counted twice. Offline, or with no answer, it says no and Finish goes ahead.

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
- `sessionMachineList`, `firstOpenMachine` and `machinesDone` are what the watching screen reads off the session, by the same rules as the recording screen. `whoStartedIt` names the starter after a take-over, for the profile's menu and the History pop-up.

## Related pieces elsewhere

- `src/lib/pending-log-edits.ts`: a set whose write is still queued keeps what the trainer typed when another machine's save lands.
- `src/features/journey-grid/send-at-once.ts` and `SessionNowBar`'s `onCommit`: a set is sent the moment it is entered, not after the typing wait.
