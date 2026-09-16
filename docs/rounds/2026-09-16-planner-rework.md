# The Planner rework — Sep 16 2026

Branch `planner-rework`, off `master` at `3e6b1f7` (the client-profile audit
round). One commit per phase, each typechecked on its own, so any phase can be
reverted alone.

AJ's brief ("Project Overview", partly drafted with Gemini) asked for the
Planner to become the studio's operational and knowledge-sharing hub. The line
that sets the bar:

> "Studio leader need to able to see what the team is assigned, what theyve
> completed and what they are failing to do and who might be failing to do so."

For trainers: studio upkeep; private notes (Kaizen lists, long-term plans,
research, an article to show a client on the iPad) built up over several
sessions and then published; sharing a note for a vacation or handoff, or with
the whole team; personal reminders on the calendar; picking up floating work
from leadership and leaving a closing message. For leaders: work for a named
person or the pool, one large job shared by several trainers, and oversight.
Then: "finish our work on the new planner tab rework" — build it, with
creative control.

## 1. Two suggestions in the brief, and what was done instead

| Suggested | Built | Why |
| --- | --- | --- |
| Rename the tab **Command** | Kept **Planner** | AJ chose "Planner" in the Learning + Planner round; trainers have learned it; the view id is still `studio-tasks` either way. A rename is a one-line change if he still wants it |
| An `isShared` boolean on notes | A **copy** at `studios/{s}/noteShares/{noteId}` | A boolean makes privacy depend on every future query remembering to filter it. Notes are private by PATH (`trainers/{uid}/notes`); sharing copies the publishable part out, exactly as sharing onto a client's record already did |

## 2. What a trainer sees now

The Planner has four tabs: **Studio · My tasks · Notes · Team** (Team for
studio leaders and above only).

- **Studio** opens on an **at-a-glance band**: today's shift ("4 of 9 done"),
  team jobs ("3 open · 1 up for grabs") and asks ("2 waiting · 1 urgent"). Each
  tile scrolls to its lane. Below it: the shift strip, a **Team jobs** lane
  ("I'll take it", and "Finished lately" for two weeks), then the board and
  the playbook as before. Manage moved to the Team tab.
- **Team jobs** (`jobs/`). One piece of work several people share — a deep
  clean, next month's birthday cards, calls to clients who've gone quiet. A
  leader posts it for named people or "anyone at the studio", optionally about
  the facility, some machines or some clients (a part per machine or client),
  with a due day, "require a closing note" and "tell me when it's done".
  Anyone at the studio can join, tick a part or close it; nothing locks.
  Posting, assigning and finishing ring the bell of the people involved.
- **My tasks** gains **New reminder**, a **Coming up** list for the next six
  days, and **Your team jobs**. Creating a task — studio or personal — is now
  a three-step **wizard** (What → When → Rules) that ends with a sentence
  ("Every day at closing, on every machine. Everyone at the studio sees it on
  the days it's due. Closing it needs a note.") before saving.
- **Reminders** (`reminders/`). A personal task with a set time can ring a
  chosen number of minutes before. The trainer's own iPad writes the bell
  notification while the app is open, at a fixed id so two iPads ring once; a
  reminder missed while every iPad was closed still rings up to two hours
  late, then stays quiet. The **Calendar** shows a strip of the coming
  reminders above the month.
- **Notes** (`notes/`) can be built over time: a **Research** kind; light
  formatting (headings, bold, lists, checklists you can tick while reading,
  links) written as text, never HTML; **Sources** (up to 10 links); and
  **Working notes** — dated jots kept beside the note, folded into it when the
  trainer is ready. The note opens to read, with Edit a tap away. A client's
  profile has **Jot a note**, which opens the Planner with a jot started for
  that client.
- **Share with colleagues** (the second half of Publish). Named people, or
  everyone at the studio; for a set time (a week, two weeks, a
  month, a date, or until the author stops it); with a line for them. They read it
  under **From colleagues** in Notes and can save their own copy; only the
  author can change it. Their bell rings once when they are first named.
  Every client the note names must be coached at that studio, or the switch
  won't save.
- **Team** (`team/`, leaders). Four tiles for the week (assigned tasks,
  behind, team jobs, up for grabs), then a card per person — behind first —
  with sentences: "Missed *Wipe the benches* on Tue", "On *Deep clean* — 3
  parts left, due yesterday", "Holding *Call Grace's physio* for 3 days". A
  "Job for Sam" button starts a job for that person. Below: the per-task
  compliance table (now "x of y days") and the task manager.

## 3. Decisions

- **Only work with someone's name on it is counted against them**
  (`team/accountability.ts`): a task a leader assigned, a task they took, a
  job they're on, a request they claimed, an initiative with their number.
  Unassigned shift work is the team's. A task someone else finished is done.
  Skipped is not missed. Today isn't judged until the studio day is over.
  Notes are never counted (the anti-blocker rule). Counts with their things
  named; no percentages.
- **A job is not a task template and not a request** — a template resets
  daily, a request belongs to whoever picks it up. A job is done once, has
  names, parts and a due day.
- **Parts are a map keyed by part id**, written one key at a time
  (`parts.p3.doneBy`), and joining uses `arrayUnion`, so two iPads ticking at
  once never erase each other.
- **A reminder is a personal task with a time**, not a new thing: one list,
  one form, one tick. Nothing contacts a trainer — the bell is in-app only.
- **Formatting is markdown-lite, not rich HTML.** Nothing to sanitize, no
  editor library, and the text reads fine anywhere it is copied. No regex
  lookbehind (older iPadOS Safari can't parse it).
- **Saving a note merges only its own fields** (`mergeFields`) so a jot added
  on another iPad isn't erased by a save here; jots use `arrayUnion`.
- **Share expiry is the app's, not the rules'.** A list query can't be checked
  against the clock. An expired copy is hidden everywhere and deleted by its
  author's Planner the next time it opens; ending a share by hand deletes the
  copy at once.

## 4. What changed in Firestore (AJ's go-ahead: "finish our work on the new planner tab rework")

| Path / field | New | Rules |
| --- | --- | --- |
| `studios/{s}/teamJobs/{jobId}` | collection | read: people who work at the studio. Create: leaders, as themselves. Update: leaders anything; the floor only parts, people, status, closing fields — never cancel, never touch a cancelled job. Delete: poster, leaders, admins |
| `studios/{s}/noteShares/{noteId}` | collection | read: the named people, the author, or (team shares) the studio's people. Write: the author only, at a studio they work at, whole shape checked. Delete: author (even when already gone), leaders, admins |
| `trainers/{uid}/notes/*` | optional `links`, `log`, `teamShare`; kind `research` | shape-checked, still author-only |
| `clients/{id}/sharedNotes/*` | optional `links` | shape-checked |
| `…/taskTemplates/*` | optional `remindMinutesBefore` | no rule change (templates aren't shape-checked) |
| `trainers/{uid}/notifications` | kinds `job-assigned`, `job-taken`, `job-done`, `note-shared`, `reminder` | no rule change |

**No new indexes**: every new query is a single-field filter. No Mindbody,
server or Cloud Functions change.

## 5. The phases

| # | Commit | What |
| --- | --- | --- |
| 1 | `feat(planner): team jobs` | `jobs/`, the shared kit (`kit.tsx`), the client picker, the lane on the Studio tab, five notification kinds, the rules |
| 2 | `feat(planner): the Team tab` | `team/`, Manage moved off the Studio tab, `ManagePanel` takes injected compliance |
| 3 | `feat(tasks): the task wizard` | `TaskWizard`, `task-wizard.ts`; `saveTaskTemplate` strips `undefined` (a latent failure in the old form) |
| 4 | `feat(planner): personal reminders` | `reminders/`, the bell watcher mounted in `AppContent`, the Calendar strip |
| 5 | `feat(notes): build a note over time` | formatting, sources, working notes, Research, read mode, Jot a note |
| 6 | `feat(notes): share a note with colleagues` | `team-share.ts`, `noteShares`, From colleagues, the sweep |
| 7 | `Planner polish` | the at-a-glance band; `planner.render.test.tsx` |
| 8 | `fix(rules)` | the floor can't reopen a job a leader called off |
| 9 | `fix(planner)` | leader-only parts follow the studio the iPad is in (`leads.ts`) |
| 10 | `docs` | this document, the READMEs, CLAUDE.md, ROADMAP, ARCHITECTURE |

## 6. Limits, stated

- A reminder rings only while some iPad signed in as that trainer has the app
  open (or within two hours of its time, when one opens).
- An expired share still exists in the database until its author opens the
  Planner (or ends it by hand).
- A note shared with colleagues can name only clients that studio coaches.
- **Multi-studio:** the Team tab, posting a job and changing its people follow
  the studio the iPad is standing in (`leads.ts`, the same answer as the
  rules): a head trainer visiting another studio is a trainer there. The
  older studio-task "Assign" button still goes by role alone (pre-existing;
  the task rules are the open hole CLAUDE.md lists).
- Notes and reminders follow the trainer; team jobs and colleague shares
  belong to one studio.
- The Team tab reads the last seven days of studio task instances, the open
  requests and initiative submissions, and the jobs lane — the same reads the
  Studio tab already made, plus one listener per open initiative.

## 7. Verification

- `npx tsc --noEmit`: **13**, same as master; each phase at or under it.
- `TZ=America/New_York npx vitest run src`: **2,763** passing, 160 files
  (master 2,636). New: `jobs.test.ts` (32), `accountability.test.ts` (18),
  `task-wizard.test.ts` (19), `reminders.test.ts` (12), `format.test.ts` (16),
  `team-share.test.ts` (14), note and intent additions, and
  `planner.render.test.tsx` — all four tabs mounted, the Team tab hidden from a
  trainer and from a head trainer visiting another studio, and a note, the
  reminder wizard and the job composer opened.
- `npx vite build`: clean. Every new screen rendered in a harness (iPad
  portrait and landscape, light and dark) and checked by screenshot.
- **Not run here:** `npm run test:rules` — nine new rules tests (team jobs ×4,
  colleague shares ×4, research notes). The emulator can't download in the
  cloud, so **AJ's run is the one that counts**, and the ship script stops if
  it fails.

## 8. Follow-ups

- Web push for reminders is out by decision (nothing contacts a trainer); if
  that ever changes, the watcher is the one place to swap.
- A Cloud Function could delete expired shares on the dot (needs an OK).
- A job template ("the monthly deep clean") once a studio has posted the same
  job three times.
- "Show a client" mode for a Research note (full screen, no private jots).
- Whether studio leaders want the Team tab's week to be Monday–Sunday rather
  than the last seven days.
