# The client profile audit — Sep 16 2026

Branch `client-profile-audit`, off `master` at `2f28fc9` (the cost round).
Fourteen commits: twelve phases, one review round, and this document. One
commit per phase, each typechecked on its own, so any single phase can be
reverted alone.

AJ's brief was a 37-page audit of the client profile ("Audit - Client
Profile.pdf"): who uses it and how (trainers in 15–30 minute sessions, head
trainers who step in cold, studio leaders who watch retention), then every
tab and every section, with what works and what doesn't. Four decisions were
asked and answered before building:

| Question | AJ's answer |
| --- | --- |
| What should the Journey tab's "Latest" column become? | **Remove the highlight** |
| What should "Clinical History" be renamed to? | **Activity Archive** |
| How far should the Mindbody Master Sync go this round? | **Full Master Sync** — one button, by Mindbody ID only, saves immediately, coach fields never touched |
| Which categories should notes be filed under? | **Seven**: Coaching tip · Equipment · Incident · Injury · Preference · FORD / Life · Admin |

Everything else was Claude's call, under the standing instruction to take
creative control and to leave the Journey grid and the Active Session as they
are. The Journey stays the profile's landing tab.

---

## 1. What the code audit found first

These explain most of the parts of the profile AJ didn't love. They are facts
about `master` at `2f28fc9`, not opinions.

- **The "Latest" column was often a column of dashes.** It highlighted the
  newest loaded session, including one with no sets (a check-in, a session
  started and left).
- **Tapping a machine on the Journey opened a different, older window** than
  Programming → All Machines, and it saved settings with a bare `setDoc` — no
  reason, no change history, no journal entry. Routine A/B rows opened the
  same old window.
- **"MOVEMENT SLOT +0% — increase from undefined to undefined"** on a real
  report card: empty accolade slots were drawn as if real. The three
  accolades were picked by machine NAME ("leg press", "row", "chest").
- **Mindbody:** neither sync button fetched city/state/postal, the waiver,
  membership status or the creation date — only the webhook wrote them, so
  most clients read "Not on file". The screen read `mindbodyId`, the webhook
  wrote `mindbodyClientId`. The profile's button fell back to a **name
  search** and staged whatever it found.
- **Smart suggestions were already paid for.** The cost round's weekly
  machine-trends job stores "which setting value do clients of which height
  use" per machine. No screen read it.
- **The clinical matrix names machines and setup changes** ("Lumbar
  extension — Gap 4-6, diagnostic load 20 lb / 3 reps") and nothing read it,
  though the Body section's helper text promised machine-level
  contraindications.

## 2. The phases

| # | Commit | What |
| --- | --- | --- |
| 1 | `feat(journey)` | No "Recent journey" caption; no Latest frame on the profile (live keeps it); older sessions load as you scroll toward the left edge — the "Older +7" pill is gone and the in-grid rail is a quiet status; calmer light-mode neutrals, profile only |
| 2 | `feat(profile): one machine window` | `ClientMachineWindow` — the All Machines detail in a dialog, for every machine tap on the profile. Saves go through `equipment/mutations.ts` (reason, history, journal). A Load progression card joins the detail. The second-tap bug is fixed |
| 3 | `feat(mindbody): master sync` | `POST /api/mindbody/client-master-sync` (by id only, `IncludeInactive`, the returned id must match), `buildMasterSyncPatch` (Mindbody-owned fields only, never blanks, only the diff), `runMasterSync`, `mindbodyIdOf`, `waiverState`. The name search is gone from `/client-demographics` |
| 4 | `feat(goals+focus)` | The why as the anchor; the current goal with a SMART checklist; "Mark achieved" with a reward into `goalHistory`. Several active focuses; Achieved (with reward) / Extend / Retire; focus history by trainer and span; the focus check-in carries its `focusId` |
| 5 | `feat(notes)` | A catalog, not a feed: seven categories, category-first capture (FORD / Life hands off to FORD capture), tiles that isolate a category in one tap, shelves, search. `injury` and `preference` kinds |
| 6 | `feat(assessment)` | Three pillars (Recovery & Fuel · Physical & Functional · Psychological & Behavioral), plain-word anchors from the question bank, "living, never finished" framing, and an Assessment History Log — deltas between filed assessments plus an in-draft `changeLog` with optional notes, so autosave never erases the trail |
| 7 | `feat(report)` | No empty or undefined accolades; `draftAccolades()` picks up to three from the data with named minimums; "—, not enough data yet" instead of fake zeros; focus history in the 4 P's step and a `focusSnapshot` on the report; step titles follow the four-phase CPR; the report reads its history once instead of twice per machine |
| 8 | `feat(programming)` | Routine rows speak the All Machines rail's language; height-based setting suggestions (never a pre-fill) and the catalog's stature tips; clinical watch-outs per machine (machine window, in-session sheet, routine rows, context line); "9 of 21 performed · N never tried" |
| 9 | `feat(profile): who they are` | The header's Sync button is the one sync; Mindbody-owned identity is read-only once linked; `client.nickname` replaces the legal first name in the primary headers; the waiver says signed / not signed / not synced yet |
| 10 | `feat(admin)` | Admin rebuilt around the contract: current tier (with a coach **lock**), what is left, the contract timeline, access, and the fine print. `ClientMembershipsCard` deleted |
| 11 | `feat(record)` | Life: work as what it does to the body (Retired keeps the previous work), activity outside the studio, experience as background + dated protocol mastery. Body: a watch-out banner and a searchable flag picker with common constraints. 223 unreachable lines out of `ClientProfileView` |
| 12 | `feat(profile): Activity Archive` | The rename, the strip resolved through the picker's code, and a Reports cue when the renewal conversation is due and no report was filed in 45 days |
| 13 | `fix(profile): the review round` | See §4 |
| 14 | `docs` | This document, CLAUDE.md, ROADMAP.md, the iPad checklist |

Phases 1–7 were built in parallel by five helpers in separate worktrees with
disjoint file ownership, then stacked; 8–12 were built on top of them.

## 3. Decisions worth knowing

- **Suggestions are sentences and never values.** A height suggestion needs
  `MIN_CLIENTS` people in a ±2" band and more than one on the offered value;
  it appears only while editing an EMPTY field, and fills only when "Use" is
  tapped. One `machineTrends/{id}` read per machine per app session.
- **Watch-outs quote the studio's own matrix.** The nine common constraints
  added to `src/data/clinical-matrix.ts` (category "Common constraints") say
  which machines load a joint and "confirm a pain-free range" — not
  treatment. A head trainer can refine the wording in that one file and every
  screen follows.
- **Mindbody owns identity; the coach owns the nickname.** Name, birth date,
  gender, contact, address and emergency contact are read-only on a linked
  client. Master Sync overwrites them when Mindbody has a value and never
  blanks one. `isActive` is the app's own; Mindbody's goes to `mindbodyActive`.
- **The tier lock does not reach the renewal engine yet.** It wins on the
  record's Admin section only; the nightly job still matches Mindbody names
  against the studio's package table (roadmap).
- **The lifetime rollup is trusted only after its backfill**
  (`machineStatsBackfilledAt`) — for "performed", "never tried", and the
  routine rows' % and ×. Before that the numbers say "unknown", not zero.
- **Fields the record edits in their own sections are not repeated in the
  notes catalog** (`SHOWN_ELSEWHERE_ON_RECORD`). Other screens still read
  them as notes.
- **The Active Session changed in exactly three visible ways:** the machine
  sheet shows a watch-out line when the client has one and suggestions inside
  its Settings card; the notes sheet uses the category chips; and names follow
  the nickname. The grid, the Now bar and the flow are untouched.

## 4. The review round

An independent review of the whole diff and a rendered pass of every new
screen (iPad portrait and landscape, light and dark, 80 screenshots against
an in-memory Firebase stand-in) found no crashes, no loops and no bad writes,
and these, all fixed in commit 13:

- **Master Sync could pull a namesake's data** onto a record whose stored
  Mindbody id came from the old name-search fallback. It now refuses any
  record whose ids disagree (`mindbodyIdConflict`), before asking Mindbody.
- Programming's coverage and the routine rows' % trusted a rollup that had not
  been backfilled; contract history compared instants, not days (a contract
  "ended" at 9pm Eastern the day before); current high-priority personal
  events had fallen out of the briefing.
- **On master already:** the progress-report banner above the header read an
  empty list on the Journey tab (reports only load on two tabs) and told
  trainers a client with reports had none; "Report Due Yesterday" for any
  overdue report. Fixed with one read per client.
- The record's Save bar and jump rail were pinned inside the scroller's
  padding (the CLAUDE.md sticky trap) — `use-scroller-pad.ts` now measures it
  for them. The header's Sync is icon-only below 2xl so the identity line
  isn't squeezed to a letter, and long names wrap.
- Smaller: flagged machine notes read "Important", not "Maintenance"; the
  notes search icon; the goal box; the FORD grid in portrait; one Assessment
  heading; readable report dates; the rail's watch-out marker; nickname in
  the machine window and "Plans from the team".

Seen and **left** (pre-existing, or the grid AJ asked to leave alone): the
Journey grid truncates long machine names ("TRICEP EXTENSI…") and fits about
seven columns in portrait; the snapshot bar's contract chip truncates and the
bar scrolls away despite its comment; Routine A caps at 860px in landscape by
design; the header's studio line still ellipses in portrait; recharts warns
about a -1 size while the machine window animates open.

## 5. Verification

- `npx tsc --noEmit`: **13** (master 18 — the five removed were in the dead
  code deleted in phase 11). Every commit typechecks at or under 18 on its own.
- `TZ=America/New_York npx vitest run src`: **2,636** passing (master 2,128),
  and the same at UTC. New render tests: the machine window, the Settings
  suggestions and watch-out card, the header, the contract panel, the flag
  picker, the banner and the Life baseline, the Assessment panel, the notes
  catalog, the Goals section, the report accolades.
- `npx vite build`, the `server.ts` bundle and `build:backend`: clean.
- Not run here: `npm run test:rules` (no rules changed; AJ's run still counts),
  and a real iPad.

## 6. What to run

No Firestore rules, indexes or Cloud Functions change. The server route is new,
so the web service must redeploy (every push to `master` does). See
`backups/profile-audit-ship/README.txt` on AJ's PC for the staged script.

After it is live: open a client with a Mindbody id and tap **Sync** once —
the Who they are card should fill in address, waiver, status and "In Mindbody
since". A client that refuses with "two different Mindbody IDs" needs a leader
to confirm which person it is.
