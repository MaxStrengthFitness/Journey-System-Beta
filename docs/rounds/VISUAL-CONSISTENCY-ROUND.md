# The visual consistency round (Sep 12, 2026)

**Branch:** `visual-consistency` off `master` · five commits, one per phase
**Ship it:** `.\ship-visuals.ps1 prepare` then `.\ship-visuals.ps1 verify`
**Undo any single phase:** `git revert <sha>` — the phases do not depend on each other

---

## 1. The diagnosis — it was one root cause, not thirty screens

The audit found the CSS layer is in good shape: every feature stylesheet runs at
92–100% design-token adherence. The drift is entirely in Tailwind classes inside
components, and it traces to a single thing.

**This app was built dark-first on Tailwind's stock `slate` scale.** Every
dark-mode token in `index.css` is *exactly* a Tailwind slate value — checked, not
assumed:

| token | value | is |
| --- | --- | --- |
| `--background` | `#020617` | `slate-950` |
| `--card` | `#0F172A` | `slate-900` |
| `--elevated` | `#1E293B` | `slate-800` |
| `--ink-l1` | `#F8FAFC` | `slate-50` |
| `--ink-l2` | `#CBD5E1` | `slate-300` |
| `--ink-l3` | `#94A3B8` | `slate-400` |
| `--ink-l4` | `#64748B` | `slate-500` |

That is why dark mode has always looked coherent. The ~2,700 hardcoded `slate-*`
classes scattered through the components happen to agree with the tokens.

**Then the Sep 9 light-mode retune moved the light palette off pure slate on
purpose** — a ground a real step below white (`#EDF0F5`), greys pulled off blue
and desaturated, both muted inks darkened to clear AA. The hardcoded classes did
not move with it. So in light mode those screens paint Tailwind's cold blue-grey
directly beside the retuned brand neutral, screen after screen.

That mismatch is the whole of the "some parts of the app don't match" report,
and it explains why it reads worse in light mode than dark.

### What the audit counted

| | before | after |
| --- | ---: | ---: |
| distinct card/panel recipes | 179 | 136 |
| non-theme-aware palette utilities | 576 | 617 counted properly¹ — 311 outside the always-dark screens |
| semantic token classes in components | ~500 | 1,267 |
| uses of the brand tokens (`bg-action`, `bg-brand`) | 9 | 30 |

¹ The first pass under-counted: its string matcher spanned newlines and silently
merged regions. The number in the test is produced by the test's own code, which
is the only number worth ratcheting against.

---

## 2. What's in it — five phases

**1 · The neutral ramp.** `slate-50`…`slate-950` are redefined in `@theme` to
point at the brand neutrals. Light maps onto anchors already in `:root`; **dark
is byte-identical to Tailwind slate**, so dark mode does not move at all. Both
ramps stay monotonic and non-inverting, so pairs already written as
`bg-white dark:bg-slate-900` keep behaving exactly as written. One file,
112 lines, and deleting the `@theme` block reverts it.

This is the same technique the elevation scale in that file already uses to
override Tailwind's shadows so every `shadow-*` softens at once.

**2 · Collapse hardcoded pairs onto semantic tokens.** 350 substitutions across
43 files. Each rule was checked against the real token values first, and all
five are identical in dark mode:

| from | to | sites | dark | light |
| --- | --- | ---: | --- | --- |
| `bg-white dark:bg-slate-900` | `bg-card` | 49 | identical | identical |
| `text-slate-500 dark:text-slate-400` | `text-muted-foreground` | 110 | identical | identical |
| `text-slate-400` (no `dark:` sibling) | `text-muted-foreground` | 143 | identical | **2.24:1 → 5.9:1** |
| `border-slate-200 dark:border-slate-700` | `border-border` | 56 | identical | identical |
| `text-slate-900 dark:text-white` | `text-foreground` | 62 | `#FFF`→`#F8FAFC` | identical |

**3 · The pre-login accents.** `AccessRequestView` — the first screen anyone
sees — was accented in `#ff9800`, Material Design's orange, which is not in the
Journey palette at all. Its sibling `StudioSelectionView` already uses `#F06C22`.
Both now go through the `--action` token.

**4 · The two largest screens.** `ClientProfileView` (4,209 lines) and
`WorkoutTrackerView` (3,965), 92 substitutions, same five rules as phase 2, in
their own commit so the biggest files can be reverted without losing the rest.

**5 · The guard.** `src/neutral-ramp.test.ts`, in the same spirit as
`journey-grid/contrast.test.ts` — a hand-typed table of ratios is a claim, a
test is a check. 53 assertions, all computed from the actual `index.css`.

---

## 3. What this does NOT do

Worth being plain about, because two of these I flagged wrongly at first and
corrected after reading the code:

- **The Start Session CTA was never off-brand.** I flagged it early as amber. It
  is not: it is `linear-gradient(135deg, #ef5302, #f36d21)` with a `#0a548b`
  focus ring — primary-1 and accent-3 with accent-4, exactly right. The amber
  button beside it is the **"In progress"** state, where amber is correct
  semantics for "a session is already running". Neither was touched.
- **The 136 remaining card recipes are not collapsed.** Reducing them needs
  judgement per panel and someone looking at the result, which is a round of its
  own — see section 6.
- **`slate-400` still fails AA as a text colour** (2.73:1). That is deliberate:
  it is a non-text grey and cannot be darkened without colliding with
  `slate-500`. The fix was to move the 367 text uses off it, which phase 2 did.

### The trap I walked into, so it does not get walked into again

Phase 2's substitution is only safe on a surface that follows the theme.
`text-muted-foreground` on a **fixed dark** pane resolves to `#55606F` in light
theme — roughly 2.4:1, unreadable. Five screens paint a dark surface regardless
of theme and are correctly excluded:

| screen | its always-dark root |
| --- | --- |
| `AccessRequestView` | `touch-pane … bg-[#1c1d1f]` + ambient gradient |
| `ClientFocusDashboard` | `flex flex-col h-full bg-[#0A2E46] text-slate-200` |
| `ErrorBoundary` | `min-h-screen bg-[#0A2E46] … text-white` |
| `LegacyChartImporter` | `bg-slate-950 min-h-screen text-slate-100` |
| `ClientProgressReportView` | `min-h-screen bg-[#0A2E46]` (the printable report) |

Two others looked like they qualified and did not: `StrongConfirmationModal`'s
`bg-slate-900/50` is a modal **scrim** over a `bg-card` panel, and `AppContent`'s
one dark block holds no substituted text. Both keep their changes.

The test names this list. If one of those screens is ever converted to follow
the theme, take it off the list and the drift budget tightens automatically.

---

## 4. The iPad pass — what to actually look at

The whole round is colour, so this is a looking exercise, not a clicking one.
**Do it in light mode first** — that is the half that changed.

1. **Put two screens side by side that used to disagree.** Open the Catalog (was
   already on tokens) and then a client's Journal (was not). The greys should now
   be the same temperature. That is the entire point of the round.
2. **Secondary text.** Labels, meta lines, timestamps, "no scans yet" empty
   states. These were `#94A3B8` on white — washed out. They should now be
   legible at arm's length on a tablet in a bright studio.
3. **Card edges.** Hairlines were Tailwind `#E2E8F0`, now `#DCE3EC`. Cards should
   still read as cards, not as floating white blocks.
4. **The access request screen.** Sign out and reach it. The orange should now
   match the studio selection screen exactly. Put them side by side.
5. **Then switch to dark mode and confirm nothing moved.** That is the
   prediction: the dark ramp is byte-identical, so dark mode should look
   *exactly* as it did. If anything looks different in dark, that is a bug worth
   reporting — it means an assumption in phase 1 was wrong.
6. **The two giants:** client profile and the workout tracker. Most substitutions
   landed there.

Screenshot anything that looks off and send it over.

---

## 5. How to undo any of it

The phases are independent:

```
git log --oneline visual-consistency   # find the sha
git revert <sha>                       # undo one phase, keep the rest
```

To abandon the whole round:

```
git checkout master
git branch -D visual-consistency
```

Phase 1 alone can be reverted by hand by deleting the `@theme` block that maps
`--color-slate-*`; the `--n-*` definitions are inert without it.

---

## 6. Still open — the next round

- **The 136 card recipes.** The most-used one appears 21 times; the rest are
  one-offs. Collapsing them means agreeing a small set of panel recipes
  (`card`, `inset`, `raised`) and converting screens onto them. Needs a proposal
  and eyes on the result — it is a redesign, not a substitution.
- **311 non-theme-aware utilities remain** outside the always-dark screens.
  Mostly semantic colours (`text-emerald-500`, `bg-red-50`) that want status
  tokens rather than neutrals. The ratchet stops it growing.
- **`hover:bg-[#a02400]`** in `StudioSelectionView` is a hardcoded pressed state
  with no token. `--cta-strong` is `#BC2C00`, close but not equal, so changing it
  is a visual decision rather than a cleanup.
- **The three giants should be broken up.** `ClientProfileView` at 4,209 lines
  and `WorkoutTrackerView` at 3,965 are where drift accumulates fastest, because
  nobody can hold either in their head.

---

## 7. The master baseline, measured by accident

The first run of `ship-visuals.ps1` refused at `prepare` — my bug, see below —
and then `verify` ran anyway. That measured **master**, which turned the mistake
into the baseline this round has to be judged against:

| | master, Sep 12 12:20 |
| --- | --- |
| typecheck, `src/` | **18 errors** |
| typecheck, `harness/` | 1 error — `TS2307`, cannot find `../src/features/demo-mode` |
| tests | **94 files, all passing** |
| build | clean, 15.04s |

18 in `src/` is the number this round must not raise. The harness error is
permanent until `demo-mode-foundation` is merged: the harness is untracked,
outside the build, and references a module that only exists on that branch.

Where the 18 live, none of them touched by this round except inside class
strings: `ClientInfoSheet` 6, `ClientProfileView` 5, `clinical-review/charts` 3,
`AppContent` 2, `MachineDefinitionForm` 1, `EditTrainerModal` 1.

**Also found: `.github/` does not exist on disk.** The Sep 10 CI workflow and
its `typecheck-baseline.txt` were delivered as downloads, because the file
bridge treats `.github/` as a protected path, and were never put in place. So
there is no CI running on this repo today, and nothing is checking the typecheck
baseline except a person. Worth fixing on its own.

### Three bugs in v1 of the ship script, all mine

1. **The clean-tree check counted untracked files.** `git status --porcelain`
   reports them; your repo root carries 20 (old round docs, three previous ship
   scripts, deploy and rules logs, `Claude outputs/`). None can conflict with
   `git apply`. v2 checks `--untracked-files=no`, which is the thing that
   actually matters, and lists the untracked ones as information. It also scopes
   `git add src` so none of that root litter gets swept into a commit.
2. **The typecheck count was read back out of the whole log file**, which is
   appended across runs, so a second run would have double-counted. v2 counts
   only the current run's output and splits `src/` from `harness/`.
3. **Non-ASCII characters.** PowerShell 5.1 reads a BOM-less file as ANSI, which
   is why the log says `PREPARE a<80><94> branch`. v2 is pure ASCII (verified
   byte by byte), and commit messages are written with `-Encoding ascii`, since
   `-Encoding utf8` on 5.1 emits a BOM that would land as a stray glyph at the
   front of every commit subject.

v2 also refuses if `src/neutral-ramp.test.ts` already exists, since patch 05
creates it, and warns loudly at `verify` if you are not on the branch — which is
exactly the trap the first run fell into.

## 8. Known limits

- **None of this was typechecked, tested or built before it reached you.**
  `device_bash` could not mount the project folder this session (the Sep 8
  Windows update), so there was no way to run `tsc`, `vitest` or `vite build`
  against the real `node_modules`. The changes are string substitutions inside
  existing class strings, which cannot break syntax, and the 53 assertions in
  the new test were executed standalone under Node against the real `index.css`
  — but the `verify` stage is the first real check. Read the log.
- **The ship script itself could not be run either.** There is no PowerShell in
  the container, so v2 was reviewed by hand: balanced braces, parens and quotes,
  every `Run` call reading the hashtable it returns, and zero non-ASCII bytes.
- **The five patches were verified to apply cleanly** to a pristine copy of your
  tree, in order, and the result was confirmed byte-identical to the tree the
  work was done in, with CRLF line endings intact.
- **Nothing here was seen rendered.** Every claim in this document is arithmetic
  on colour values, not a judgement about how a screen looks.
