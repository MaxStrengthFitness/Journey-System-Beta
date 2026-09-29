# features/relay — Relay (was the Planner, was the To-Do screen)

**My Studio (Sep 19 2026):** Relay is the first section of **My Studio**
(`features/my-studio/MyStudioView`), which owns the masthead, the Relay
context and the Capture sheet now; `PlannerView` draws the board under it.
Relay's **Team** tab became My Studio's Team section (`team/TeamPanel`, beside
the studio's staff), and the Network tab moved to Operations → Overview → All
my studios (voice-review round, Sep 27 2026; its ranking of studios was
dropped), so the board's tabs were **Floor · Mine · Notes**, and since the Relay room (Sep 28 2026; AJ, q1) they read **Board · Tracker · Journal** (the ids `floor`, `mine`, `notes` never change). Relay is first for the trainer
between clients (AJ, Sep 27: leaders "have operations and the hub").
Read `features/my-studio/README.md` first.

**Relay (Sep 16 2026)** rebuilt the Planner as the studio's asynchronous
board and each trainer's second brain: the Now Bar, one Capture composer,
Next up and the Floor Map on the Floor, Mine's four lanes, the two-pane note
editor, the Team cockpit and the vault (Team is people and standards since
Sep 27), the Network tab (now on Operations), the Calendar layer, kudos. Everything Relay added lives in `board/` (its own README there; it was
`planner/relay/` until the beta-prep trim renamed this folder from
`features/planner/` to `features/relay/` on Sep 17 2026); the round is
`docs/rounds/2026-09-16-relay.md`. The view id stays `studio-tasks`.

The tabs were **Floor · Mine · Notes · Team · Network** until the My Studio
round moved Team out and the voice-review round (Sep 27 2026) moved Network
to Operations → Overview → All my studios (`features/admin/network/`). The
table under **Tabs** is what each one holds today.

Round: Learning + Planner, Sep 2026. AJ's brief:

> "the to do screen … needs to be renamed to something better … we should have a to do in the tasks and keep everything the same but we need to just have an area where trainers can store notes in folders and link clients to those notes to build plans and plan routine changes or additions or retention strategies or injury plans, just personal notes and personal tasks and the studio tasks"

He picked the name **Planner**.

**The Planner rework (Sep 16 2026)** made it the studio's operational and
knowledge-sharing hub: team jobs, the Team tab, the task wizard, reminders,
notes built over time and shared with colleagues. The round document is
`docs/rounds/2026-09-16-planner-rework.md` — read it before changing any of
this.

## Tabs

Relay's tabs are **Board · Tracker · Journal** (Floor · Mine · Notes until the Relay room, Sep 28 2026; the ids stay), and every one is everyone's. In
the Planner they were Studio · My tasks · Notes · Team.

| Tab | What | Where the data lives |
| --- | --- | --- |
| Floor | The studio's shared board (`features/studio-tasks/StudioHubView`, `embedded`), drawn as **the Board** since the Relay room (Sep 28 2026, `board/Board.tsx`): Right now, five doors (Floor work · Desk work · Help a teammate · From leadership · Mine), one job dealt to you, Just now; behind the doors, unchanged: the shift rings, the shift strip and the Floor Map, client tasks and renewals, the team jobs lane (`jobs/`), asks and initiatives, the playbook, and the network's focus (`board/FocusBanner`) | `studios/{s}/task*`, `taskRequests`, `teamJobs`, `playbook`; the focus on `networks/{id}.relayFocus` |
| Mine | A trainer's own list, drawn as **the Tracker** since the Relay room (Sep 28 2026, `MyTasksPanel` over `tracker.ts`): lists by WHEN, not by where the work came from — **Today** (Handed to you · Now · Follow-ups · Closing), **Coming up**, **Anytime**, **Someday · Growth**, **Done** — with Tracking, the lists and + To-do, New reminder and All my tasks in a rail beside them (above them upright) | `trainers/{uid}/task*` — private by path, since the Settings-tiers round; and the studio's asks, rows and team jobs the Board reads |
| Notes | A trainer's own notes, in folders, linked to clients, built over time; shared onto a client's record or with colleagues (`notes/`, with its own README) | `trainers/{uid}/notes`, `noteFolders`; copies at `clients/{id}/sharedNotes` and `studios/{s}/noteShares` |

**Team is not a tab.** It is My Studio → Team (`team/TeamPanel`, mounted by
`features/my-studio/TeamSection`), for the leaders of this studio
(`leads.ts`): people and standards since the voice-review round, Sep 27 2026.
People are listed by name, never ranked, with no "Behind" verdict. It reads
the Floor's paths.

**Network is not a tab.** The network's focus and a launch at every studio
are on Operations → Overview → All my studios, and at the foot of the
Overview for a franchise owner who sees one studio
(`features/admin/network/`). The ranking of studios was dropped.

## Decisions

- **The view id stays `studio-tasks`.** Notifications already sitting in trainers' bells link to it. Only the labels changed:
  - the bottom bar ("Planner", notebook icon; it is **My Studio** since Sep 18);
  - the settings link;
  - the Operations overview ("Studio tasks");
  - the Hub's day strip ("Tasks").

  The old list and its `?classic-todo` escape hatch were deleted in the cost
  round (Sep 2026).
- **A masthead like Learning's** (Learning + Planner round). A title, the tabs, and the studio and day on the right. AJ said both screens lacked "a good header", and both got the same one.
  - Embedded in the Planner, the hub's own title and date give way to one line: "Shared with everyone at {studio}".
- **One header** (Relay room, Sep 28 2026; the redesign's phase 1, AJ's pick). My Studio's masthead, Relay's tabs and the Now Bar were three bars, about a quarter of an upright iPad before any work. They are one bar (`my-studio/StudioHeader`): the section (its menu holds the five sections), Relay's tabs, the time (the shift, minutes free, the next session; a tap unfolds the day strip), Tracking (the job you took, `board/tracked.ts`), Ask and +. The floating Capture button went with it: Ask asks the team, + holds your own to-do, reminder or note (and a leader's studio task or team job). "Just now" is a still list on the Floor (`board/JustNow.tsx`).
- **My tasks shows what already existed.** Personal tasks were mixed into the studio's shift strip with a "Just you" badge. "New personal task" could only be reached through Manage → task form → back.
  - My tasks lists them on their own, in three groups: open, in time order; done today; and studio tasks a head trainer assigned to you today.
  - If any of its reads fails, it says it couldn't load all of today's tasks — never "Nothing on your list today" (`useStudioTasks` now reports an `error`, and waits for the personal task list before it stops loading).
  - Creating and editing uses the existing `TaskManager` in its personal-only mode. Nothing new is stored.
- **Asking the team has its own sheet** (Relay room, Sep 28 2026; phase 7, `board/AskSheet.tsx`). The header's Ask opens six typed tiles (Cover me · A hand on the floor · Hand this off · A question · Something's broken · Other), each asking only for what it needs, and the same sheet opens from where the need is: a session on the day strip ("I need cover"), a client's task on Desk work ("Ask"), and the row of tiles behind Help a teammate. The header's + stays for your own to-dos. A leader's hand-off arrives already that person's (AJ, q5); a trainer's is an offer anyone can take. A cover ask keeps its time since the second wave (Sep 28 2026, AJ: "all yes"): `taskRequests.coverAt`, the session's start beside its day (`board/cover.ts`). Help a teammate deals today's covers soonest first and says "needed at 4:20 PM", a cover for a later day doesn't press on today, Right now and Opening name only a cover needed today, Later today puts a teammate's cover at its time, and the ask comes down when the session starts.
- **The open-questions trail** (AJ approved, Sep 28 2026). A question about one client opens a thread on her record, written by the asker (kind `question`, Heads up while it is open, labelled "Open question from {name}"); the ask keeps the thread's id (`taskRequests.threadId`, the one new field); every reply, take-over and the answer is written onto the thread by the person doing it, and the answer closes it. The rules are `studio-tasks/question-trail.ts` and `client-notes/thread-write.ts`; the words on the record are `client-notes/note-catalog.ts`. A question is answered, not ticked: the Board deals it with "Answer", the Tracker opens its answer box beside the list, and Help a teammate's lane names the client and keeps a closed question's answer on screen ("Answered lately").
- **The Tracker sorts by when** (Relay room, Sep 28 2026; the redesign's phase 5, AJ's "mission tracker"). Mine had eight lanes that answered "whose is it" (your list, handed to you, team jobs, assigned at the studio, follow-ups, coming up, growth, done today) when a trainer between clients asks "what's next". The Tracker's rules are `tracker.ts` (+ test): Handed to you is work someone else put your name on (an ask handed to you, a chore a leader assigned, a team job with your name); Now is your own to-dos for today and what you took on the Board that is due today or overdue; Closing is your own to-dos for the end of the day (the closing shift, or a time from the studio's Closing on); Coming up is your timed to-dos in the next six days and what you took that is due later; Anytime is what you took with no day on it (a to-do you add always has one); Someday is Growth; Done is what you finished today, on your list, on the floor, on the board and in team jobs, newest first, and a tick on your own list can be taken back there. Nothing new is stored.
  - **A leader's assignment is simply yours** (AJ, q5): Done and "I can't", never "Take it · Not me · Later". "I can't" puts an ask back on the board for anyone, steps you off a team job, or opens Capture to ask the team to take a chore (only a leader may take a name off a chore, by the rules). The first two can be undone for eight seconds (the Board's `UndoBar`); stepping back onto a job you were on rings nobody's bell.
  - **An empty list is said only once every read has answered**: a read on its way is "Loading…", a failed one says some of the list couldn't be loaded, and neither says "Nothing on your list today".
  - The list you are on is module memory, and a sign-out forgets it.
- **Since you were in** (the second wave, Sep 28 2026; AJ: "all yes" to the marker and the lookup). The top of the Board's side column says what changed since this trainer last opened the Board at this studio: notices from leadership, who is new to the studio this week, machines off the floor or flagged, answers kept in the Playbook, hearts to you. New means after the marker, `studios/{s}/lastSeen/{uid}` (one small document, only that person's; read once a session and moved to now). "New this week" is her FIRST-EVER visit, never her first Journey session, from the client list and bookings the app already streams; a client it can't judge is counted under "couldn't check", and a list still loading or failed says so. Team today beside it is by chore (`board/team-today.ts`).
- **The tab is remembered for the session** (module state, not storage), and a sign-out forgets it. A fresh load starts on the Floor, where the shift rings are. Since the one header, a tab change asks about typing first (a leave scope in `MyStudioView`), as a section change does.
- **A client's profile can open the Planner** at a note: **Write a plan**, **Jot a note**, or **Edit in your Planner** on a shared note. The profile leaves its request in `intent.ts`, and the Planner reads it when it mounts. That avoids threading more state through AppContent, since the Planner is not mounted while the profile is showing.
- **A bell notification can open the Planner too** (rework): its link is `{ view: "studio-tasks", id }` with `id` = `job:<jobId>`, `share:<noteId>` or `mine`, turned into an intent by `plannerIntentFromLink` in `AppContent`.

- **The third wave (Sep 29 2026; the second wave's three leftovers, `docs/rounds/2026-09-29-relay-3.md`).** (1) **When a job was taken and when it was finished**: a join stamps `claims.{uid}` on the team job (the signed-in uid, one map key, the name and the server's time; stepping off removes it), and the sheet, the card and the Tracker's job rows say "Claimed by Sam 10:12 AM · done 10:40 AM" (`jobs/jobs.ts` `jobTimesLine`). A leader naming someone is not a claim. (2) **Trainers' own cases** sit under the Tracker's Follow-ups (`my-cases.ts`, `useMyCases.ts`: `studios/{s}/cases` where `owner.id` is the Auth uid, open, by `dueOn`, the cases index), overdue first, with `MyCaseEditor` changing only what the rules let the owner change (the next step, the due day, the outcome, the reason) through `saveCase`. (3) **Announcements that ask "I've read it"** (q7): `asksRead` on the notice, a checkbox on the composer; on Since you were in the notice stays new until this person taps "I've read it", one merge write of `acks.{id}` on their own `announcementReads/{uid}` (the retired `readBy` stamp is untouched). The poster counts nobody; nobody is pinged.

### The rework's decisions (Sep 16 2026)

- **Name kept: Planner**, not "Command" (the brief's suggestion). **Sharing is a copy**, not an `isShared` flag.
- **Team jobs** (`jobs/`) are neither task templates (those reset daily) nor board requests (those belong to whoever picks them up). One document at `studios/{s}/teamJobs/{id}`; parts are a MAP written one key at a time so two iPads never erase each other's ticks. **Nothing locks**: anyone at the studio can tick or close.
- **My Studio → Team counts only work with someone's name on it** (it was Relay's Team tab) (`team/accountability.ts` — its header is the rulebook). Today isn't judged; skipped isn't missed; a task someone else finished is done; notes are never counted. Counts with the thing named, no percentages. People are listed **by name, never ranked**, with no "Behind" verdict (voice-review round, Sep 27 2026: they were behind first, by a weight nobody saw).
- **Leader-only parts follow the studio the iPad is in** (`leads.ts`, the same answer as the `teamJobs` rules). `isStudioLeader` alone would offer a visiting head trainer buttons the rules refuse.
- **A reminder is a personal task with a set time** and `remindMinutesBefore` (`reminders/`). The trainer's own iPad writes the bell notification while the app is open (`PlannerReminders`, mounted in `AppContent`), at a fixed id so two iPads ring once; up to `LATE_GRACE_MINUTES` late. Nothing is pushed, texted or emailed.
- **The task form is a wizard** (`studio-tasks/TaskWizard.tsx`, pure steps in `task-wizard.ts`) ending with a sentence. `saveTaskTemplate` strips `undefined` — Firestore refuses it.
- **Shared kit** (`kit.tsx`, `kit.css`): avatars, toggles, segmented controls, the people picker, and the `.rk-*` / `.tw-*` / `.gb` styles, all on the `--st-*` tokens.

## Files

| File | What |
| --- | --- |
| `PlannerView.tsx` | Relay's tabs' content and the Context Panel beside it. Since the Relay room (Sep 28 2026) the tabs, the time and Tracking are in My Studio's one header (`features/my-studio/StudioHeader`), so the shell chooses the tab (`PLANNER_TABS`, `initialPlannerTab`, `rememberPlannerTab`) and a tab change is a leave scope |
| `GlanceBand.tsx` | The Floor's three at-a-glance tiles, drawn by `studio-tasks/StudioHubView` (it was the Planner's Studio tab) |
| `MyTasksPanel.tsx` + `tracker.ts` (+ test) + `tracker.css` | The Tracker (it was Mine, and My tasks before that), its pure lists by when, and its rail (prefix `rtk`). `Tracker.render.test.tsx` mounts it. `my-tasks.ts` keeps `taskMeta` (a row's small print); its `myTaskBuckets`, and `board/mine.ts`'s `handedAsks`, went with Mine |
| `jobs/` | Team jobs: `types.ts`, `jobs.ts` (+ test), `mutations.ts`, `useTeamJobs.ts`, `JobComposer`, `JobSheet`, `TeamJobsLane`. `claims` and `jobTimesLine` since the third wave (Sep 29 2026) |
| `my-cases.ts` (+ test), `useMyCases.ts`, `MyCaseEditor.tsx` (+ render test) | The cases a trainer owns, under the Tracker's Follow-ups (the third wave, Sep 29 2026) |
| `team/` | My Studio → Team, people and standards: `accountability.ts` (+ test), `useInitiativeProgress.ts`, `TeamPanel` |
| `reminders/` | `reminders.ts` (+ test), `useReminderBell.ts`, `PlannerReminders` (the watcher). The Calendar's strip is `board/RelayStrip` since the Relay round; the older `ReminderStrip` was deleted, unused, in the beta-prep trim (Sep 17 2026) |
| `notes/` | The Journal tab (the Notes tab until Sep 28 2026): notes, and since the second wave the six typed notes, shelves, hunches, the Studio shelf and the day log — see `notes/README.md` |
| `kit.tsx`, `kit.css`, `ClientPicker.tsx` | Shared pieces |
| `leads.ts` | Who leads the studio the iPad is in (`leadsHere`): My Studio asks it for Team and Studio, and the rules give the same answer |
| `intent.ts` (+ test) | Opening Relay at a note, a job, a share, Mine or the Floor |
| `planner.render.test.tsx` | Mounts My Studio: Relay's three tabs and every section, and opens a note, the task wizard and the job composer |
| `planner.css` | On the Studio Hub's `--st-*` tokens |
