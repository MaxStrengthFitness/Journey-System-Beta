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
| `tracker/` | Pieces of the Active Session screen that have been pulled out of `components/WorkoutTrackerView.tsx` (Who's this?, the open session's client picker, and the stale-session question) | `ClientSelectionDialog.tsx` |
| `open-session/` | The open session (the Client Directory's Open session): its Start and the way back, Who's this? (one batch giving the session and its sets their client), the settings held on the session until then | `README.md` |
| `journey-grid/` | The sticky grid of machines by sessions: the tracker's grid and the profile's Journey tab | `README.md` |
| `rating/` | The Dial and Loudness: the ONE rating control and the ONE loudness control | `scales.ts` |
| `subjective-report/` | Pulse, the living assessment (code and Firestore still say check-in / subjective) | `README.md` |
| `client-profile/` | The profile's header and its navigation: four tabs, the sub-toggle, `useProfileNav` | `README.md`, then `profile-nav.ts` |
| `client-codex/` | Notes & Profile as seven pages (Overview · Notes · FORD · Body & Pulse · Goals & Focus · Story · Account): the kit, the shell and the Overview | `README.md` |
| `client-story/` | Notes & Profile → Story: the client's dated moments, newest first, each from a record somebody already made | `README.md` |
| `routines/` | Profile, Programming tab: Routine A and Routine B | `RoutinesTab.tsx` |
| `routine-builder/` | The routine builder the Edit Routine drawer opens, with the Academy's programming rules | `engine.ts`, `academy.ts` |
| `equipment/` | Profile, Programming tab: All Machines, setting suggestions. The one card for a client on a machine is `machine-menu/` since Oct 4 2026 | `README.md` |
| `machine-menu/` | The machine menu: ONE card for a client on one machine (safety, the settings, notes, the Staircase), opened from the Active Session and the profile | `README.md` |
| `machine-totals/` | A client's machine maps in their own document (`clients/{id}/machineTotals/current`, since Oct 6 2026) | `README.md` |
| `next-weight/` | The Wrap-up's next-session weight (`NextWeightCard`) | `next-weight.ts` |
| `client-history/` | Profile, Activity Archive: Calendar and Sessions | `README.md` |
| `clinical-review/` | Profile, Activity Archive: Trends (the Kaizen Deep Dive) | `facts.ts` |
| `progress-report/` | The Client Progress Report, the five-step conversation | `README.md` |
| `client-notes/` | The client notes catalog, category chips and the To-file tray (NOT a trainer's private notes; those are `relay/notes/`) | `note-catalog.ts` |
| `ford/` | FORD: the client's FORD page (Notes & Profile → FORD), mid-session capture, the Wrap-up's sweep, the Delight queue | `README.md` |
| `client-life/` | The life editors: Work and Recreation on the FORD page's bands, Experience on Body & Pulse | `life.ts` |
| `goals/` | The Goals section of the record: the original why, goals, focus | `goals.ts` |
| `clinical-flags/` | The condition picker (the Body page's watch-out banner is `client-codex/body/WatchOutsCard.tsx` since the client codex) | `ClinicalFlagPicker.tsx` |
| `client-admin/` | The record's Account page: the membership (`MembershipSection`) and the tier lock | `contract.ts` |
| `inbody/` | InBody scans (health data: read its rules note first) | `README.md` |
| `renewals/` | The renewal engine, pipeline and conversation log. Its Operations screens are in `admin/renewals/` | `README.md` |
| `calendar/` | The Calendar screen | `README.md` |
| `session-record/` | Never lose or block a session: the line under the session bar, Finish that never hangs or counts twice, a second iPad watching a running session | `README.md` |
| `packages/` | The studio's packages explained to someone who hasn't chosen, opened from the Wrap-up | `README.md` |
| `machine-fit/` | Predictive set-up, the passive check and the Kaizen report: Programming → Setup (Operations → Machine fit is `admin/machine-fit/`) | `README.md` |

## Relay — the studio's shared work

| Folder | What it is | Read first |
| --- | --- | --- |
| `my-studio/` | My Studio on the bottom bar: Relay · Openings · Machines · Team · Studio, the one header, and the two doors (Capture, the Context Panel) | `README.md` |
| `relay/` | Relay (was the Planner, was To-Do), My Studio's first section: the tab bar (Board · Tracker · Journal; ids `floor`, `mine`, `notes`), the Tracker, the Journal, and My Studio → Team's people and standards (`team/`). Relay's own pieces are in `board/`. The view id is still `studio-tasks`. The network's focus and launch are not here: they are on Operations (`admin/network/`) | `README.md`, then `board/README.md` |
| `standing-week/` | Each trainer's usual week, proposed on My Profile, agreed on My Studio → Team, and checked against the coming week's Mindbody bookings (a check, never a booking) | `README.md` |
| `openings/` | When the studio is usually busy, what opened up and what to offer (My Studio → Openings; never books): the pure core, the Sunday job's summary, the screens in `ui/` | `README.md`, then `ui/README.md` |
| `studio-tasks/` | Relay's Board (the `floor` tab) AND the task data layer (templates, instances, requests, initiatives, the playbook, upkeep). The Catalog, the Hub and Operations import it too, which is why it is not inside `relay/` | `README.md` |
| `notifications/` | The bell in the header, and announcements | `NotificationBell.tsx` |
| `comments/` | Comments with @tags at the foot of Learning pages | `README.md` |
| `feedback/` | The always-there bug and idea reporter | `FeedbackButton.tsx` |
| `hub-schedule/` | The Hub's Schedule layer: the grid, its cards, the day header, the spotlight and the peek | `README.md` |
| `hub-opportunities/` | The Hub's Opportunities layer (the Run-sheet) and the day's moments, worked out once for the Hub | `README.md` |
| `client-directory/` | The Client Directory: the smart table, its one row model and its one name search | `README.md` |

## Learning

| Folder | What it is | Read first |
| --- | --- | --- |
| `learning/` | The Learning tab: its front page, its one search, and the link format other features use to point into it | `README.md` |
| `wiki/` | The shared shell the Catalog and the Academy both sit on, and a studio's own wiki blocks | `index.ts` (its header) |
| `catalog/` | The machine Catalog (`CatalogWikiView`, `MachineArticle`), machine identity, studio notes and setup cards. Its README is the PRE-wiki spec: read the banner at its top | `index.ts`, `machine-identity.ts` |
| `academy/` | The MSF Academy pages, built from `docs/msf-academy/` by `scripts/build-academy-content.ts` | `academy-machines.ts` |
| `machine-db/` | All MSF machines: sharing a machine, adopting one onto a studio's floor | `README.md` |
| `machine-trends/` | The pure core of the weekly machine-trends job (aggregates only) | `README.md` |
| `machine-codex/` | The Machine Codex: format v2's optional fields, the model record `machineModels/{id}` and Compare | `README.md` |
| `floor-notes/` | The floor's notes on a machine: one dated list per machine, a note being a thread | `README.md` |

## Operations, people and settings

| Folder | What it is | Read first |
| --- | --- | --- |
| `admin/` | Every Operations screen, and the kit they are built from. It has its own table of which folder each tab lives in | `README.md` |
| `admins/` | The Admins dashboard (administrators and the founder), the Command Center since Sep 28 2026: four places (Home · Studios · Standard · Machinery), a search across the company, every studio grouped by what Journey knows with a page each, every studio's Mindbody pull at once; the screens that were tabs are still here, moved from `admin/`. Read its `README.md` | `AdminsDashboardView.tsx` |
| `trainer-profile/` | A trainer's own profile, the Kaizen Roster, the Edit Trainer modal | `README.md` |
| `trainer-identity/` | Claiming a placeholder trainer profile at first sign-in | `claim.ts` |
| `settings/` | Trainer Settings: what is left after the settings tiers round | `TrainerSettingsView.tsx` |
| `studio-settings/` | A studio's own numbers (the quiet floor, the Journey's lines, the machines' care) with head office's default beneath them | `README.md` |

## The whole app

| Folder | What it is | Read first |
| --- | --- | --- |
| `demo-mode/` | The practice studio at `demo-studio`, and the realm rule: from inside Demo Mode you see Demo Mode and nothing else | `README.md` |
| `sign-out/` | A sign-out is a fresh load for the next person on a shared iPad; `memory.ts` is where a module-level memory registers its reset | `README.md` |
| `unsaved-changes/` | The one registry of typed-but-unsaved work, and the one question before leaving it | `README.md` |
| `new-version/` | Noticing a deploy and loading it safely, never over a session, a send or typing | `README.md` |
| `home-screen/` | Journey as a Home Screen app: the manifest, the status bar and the safe areas | `README.md` |
| `front-door/` | Sign in, checking you in, the greeting, the studio picker and the access request | `README.md` |
| `boot-timing/` | How long an open of Journey took: three marks on the timeline and one boot report to Render's logs | `README.md` |
| `phone/` | Journey Lite: the same app laid out for a phone (`usePhone()`), never a second app | `README.md` |

## Which machine hook when

Four hooks hand out machines. They are layers, not copies:

| Hook | Gives you | Use it when |
| --- | --- | --- |
| `hooks/useMachines` | The app-wide list: `data/default-machines.ts` merged with the `machines` collection by id | You are `AppContent`. Everyone else receives `machines` from it |
| `hooks/useMachineCatalog` | The shared catalog documents, live | You edit or list machine DEFINITIONS (Operations, Catalog) |
| `hooks/useStudioMachines` | Every machine ONE studio has, fully resolved: the catalog plus `studios/{id}/roster`, merged by the one policy in `lib/resolve-machine.ts` | Anything about THIS studio's floor: the profile, the tracker's settings, Operations' equipment panel |
| `features/catalog/useCatalogMachines` | The machines this studio has, ready to draw: the list above, de-duplicated across id conventions and joined to anatomy | You are drawing a Learning or Catalog page |

Since Sep 20 2026 the Active Session reads the studio's own floor
(`useStudioMachines` through `lib/floor-machines.ts`), not the app-wide list,
so a studio's own or adopted machines are in the session picker.
