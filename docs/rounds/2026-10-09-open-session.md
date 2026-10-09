# The open session: the FileMaker floor, and settings that go in fast (Oct 9 2026)

**Status: in build on `oct9/open-session`**, on master's `546bb0aa` (the
first-session rounds). It is not pushed. It ships after AJ's iPad walk of the
first-session round (Round 65), as agreed.

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

One commit per phase, each typechecked on its own (baseline 2). Measurements at
the end.
