# features/planner — the Planner (was the To-Do screen)

Round: Learning + Planner, Sep 2026. AJ's brief:

> "the to do screen … needs to be renamed to something better … we should have a to do in the tasks and keep everything the same but we need to just have an area where trainers can store notes in folders and link clients to those notes to build plans and plan routine changes or additions or retention strategies or injury plans, just personal notes and personal tasks and the studio tasks"

He picked the name **Planner**.

**The Planner rework (Sep 16 2026)** made it the studio's operational and
knowledge-sharing hub: team jobs, the Team tab, the task wizard, reminders,
notes built over time and shared with colleagues. The round document is
`docs/rounds/2026-09-16-planner-rework.md` — read it before changing any of
this.

## Tabs

| Tab | What | Where the data lives |
| --- | --- | --- |
| Studio | The studio hub (`features/studio-tasks/StudioHubView`, `embedded`): the at-a-glance band (`GlanceBand`), the shift strip, the team jobs lane (`jobs/`), the board, the playbook | `studios/{s}/task*`, `taskRequests`, `teamJobs`, `playbook` |
| My tasks | A trainer's own list (`MyTasksPanel`), reminders and "Coming up" (`reminders/`), and the team jobs they're on | `trainers/{uid}/task*` — private by path, since the Settings-tiers round |
| Notes | A trainer's own notes, in folders, linked to clients, built over time; shared onto a client's record or with colleagues (`notes/`, with its own README) | `trainers/{uid}/notes`, `noteFolders`; copies at `clients/{id}/sharedNotes` and `studios/{s}/noteShares` |
| Team | **Leaders of this studio only** (`leads.ts`): who has work with their name on it, who finished it, who is behind (`team/`); Manage (compliance) and the task manager moved here | reads the Studio tab's paths |

## Decisions

- **The view id stays `studio-tasks`.** Notifications already sitting in trainers' bells link to it. Only the labels changed:
  - the bottom bar ("Planner", notebook icon);
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
- **The tab is remembered for the session** (module state, not storage). A fresh load starts on Studio, where the shift strip is.
- **A client's profile can open the Planner** at a note: **Write a plan**, **Jot a note**, or **Edit in your Planner** on a shared note. The profile leaves its request in `intent.ts`, and the Planner reads it when it mounts. That avoids threading more state through AppContent, since the Planner is not mounted while the profile is showing.
- **A bell notification can open the Planner too** (rework): its link is `{ view: "studio-tasks", id }` with `id` = `job:<jobId>`, `share:<noteId>` or `mine`, turned into an intent by `plannerIntentFromLink` in `AppContent`.

### The rework's decisions (Sep 16 2026)

- **Name kept: Planner**, not "Command" (the brief's suggestion). **Sharing is a copy**, not an `isShared` flag.
- **Team jobs** (`jobs/`) are neither task templates (those reset daily) nor board requests (those belong to whoever picks them up). One document at `studios/{s}/teamJobs/{id}`; parts are a MAP written one key at a time so two iPads never erase each other's ticks. **Nothing locks**: anyone at the studio can tick or close.
- **The Team tab counts only work with someone's name on it** (`team/accountability.ts` — its header is the rulebook). Today isn't judged; skipped isn't missed; a task someone else finished is done; notes are never counted. Counts with the thing named, no percentages.
- **Leader-only parts follow the studio the iPad is in** (`leads.ts`, the same answer as the `teamJobs` rules). `isStudioLeader` alone would offer a visiting head trainer buttons the rules refuse.
- **A reminder is a personal task with a set time** and `remindMinutesBefore` (`reminders/`). The trainer's own iPad writes the bell notification while the app is open (`PlannerReminders`, mounted in `AppContent`), at a fixed id so two iPads ring once; up to `LATE_GRACE_MINUTES` late. Nothing is pushed, texted or emailed.
- **The task form is a wizard** (`studio-tasks/TaskWizard.tsx`, pure steps in `task-wizard.ts`) ending with a sentence. `saveTaskTemplate` strips `undefined` — Firestore refuses it.
- **Shared kit** (`kit.tsx`, `kit.css`): avatars, toggles, segmented controls, the people picker, and the `.pk-*` / `.tw-*` / `.gb` styles, all on the `--st-*` tokens.

## Files

| File | What |
| --- | --- |
| `PlannerView.tsx` | The masthead and tabs |
| `GlanceBand.tsx` | The Studio tab's three at-a-glance tiles |
| `MyTasksPanel.tsx` + `my-tasks.ts` | My tasks, and its pure sorting |
| `jobs/` | Team jobs: `types.ts`, `jobs.ts` (+ test), `mutations.ts`, `useTeamJobs.ts`, `JobComposer`, `JobSheet`, `TeamJobsLane` |
| `team/` | The Team tab: `accountability.ts` (+ test), `useInitiativeProgress.ts`, `TeamPanel` |
| `reminders/` | `reminders.ts` (+ test), `useReminderBell.ts`, `PlannerReminders` (the watcher), `ReminderStrip` (the Calendar) |
| `notes/` | The Notes tab — see `notes/README.md` |
| `kit.tsx`, `kit.css`, `ClientPicker.tsx` | Shared pieces |
| `leads.ts` | Who leads the studio the iPad is in |
| `intent.ts` (+ test) | Opening the Planner at a note, a job, a share or My tasks |
| `planner.render.test.tsx` | Mounts all four tabs and opens a note, the reminder wizard and the job composer |
| `planner.css` | On the Studio Hub's `--st-*` tokens |
