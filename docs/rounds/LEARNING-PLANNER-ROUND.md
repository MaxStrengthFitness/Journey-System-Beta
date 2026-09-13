# The Learning + Planner round (Sep 11, 2026)

Branch `learning-planner`, on top of the Renewals round: seven phases, the review's fixes and the docs, **one commit each**, so any one of them can be reverted on its own. The code maps are the READMEs in `src/features/learning/`, `planner/`, `planner/notes/`, `machine-db/` and `comments/`.

**Nothing in this round contacts a client or a trainer outside the app.** A tag rings the bell, and that's all.

---

## 1. What's in it

| # | Commit | What you'll notice |
| --- | --- | --- |
| 0 | One link format for any Learning page | The bell's "machine flagged" opens that machine, not the Catalog's front page. An Academy page that moved says so |
| 1 | The Learning masthead, the Overview and one search | Learning opens on an **Overview**: every machine by category with its code (CP, LP…), the Academy's ways in, and what the studio wrote. One **Search** on every page |
| 2 | The To-Do screen becomes the **Planner** | Tabs **Studio** (the hub, unchanged) and **My tasks** (a trainer's own list, which had no screen) |
| 3 | Planner **Notes** | Folders and notes private to their author, linked to clients, marked as a plan, routine change, retention idea or injury plan. **Share** puts a one-client note on that client's profile, under Goals → **Plans from the team** |
| 4 | The **MSF machine database** | Catalog → **All MSF machines** beside the studio's own floor. Studios share their own machines, notes and tips with a switch, add machines to their floor, and read what other studios shared on every machine page |
| 5 | **Comments** on Learning pages | Each studio's own thread at the foot of machine, studio and Academy pages. Type **@** to tag someone at the studio |
| 6 | **Announcements link to Learning** | The composer can link any Learning page; the bell's card gets an **Open** button |
| 7 | Fixes from the independent review (§8) | A studio's own machines open reliably from the bell and search; loading screens stop claiming "nothing here"; the rules are tighter in four places |
| 8 | Docs | This file, `CLAUDE.md`, the READMEs, `ROADMAP.md`, `TESTING-CHECKLIST.md` |

---

## 2. Before you start

- **The Renewals round goes live first.** This round is built on it. The script checks that `master` holds `operations-renewals` and stops, with nothing changed, if it doesn't: finish `ship-renewals.ps1 -Stage golive` first.
- PowerShell, in the project folder: `cd C:\Users\austi\Projects\Journey-System-Beta-master`
- On `master`, with `node_modules` installed (`npm ci`), JDK 21 for the rules tests, and `npx firebase login:list` showing your account.
- No uncommitted changes to files git tracks. The preflight lists any it finds and stops. To set them aside: `git stash push -m before-learning`. After the release, `git stash pop` brings them back.
- The ship script is **`ship-learning.ps1`**. The patches it applies are in **`backups\learning-ship\`**, which git ignores. It checks their fingerprints before it uses them, and before it touches anything it tries every patch on a scratch copy of `master`.

---

## 3. Ship it — two lines

```powershell
powershell -ExecutionPolicy Bypass -File .\ship-learning.ps1 -Stage prepare
powershell -ExecutionPolicy Bypass -File .\ship-learning.ps1 -Stage golive
```

**`prepare`** only changes your PC's git history:

- **preflight** checks you're on `master` and that it holds the Renewals release, verifies the patches and tries them all on a scratch copy, confirms the files this round touches are clean, and measures the typecheck **on master** as the baseline.
- **commit** creates `learning-planner` and applies the nine patches, one commit each. This file's copy in the folder isn't in git yet, so it's moved to `backups\learning-docs-before\` first and the committed version replaces it.
- **check** runs the typecheck (the count must not go up), `vitest`, `vite build` and `build:backend`, and remembers the exact commit that passed.

**`golive`** is production. It refuses to run unless `check` passed for the commit you're on:

- **indexes** deploy first, so they're building while everything else runs. If it asks whether to **delete** indexes that aren't in the file, answer **N**.
- **rules tests** (`npm run test:rules`). One old test, `denies trainer creation with a non-empty pinHash`, is known to fail and is allowed. Any other failure stops everything — the new indexes are harmless on their own.
- **rules** deploy to `prod`, and the script checks the live rules contain this round's.
- **push** merges into `master` and pushes. **Render deploys `master`, so this is the go-live.**

Every stage stops at the first problem and says why, and everything goes into `ship-learning.log`. Send me the log if anything stops. Running a line again picks up where it left off.

Why the rules go before the push even though some of them are tighter: the app that's running now only ever does what the tighter rules still allow (it writes to the studio you're in, as yourself), and the new app needs the new rules waiting for it.

---

## 4. After the push

1. **Reload every iPad** (close the tab or home-screen app and reopen it).
2. **Wait for the indexes.** Firebase console → Firestore → Indexes: every row **Enabled** (usually a few minutes). Until then:
   - All MSF machines lists the MSF catalog and says it couldn't load what studios shared;
   - a machine page's **From other MSF studios** says the same;
   - comments say "Couldn't load the comments."

   Nothing is lost while they build — the screens just can't read those lists yet.

---

## 5. The iPad pass — portrait, then landscape

**Learning, as a trainer:**

1. Tap **Learning**. The **Overview**: the masthead (Learning · Overview · Catalog · Academy · Search), then every category with every machine and its code. Tap a machine name — it opens that machine.
2. **Search** from the masthead: try `CP`, `glute`, `turnaround`, and a machine another studio shared. Results come in groups: machines at your studio, **Shared by other MSF studios**, the Academy, your studio's pages.
3. **Catalog → All MSF machines** (the switch above the title). The counts, the **On your floor** badges, a machine page, and **From other MSF studios** on it.
4. On a machine page at your studio, the switches: **Share with all MSF studios** on the studio's note (anyone at the studio), on a playbook tip (its author or a leader), and — on a machine the studio made — the machine itself (leaders).
5. **Comments** at the foot of a machine page: type `@` and part of a name, pick someone, post. They get "*Your name* tagged you on Leg Press" in their bell, and tapping it opens the page. Edit your own; delete your own. Tap a Related machine: the half-typed comment doesn't follow you.

**As a studio leader:**

6. All MSF machines → a machine you don't have → **Add to *studio*'s floor**. A shared machine from another studio is added as your own copy. Switch one off in Operations → Studios → Equipment, then find it here: it offers **Put it back on *studio*'s floor**.
7. Delete anyone's comment at your studio.

**Planner (the old To-Do):**

8. **Studio** is the hub as it was. **My tasks**: add a personal task, make one repeat, tick one off.
9. **Notes**: make a folder, a note in it, pick a kind, pin it. **Link a client** — today's schedule first, then type a name. Switch **Share** on and save. Open that client's profile → Goals → **Plans from the team**: it's there. As a leader, **Take off the record** removes the copy; the author keeps their note.
10. From a client's profile, **Write a plan** opens the Planner with a new plan about that client.

**Announcements (as an administrator or franchise owner):**

11. Operations → Announcements → **Link a Learning page**: search, pick, post. In the bell, the card shows **Open *page***, and it opens it. A studio's own page can only be linked in an announcement to that one studio.

Send me screenshots of anything wrong — cropped, with magenta arrows, as usual.

---

## 6. Who can do what — what changed

Mostly new things, but four rules are **tighter** than before. Each follows what the app already offered; tell me if any of them catches someone it shouldn't:

| Where | Before | Now |
| --- | --- | --- |
| A studio's machine notes, upkeep log, playbook tips and notes on pages | Any signed-in trainer, at any studio, could write them | People who work at or run that studio, franchise owners and administrators. Operations → Studios → Equipment shows **Upkeep** only where you can log it |
| A studio's playbook and its notes on pages (reading) | Anyone signed in, any studio | That studio's own people. Other studios see only what's shared |
| Announcements | Anyone signed in could post to every studio, or rewrite anyone's notice | Posted by administrators, founders and franchise owners (Operations) and studio owners (Franchise), as themselves. Only Operations reaches every studio. A studio owner changes only their own notices. Everyone else can only mark a notice read |
| A studio's equipment list | — | An entry names its own studio, and a copy of another studio's machine can't be shared as your own |

---

## 7. How to undo any of it

| To undo | Do this |
| --- | --- |
| One phase | `git revert <sha>` on `master`, then push. Phase 6 (announcement links) and 7 (the review's fixes) come out on their own; the rest are built on by later phases, so revert those newest first |
| The rules | Revert the phase, then `npx firebase deploy --only firestore:rules --project prod`. The new blocks (notes, shared notes, comments, the shared lists) only add access; the four in §6 take some away |
| The indexes | Leave them. Unused indexes cost nothing and change nothing |
| A shared note on a client | The author switches Share off, or a leader taps **Take off the record** |
| A comment | Its author or a studio leader deletes it |

---

## 8. Found during the review

An independent review of this round (three reviewers: the rules, the screens, the logic) found and fixed, in commit 7:

- **A studio's own machine opened from the bell, search or the Overview could land in All MSF machines** — the Catalog decided "not on this floor" before the floor had loaded. It now waits.
- **A tag from another studio opened your current studio's thread**, where the comment isn't. It now says where it happened.
- **Tags:** "@Sam Kim" counted inside "@Sam Kimball"; accents and the iPad's curly apostrophe didn't match; the list stayed open after a finished tag; an 11th tag was dropped silently; a half-typed comment followed you to the next page.
- **Adding a machine the studio had switched off made a second copy** (or a copy of its own machine). It now switches the original back on.
- **Anyone signed in could read every studio's unshared tips and notes** straight from the database, and a shared item could claim to be from another studio. Unshared now stays with the studio in the rules too, and credit comes from where the item is stored.
- **Announcements** could be posted under someone else's name, and a studio owner could reach every studio or change head office's notice.
- **"Nothing here" while loading or after a failed read:** the Overview, a studio page ("That page is gone"), My tasks, a folder ("This folder is gone"), the client search in Notes, and All MSF machines' floor counts.
- **Notes:** a draft reopened before the notes loaded could be saved in a way that left a shared copy behind; a folder deleted on one iPad could strand a note; deleting a folder read a list that could be stale.
- Smaller: the comment list kept the oldest 200 instead of the newest; tap targets under 40px; scroll places lost on long lists; a machine with no plain letters in its name got an empty id.

Found and **not changed — needs your OK**:

- **The older holes are still open** (`CLAUDE.md`, Known traps): a trainer can edit their own role and studio lists; any trainer can edit any studio document; any trainer can create and update another studio's tasks and requests. A short rules round of its own.
- **A colleague with developer tools could block someone's note from being shared** by planting a copy under the same id on the client's record, until a leader removes it. Closing it properly means naming each copy after its author — a small change to how copies are stored, so it waits for your yes.
- **People who reach a studio only through the studio's owner field or a network** (not through their own profile) can't write that studio's machine notes and tips or read its comments. They already can't read its clients, so few or no real accounts are affected.

---

## 9. Known limits

- **Sessions still use the app-wide machine list.** A studio's own or adopted machine is in its Catalog, but not yet in the session tracker's picker. Wiring sessions to each studio's roster is next on the roadmap.
- Comments aren't searchable, and a tag reaches only people at the studio who can sign in. An older account whose profile id differs from its sign-in id doesn't get tag notifications (as before this round).
- A shared note is about exactly one client; a note about two can't be shared.
- Learning search matches titles, codes, muscles and terms — not the full text of the curriculum.
