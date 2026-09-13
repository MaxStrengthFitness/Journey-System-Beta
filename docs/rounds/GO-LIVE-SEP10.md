# Going live — Sep 10, 2026

AJ, Sep 10: *"we are based in Ohio so we should go of est / i think we should combo acadamy and
catalog into learning or something similar also / lets push everything to master and live"*

Decided the same evening: the push runs on AJ's PC from `ship-sep10.ps1` (AJ pastes two lines;
Claude reads `ship-sep10.log` after each — Claude's computer control can see a terminal but
cannot type into one); **Eastern time going forward only** (saved dates are not rewritten);
**Demo Mode stays out** (see `DEMO-MODE-BRANCH.md`).

---

## What went live

Everything built since the last deploy (Sep 9), in the order it was committed:

| Piece | What trainers will notice |
| --- | --- |
| **Studio Hub** (`studio-hub` branch) | The To-Do screen is the Hub: today's shift, clients waiting, the board, the playbook. |
| **Who did what on the hub** (`catalog-wiki` branch) | "Today's shift" shows who claimed and who finished each group; head trainers can assign. |
| **The Catalog as a wiki** (`catalog-wiki`) | Page navigation, no bottom sheet, no surprise keyboard; the anatomy model full size. |
| **Learning** (new tonight) | **One "Learning" button** replaces Catalog and Academy. A Catalog / Academy switch sits in the top bar of every Learning page. Six buttons in the bottom bar instead of seven. |
| **Client History** (new tonight) | Every month at once, breaks you can see, four numbers on top, a richer list. `HISTORY-ROUND.md`. |
| **Eastern time** (new tonight) | A session started after 8 PM is saved on the right day. Same for check-ins, progress reports, events, exports and Insights. |

**Four fixes that rode along:**

- **The assign dialog listed every trainer as "A trainer"**, and saved that as the assignee's
  name. It now shows and saves real names.
- **The notification bell had no icon for "task assigned".** It showed a plain bell; it now has
  its own.
- **The access-request form's Submit button was unreachable on a landscape iPad.** Fixed on
  Sep 10 by the hub round but never committed. It's in now.
- **`src/features/notifications/types.ts`** — where "task assigned" is defined — had been left out
  of the hub's commit. It's in now.

## How it was shipped — `ship-sep10.ps1`

Two lines in PowerShell, from the repo folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\ship-sep10.ps1 -Stage prepare   # preflight + commit + check
powershell -ExecutionPolicy Bypass -File .\ship-sep10.ps1 -Stage golive    # rules + push
```

Five stages underneath. Each one stops at the first problem, prints **STOPPED:** and why, and
changes nothing after that point. Red text from `git` and `vite` on its own is normal — they
write progress to the error stream. Everything lands in `ship-sep10.log`.

| Stage | What it does |
| --- | --- |
| `preflight` | Looks, changes nothing: branch, uncommitted files, GitHub's master, Firebase login. |
| `commit` | One commit per phase on a new branch, `sep10-go-live`, on top of `catalog-wiki`. |
| `check` | Runs the tests and a production build of exactly what will be pushed. |
| `rules` | Deploys `firestore.rules` to production. The wiki's studio pages need their new rules. |
| `push` | Merges `sep10-go-live` into `master` as one merge commit and pushes. **Render deploys `master`, so this is the go-live.** |

The eleven commits on `sep10-go-live`:

1. Studio hub: the three files the attribution commit missed
2. Hub: real names in the assign dialog; the bell knows task-assigned
3. Dates: the app's day is the Eastern day (Ohio), going forward
4. History: pure model — days, breaks, cadence, calendar and list shapes (36 tests)
5. History: load the whole history live, and sets on demand
6. History: every month at once, in the Calendar tab's language
7. History: the list, rebuilt in the app's style
8. History: session pop-up in the Journey grid's colours; four data fixes
9. History: wire the new tab into the profile; retire the 1,775-line calendar
10. Learning: the Catalog and the Academy as one tab
11. Docs

Every one of them was typechecked on its own before the push, so any single phase can be
reverted without breaking the build.

## If something is wrong after the deploy

| Situation | Do this |
| --- | --- |
| **The app is broken for everyone** | Render dashboard → the web service → the previous successful deploy → **Rollback**. One click, about a minute. Then tell Claude what you saw. |
| **Undo the whole release in git** | `git revert -m 1 <sha>` on the commit called *"Go live Sep 10: …"*, then `git push origin master`. |
| **Undo one piece** | `git revert <sha>` on that phase's commit (list above), then push. |
| **The rules** | They only add permissions for the new studio pages. There's no reason to roll them back, and the Firebase console keeps every earlier version. |

Trainers get the new version the next time the app reloads. A session that is already running
isn't interrupted — its sets go straight to Firestore, not through the server that restarts.

## What was checked before the push

- `npx tsc --noEmit` — **20 errors, down from 23.** None new; the three hub errors are fixed.
- `npx vitest run src` — **1,443 passing** (14 new tonight: 7 for Eastern time, 7 for Learning;
  36 new for History earlier today).
- `npx vite build` — clean.
- The Learning tab rendered with the real Catalog and Academy at 834×1194, 1194×834,
  1366×1024 and phone width, light and dark. Clicked through: switch sections, open a machine,
  tap the section you're in to get back to its index, the Academy's "back to the machine" trail.
- The commit stage was rehearsed end to end on a copy of the repo before it ran on the PC.

## Still open

- **Not looked at on a real iPad yet** — the Hub, the wiki, Learning and History. Checklists:
  `HISTORY-ROUND.md`, `RUN-THIS-MORNING.md`.
- **Demo Mode** — `DEMO-MODE-BRANCH.md` has the plan: cherry-pick the clean parts, rewrite the
  rules change. `handleSeedDemoClient` ("John Demo") is still live in System Tools until then.
- **Saved evening sessions keep their UTC date.** History already shows them on the right day;
  the Journey grid shows them a day late. A one-off correction script is possible, but it needs
  care around the Mindbody matching.
- **Reads:** History reads up to 200 session documents when it's opened (was 30).
