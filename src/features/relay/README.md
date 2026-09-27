# features/relay — Relay (was the Planner, was the To-Do screen)

**My Studio (Sep 19 2026):** Relay is the first section of **My Studio**
(`features/my-studio/MyStudioView`), which owns the masthead, the Relay
context and the Capture sheet now; `PlannerView` draws the board under it.
Relay's **Team** tab became My Studio's Team section (`team/TeamPanel`, beside
the studio's staff), and the Network tab moved to Operations → Overview → All
my studios (voice-review round, Sep 27 2026; its ranking of studios was
dropped), so the board's tabs are **Floor · Mine · Notes**. Relay is first for the trainer
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

Relay's tabs are **Floor · Mine · Notes**, and every one is everyone's. In
the Planner they were Studio · My tasks · Notes · Team.

| Tab | What | Where the data lives |
| --- | --- | --- |
| Floor | The studio's shared board (`features/studio-tasks/StudioHubView`, `embedded`): Next up, the shift rings, the Floor Map, the team jobs lane (`jobs/`), asks and initiatives, the playbook, and the network's focus as a quiet line (`board/FocusBanner`) | `studios/{s}/task*`, `taskRequests`, `teamJobs`, `playbook`; the focus on `networks/{id}.relayFocus` |
| Mine | A trainer's own list (`MyTasksPanel`): today, handed to you, follow-ups, growth, reminders and "Coming up" (`reminders/`), and the team jobs they're on | `trainers/{uid}/task*` — private by path, since the Settings-tiers round |
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
- **A masthead like Learning's.** A title, the tabs, and the studio and day on the right. AJ said both screens lacked "a good header", and both got the same one.
  - Embedded in the Planner, the hub's own title and date give way to one line: "Shared with everyone at {studio}".
  - Everything below the header is untouched.
- **My tasks shows what already existed.** Personal tasks were mixed into the studio's shift strip with a "Just you" badge. "New personal task" could only be reached through Manage → task form → back.
  - My tasks lists them on their own, in three groups: open, in time order; done today; and studio tasks a head trainer assigned to you today.
  - If any of its reads fails, it says it couldn't load all of today's tasks — never "Nothing on your list today" (`useStudioTasks` now reports an `error`, and waits for the personal task list before it stops loading).
  - Creating and editing uses the existing `TaskManager` in its personal-only mode. Nothing new is stored.
- **The tab is remembered for the session** (module state, not storage), and a sign-out forgets it. A fresh load starts on the Floor, where the shift rings are.
- **A client's profile can open the Planner** at a note: **Write a plan**, **Jot a note**, or **Edit in your Planner** on a shared note. The profile leaves its request in `intent.ts`, and the Planner reads it when it mounts. That avoids threading more state through AppContent, since the Planner is not mounted while the profile is showing.
- **A bell notification can open the Planner too** (rework): its link is `{ view: "studio-tasks", id }` with `id` = `job:<jobId>`, `share:<noteId>` or `mine`, turned into an intent by `plannerIntentFromLink` in `AppContent`.

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
| `PlannerView.tsx` | Relay's tab bar, the Now Bar and the board under My Studio's masthead (`features/my-studio/MyStudioView` owns the masthead, Capture and the Context Panel) |
| `GlanceBand.tsx` | The Floor's three at-a-glance tiles, drawn by `studio-tasks/StudioHubView` (it was the Planner's Studio tab) |
| `MyTasksPanel.tsx` + `my-tasks.ts` | Mine (it was My tasks), and its pure sorting |
| `jobs/` | Team jobs: `types.ts`, `jobs.ts` (+ test), `mutations.ts`, `useTeamJobs.ts`, `JobComposer`, `JobSheet`, `TeamJobsLane` |
| `team/` | My Studio → Team, people and standards: `accountability.ts` (+ test), `useInitiativeProgress.ts`, `TeamPanel` |
| `reminders/` | `reminders.ts` (+ test), `useReminderBell.ts`, `PlannerReminders` (the watcher). The Calendar's strip is `board/RelayStrip` since the Relay round; the older `ReminderStrip` was deleted, unused, in the beta-prep trim (Sep 17 2026) |
| `notes/` | The Notes tab — see `notes/README.md` |
| `kit.tsx`, `kit.css`, `ClientPicker.tsx` | Shared pieces |
| `leads.ts` | Who leads the studio the iPad is in (`leadsHere`): My Studio asks it for Team and Studio, and the rules give the same answer |
| `intent.ts` (+ test) | Opening Relay at a note, a job, a share, Mine or the Floor |
| `planner.render.test.tsx` | Mounts My Studio: Relay's three tabs and every section, and opens a note, the task wizard and the job composer |
| `planner.css` | On the Studio Hub's `--st-*` tokens |
