# MSF Academy — reference corpus

Plain-text conversion of the MSF Academy Google Drive
(`drive.google.com/drive/folders/11EQ0ebZENz4zdQ1Im6Q3UFktCs5-8ye8`),
committed so the methodology is greppable from any checkout without
needing Drive access.

**This is the source of truth for training methodology.** When a feature
encodes a rule about exercise selection, sequencing, rep ranges, or
progression, that rule must trace back to a file in here — and the code
that encodes it should cite the filename in a comment.

## Where the rules that are already in code came from

| Code | Source document |
| --- | --- |
| `src/features/routine-builder/academy.ts` → `ACADEMY_CATEGORIES`, `BIG_FIVE` | `Academy 6/Academy - Programming and Progression 1 - Workout Programming Considerations.txt` |
| `academy.ts` → `SEQUENCING_RULES` | `Academy 6/Programming and Progression 7 - Exercise Selection Template.txt` ("Programming and/or sequencing to potentially avoid") |
| `academy.ts` → `EXERCISE_SUBSTITUTES` | `Academy 6/Exercise Substitutes.txt` |
| `academy.ts` → `SELECTION_TEMPLATES` | `Academy 6/Programming and Progression 7 - Exercise Selection Template.txt` (condition/goal table) |
| `academy.ts` → `MODEL_AB_ROUTINE`, `TWICE_WEEKLY_RULE` | `Academy 6/Programming and Progression 6 - AB Routines - How to Optimize Programming.txt` |
| `academy.ts` → `REP_RANGE_BY_LEVEL`, `EXERCISE_COUNT` | `Academy 6/Academy - Programming and Progression 2/3/4 - Novice/Intermediate/Advanced Level Trainees.txt` |
| `academy.ts` → `PAIN_PROTOCOL` | `Academy 6/Considerations for Training with Pain.txt` |
| `src/features/demo-mode/loads.ts` — the whole file | `Academy 2/Training with pain…txt` (two-pound increments), `Initial Setups/…/Cervical Extension.txt` + `Triceps Extension.txt` (the 20 lb floor), `Academy 2/Exercise Selection Template.txt` (intentionally underestimating the new client), `Academy 2/How Intensely to Push a Client.txt` (the rep bands), `Academy 6/… Progression 5 - Workout Progressions.txt` (reps before resistance), `Academy/… Registering Performance - Use of the Clicker.txt` (only clean reps count), `Initial Setups/…/Leg Extension.txt` (static-hold time progression) |

## Layout

```
Academy/                       the numbered curriculum, 1–9
  Academy 1 - Introduction/            philosophy, glossary, the 4 P's
  Academy 2 - Benefits.../             why resistance training
  Academy 3 - Basic Principles.../     overload, intensity, volume, progression
  Academy 4 - Exercise Performance/    cadence, turnarounds, breathing
  Academy 5 - Continuous Tension.../   the core MSF protocol
  Academy 6 - General Recommendations for Programming and Progression/
                                       ← programming rules live here
  Academy 7 - Variations.../           TSC, static hold, forced reps, drop sets
  Academy 8 - Basic Equipment.../      per-machine setup + quick-reference guides
  Academy 9 - Exercise Instruction/    scripts and cueing
Academy 2/                     Fundamentals of High Intensity Exercise
Initial Setups (...)           starting-weight tables
Set Up Machines/               standardized setup guides (batches 1–4)
Workout Setups and Instruction/ upper / lower / spine-trunk-core
```

Binary originals (`.docx`, `.xlsx`, `.pdf`, machine photos) were **not**
committed — only the extracted text. Spreadsheets that matter
(`MSF - Suggested Starting Weights.xlsx`, `Exercise Loading Guidelines.xlsx`)
are still Drive-only; if their numbers get encoded in the app, add them here
in a structured form at the same time.

**Oct 7 2026: the first of the two is now here** (`MSF - Suggested Starting
Weights.txt`, see "Checked against Drive" below); the paragraph that follows
is kept as it was written.

**Those two are now the biggest gap in this corpus.** Sep 20 2026: the demo
loads round searched every file for a per-machine starting weight and there is
none — no table, no percentage of bodyweight, no percentage of 1RM. The only
hard numbers anywhere are the 20 lb floor on Cx / Bi / Tri / LE / LC and the
Leg Press's 18 lb accessory and 38 lb combined footplate pressure. Two places
in the app are running on unvetted guesses in the meantime and both should be
replaced from the spreadsheet: the catalog's `baselineLoad` (which
`suggestedWeight()` offers to real trainers for real clients) and
`src/features/demo-mode/loads.ts` (demo only, and says so at the top).

## Checked against Drive, Oct 7 2026

AJ opened the MSF Academy Drive folder and asked for everything the corpus
didn't have. Every folder and subfolder was compared by name, count and date
(the nine Academy sections, the Executive Summary, Initial Setups' 19 equipment
overviews and 18 quick reference guides, Workout Setups and Instruction).
Brought in:

- `Academy/Academy 6 - .../MSF - Suggested Starting Weights.txt` — **the
  starting-weight table this README called the biggest gap.** It is a Google
  Sheet now (titled "MSF + Imagine Strength Equipment Loading Guidelines"):
  a range for each of the twenty machines, female and male, Novice and
  Advanced, "for a new client OR a new exercise for an existing client", with
  the sheet's own notes on reading it. Whether `Exercise Loading
  Guidelines.xlsx` is the same table under its old name is not known; it is
  not in the Academy folder.
- `Academy/Academy 2 - .../Academy - Benefits of Resistance Training 9 - Sarcopenia.txt`
  (Jun 1 2026, never brought in).
- `Academy/Research.txt` refreshed (Drive changed it on Oct 2 2026: the
  frequency studies, the ACSM 2026 position stand, the retirement-age RCT).

Left in Drive on purpose:

- `Fundamentals of High Intensity Exercise_MSF (1).pdf` — the 19-page designed
  version of `MSF Fundamentals of High Intensity Exercise`, whose text is
  already here (the same opening; not compared page by page).
- `Global consensus on optimal exercise recommendations for enhancing healthy
  longevity in older adults (ICFSR).pdf` — a published paper by outside
  authors; this repository is public, so its text is not copied. `Research.txt`
  keeps its Drive link and the two quotes MSF chose.

Outside the Academy folder, the same Drive account shares other MSF documents
(the Mastery Series, MSF Overview, the Resistance Training Workshop, Exercise
Categories, the Training Roundtable links). Some are the sources of the
corpus's other folders (`Academy 2/`, the top-level `Academy 6 - .../`); they
were not compared in this pass.

## Refreshing

Re-export the Drive folder, convert `.docx` → `.txt` preserving the tree, and
replace the contents of this directory. Nothing reads these files at runtime —
they exist for humans and for agents doing research before a change.
