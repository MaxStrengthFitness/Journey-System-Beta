# The open session

A session started before the client is chosen: the Client Directory's **Open session** button. It is stored as an ordinary session with `isUnassigned: true` and no `clientId`. The round is `docs/rounds/2026-10-09-open-session.md` (AJ's picks "1b 2a 3a"); read it first.

The Hub peek's "Open session" is a different thing: it resumes a client's running session.

## Start (`start.ts`, used by `src/hooks/useClientMutations.ts`)

- **One write, never awaited.** The id is made on the iPad (`doc(collection(db, "sessions"))`), one `setDoc` is issued, and the screen moves to the Active Session in the same tap, online or off. A refusal comes back through the write's promise: a toast (`OPEN_SESSION_REFUSED`), and the device forgets the session.
- **Nothing is seeded.** The session records an empty list (`sessionMachineIds: []`) and no sets. It used to seed six machines by Title Case names the floor spells in capitals, and where one matched it wrote a ghost weight "0".
- **Signed as a client Start signs it** (`openSessionPayload`): `trainerId`, `trainerName`, `trainerInitials` and `startedByTrainerId` as a client Start writes them (the trainer document's id, which every reader of `startedByTrainerId` compares; the sign-in uid only when the trainer document has no id), `clientStartTime` from the iPad's clock (the timer runs from it until the server's start time arrives), `lastHeartbeatAt`, `pausedAt: null` and `totalPausedMs: 0`.
- **At this iPad's studio only.** With no studio on the iPad it writes nothing and says "Choose a studio first": the Active Session finds an open session in the studio on screen, so one written elsewhere could not be found again.
- **One open session a trainer.** While the trainer's own open session is running, Open session goes back to it and writes nothing (`runningOpenSessionId`): found in the studio's sessions stream, or, for the one this iPad just started and the device still remembers, before the database has it (offline). Once it is finished, assigned, discarded, refused, taken over or abandoned, the next tap starts a new one. The Directory's button says "Back to the open session" while one runs, and "Starting…" for a moment after a Start; a second tap inside `OPEN_SESSION_GUARD_MS` opens the session just started even on an iPad that cannot remember one.
- **The device remembers it** (`rememberLiveSession`).

## The way back (`src/lib/live-session.ts`)

- `findMyLiveSession` counts this trainer's live open session, so the Session tab appears, labelled "Open session" on the iPad.
- `resumeSession` is the tab, wired (AppContent hands it the reads and the moves): `resumeTarget`, a client's session or the open session (no client chosen, the device pointed at it), else `rememberedTarget`, the session the device remembered, read by its id, while it is live. An open session at another studio is said ("Your open session is at Solon. Switch to Solon to go back to it.") and kept, never followed to a screen that can't find it.
- `pickOpenSession` is which of the studio's open sessions this iPad records: a take-over still settling, the one on screen (however long its pause), the one the device remembers while it is live, then the newest live one of this trainer's. An abandoned one is never taken up without asking (Sep 24 2026), nor watched: a refused Start, or an Assign with an old one left over, used to put the sets typed next into yesterday's session. It took the first of this trainer's it came to, so a second open session could bring back the old one.
- Sign-out's question and the new-version line call it "your open session" (`ownSessionName` gives them ""), never "your session with a client".

## On the Active Session

- The open-session listener follows a studio switch (the studio is one of its dependencies), and reads the newest twenty (`orderBy("createdAt", "desc")`; the index that leads with `hostedAtStudioId` serves it): unordered, a session just started could fall outside twenty abandoned ones.
- Until the studio's open sessions answer, the screen says "Opening the session…" (`nothingKind`'s `opening`), never "No session is open here".
- Notes and Pulse are not drawn while there is no client: both need one, and they were buttons that opened nothing.
