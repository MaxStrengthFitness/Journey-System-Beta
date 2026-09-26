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

## Related pieces elsewhere

- `src/lib/pending-log-edits.ts`: a set whose write is still queued keeps what the trainer typed when another machine's save lands.
- `src/features/journey-grid/send-at-once.ts` and `SessionNowBar`'s `onCommit`: a set is sent the moment it is entered, not after the typing wait.
