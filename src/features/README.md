# src/features — the map

One line per folder: which screen it belongs to, and what to read first.
Written in the beta-prep trim (Sep 17 2026), when there were 36 folders and
nothing said which one belonged to which screen. **When you add a folder, add
its line.** When a folder has a `README.md`, that README is the first thing to
read; otherwise the file named here is.

Older screens still live in `src/components/` (the Hub is `ClientsView`, the
profile shell is `ClientProfileView`, the tracker is `WorkoutTrackerView`).
New code goes here.

## The floor loop — the Hub, the profile, the session

| Folder | What it is | Read first |
| --- | --- | --- |
| `briefing/` | The pre-session briefing, the first of the tracker's three screens | `README.md` |
| `tracker/` | Pieces of the Active Session screen that have been pulled out of `components/WorkoutTrackerView.tsx` (the three dialogs, so far) | `PerformanceEntryDialog.tsx` |
| `journey-grid/` | The sticky grid of machines by sessions: the tracker's grid and the profile's Journey tab | `README.md` |
| `rating/` | The Dial and Loudness: the ONE rating control and the ONE loudness control | `scales.ts` |
| `subjective-report/` | Pulse, the living assessment (code and Firestore still say check-in / subjective) | `README.md` |
| `client-profile/` | The profile's header and its navigation: four tabs, the sub-toggle, `useProfileNav` | `README.md`, then `profile-nav.ts` |
| `routines/` | Profile, Programming tab: Routine A and Routine B | `RoutinesTab.tsx` |
| `routine-builder/` | The routine builder the Edit Routine drawer opens, with the Academy's programming rules | `engine.ts`, `academy.ts` |
| `equipment/` | Profile, Programming tab: All Machines, the one machine window, setting suggestions | `README.md` |
| `client-history/` | Profile, Activity Archive: Calendar and Sessions | `README.md` |
| `clinical-review/` | Profile, Activity Archive: Trends (the Kaizen Deep Dive) | `facts.ts` |
| `progress-report/` | The Client Progress Report, the five-step conversation | `README.md` |
| `client-notes/` | The client notes catalog, category chips and the To-file tray (NOT a trainer's private notes; those are `relay/notes/`) | `note-catalog.ts` |
| `ford/` | FORD: the client's FORD page (Notes & Profile → FORD), mid-session capture, the post-session sweep, the Delight queue | `README.md` |
| `client-life/` | The life editors: Work and Recreation on the FORD page's bands, Experience on Body & Pulse | `life.ts` |
| `goals/` | The Goals section of the record: the original why, goals, focus | `goals.ts` |
| `clinical-flags/` | The Body section's watch-out banner and the condition picker | `BodyWatchOuts.tsx` |
| `client-admin/` | The record's Admin section: the contract panel and the tier lock | `contract.ts` |
| `inbody/` | InBody scans (health data: read its rules note first) | `README.md` |
| `renewals/` | The renewal engine, pipeline and conversation log. Its Operations screens are in `admin/renewals/` | `README.md` |
| `calendar/` | The Calendar screen | `README.md` |

## Relay — the studio's shared work

| Folder | What it is | Read first |
| --- | --- | --- |
| `relay/` | Relay (was the Planner, was To-Do): the shell, Mine, Notes, Team, Network. Relay's own pieces are in `board/`. The view id is still `studio-tasks` | `README.md`, then `board/README.md` |
| `studio-tasks/` | Relay's Floor tab AND the task data layer (templates, instances, requests, initiatives, the playbook, upkeep). The Catalog, the Hub and Operations import it too, which is why it is not inside `relay/` | `README.md` |
| `notifications/` | The bell in the header, and announcements | `NotificationBell.tsx` |
| `comments/` | Comments with @tags at the foot of Learning pages | `README.md` |
| `feedback/` | The always-there bug and idea reporter | `FeedbackButton.tsx` |

## Learning

| Folder | What it is | Read first |
| --- | --- | --- |
| `learning/` | The Learning tab: its front page, its one search, and the link format other features use to point into it | `README.md` |
| `wiki/` | The shared shell the Catalog and the Academy both sit on, and a studio's own wiki blocks | `index.ts` (its header) |
| `catalog/` | The machine Catalog (`CatalogWikiView`, `MachineArticle`), machine identity, studio notes and setup cards. Its README is the PRE-wiki spec: read the banner at its top | `index.ts`, `machine-identity.ts` |
| `academy/` | The MSF Academy pages, built from `docs/msf-academy/` by `scripts/build-academy-content.ts` | `academy-machines.ts` |
| `machine-db/` | All MSF machines: sharing a machine, adopting one onto a studio's floor | `README.md` |
| `machine-trends/` | The pure core of the weekly machine-trends job (aggregates only) | `README.md` |

## Operations, people and settings

| Folder | What it is | Read first |
| --- | --- | --- |
| `admin/` | Every Operations screen, and the kit they are built from. It has its own table of which folder each tab lives in | `README.md` |
| `trainer-profile/` | A trainer's own profile, the Kaizen Roster, the Edit Trainer modal | `README.md` |
| `trainer-identity/` | Claiming a placeholder trainer profile at first sign-in | `claim.ts` |
| `settings/` | Trainer Settings: what is left after the settings tiers round | `TrainerSettingsView.tsx` |

## Which machine hook when

Four hooks hand out machines. They are layers, not copies:

| Hook | Gives you | Use it when |
| --- | --- | --- |
| `hooks/useMachines` | The app-wide list: `data/default-machines.ts` merged with the `machines` collection by id | You are `AppContent`. Everyone else receives `machines` from it |
| `hooks/useMachineCatalog` | The shared catalog documents, live | You edit or list machine DEFINITIONS (Operations, Catalog) |
| `hooks/useStudioMachines` | Every machine ONE studio has, fully resolved: the catalog plus `studios/{id}/roster`, merged by the one policy in `lib/resolve-machine.ts` | Anything about THIS studio's floor: the profile, the tracker's settings, Operations' equipment panel |
| `features/catalog/useCatalogMachines` | The machines this studio has, ready to draw: the list above, de-duplicated across id conventions and joined to anatomy | You are drawing a Learning or Catalog page |

Known gap (ROADMAP): sessions still use the app-wide list, not the studio's
roster, so a studio's own or adopted machines are not in the session picker
yet.
