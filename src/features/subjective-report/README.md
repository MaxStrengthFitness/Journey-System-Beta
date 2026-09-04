# 90-Day Subjective Progress Report

Round: Subjective Report, Sep 2026. Lives inside the Progress Report
(`progressReports/{id}.subjective`) and the trainer's editing flow for it.

This folder is the data model, the question bank and the scoring. The form
(`SubjectiveStep`) and the coach dashboard (`SubjectiveDashboard`) sit
beside them; `ClientProgressReportView` mounts both.

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
| `SubjectiveStep.tsx` | The coach-entered form (step 5 of the report). |
| `SubjectiveDashboard.tsx` | Coach dashboard + the client-copy variant. |
| `subjective-report.css` | Scoped styles; light on `:root`, dark on `.dark`. |
