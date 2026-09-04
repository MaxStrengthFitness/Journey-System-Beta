# Progress Report — the six-step conversation

Round: Subjective Report, Sep 2026. Companion to
`src/features/subjective-report/` (the 90-day check-in that is step 5).
`ClientProgressReportView.tsx` still owns the data flow; this folder holds
the step rail, the two new steps and the client-copy renderers so the view
file stops growing.

## Why a stepper

The old editor was five tall cards on one page. Trainers filled them in
out of order and clients got a report that read like a form. The report is
really a conversation with a fixed shape — celebrate, show the wins, show
the numbers, say the hard thing, leave them with a goal and a date — so the
editor now walks that shape one step at a time and explains each step in
plain words above it. The order is the pitch: a client who has just been
congratulated and shown a +71 % row hears "your Path breaks down under
load" very differently from a client who got the criticism first.

| # | Step | What's there | New? |
| - | - | - | - |
| 1 | Celebrate | Attendance & Dedication (unchanged) | |
| 2 | Highlights | Highlighted Movements (unchanged) | |
| 3 | Machine progression | Start → now for every machine with history; trainer ticks what the client sees | **new** |
| 4 | The 4 P's | Clinical Performance Matrix (unchanged) | |
| 5 | 90-day check-in | `SubjectiveStep` — the reference document + hydration, pain map, stress anchors | **new** |
| 6 | Goals | Goal continuity block + the existing training-track picker + closing notes | **new block** |

`steps.ts` carries the guide text; `ReportStepper` renders the rail and the
guide, `ReportStepNav` the Back / Next / Finalize row at the bottom.

## Goal continuity

`ReportGoals` on the report: `originalWhy` (carried forward every report),
`previousGoal` + `previousGoalOutcome` + `previousGoalNote` (how last
time's goal went), `nextGoal` + `nextGoalTargetDate` + `checkpoints`, and
`followUpDate` — the date the trainer chases in 90 days. A new report pulls
`previousGoal` from the previous finalized report's `nextGoal`, so the
loop closes itself.

## Machine progression

`rowsFromHistory()` turns the per-machine stats the page already loads
into `MachineProgressionRow[]`, sorted by % gain. Rows are captured onto
the report when ticked, so the printed copy never changes after the fact.
Biggest gains are pre-ticked the first time so a rushed trainer still
ships a useful table.

## Printing

Two things were wrong before this round:

1. The app shell is a `100dvh` scroll pane, and a scroll pane prints as
   exactly one page — every report was cut off. `index.css` now un-caps the
   shell while `body.printing-report` is set; the view sets it on
   `beforeprint` and marks its root `data-print-root`.
2. The print stylesheet forced a navy page while headings switched to navy
   ink — invisible text. Print is now white paper / navy ink; translucent
   surfaces become pale cards and their white text becomes navy, while the
   deliberately dark (trophies) and orange (goal, session count) cards keep
   their fill.

Email: the Email button opens the trainer's own mail app with subject and a
short body filled in; they print to PDF and attach. The app itself still
never contacts clients — no provider is wired and client-contact features
are switched off (see RENDER-DEPLOYMENT.md).
