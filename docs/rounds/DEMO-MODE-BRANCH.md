# `demo-mode-foundation` — what's actually in it

Written 10 Sep 2026, from the branch's own commit log checked against what
master looks like today. Nothing was merged, nothing was deleted. This is the
inventory you asked for so you can decide.

---

## The short version

**Ten commits. None of the code is in master — not one line.** I checked
directly: there is no `src/features/demo-mode/`, no `isDemo` anywhere in `src`,
and no mention of demo in `firestore.rules`.

Two of the files the branch edits **no longer exist** — the admin overhaul
deleted them. Those two commits cannot be applied at all and have to be
re-done by hand or dropped.

But one phase of it fixed a **bug that is still live in master today**, and I
have now fixed that separately so it doesn't wait on this decision.

---

## The ten commits

| # | Commit | Still applies? |
|---|---|---|
| 1 | Pre-shell screens own their scroll pane | **Partly — see below** |
| 2 | The demo-mode module — one id, two guards, fifteen tests | Yes, clean |
| 3 | Every trainer can enter Demo Mode, from a card | Yes |
| 4 | A strip you cannot miss, in 28 pixels | Yes |
| 5 | Keep practice data out of every number that means something | **Conflicts** |
| 6 | A demo studio that can be put back | **Conflicts** |
| 7 | Demo Mode named in the rules | Needs re-doing |
| 8 | The curriculum as data, content deliberately unwritten | Yes, clean |
| 9 | Roadmap | Trivial |
| 10 | Prep for the admin overhaul, and the Kaizen root cause | **Already superseded** |

---

## Phase 1 — the scroll trap. Half of it is already in master; the other half was still broken.

The branch fixed three screens that render **outside** the app shell:
studio selection, the access-request form, and login. They matter because
`src/index.css` sets `html, body { overflow: hidden }` — deliberately, so the
bounded app shell doesn't rubber-band on iPadOS. A screen outside that shell
with no scroller of its own therefore lays out its content and makes anything
past the first viewport **physically unreachable on a tablet**.

What I found today:

- **Studio selection — already fixed.** It now carries
  `touch-pane overflow-y-auto overscroll-contain`, which arrived through the
  iPad round on the 9th. Nothing to merge.
- **Login — never a problem.** It's a centred spinner with nothing to scroll.
- **The access-request form — still broken in master.** It had
  `min-h-screen … justify-center … overflow-hidden` and no scroller. On a
  1024×768 iPad the form is ~1200px tall, so **the Submit button could not be
  reached at all.**

I measured it rather than assuming, in a headless browser at iPad-landscape
size:

```
BEFORE  content 1206px · pane grew to 1206px · scrolled 0px · Submit visible: NO
AFTER   content 1206px · pane 768px          · scrolled 438px · Submit visible: YES
```

**I've fixed that one already** — same pattern as studio selection, plus a
`min-h-full` inner wrapper (without it, `justify-center` clips the *top* of an
overflowing child, which hides the heading and is worse than the original bug).
The three background layers moved from `absolute` to `fixed` so they still
cover the viewport instead of scrolling away. Verified: the heading is visible
at the top, Submit is visible at the bottom. It's on your machine now.

So Phase 1 no longer needs merging. Its value is banked.

---

## Phases 5 and 6 — the real conflicts

Both touch files the admin overhaul **deleted**:

- `AdminMetricsDashboard.tsx` — replaced by `features/admin/AdminOverviewTab.tsx`
- `AdminUserDirectory.tsx` — replaced by `features/admin/staff/`

Phase 5's job was keeping practice data out of numbers that mean something —
career session counts, payroll, attendance, exports, Mindbody sync. The
guarding in `functions/src/trainerRollups.ts` still applies cleanly (that file
is untouched by the overhaul). The `AdminMetricsDashboard` guard has to be
re-pointed at `AdminOverviewTab` — but the new Insights work reads sessions
through a different query shape, so it isn't a copy-paste; it's a fresh read of
where demo data could leak into the new code.

Phase 6 built the seeder and the Reset button at
**Admin → System Backend → System Tools → Demo Mode studio**, and deleted the
old `handleSeedDemoClient`. That deletion never happened, so:

> **`handleSeedDemoClient` is still live in `AppContent.tsx:1203`.** It writes a
> client called "John Demo" into whatever **real** studio is active, with no
> `isDemo` flag and no `homeStudioId`. The button is still on the System Tools
> screen. That's 131 lines that can put junk in a production studio, one tap
> away, today.

I have **not** touched it — deleting a visible admin button is your call, not
mine. But it's the strongest single argument for not leaving this branch parked
much longer.

---

## Phase 7 — the rules

`firestore.rules` has moved a great deal since the branch was cut: the tenancy
fix, the expression-budget rewrite, the playbook and submissions blocks. The
branch's version of the file is far enough behind that merging it is a
line-by-line rewrite, not a merge.

The good news is the change itself is small — Demo Mode named in the rules so
later hardening can't lock it out. Re-writing it against today's file is
probably twenty minutes and much safer than resolving a conflict in a 64KB
security file.

---

## Phase 10 is already spent

`5b0774e` is the admin-overhaul prep commit — `ADMIN-OVERHAUL-PREP.md` plus the
Kaizen root-cause audit. Rounds 1 and 2 both shipped off the back of it and are
merged. It's history, not pending work.

---

## What I'd suggest

Not a merge. The branch is 10 commits behind a security rewrite of the rules
file and two of its targets have been deleted; resolving that by hand risks
exactly the kind of quiet mistake a rules file punishes.

**Cherry-pick the clean parts, rewrite the rest:**

1. **Delete `handleSeedDemoClient` now.** Independent of everything else, and
   it removes a live way to write junk into a real studio. One commit.
2. **Take phases 2, 3, 4 and 8 as-is** — the demo-mode module, the entry card,
   the banner strip, the curriculum data. They're new files that touch nothing
   the overhaul changed, so they apply cleanly.
3. **Re-write phase 5's admin guard** against `AdminOverviewTab` and the new
   Insights queries. The `trainerRollups.ts` half applies as-is.
4. **Re-write phase 7's rules change** against today's `firestore.rules`, and
   run `npm run test:rules` before deploying.
5. **Drop phases 1, 9 and 10.** Phase 1 is banked, 9 is roadmap text, 10 shipped.

That gets you Demo Mode without a merge conflict in the file that decides who
can read client records.

**One caveat I want to be straight about:** I have not read the branch's actual
diffs. The bridge gives me the working tree and git's reflog, not arbitrary
commits, so this is built from the commit subjects, the design notes from when
it was written, and direct checks of what master looks like now. The
conflict-vs-clean calls are sound — they follow from files existing or not —
but if you want per-line certainty, `git diff master...demo-mode-foundation
--stat` on your machine will confirm or correct it in one command.
