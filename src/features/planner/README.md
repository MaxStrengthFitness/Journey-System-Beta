# features/planner — the Planner (was the To-Do screen)

Round: Learning + Planner, Sep 2026. AJ's brief:

> "the to do screen … needs to be renamed to something better … we should have a to do in the tasks and keep everything the same but we need to just have an area where trainers can store notes in folders and link clients to those notes to build plans and plan routine changes or additions or retention strategies or injury plans, just personal notes and personal tasks and the studio tasks"

He picked the name **Planner**.

## Tabs

| Tab | What | Where the data lives |
| --- | --- | --- |
| Studio | The studio hub, unchanged (`features/studio-tasks/StudioHubView`, `embedded`) | `studios/{s}/task*`, `taskRequests`, `playbook` |
| My tasks | A trainer's own list (`MyTasksPanel`) | `trainers/{uid}/task*` — private by path, since the Settings-tiers round |
| Notes | A trainer's own notes, in folders, linked to clients; one can be shared onto a client's record (`notes/`, with its own README) | `trainers/{uid}/notes`, `noteFolders`; shared copies at `clients/{id}/sharedNotes` |

## Decisions

- **The view id stays `studio-tasks`.** Notifications already sitting in trainers' bells link to it. Only the labels changed:
  - the bottom bar ("Planner", notebook icon);
  - the settings link;
  - the Operations overview ("Studio tasks");
  - the Hub's day strip ("Tasks").
  
  `?classic-todo` still opens the old list.
- **A masthead like Learning's.** A title, the tabs, and the studio and day on the right. AJ said both screens lacked "a good header", and both got the same one.
  - Embedded in the Planner, the hub's own title and date give way to one line: "Shared with everyone at {studio}".
  - Everything below the header is untouched.
- **My tasks shows what already existed.** Personal tasks were mixed into the studio's shift strip with a "Just you" badge. "New personal task" could only be reached through Manage → task form → back.
  - My tasks lists them on their own, in three groups: open, in time order; done today; and studio tasks a head trainer assigned to you today.
  - Creating and editing uses the existing `TaskManager` in its personal-only mode. Nothing new is stored.
- **The tab is remembered for the session** (module state, not storage). A fresh load starts on Studio, where the shift strip is.
- **A client's profile can open the Planner** at a note: **Write a plan**, or **Edit in your Planner** on a shared note. The profile leaves its request in `intent.ts`, and the Planner reads it when it mounts. That avoids threading more state through AppContent, since the Planner is not mounted while the profile is showing.

## Files

| File | What |
| --- | --- |
| `PlannerView.tsx` | The masthead and tabs |
| `MyTasksPanel.tsx` + `my-tasks.ts` | My tasks, and its pure sorting |
| `notes/` | The Notes tab — see `notes/README.md` |
| `intent.ts` | Opening the Planner at a note from a client's profile |
| `planner.css` | On the Studio Hub's `--st-*` tokens |
