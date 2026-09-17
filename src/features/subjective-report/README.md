# The Pulse (the subjective report, the living assessment)

On screen it is the **Pulse** since the reporting round (§6). Round:
Subjective Report, Sep 2026. Lives at `progressReports/{id}.subjective` —
as a resumable draft the record's panel keeps open, and as finalized rounds.

This folder is the data model, the question bank and the scoring. The form
(`SubjectiveStep`), the panel's cards, client mode, the quick-log and the
coach dashboard (`SubjectiveDashboard`) sit beside them.

---

## 1. The reference document, verbatim

Everything below this line is the original "Subjective Reports" document as
it was handed over. It is the contract: nothing here has been removed, and
`scoring.test.ts` pins the numbers.

> **Purpose:** Measure meaningful lifestyle and behavior changes supporting
> strength, health, independence, and longevity. Completed every 90 days as
> a coaching conversation tool.
>
> **Rating Scale:** 0 = Not At All, 1 = Rarely, 2 = Sometimes, 3 = Often,
> 4 = Nearly Always.
>
> **Categories (Score Range: 0-12 per category by adding the three responses):**
>
> **Sleep & Recovery:** (1) I am getting consistent, quality sleep. (2) I wake
> up feeling rested. (3) I recover well between workouts.
>
> **Energy & Daily Function:** (1) I have steady energy throughout the day.
> (2) I feel physically capable doing daily tasks. (3) I don't rely heavily
> on caffeine.
>
> **Strength & Physical Confidence:** (1) I feel stronger than I did 3 months
> ago. (2) I feel confident in my body's ability to perform. (3) I can handle
> physical challenges without hesitation.
>
> **Pain & Mobility:** (1) I am free from nagging aches and pains. (2) My
> mobility/flexibility allows me to move comfortably. (3) Physical
> limitations are not holding me back.
>
> **Consistency & Habits:** (1) I am consistent with my workouts. (2) I
> follow through on commitments I make to myself. (3) Fitness is part of my
> routine, not something I "try to fit in."
>
> **Mental & Emotional Impact:** (1) Exercise positively impacts my mood.
> (2) I feel less stressed because of my fitness routine. (3) I feel more
> confident overall.
>
> **Nutrition & Protein:** (1) I consistently eat enough protein to support
> my goals. (2) My eating habits support my health and strength goals. (3) I
> make intentional food choices most days.
>
> **Lifestyle Alignment:** (1) My habits outside the gym support my goals.
> (2) I stay physically active outside of workouts. (3) I am prioritizing my
> long-term health.
>
> **Protein Compliance Score (Displayed separately from the subjective score):**
> Instructor Prompt: Calculate ideal protein (0.75-1.0g per lb of ideal body
> weight per day). Ask: "On average, how many days per week do you hit your
> protein goal?" Rating: Green = 5-7 days, Yellow = 2-4 days, Red = 0-1 days.
>
> **Color Coding & Overall Score:**
> Category Status: Green = 9-12, Yellow = 6-8, Red = 0-5.
> Overall Subjective Progress Score: Maximum 96 points. Green = 72-96,
> Yellow = 48-71, Red = 0-47.
>
> **Coach Dashboard Recommendations:**
> Display Current Category Score, Previous Category Score, Change Since Last
> Assessment, Green/Yellow/Red Status, Protein Compliance Status, Overall
> Score. Highlight Largest Improvement, Largest Opportunity Area, Categories
> in Red, and Protein Compliance. Automatically flag any client who scores
> Red in Protein Compliance, Sleep & Recovery, or Consistency & Habits.

Where each piece lives in code:

| Document item | Code |
| --- | --- |
| Purpose, cadence | `questions.ts` → `SUBJECTIVE_PURPOSE`, `SUBJECTIVE_CADENCE` |
| 0–4 rating scale | `questions.ts` → `LEGACY_SCALE`; conversion in `scoring.ts` → `convertLegacyAnswer` |
| 8 categories × 3 statements | `questions.ts` → `SUBJECTIVE_CATEGORIES` (text verbatim) |
| 0–12 per category | `CategoryScore.legacyScore` |
| Protein prompt + question | `PROTEIN_INSTRUCTOR_PROMPT`, `PROTEIN_QUESTION`, `PROTEIN_G_PER_LB_LOW/HIGH` |
| Protein Green/Yellow/Red by days | `scoring.ts` → `ragForDaysPerWeek` |
| Category Green 9–12 / Yellow 6–8 / Red 0–5 | `ragForFraction` (see §2.1 for why it is a fraction) |
| Overall max 96, Green 72–96 / Yellow 48–71 / Red 0–47 | `scoreOverall` + `ragForFraction` |
| Current / previous / change / status per category | `compareCategories` → `CategoryComparison` |
| Protein status, overall score | `SubjectiveSummary.protein`, `.overall` |
| Largest improvement / opportunity / categories in Red | `SubjectiveSummary.largestImprovement`, `.largestOpportunity`, `.redCategories` |
| Auto-flag Red in Protein, Sleep & Recovery, Consistency & Habits | `buildFlags` → codes `protein_red`, `sleep_red`, `consistency_red`, severity `"red"` |

---

## 2. What was enhanced, and why

### 2.1 The rating scale (0–4 → 0–10 with statement-specific anchors)

The 0–4 frequency scale was the part nobody liked: five coarse steps, and
"Sometimes" means something different for sleep than for protein.

Scale v2 answers each statement **0–10**. The frequency words still exist as
anchors at 0 / 3 / 5 / 8 / 10, but every statement also carries its own
`anchorLow` ("Under 5 hours most nights, broken sleep") and `anchorHigh`
("7–9 hours most nights on a steady schedule"), so two coaches asking the
same client land on the same number. Each answer can carry a short note in
the client's words.

**The document's thresholds survive unchanged.** 9/12 and 72/96 are both
exactly 75 %; 6/12 and 48/96 are both exactly 50 %. So the colours are
computed from the *fraction* of the maximum, which gives the documented
result on the 0–12 / 0–96 scales and the identical result on the 0–30 /
0–240 totals that v2 answers add up to. `legacyScore` is also computed so
the printed report can still say "10 / 12" and "78 / 96".

Old 0–4 answers (`scaleVersion: 1`) convert with ×2.5 → 0, 3, 5, 8, 10.

### 2.2 Protein compliance (days/week → days/week + real intake)

The days-per-week rule is kept exactly. Added: the ideal body weight and the
chosen g/lb factor are stored (the 0.75–1.0 range is always shown), the
computed target in grams is shown to the client, and the client's *typical
daily grams* can be recorded. When it is, `intakeStatus` (≥ 90 % green,
≥ 70 % yellow) is combined with the days status, **worse wins** — a client
who "hits their goal" six days a week at 60 % of the real target is Red.

### 2.3 Hydration (new)

`HydrationTracking`: typical fluid per day, a target (studio default ½ oz per
lb of body weight; the coach can override, and can mark the target as
`medical` when a clinician set a limit — the reason is deliberately not
stored), days per week on target, and the main sources. Status is the worse
of ratio-to-target (≥ 90 % green, ≥ 60 % yellow) and the same days rule.

### 2.4 Pain map (new)

The Pain & Mobility statements stay as the subjective read. `PainPoint[]`
adds the specifics: body region (17 regions, grouped for the picker),
side, joint / muscle / nerve, severity 0–10, frequency, since when, which
machines aggravate it, and **links to journal entries** — `incident`
entries and `life / Injury` entries written pre-, mid- or post-session.
The form pulls the client's open incidents and injuries from the journal
and offers them as one-tap links. Points are matched to last time by
region + side so the dashboard shows "knee (L): 7, up 3 since June" and
which points resolved.

### 2.5 Stress anchors (new)

`StressAnchor[]`: a category picked for a 40–95 client base (caring for a
spouse or parent, a family member's health, own health, retirement
transition, grief, loneliness, travel…), the stressor in the client's own
words, intensity 0–10, **training impact** (none → could stop training) and
what the coach agreed to do about it. A `high` training impact raises a
watch flag. Stress anchors are **off the client's printed copy by default**
(`clientCopy.includeStressAnchors`) — they are coaching context.

### 2.6 Flags

Two severities. `"red"` is reserved for the three the document names.
`"watch"` covers the enhancements: any other category Red, overall Red,
hydration Red, pain ≥ 7 or up ≥ 2, a high-impact stressor, and a category
that dropped 25 % (3 of 12) since last time.

On finalize the report writes `ClientSubjectiveSnapshot` to the client
document (`client.subjectiveSnapshot`) so the hub schedule and client list
can show the flag without opening the report; `client-alerts.ts` reads it.

---

## 3. Data shape (Firestore)

```
progressReports/{id}
  …existing report fields…
  subjective: SubjectiveAssessment
    scaleVersion: 2
    completedAt: "2026-09-04"
    enteredBy: "coach" | "client"
    answers: { [statementId]: { value: 0–10 | null, note?: string } }
    categoryNotes: { [categoryKey]: string }
    protein: ProteinCompliance
    hydration: HydrationTracking
    painMap: PainPoint[]
    stressAnchors: StressAnchor[]
    overallStressLevel: 0–10 | null
    clientCopy: { includeCategoryScores, includeProteinHydration, includePainMap, includeStressAnchors }
    coachSummary?: string
    summary?: SubjectiveSummary        ← computed at save; a cache, recomputed on render

clients/{id}
  subjectiveSnapshot?: ClientSubjectiveSnapshot   ← written on finalize
```

"Previous assessment" is the most recent *finalized* report for the same
client that carries a `subjective` block — found with the existing
`clientId + createdAt desc` query and filtered in memory, so no new index.

---

## 4. Files

| File | Job |
| --- | --- |
| `types.ts` | The schema above. Input types vs computed types are separated. |
| `questions.ts` | Every string and number from the document, plus enhancement labels. |
| `scoring.ts` | Pure functions. `summarize()` is the entry point. |
| `scoring.test.ts` | Pins the thresholds. `npx vitest run src/features/subjective-report`. |
| `SubjectiveStep.tsx` | The whole form at once, plus the five cards the panel mounts one at a time (`CategoryCard`, `ProteinCard`, `HydrationCard`, `PainMapCard`, `StressCard`). |
| `SubjectiveDashboard.tsx` | Coach dashboard + the client-copy variant (read-only; the Progress Report shows it as the Pulse snapshot). |
| `ui.tsx` | The small controls. `ScaleInput` and `Range10` are the Dial (§6). |
| `subjective-report.css` | Scoped styles; light on `:root`, dark on `.dark`. Also the panel chrome (`.sra-*`), the quick-log (`.pq*`) and client mode (`.pcm*`). |
| `PulseQuickLog.tsx` | Update Pulse: one area, one Dial, Done — the floor entry point (with `PulseQuickLogDialog`). |
| `PulseQuickLog.tsx` | Update Pulse: one area, one Dial, back to the session (content + dialog). |
| `PulseClientMode.tsx` | Client mode: the sheet the client holds (§6.4). |
| `useCheckInDraft.ts` | The open draft: load, autosave, the change log, finalize, discard. |
| `../../components/journal/ClientCheckInPanel.tsx` | The Pulse panel in the record and the session slide-over. |

---

## 5. The living assessment (Assessment round, Sep 2026)

The owner's audit: trainers see a client ~20 minutes twice a week, so the
assessment is updated a little at a time and is never "done" — and "when a
category is updated, the previous score is overwritten, erasing the client's
evolutionary timeline." Everything in §1–§3 is unchanged: the question bank,
the scoring and every threshold. This round is presentation plus one optional
field.

### 5.1 Three pillars (`pillars.ts`)

| Pillar | Areas, in order |
| --- | --- |
| Recovery & Fuel | Sleep & Recovery · Nutrition & Protein · Protein compliance · Hydration |
| Physical & Functional | Energy & Daily Function · Strength & Physical Confidence · Pain & Mobility · Pain map |
| Psychological & Behavioral | Mental & Emotional Impact · Consistency & Habits · Lifestyle Alignment · Stress anchors |

`pillars.test.ts` pins that every category and every extra area is in
exactly one pillar. Each pillar header says how many of its areas were
updated in the last 90 days (`SUBJECTIVE_CADENCE_DAYS`) — and says "at
least" or "can't say" when the history is partial or failed to load.

### 5.2 Scale ends (`sectionScale`)

Every area shows what 0 and the top of its scale mean. No new wording was
invented:

| Area | Number | Low end / high end taken from |
| --- | --- | --- |
| The eight categories | 0–12 score | The first statement's `anchorLow` / `anchorHigh` (Sleep: "Under 5 hours most nights, broken sleep, no routine" / "7–9 hours most nights on a steady schedule") |
| Protein, hydration | days a week (0–7) | The document's Red 0–1 / Green 5–7 days rule |
| Pain map | worst active spot (0–10), lower is better | The pain editor's "0 none → 10 worst" and `PainPoint.severity`'s "worst imaginable" |
| Stress anchors | overall level (0–10), lower is better | The stress editor's "0 light → 10 crushing" |

Every area has bank wording today. `NEUTRAL_LOW` / `NEUTRAL_HIGH`
("Struggling" / "Thriving") exist only as the fallback for an area without it.

### 5.3 The history (`assessment-history.ts`)

```
progressReports/{id}.subjective
  …everything in §3…
  changeLog?: AssessmentChange[]      ← NEW, optional
    categoryId: category key | "protein" | "hydration" | "pain" | "stress"
    from: number | null               ← value before (see "living rule")
    to: number | null
    at: ISO instant
    byId?, byName?                    ← trainer doc id + name, display only
    note?: string                     ← ≤ 140 chars, typed at the time
    fromUnknown?: true                ← history unreadable then; row says "Updated"
```

- **In the draft**, every edit that moves an area's number appends a row.
  Autosave writes it with the rest of the block, so it can no longer be
  erased. Changes by the same person to the same area within 10 minutes fold
  into one row; a correction that returns to where it started is dropped
  unless it carries a note.
- **The living rule.** An area missing from an assessment was not asked, not
  cleared, so the last known value carries forward — per statement for a
  category (a draft that re-asks only sleep statement 1 is scored with the
  other two from the last save). That is also the `from` of a change in a
  fresh draft, which still starts empty.
- **Saved assessments** are compared in order (`deriveAssessmentDeltas`), so
  every assessment saved before `changeLog` existed still has a timeline. A
  first value is "new" only if the read reached the client's first report.
- **One log** (`buildHistoryLog`): draft rows, rows recorded inside saved
  assessments, and derived rows for whatever those recordings don't cover —
  a saved assessment with log rows for an area never also gets a derived row
  for it.
- `finalizedSubjective` builds the stored block for both the draft's
  finalize, so it cannot drop the log. (`saveQuickCheckIn`, the second caller this was written for, went with the retired QuickCheckInDialog - deleted in the beta-prep trim, Sep 17 2026.)
- `loadAssessmentHistory` is the same `clientId + createdAt desc` read as
  `loadPreviousCheckIn` with a 25-report window; the panel's hook uses it
  instead of that read (no extra query, no new index, no rule change). The
  newest saved assessment in it is "previous"; after a finalize the saved
  block joins the history in memory.

**Not stored anywhere new.** `progressReports` is readable by any signed-in
user, exactly like the category notes already there: keep change notes to
coaching context. InBody numbers never go in here.

### 5.4 Files added

| File | Job |
| --- | --- |
| `pillars.ts` (+ test) | The three pillars, area titles, scale ends. |
| `assessment-history.ts` (+ test) | Measures, the change log, deltas, the merged log, freshness. Pure. |
| `AssessmentHistoryLog.tsx` | The log on screen: newest six, "Show all", inline notes on draft rows. |
| `ClientCheckInPanel.render.test.tsx` | Mounts the panel (null client → client, pillars, log, a logged change with a note). |

---

## 6. Pulse (reporting round, Sep 2026)

The owner: "this is a lot of information to go through… the idea is that we
really fill this out over time with the client as we slowly learn
information about them… as long as trainers actively update this we can see
how the client has progressed in ways that are not in the studio." And: it
"could use a general spruce up to feel like the rest of our app".

Everything in §1–§5 still holds: the question bank, the scoring, every
threshold, the pillars, the change log. This round changed the name, the
control and the chrome — and dropped one thing.

### 6.1 The name

The living record is the **Pulse** everywhere a person reads it: the
record's section, the session slide-over, the archive rows, the renewal
brief. Code identifiers, file names and Firestore fields (`progressReports`,
`isCheckInOnly`, `subjectiveSnapshot`, `checkInSectionsReviewed`) keep their
names. The journal's focus "check-ins" are a different feature and keep
theirs. One sentence for the whole system: **Pulse sets the baseline, the
floor records drift from it, the Kaizen Deep Dive reads the drift against
the sets.**

### 6.2 The Dial

Every statement is answered on the Dial (`features/rating`) with the
document's five frequency words — Not at all · Rarely · Sometimes · Often ·
Nearly always — stored at the 0 / 3 / 5 / 8 / 10 anchors scale v2 already
had (`absoluteToTen` / `tenToAbsolute`). So nothing in `scoring.ts`, the
history or the change log moved; an old 0–10 answer lands on the nearest
word. The 0…10 tap grid (24 statements × 11 buttons = 264 targets on one
screen) is gone, and so is the "0 · anchor … anchor · 10" line under it; the
per-area scale ends (`ScaleEnds`, §5.2) still say what the low and high end
mean.

Pain severity, stress intensity and the overall stress level are the Dial
too, on **Worst · Severe · Moderate · Mild · None** — worst on the LEFT like
every Dial, with `absoluteToTen(v, INTENSITY_SCALE)` reversing it for the
stored 0–10 where 10 is worst. The dashboard prints those as words
(`intensityWord`) and a pain point's movement as "easing / same / worse".

Rules that follow: nowhere on the Pulse does a trainer see the 0–10 number
for a statement. The area's "10 / 12" score and its Green / Yellow / Red are
the document's own and stay. **Untouched is `null`** — "not asked" — never
0; the overall stress level no longer defaults to 0 on screen. A pain
point's `severity` and a stressor's `intensity` are required numbers on the
type, so a cleared Dial there is a no-op rather than a made-up value (a new
pain point still starts at 5 / "Moderate" — the type needs a number; TODO
for a later round if the owner wants it nullable).

### 6.3 One note per topic

Per-statement notes ("+ Add note" under every statement) are retired. One
note per topic — "In their words / worth remembering" — is the record. A
note already stored on a statement (`answers[id].note`) still renders,
read-only in italics under its statement, so nothing written is hidden; no
new ones can be added. `StatementAnswer.note` stays on the type for that
reason.

Kept, because the owner chose to keep them: protein (ideal weight, g/lb,
days, typical grams, the sources chips), hydration (typical, target, unit,
who set it, days, the sources chips), the pain map, the stress anchors and
the client-copy switches.

### 6.4 Client mode — "Hand to client"

`PulseClientMode`: a full-screen sheet (portal, like the quick-log dialog)
the client holds. Plain wording ("Judy, tap the word that fits."), one area
at a time in the pillars' order with Back / Next on a 48px bar, the area's
three statements on the frequency Dial with all five words showing, large
type (17px statements), and "Done — hand back" at the end. Nothing of the
coach's is on it: no notes, no flags, no scores, no history, no pain map, no
stress anchors.

Answers go through the same `useCheckInDraft.update` as the panel's, so they
autosave into the open draft and land in the change log. While the client
holds the iPad the draft is `enteredBy: "client"`; the panel's header says
"Judy's own answers", and the coach's next edit (the panel wraps its own
writes in `coachUpdate`) marks it `"coach"` again. `enteredBy` is per
assessment, not per answer — that is what the type has had since §3.

### 6.5 The panel's chrome

`ClientCheckInPanel` draws its header ("Pulse" · "How life is going — filled
a little at a time, never done."), the search box, the area rows, "Mark
reviewed" and the footer from the feature's tokens (`.sra-*` in
`subjective-report.css`) instead of raw Tailwind greys, so it reads in light
and dark inside the record spine. Every tappable is 44px or more; the Dial
is 48. "Save assessment" is now "Save this round".

### 6.6 Update Pulse (phase 2) and the full-form dialog

`PulseQuickLog` / `PulseQuickLogDialog` are what the floor opens (briefing,
note sheet, post-session): pick an area → its statements on the Dial → Done,
with "Open full Pulse" as the escape hatch for the lists. `QuickCheckInDialog`
(the whole form as a sheet, saved as one finalized round) stays for the
flows that still want it, retitled Pulse and running on the same rebuilt
`SubjectiveStep`.

### 6.7 Tests

`ClientCheckInPanel.render.test.tsx` mounts the panel and proves: the five
words on a statement and no 0…10 button anywhere; a tap logs "11 → 7" with
a note and autosaves `enteredBy: "coach"`; "Hand to client" opens the sheet,
a tap there autosaves `enteredBy: "client"`, Next walks the eight areas,
Done hands back, and the coach's next edit restores `"coach"`.
