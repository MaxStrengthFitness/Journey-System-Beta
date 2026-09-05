/**
 * Step 5 of the progress report: the 90-day check-in, entered by the coach
 * during the conversation.
 *
 * Layout: eight category cards (two columns in landscape), then protein and
 * hydration side by side, then the pain map and stress anchors full width,
 * then what goes on the client's copy. Every card carries a one-line
 * "what to fill in and why" for the trainer; those lines never print.
 *
 * State: this component owns nothing. `value` in, `onChange(next)` out, and
 * the parent (ClientProgressReportView) keeps it on `report.subjective`.
 */
import React, { useMemo, useState } from "react";
import type {
  BodyRegion,
  BodySide,
  HydrationSource,
  PainPoint,
  StressAnchor,
  StressCategory,
  SubjectiveAssessment,
  SubjectiveCategoryDef,
} from "./types";
import {
  BODY_REGION_GROUPS,
  BODY_REGION_LABELS,
  BODY_SIDE_LABELS,
  CENTERLINE_REGIONS,
  HYDRATION_SOURCE_LABELS,
  LEGACY_CATEGORY_MAX,
  LEGACY_OVERALL_MAX,
  PAIN_FREQUENCY_LABELS,
  PAIN_TYPE_LABELS,
  PROTEIN_G_PER_LB_HIGH,
  PROTEIN_G_PER_LB_LOW,
  PROTEIN_INSTRUCTOR_PROMPT,
  PROTEIN_QUESTION,
  PROTEIN_SOURCE_SUGGESTIONS,
  SCALE_MAX,
  STRESS_CATEGORY_LABELS,
  SUBJECTIVE_CATEGORIES,
  TRAINING_IMPACT_LABELS,
} from "./questions";
import {
  answeredCount,
  defaultHydrationTarget,
  newId,
  scoreCategory,
  scoreHydration,
  scoreOverall,
  scoreProtein,
  type PreviousAssessmentRef,
} from "./scoring";
import {
  Card,
  Chip,
  DaysPicker,
  Delta,
  RagPill,
  Range10,
  ScaleInput,
  Seg,
  Stepper,
  Switch,
  fmtDate,
  scaleWord,
} from "./ui";
import { useJournalSuggestions } from "./useJournalSuggestions";

export interface SubjectiveStepProps {
  value: SubjectiveAssessment;
  onChange: (next: SubjectiveAssessment) => void;
  previous: PreviousAssessmentRef | null;
  machines: { id?: string; name: string }[];
  clientId: string | undefined;
  clientFirstName: string;
  bodyWeightLbs: number | null;
}

export function SubjectiveStep({
  value,
  onChange,
  previous,
  machines,
  clientId,
  clientFirstName,
  bodyWeightLbs,
}: SubjectiveStepProps) {
  const patch = (p: Partial<SubjectiveAssessment>) => onChange({ ...value, ...p });

  const categoryScores = useMemo(
    () => SUBJECTIVE_CATEGORIES.map((c) => scoreCategory(c.key, value.answers, value.scaleVersion)),
    [value.answers, value.scaleVersion],
  );
  const overall = useMemo(() => scoreOverall(categoryScores), [categoryScores]);
  const answered = answeredCount(value);

  return (
    <div className="sr">
      {/* ---- header strip: where we are, and the live overall ---- */}
      <div className="sr-tiles">
        <div className="sr-tile">
          <span className="sr-tile__label">Answered</span>
          <span className="sr-tile__value">
            {answered}
            <small>/ 24</small>
          </span>
          <span className="sr-tile__sub">8 topics × 3 statements</span>
        </div>
        <div className={`sr-tile${overall.status ? ` sr-tile--${overall.status}` : ""}`}>
          <span className="sr-tile__label">Overall score</span>
          <span className="sr-tile__value">
            {overall.legacyScore ?? "—"}
            <small>/ {LEGACY_OVERALL_MAX}</small>
          </span>
          <span className="sr-tile__sub">
            {overall.isComplete ? "Green 72–96 · Yellow 48–71 · Red 0–47" : "Scores once all 24 are answered"}
          </span>
        </div>
        <div className="sr-tile">
          <span className="sr-tile__label">Compared with</span>
          <span className="sr-tile__value" style={{ fontSize: 18 }}>
            {previous ? fmtDate(previous.date) : "First check-in"}
          </span>
          <span className="sr-tile__sub">{previous ? "Changes shown per topic" : "No previous check-in on file"}</span>
        </div>
        <div className="sr-tile">
          <span className="sr-tile__label">Check-in date</span>
          <input
            type="date"
            className="sr-input"
            aria-label="Check-in date"
            value={value.completedAt ?? ""}
            onChange={(e) => patch({ completedAt: e.target.value || null })}
          />
        </div>
      </div>

      <p className="sr-card__help sr-no-print">
        Read each statement to {clientFirstName} and tap the number that fits. The words under the
        scale are what a 0 and a 10 look like for that statement — use them, not your own sense of
        “often”. Tap a number again to clear it. “Add note” keeps what they said, in their words.
      </p>

      {/* ---- the eight categories ---- */}
      <div className="sr-grid">
        {SUBJECTIVE_CATEGORIES.map((def, i) => (
          <CategoryCard
            key={def.key}
            def={def}
            value={value}
            onChange={onChange}
            score={categoryScores[i]}
            previousScore={
              previous ? scoreCategory(def.key, previous.assessment.answers, previous.assessment.scaleVersion) : null
            }
          />
        ))}
      </div>

      {/* ---- protein + hydration ---- */}
      <div className="sr-grid">
        <ProteinCard value={value} onChange={onChange} bodyWeightLbs={bodyWeightLbs} />
        <HydrationCard value={value} onChange={onChange} bodyWeightLbs={bodyWeightLbs} />
      </div>

      {/* ---- pain map ---- */}
      <PainMapCard value={value} onChange={onChange} previous={previous} machines={machines} clientId={clientId} />

      {/* ---- stress anchors ---- */}
      <StressCard value={value} onChange={onChange} clientFirstName={clientFirstName} />

      {/* ---- client copy ---- */}
      <Card
        title="What goes on the client's copy"
        help="The coach dashboard always shows everything. These switches only control the printed / emailed copy. Stress anchors are off by default — they are coaching context, and clients rarely want them on paper."
      >
        {(
          [
            ["includeCategoryScores", "Topic scores", "The eight Green / Yellow / Red tiles and the overall score"],
            ["includeProteinHydration", "Protein & hydration", "Targets and how often they are hit"],
            ["includePainMap", "Pain map", "The specific areas and how they are trending"],
            ["includeStressAnchors", "Stress anchors", "What is going on in their life right now"],
          ] as const
        ).map(([key, label, sub]) => (
          <div className="sr-toggle" key={key}>
            <div>
              <div className="sr-toggle__label">{label}</div>
              <div className="sr-toggle__sub">{sub}</div>
            </div>
            <Switch
              on={value.clientCopy[key]}
              ariaLabel={`Include ${label} on the client copy`}
              onChange={(on) => patch({ clientCopy: { ...value.clientCopy, [key]: on } })}
            />
          </div>
        ))}
        <div>
          <label className="sr-label" htmlFor="sr-coach-summary">
            Your summary of the check-in (prints on the client copy)
          </label>
          <textarea
            id="sr-coach-summary"
            className="sr-textarea"
            placeholder={`Two or three sentences ${clientFirstName} will read: what has clearly improved, and the one thing to work on next.`}
            value={value.coachSummary ?? ""}
            onChange={(e) => patch({ coachSummary: e.target.value })}
          />
        </div>
      </Card>
    </div>
  );
}

/* ====================================================================== *
 * Category card
 * ====================================================================== */

export function CategoryCard({
  def,
  value,
  onChange,
  score,
  previousScore,
}: {
  key?: string;
  def: SubjectiveCategoryDef;
  value: SubjectiveAssessment;
  onChange: (next: SubjectiveAssessment) => void;
  score: ReturnType<typeof scoreCategory>;
  previousScore: ReturnType<typeof scoreCategory> | null;
}) {
  const [notesOpen, setNotesOpen] = useState<Record<string, boolean>>({});

  const setAnswer = (id: string, v: number | null) =>
    onChange({
      ...value,
      answers: { ...value.answers, [id]: { ...(value.answers[id] ?? {}), value: v } },
    });
  const setNote = (id: string, note: string) =>
    onChange({
      ...value,
      answers: { ...value.answers, [id]: { value: value.answers[id]?.value ?? null, note } },
    });

  const pct = score.percent === null ? 0 : Math.round(score.percent * 100);
  const prevLegacy = previousScore?.isComplete ? previousScore.legacyScore : null;
  const change = score.legacyScore !== null && prevLegacy !== null ? score.legacyScore - prevLegacy : null;

  return (
    <Card
      title={def.title}
      prompt={def.coachPrompt}
      status={score.status}
      right={<RagPill status={score.status} label={score.isComplete ? undefined : `${score.answeredCount}/3`} />}
    >
      <div className="sr-score" aria-live="polite">
        <div className="sr-score__bar">
          <div
            className={`sr-score__fill${score.status ? ` sr-score__fill--${score.status}` : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="sr-score__num">
          {score.legacyScore ?? "—"}
          <small> / {LEGACY_CATEGORY_MAX}</small>
        </span>
        {prevLegacy !== null && (
          <span className="sr-score__prev">
            was {prevLegacy} · <Delta value={change} />
          </span>
        )}
      </div>

      {def.statements.map((st) => {
        const a = value.answers[st.id];
        const v = a?.value ?? null;
        const open = notesOpen[st.id] || !!a?.note;
        return (
          <div className="sr-statement" key={st.id}>
            <div className="sr-statement__row">
              <p className="sr-statement__text">{st.text}</p>
              <span className="sr-statement__value">
                {v === null ? "—" : <><b>{v}</b> · {scaleWord(v)}</>}
              </span>
            </div>
            <ScaleInput
              value={v}
              onChange={(n) => setAnswer(st.id, n)}
              anchorLow={st.anchorLow}
              anchorHigh={st.anchorHigh}
              ariaLabel={st.text}
            />
            {open ? (
              <input
                className="sr-input"
                placeholder="What they said, in their words…"
                value={a?.note ?? ""}
                onChange={(e) => setNote(st.id, e.target.value)}
              />
            ) : (
              <button
                type="button"
                className="sr-note-toggle sr-no-print"
                onClick={() => setNotesOpen((s) => ({ ...s, [st.id]: true }))}
              >
                + Add note
              </button>
            )}
          </div>
        );
      })}

      <div>
        <label className="sr-label" htmlFor={`sr-cat-note-${def.key}`}>
          Coach note for this topic
        </label>
        <textarea
          id={`sr-cat-note-${def.key}`}
          className="sr-textarea"
          style={{ minHeight: 48 }}
          placeholder="Anything worth remembering next time…"
          value={value.categoryNotes[def.key] ?? ""}
          onChange={(e) =>
            onChange({ ...value, categoryNotes: { ...value.categoryNotes, [def.key]: e.target.value } })
          }
        />
      </div>
    </Card>
  );
}

/* ====================================================================== *
 * Protein
 * ====================================================================== */

export function ProteinCard({
  value,
  onChange,
  bodyWeightLbs,
}: {
  value: SubjectiveAssessment;
  onChange: (next: SubjectiveAssessment) => void;
  bodyWeightLbs: number | null;
}) {
  const p = value.protein;
  const set = (patch: Partial<typeof p>) => onChange({ ...value, protein: { ...p, ...patch } });
  const s = scoreProtein(p);
  const [customSource, setCustomSource] = useState("");

  return (
    <Card
      title="Protein compliance"
      prompt={PROTEIN_QUESTION}
      status={s.status}
      help={`${PROTEIN_INSTRUCTOR_PROMPT} Put in the weight you'd like them to be, not today's weight; the target updates as you go. Days per week is the official score. If they know roughly how many grams they actually eat, add it — it can pull a "6 days" answer down to Red when the number is far off.`}
      right={<RagPill status={s.status} />}
    >
      <div className="sr-field-row">
        <div className="sr-field">
          <span className="sr-label">Ideal body weight</span>
          <Stepper
            value={p.idealBodyWeightLbs}
            onChange={(v) => set({ idealBodyWeightLbs: v })}
            step={5}
            min={60}
            max={500}
            unit="lb"
            ariaLabel="Ideal body weight in pounds"
            placeholder={bodyWeightLbs ? String(bodyWeightLbs) : "lbs"}
          />
          {bodyWeightLbs && p.idealBodyWeightLbs !== bodyWeightLbs && (
            <p className="sr-hint">On file: {bodyWeightLbs} lb</p>
          )}
        </div>
        <div className="sr-field" style={{ flex: 1, minWidth: 200 }}>
          <span className="sr-label">
            Grams per lb · {p.gramsPerLb.toFixed(2)} (range {PROTEIN_G_PER_LB_LOW}–{PROTEIN_G_PER_LB_HIGH})
          </span>
          <input
            type="range"
            min={PROTEIN_G_PER_LB_LOW}
            max={PROTEIN_G_PER_LB_HIGH}
            step={0.05}
            value={p.gramsPerLb}
            aria-label="Grams of protein per pound of ideal body weight"
            style={{ width: "100%", height: 44, accentColor: "var(--sr-navy)" }}
            onChange={(e) => set({ gramsPerLb: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      <div className="sr-tiles" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <div className="sr-tile">
          <span className="sr-tile__label">Daily target</span>
          <span className="sr-tile__value">
            {s.targetG ?? "—"}
            <small>g</small>
          </span>
          <span className="sr-tile__sub">
            {s.targetLowG !== null ? `range ${s.targetLowG}–${s.targetHighG} g` : "needs a body weight"}
          </span>
        </div>
        <div className={`sr-tile${s.daysStatus ? ` sr-tile--${s.daysStatus}` : ""}`}>
          <span className="sr-tile__label">Days on target</span>
          <span className="sr-tile__value">
            {p.daysPerWeekOnTarget ?? "—"}
            <small>/ 7</small>
          </span>
          <span className="sr-tile__sub">the official score</span>
        </div>
        <div className={`sr-tile${s.intakeStatus ? ` sr-tile--${s.intakeStatus}` : ""}`}>
          <span className="sr-tile__label">Typical intake</span>
          <span className="sr-tile__value">
            {s.intakeRatio !== null ? Math.round(s.intakeRatio * 100) : "—"}
            <small>% of target</small>
          </span>
          <span className="sr-tile__sub">optional, if they know</span>
        </div>
      </div>

      <div>
        <span className="sr-label">{PROTEIN_QUESTION}</span>
        <DaysPicker
          value={p.daysPerWeekOnTarget}
          onChange={(v) => set({ daysPerWeekOnTarget: v })}
          ariaLabel="Days per week hitting the protein goal"
        />
      </div>

      <div className="sr-field-row">
        <div className="sr-field">
          <span className="sr-label">Typical grams on a normal day (optional)</span>
          <Stepper
            value={p.typicalGramsPerDay}
            onChange={(v) => set({ typicalGramsPerDay: v })}
            step={10}
            max={400}
            unit="g"
            ariaLabel="Typical protein grams per day"
            placeholder="—"
          />
        </div>
      </div>

      <div>
        <span className="sr-label">Where it mostly comes from</span>
        <div className="sr-chips">
          {[...PROTEIN_SOURCE_SUGGESTIONS, ...p.primarySources.filter((x) => !PROTEIN_SOURCE_SUGGESTIONS.includes(x))].map(
            (src) => (
              <Chip
                key={src}
                small
                on={p.primarySources.includes(src)}
                onClick={() =>
                  set({
                    primarySources: p.primarySources.includes(src)
                      ? p.primarySources.filter((x) => x !== src)
                      : [...p.primarySources, src],
                  })
                }
              >
                {src}
              </Chip>
            ),
          )}
          <input
            className="sr-input"
            style={{ maxWidth: 180, minHeight: 30, padding: "4px 10px" }}
            placeholder="Other… (Enter)"
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customSource.trim()) {
                set({ primarySources: [...p.primarySources, customSource.trim()] });
                setCustomSource("");
              }
            }}
          />
        </div>
      </div>

      <textarea
        className="sr-textarea"
        style={{ minHeight: 48 }}
        placeholder="Coach note on protein…"
        value={p.coachNote ?? ""}
        onChange={(e) => set({ coachNote: e.target.value })}
      />
    </Card>
  );
}

/* ====================================================================== *
 * Hydration
 * ====================================================================== */

export function HydrationCard({
  value,
  onChange,
  bodyWeightLbs,
}: {
  value: SubjectiveAssessment;
  onChange: (next: SubjectiveAssessment) => void;
  bodyWeightLbs: number | null;
}) {
  const h = value.hydration;
  const set = (patch: Partial<typeof h>) => onChange({ ...value, hydration: { ...h, ...patch } });
  const s = scoreHydration(h);
  const studioDefault = defaultHydrationTarget(bodyWeightLbs, h.unit);

  return (
    <Card
      title="Hydration"
      prompt="On a normal day, how much do you drink — and how much of that is water?"
      status={s.status}
      help="The target starts at half their body weight in ounces a day (studio default). If their doctor has them on a fluid limit, type that number and mark it Medical — the limit becomes the target and the reason is deliberately not stored here."
      right={<RagPill status={s.status} />}
    >
      <div className="sr-field-row">
        <div className="sr-field">
          <span className="sr-label">Typical per day</span>
          <Stepper
            value={h.typicalPerDay}
            onChange={(v) => set({ typicalPerDay: v })}
            step={h.unit === "oz" ? 8 : 250}
            max={h.unit === "oz" ? 300 : 9000}
            unit={h.unit}
            ariaLabel="Typical fluid per day"
            placeholder="—"
          />
        </div>
        <div className="sr-field">
          <span className="sr-label">Target</span>
          <Stepper
            value={h.targetPerDay}
            onChange={(v) => set({ targetPerDay: v, targetSource: h.targetSource === "studio_default" ? "coach" : h.targetSource })}
            step={h.unit === "oz" ? 8 : 250}
            max={h.unit === "oz" ? 300 : 9000}
            unit={h.unit}
            ariaLabel="Daily fluid target"
            placeholder="—"
          />
        </div>
        <div className="sr-field">
          <span className="sr-label">Unit</span>
          <Seg
            value={h.unit}
            ariaLabel="Fluid unit"
            options={[
              { value: "oz", label: "oz" },
              { value: "ml", label: "ml" },
            ]}
            onChange={(unit) => {
              const f = unit === "ml" ? 29.5735 : 1 / 29.5735;
              set({
                unit,
                typicalPerDay: h.typicalPerDay === null ? null : Math.round(h.typicalPerDay * f),
                targetPerDay: h.targetPerDay === null ? null : Math.round(h.targetPerDay * f),
              });
            }}
          />
        </div>
      </div>

      <div className="sr-field-row">
        <div className="sr-field">
          <span className="sr-label">Target set by</span>
          <Seg
            value={h.targetSource}
            ariaLabel="Where the hydration target comes from"
            options={[
              { value: "studio_default", label: "Studio default" },
              { value: "coach", label: "Coach" },
              { value: "medical", label: "Medical limit" },
            ]}
            onChange={(targetSource) =>
              set(
                targetSource === "studio_default"
                  ? { targetSource, targetPerDay: studioDefault }
                  : { targetSource },
              )
            }
          />
        </div>
        <div className={`sr-tile${s.ratioStatus ? ` sr-tile--${s.ratioStatus}` : ""}`} style={{ minWidth: 150 }}>
          <span className="sr-tile__label">Of target</span>
          <span className="sr-tile__value">
            {s.ratio !== null ? Math.round(s.ratio * 100) : "—"}
            <small>%</small>
          </span>
          <span className="sr-tile__sub">≥ 90 green · ≥ 60 yellow</span>
        </div>
      </div>

      <div>
        <span className="sr-label">Days per week they reach the target</span>
        <DaysPicker
          value={h.daysPerWeekOnTarget}
          onChange={(v) => set({ daysPerWeekOnTarget: v })}
          ariaLabel="Days per week reaching the fluid target"
        />
      </div>

      <div>
        <span className="sr-label">What they mostly drink</span>
        <div className="sr-chips">
          {(Object.keys(HYDRATION_SOURCE_LABELS) as HydrationSource[]).map((src) => (
            <Chip
              key={src}
              small
              on={h.primarySources.includes(src)}
              onClick={() =>
                set({
                  primarySources: h.primarySources.includes(src)
                    ? h.primarySources.filter((x) => x !== src)
                    : [...h.primarySources, src],
                })
              }
            >
              {HYDRATION_SOURCE_LABELS[src]}
            </Chip>
          ))}
        </div>
      </div>

      <textarea
        className="sr-textarea"
        style={{ minHeight: 48 }}
        placeholder="Coach note on hydration…"
        value={h.coachNote ?? ""}
        onChange={(e) => set({ coachNote: e.target.value })}
      />
    </Card>
  );
}

/* ====================================================================== *
 * Pain map
 * ====================================================================== */

const painKey = (region: BodyRegion, side: BodySide) => `${region}:${side}`;

export function PainMapCard({
  value,
  onChange,
  previous,
  machines,
  clientId,
}: {
  value: SubjectiveAssessment;
  onChange: (next: SubjectiveAssessment) => void;
  previous: PreviousAssessmentRef | null;
  machines: { id?: string; name: string }[];
  clientId: string | undefined;
}) {
  const points = value.painMap;
  const setPoints = (painMap: PainPoint[]) => onChange({ ...value, painMap });
  const suggestions = useJournalSuggestions(clientId);

  const byKey = useMemo(() => new Map(points.map((p) => [painKey(p.region, p.side), p])), [points]);
  const prevByKey = useMemo(
    () =>
      new Map(
        (previous?.assessment.painMap ?? [])
          .filter((p) => p.status !== "resolved")
          .map((p) => [painKey(p.region, p.side), p]),
      ),
    [previous],
  );

  const toggle = (region: BodyRegion, side: BodySide) => {
    const k = painKey(region, side);
    const existing = byKey.get(k);
    if (existing) {
      setPoints(points.filter((p) => p.id !== existing.id));
      return;
    }
    const prev = prevByKey.get(k);
    setPoints([
      ...points,
      {
        id: newId("pain"),
        region,
        side,
        type: prev?.type ?? "unsure",
        severity: prev?.severity ?? 5,
        frequency: prev?.frequency ?? "during_training",
        since: prev?.since ?? null,
        aggravatingMachineIds: prev?.aggravatingMachineIds ?? [],
        linkedJournalEntryIds: prev?.linkedJournalEntryIds ?? [],
        status: "active",
        note: "",
      },
    ]);
  };

  const carryForward = () => {
    const missing = [...prevByKey.values()].filter((p) => !byKey.has(painKey(p.region, p.side)));
    setPoints([...points, ...missing.map((p) => ({ ...p, id: newId("pain"), note: "" }))]);
  };
  const carryable = [...prevByKey.values()].filter((p) => !byKey.has(painKey(p.region, p.side))).length;

  return (
    <Card
      title="Pain map"
      prompt="Show me where. Is it the joint itself, or the muscle around it?"
      wide
      help="Tap a body area (and a side) for every spot that bothers them, then rate each one. Link it to the incident or injury note it came from so the session notes and this check-in describe the same event. Last time's spots can be carried forward and re-rated."
      right={
        carryable > 0 ? (
          <button type="button" className="sr-btn sr-btn--sm sr-no-print" onClick={carryForward}>
            Carry forward {carryable} from last time
          </button>
        ) : undefined
      }
    >
      <div className="sr-body">
        {BODY_REGION_GROUPS.map((g) => (
          <div className="sr-body__group" key={g.title}>
            <h5>{g.title}</h5>
            {g.regions.map((region) => {
              const sides: BodySide[] = CENTERLINE_REGIONS.includes(region)
                ? ["center"]
                : ["left", "right", "both"];
              const has = sides.some((s) => byKey.has(painKey(region, s)));
              return (
                <div key={region} className={`sr-body__region${has ? " sr-body__region--has" : ""}`}>
                  <span>{BODY_REGION_LABELS[region]}</span>
                  <div className="sr-body__sides">
                    {sides.map((side) => {
                      const on = byKey.has(painKey(region, side));
                      return (
                        <button
                          key={side}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${BODY_REGION_LABELS[region]} ${BODY_SIDE_LABELS[side]}`}
                          className={`sr-body__side${on ? " sr-body__side--on" : ""}`}
                          onClick={() => toggle(region, side)}
                        >
                          {side === "center" ? "+" : side === "both" ? "L+R" : side === "left" ? "L" : "R"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {points.length === 0 ? (
        <div className="sr-empty">No pain points recorded — good news, if it's true.</div>
      ) : (
        points.map((p) => (
          <PainPointEditor
            key={p.id}
            point={p}
            previous={prevByKey.get(painKey(p.region, p.side)) ?? null}
            machines={machines}
            suggestions={suggestions}
            onChange={(next) => setPoints(points.map((x) => (x.id === p.id ? next : x)))}
            onRemove={() => setPoints(points.filter((x) => x.id !== p.id))}
          />
        ))
      )}
    </Card>
  );
}

function PainPointEditor({
  point,
  previous,
  machines,
  suggestions,
  onChange,
  onRemove,
}: {
  key?: string;
  point: PainPoint;
  previous: PainPoint | null;
  machines: { id?: string; name: string }[];
  suggestions: ReturnType<typeof useJournalSuggestions>;
  onChange: (p: PainPoint) => void;
  onRemove: () => void;
}) {
  const set = (patch: Partial<PainPoint>) => onChange({ ...point, ...patch });
  const linked = new Set(point.linkedJournalEntryIds);
  // Offer open incidents / injuries first; anything already linked stays visible.
  const offered = suggestions.filter((s) => s.isOpen || linked.has(s.id)).slice(0, 6);

  return (
    <div className={`sr-pain sr-pain--${point.status}`}>
      <div className="sr-pain__head">
        <h4 className="sr-pain__title">
          {BODY_REGION_LABELS[point.region]}
          <small>{BODY_SIDE_LABELS[point.side]}</small>
          {previous && (
            <small>
              · was {previous.severity}/10 <Delta value={point.severity - previous.severity} />
            </small>
          )}
        </h4>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Seg
            value={point.status}
            ariaLabel="Pain status"
            options={[
              { value: "active", label: "Active" },
              { value: "improving", label: "Improving" },
              { value: "resolved", label: "Resolved" },
            ]}
            onChange={(status) => set({ status })}
          />
          <button type="button" className="sr-btn sr-btn--sm sr-btn--ghost sr-no-print" onClick={onRemove} aria-label="Remove pain point">
            ✕
          </button>
        </div>
      </div>

      <div className="sr-field-row">
        <div className="sr-field" style={{ flex: 1, minWidth: 220 }}>
          <span className="sr-label">Severity (0 none → 10 worst)</span>
          <Range10 value={point.severity} onChange={(severity) => set({ severity })} ariaLabel="Pain severity" />
        </div>
        <div className="sr-field">
          <span className="sr-label">Type</span>
          <Seg
            value={point.type}
            ariaLabel="Pain type"
            options={(Object.keys(PAIN_TYPE_LABELS) as (keyof typeof PAIN_TYPE_LABELS)[]).map((k) => ({
              value: k,
              label: PAIN_TYPE_LABELS[k],
            }))}
            onChange={(type) => set({ type })}
          />
        </div>
      </div>

      <div className="sr-field-row">
        <div className="sr-field">
          <span className="sr-label">When</span>
          <Seg
            value={point.frequency}
            ariaLabel="Pain frequency"
            options={(Object.keys(PAIN_FREQUENCY_LABELS) as (keyof typeof PAIN_FREQUENCY_LABELS)[]).map((k) => ({
              value: k,
              label: PAIN_FREQUENCY_LABELS[k],
            }))}
            onChange={(frequency) => set({ frequency })}
          />
        </div>
        <div className="sr-field" style={{ minWidth: 180 }}>
          <span className="sr-label">Since</span>
          <input
            className="sr-input"
            placeholder="e.g. the fall in March"
            value={point.since ?? ""}
            onChange={(e) => set({ since: e.target.value || null })}
          />
        </div>
      </div>

      <div>
        <span className="sr-label">Machines that bring it on</span>
        <div className="sr-chips">
          {machines.filter((m) => m.id).map((m) => (
            <Chip
              key={m.id}
              small
              hero
              on={point.aggravatingMachineIds.includes(m.id!)}
              onClick={() =>
                set({
                  aggravatingMachineIds: point.aggravatingMachineIds.includes(m.id!)
                    ? point.aggravatingMachineIds.filter((x) => x !== m.id)
                    : [...point.aggravatingMachineIds, m.id!],
                })
              }
            >
              {m.name}
            </Chip>
          ))}
        </div>
      </div>

      {offered.length > 0 && (
        <div className="sr-suggest">
          <span className="sr-label" style={{ marginBottom: 0 }}>
            Link to a session note
          </span>
          {offered.map((s) => {
            const on = linked.has(s.id);
            return (
              <div className="sr-suggest__row" key={s.id}>
                <time>{fmtDate(s.date)}</time>
                <span className="sr-suggest__body">
                  <b>{s.kindLabel}:</b> {s.body}
                </span>
                <button
                  type="button"
                  className={`sr-btn sr-btn--sm${on ? " sr-btn--primary" : ""}`}
                  onClick={() =>
                    set({
                      linkedJournalEntryIds: on
                        ? point.linkedJournalEntryIds.filter((x) => x !== s.id)
                        : [...point.linkedJournalEntryIds, s.id],
                    })
                  }
                >
                  {on ? "Linked" : "Link"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <input
        className="sr-input"
        placeholder="Note — what makes it better or worse, what they've tried…"
        value={point.note ?? ""}
        onChange={(e) => set({ note: e.target.value })}
      />
    </div>
  );
}

/* ====================================================================== *
 * Stress anchors
 * ====================================================================== */

export function StressCard({
  value,
  onChange,
  clientFirstName,
}: {
  value: SubjectiveAssessment;
  onChange: (next: SubjectiveAssessment) => void;
  clientFirstName: string;
}) {
  const anchors = value.stressAnchors;
  const setAnchors = (stressAnchors: StressAnchor[]) => onChange({ ...value, stressAnchors });

  const add = (category: StressCategory) =>
    setAnchors([
      ...anchors,
      { id: newId("stress"), category, label: "", intensity: 5, trainingImpact: "low", coachResponse: "", status: "active" },
    ]);

  return (
    <Card
      title="Stress anchors"
      prompt="What's taking the most out of you right now, outside the gym?"
      wide
      help={`For most of our clients the thing that stops training isn't motivation — it's a spouse's surgery, a parent to care for, a move, a loss. Tap what applies, write it in ${clientFirstName}'s words, and rate how much it threatens training. "Could stop training" raises a flag on the dashboard so nobody is surprised in six weeks.`}
    >
      <div className="sr-field-row">
        <div className="sr-field" style={{ flex: 1, minWidth: 240 }}>
          <span className="sr-label">Overall — how heavy does life feel right now? (0 light → 10 crushing)</span>
          <Range10
            value={value.overallStressLevel ?? 0}
            onChange={(overallStressLevel) => onChange({ ...value, overallStressLevel })}
            ariaLabel="Overall stress level"
          />
        </div>
      </div>

      <div>
        <span className="sr-label">Add a stressor</span>
        <div className="sr-chips">
          {(Object.keys(STRESS_CATEGORY_LABELS) as StressCategory[]).map((c) => (
            <Chip key={c} small on={false} onClick={() => add(c)}>
              + {STRESS_CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
      </div>

      {anchors.length === 0 ? (
        <div className="sr-empty">Nothing recorded. That's fine — not every check-in has one.</div>
      ) : (
        anchors.map((a) => {
          const set = (patch: Partial<StressAnchor>) =>
            setAnchors(anchors.map((x) => (x.id === a.id ? { ...x, ...patch } : x)));
          const cls =
            a.status === "resolved" ? "sr-stress--resolved" : a.trainingImpact === "high" ? "sr-stress--high" : "";
          return (
            <div className={`sr-stress ${cls}`} key={a.id}>
              <div className="sr-pain__head">
                <h4 className="sr-pain__title">{STRESS_CATEGORY_LABELS[a.category]}</h4>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Seg
                    value={a.status}
                    ariaLabel="Stressor status"
                    options={[
                      { value: "active", label: "Active" },
                      { value: "easing", label: "Easing" },
                      { value: "resolved", label: "Resolved" },
                    ]}
                    onChange={(status) => set({ status })}
                  />
                  <button
                    type="button"
                    className="sr-btn sr-btn--sm sr-btn--ghost sr-no-print"
                    onClick={() => setAnchors(anchors.filter((x) => x.id !== a.id))}
                    aria-label="Remove stressor"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <input
                className="sr-input"
                placeholder={`In ${clientFirstName}'s words…`}
                value={a.label}
                onChange={(e) => set({ label: e.target.value })}
              />
              <div className="sr-field-row">
                <div className="sr-field" style={{ flex: 1, minWidth: 200 }}>
                  <span className="sr-label">How intense</span>
                  <Range10 value={a.intensity} onChange={(intensity) => set({ intensity })} ariaLabel="Stress intensity" />
                </div>
                <div className="sr-field">
                  <span className="sr-label">Effect on training</span>
                  <Seg
                    value={a.trainingImpact}
                    ariaLabel="Effect on training"
                    options={(Object.keys(TRAINING_IMPACT_LABELS) as (keyof typeof TRAINING_IMPACT_LABELS)[]).map(
                      (k) => ({ value: k, label: TRAINING_IMPACT_LABELS[k] }),
                    )}
                    onChange={(trainingImpact) => set({ trainingImpact })}
                  />
                </div>
              </div>
              <input
                className="sr-input"
                placeholder="What we agreed to do about it — e.g. move to Tuesday mornings while Dad is in rehab"
                value={a.coachResponse ?? ""}
                onChange={(e) => set({ coachResponse: e.target.value })}
              />
            </div>
          );
        })
      )}
    </Card>
  );
}
