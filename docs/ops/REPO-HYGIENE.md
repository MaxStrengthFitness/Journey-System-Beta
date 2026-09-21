# Repo hygiene — what is clutter, and how to clear it

*Inventory taken Sep 21 2026. Claude cannot delete files on the connected-folder
mount, so this page is the list and the commands; you run them.*

Nothing here is committed to git — it is all loose files in your working copy
and stale branches. None of it affects the running app. It affects whether the
folder is legible, and whether a "clean tree" check means anything.

Run everything from the project folder in PowerShell:
`C:\Users\austi\Projects\Journey-System-Beta-master`

---

## 1. First, check nothing is in flight

```powershell
git status --short
git branch --show-current
```

You want a clean tree and to know which branch you're on. **Do not run any of
this while a round is half-built.**

---

## 2. Archives and dumps at the root — about 10 MB

These are all in `.gitignore` already, so git ignores them; they are just
sitting in the folder.

| File | What it was |
| --- | --- |
| `.js-src.tar.gz` (5.0 MB) | a source snapshot for a one-off transfer |
| `journey-system-for-ai-studio.zip` (4.2 MB) | the AI Studio sandbox round's package |
| `commit-history.txt`, `commit-history-all.txt` (220 KB) | git log dumps |
| `grep-sweep.txt` (100 KB), `gemini.txt` (15 KB) | one-off search captures |
| `live-rules-ai-studio-…rules` (120 KB) | a snapshot of the live rules from Sep 9 — **stale, do not trust it**; use `scripts/fetch-live-rules.ts` for a current one |
| `ship-*.log` (~14 files, ~280 KB) | ship-script run logs |
| `firestore-debug.log` (0 bytes) | emulator leftover |

```powershell
Remove-Item .js-src.tar.gz, journey-system-for-ai-studio.zip -Force
Remove-Item commit-history.txt, commit-history-all.txt, grep-sweep.txt, gemini.txt -Force
Remove-Item live-rules-*.rules, *.log -Force
```

`scripts/ship/tidy-root.ps1` does this and more — run it with `-Stage report`
first to see what it would touch.

---

## 3. The 8 MB zip in `docs/`

```powershell
Remove-Item "docs\Final client profile edits-20260906T202819Z-1-001.zip" -Force
```

That round shipped on Sep 16. If you want to keep the original attachments,
move them out of the repo rather than leaving them in `docs/`.

---

## 4. Git bundles — 330 KB

`claude-experiment.bundle`, `demo-mode.bundle`, `note-threads-aj.bundle` at the
root, plus four more inside `Claude outputs/`. These were used to move branches
between machines. Every branch they carry is merged into `master` now, so they
are dead weight.

These are **not** gitignored, so they show up in `git status` and can confuse a
clean-tree check.

```powershell
Remove-Item *.bundle -Force
Add-Content .gitignore "`n# Git bundles used to move branches between machines`n*.bundle"
```

---

## 5. Untracked files that should be decided, not deleted

Five ship scripts were written but never committed, while their siblings in the
same folder are tracked:

`scripts/ship/ship-fixes.ps1`, `ship-floor.ps1`, `ship-gate.ps1`,
`ship-tracker.ps1`, `ship-tracker2.ps1`

Two documents are in the same state:

- `DEMO-MODE-RUNBOOK.md` at the root — Demo Mode is retired to the tag
  `archive/demo-mode-foundation` and will be rebuilt, so this is history.
  Belongs in `docs/ops/` or deleted.
- `docs/JOURNEY-BRIEFING.md` (44 KB) — worth a look before deciding; if it is
  still true, commit it; if it has been superseded by `docs/START-HERE.md` and
  `docs/ARCHITECTURE.md`, delete it.

Commit them or remove them, but do not leave them untracked — an untracked file
is invisible to every check the project runs.

---

## 6. `Claude outputs/` — keep this one

It holds ~60 screenshots and preview images from past rounds, plus a few round
documents and bundles. It is gitignored deliberately.

**Do not delete it blindly** — the screenshots are the only visual record of
several rounds. If you want the space back, move the whole folder outside the
repo. The one thing worth pulling out is `session-scope.test.ts`, which looks
like it was meant to live in `src/`.

---

## 7. Twenty-three merged branches

Everything except `catalog-gate` and `claude-experiment` is merged into
`master` and can go. `cleanup-branches.ps1` already exists for this:

```powershell
.\scripts\ship\cleanup-branches.ps1
```

Or by hand, which prints what it would do first:

```powershell
git branch --merged master | Select-String -NotMatch 'master|\*'
git branch --merged master | Select-String -NotMatch 'master|\*' | ForEach-Object { git branch -d $_.ToString().Trim() }
```

`claude-experiment` is **not** merged — leave it until you know whether you
still want it.

Deleting a local branch does not delete anything on GitHub, and it does not
delete the commits — they are all in `master`'s history.

---

## 8. `.git/stale-locks/` — 38 files

Claude had to rename git lock files aside during the catalog gate round,
because this mount cannot delete them (see `docs/KNOWN-TRAPS.md`, "Git on the
connected-folder mount"). They are harmless and inside `.git`, so they are
never committed.

```powershell
Remove-Item .git\stale-locks -Recurse -Force
```

---

## 9. After

```powershell
git status --short
```

Should print nothing but the work you are actually doing.

---

## Why this keeps happening

The root collects files because it is where scripts write by default and where
transfers land. `.gitignore` has a root-hygiene block (added Sep 12) that
catches `/*.txt` and `/logs/`, which is why most of this is invisible to git —
but invisible is not the same as gone.

The durable fix is the one already in `.gitignore`'s comment: ship scripts
write into a gitignored `logs/` folder, and anything that is a transfer
artefact gets a pattern. Adding `*.bundle` in step 4 is the last common case
that was missing.
