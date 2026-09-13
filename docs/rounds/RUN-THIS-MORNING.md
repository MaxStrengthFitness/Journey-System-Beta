# Run this in the morning — the wiki round (Sep 10, 2026)

Everything is written to your working tree. **Nothing is committed and nothing is deployed.**
This file is the checklist; work down it in order and stop at the first thing that goes wrong.

---

## 0. Where things are

Open **PowerShell** and start here. You do not need Claude's Linux shell for any of this —
that is still broken, which is exactly why you are running these by hand.

```powershell
cd C:\Users\austi\Projects\Journey-System-Beta-master
```

---

## 1. Typecheck

```powershell
npx tsc --noEmit -p tsconfig.json 2>&1 | Select-String "error TS" | Measure-Object -Line
```

**Read the COUNT, not the list.** The master baseline is **18** — measured, and the number
`.github/typecheck-baseline.txt` and CI both gate on. None of those 18 come from this work.
What matters is whether the number went **up**.

- Same as before, or within a couple → good, carry on.
- Jumped by ten or more → something in the new code did not compile. Run it again without the
  filter to see them:
  ```powershell
  npx tsc --noEmit -p tsconfig.json
  ```
  and send me the ones mentioning `features/wiki`, `features/catalog` or `features/academy`.

> These files were type-checked against stubs in a clean TypeScript 5.8 project with `strict`,
> `noUnusedLocals` and `noUnusedParameters` on, and came back at **0 errors** — but stubs are not
> your real modules, so this run is the one that counts.

---

## 2. Tests

```powershell
npx vitest run src/features
```

Three new suites, plus 22 tests appended to an existing one:

- `src/features/wiki/studio-wiki.test.ts` — 28 tests
- `src/features/wiki/glossary-links.test.tsx` — 14 tests
- `src/features/academy/academy-machines.test.ts` — 20 tests
- `src/features/studio-tasks/hub.test.ts` — **68** tests, up from 46

All ran green here (130/130), and the 46 pre-existing hub tests still pass unchanged. The academy one runs against the **real corpus JSON**, not
fixtures — so if `scripts/build-academy-content.ts` is ever re-run and the output shifts, that
suite fails loudly instead of the deep-dive links quietly disappearing from the index.

---

## 3. Build

```powershell
npx vite build
```

Exit code 0 is the whole test. This takes 50–110 seconds.

---

## 4. Look at it — this is the actual point of the round

```powershell
.\Start-Journey-App.bat
```

Then on the **iPad**, in **portrait**, walk this path:

1. **Catalog tab** — you should land on an index that lists every machine, grouped, with a
   "Contents" row of coloured cards at the top. Tapping a contents card *scrolls* to that group;
   it does not filter anything. **No bottom sheet should ever appear.**
2. Tap a machine. You get a full page: breadcrumb at the top, the anatomy model full size in the
   infobox, then setup, execution, warnings — all on the page, not in drawers.
3. Tap **Search** in the top bar. The keyboard should appear *then*, and only then, on a screen
   that is nothing but search.
4. Scroll to **"Add [studio]'s note on this machine"**, tap it, type two lines, save.
   → this will fail with a permissions error until step 5. That is expected.
5. Tap **Quick reference card**. It should switch to the Academy tab, and the breadcrumb should
   read *`<machine name>` › Academy › `<card>`* — tapping the machine name brings you back.
6. **Academy tab** — the index has four groups, in this order: **By machine** (20 rows, one per
   machine, each showing `Cx · Card · Script · Deep dive`), **Cueing & language**, and
   **Curriculum**. Your studio's own pages appear as a second group *only once you have written
   one*. Check the contents cards at the top read "20 machines" / "13 modules" — not "13
   machines", which was the bug.
7. Open a machine row. The title should be the app's name (**"Torso Arm"**, **"Pec Fly"**) —
   never an abbreviation like "Pd". At the bottom, "More on the …" should offer the other two
   documents plus the Catalog page.
8. Open any curriculum topic: glossary terms in the prose are dotted-underlined, and tapping one
   shows the definition inline. Check the Curriculum group's note points at the Executive
   Summary.
9. **Studio hub (To-Do tab)** — the strip is headed **"Today's shift"**, not "My shift". Tap
   **Take it** on a group: it should read *"You're on it"*, and the tick boxes must stay live —
   a colleague can still close it, which is the whole point. Tick something and check the group
   line names who closed it. Any of your own private tasks should carry a **"Just you"** badge.
10. Flip **Everyone → Mine** in the hub header. The shift strip should now narrow too (it never
   did before), showing only what you claimed or closed, with an honest smaller denominator.

Then rotate to **landscape** and check the infobox moves to a sticky right-hand column and the
model stays put while the text scrolls.

Send me screenshots of anything that looks wrong — cropped, with magenta arrows, as usual.

---

## 5. Deploy the rules — only after steps 1–4 pass

The studio-notes and new-page features **cannot work until this runs**. Everything else works
without it.

```powershell
npm run test:rules
```

> If it fails with **"port taken"**, an orphaned `java.exe` from an interrupted run is holding
> 8080. This is safe to kill — the dev server is on 3000:
> ```powershell
> Get-NetTCPConnection -LocalPort 8080 -State Listen |
>   Select-Object -ExpandProperty OwningProcess -Unique |
>   ForEach-Object { Stop-Process -Id $_ -Force }
> ```
> One test, `denies trainer creation with a non-empty pinHash`, has been failing for weeks and is
> unrelated. Everything else should pass.

Then:

```powershell
firebase deploy --only firestore:rules
npx tsx scripts/fetch-live-rules.ts
```

**Run that second command.** The repo file describes intent; only the fetch proves what is live.
The change is purely additive — one new `match /wiki/{docId}` block inside `match /studios/{studioId}`.
Nothing existing was touched.

*No Firestore indexes are needed.* The new collection is read with an unfiltered listener, on
purpose, so there is no composite index to deploy and nothing to wait on.

---

## 6. Commit — four commits, one per area, each revertable on its own

```powershell
git checkout -b catalog-wiki

git add src/features/wiki
git commit -m "Wiki: shared shell for the Catalog and the Academy"

git add src/features/catalog
git commit -m "Catalog: rebuilt as a wiki on the shared shell"

git add src/features/academy src/AppContent.tsx src/types.ts
git commit -m "Academy: its own tab, joined by machine, on the same shell"

git add firestore.rules
git commit -m "Wiki: studio overlays and pages, rules"

git add src/features/studio-tasks
git commit -m "Studio hub: attribution and claiming on the shift strip"

git add ROADMAP.md RUN-THIS-MORNING.md
git commit -m "Docs: wiki round + studio task attribution"
```

If `git commit` complains **"Another git process seems to be running"**, that is the stale lock
this repo leaves behind:

```powershell
Remove-Item .git\HEAD.lock, .git\index.lock -ErrorAction SilentlyContinue
```

**Do not push or merge yet.** Render builds `master`, so a merge is a deploy.

---

## How to undo any of it

| To undo | Do this |
| --- | --- |
| The whole Catalog round | In `src/features/catalog/index.ts`, swap `CatalogWikiView` back to `CatalogView` on the export line. One line. The old screen is untouched on disk. |
| Just the Academy tab | Delete the `NavButton` with `label="Academy"` in `AppContent.tsx`. The tab becomes unreachable; nothing else breaks. |
| One commit | `git revert <sha>` — that is why they are split by area. |
| The rules | They are purely additive. Removing the `match /wiki/{docId}` block and redeploying restores the previous behaviour exactly. |

---

## Two things I could not decide for you

1. **Seven buttons in the trainer nav.** I gave the Academy its own slot and made the buttons
   share the bar evenly with truncating labels. On an iPad there is room to spare; on a narrow
   phone "Active Session" will clip. If you dislike it, the cheapest fix is folding Catalog and
   Academy into one slot — say the word and I will do it.

2. **Who can write what.** Right now: *any trainer* can add a studio note on a machine, topic or
   card (same rule as the existing machine notes — those notes carry no power over safety
   content). *Studio leaders and above* can create whole new pages. If you want notes locked down
   to leaders too, it is a two-line change in `firestore.rules`.

3. **Task claiming needs no rules change** — it writes `claimedBy` on a task instance, and
   `taskInstances` has been writable by any trainer since the To-Do round. It works the moment
   you pull the code.
