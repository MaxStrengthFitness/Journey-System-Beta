/**
 * THE ASSESSMENT HISTORY (Assessment round, Sep 2026). Pure — no Firestore.
 *
 * The owner's audit named the flaw: "When a category is updated, the previous
 * score is overwritten, erasing the client's evolutionary timeline." Two
 * things were true at once. Every SAVED assessment is its own
 * `progressReports` document, so the history between saved assessments
 * existed but was never shown. And inside the open draft, autosave replaces
 * the whole `subjective` block, so a score changed on Monday and again on
 * Thursday kept only Thursday's value.
 *
 * This file fixes both without a new collection:
 *
 *  1. `recordChanges` appends to `subjective.changeLog` whenever an area's
 *     number moves in the draft. Autosave writes the log with the rest of the
 *     block, so the trail is never erased. Quick corrections by the same
 *     person inside ten minutes fold into one row ("tapped 5, meant 7" is
 *     not history).
 *  2. `deriveAssessmentDeltas` compares consecutive saved assessments, so
 *     every assessment saved before the log existed still has a timeline.
 *  3. `buildHistoryLog` merges the two, newest first. When a saved
 *     assessment carries log rows for an area, those rows ARE that change
 *     (with their times and notes), so the derived row for the same area in
 *     the same assessment is dropped — nothing is counted twice.
 *
 * AN AREA'S NUMBER (`measureSection`). One number per area so a change reads
 * as "was → now" and can later be lined up against strength data:
 *   - the eight categories: the 0–12 score the printed report uses;
 *   - protein, hydration: days a week on target (0–7), the document's measure;
 *   - pain: the worst active spot (0–10); 0 once the coach has reviewed pain
 *     and nothing is active; unknown before anyone has asked;
 *   - stress: the overall "how heavy does life feel" level (0–10).
 * `null` means "not assessed", never zero.
 *
 * THE LIVING RULE. The assessment is updated a piece at a time, so an area
 * missing from a saved assessment was not "cleared" — it just was not asked
 * that time. The last known value carries forward, both when deriving deltas
 * and as the "from" of a change in a fresh draft (drafts start empty).
 */
import type { PreviousAssessmentRef } from "./scoring";
import { clamp, convertLegacyAnswer, scoreCategory } from "./scoring";
import { CATEGORY_BY_KEY, SCALE_MAX, SUBJECTIVE_CADENCE_DAYS } from "./questions";
import type {
  AssessmentChange,
  StatementAnswer,
  SubjectiveAssessment,
  SubjectiveCategoryKey,
  SubjectiveEnteredBy,
  SubjectiveSummary,
} from "./types";
import {
  ALL_ASSESSMENT_SECTION_IDS,
  ASSESSMENT_PILLARS,
  pillarOf,
  sectionScale,
  type AssessmentPillar,
} from "./pillars";

export const DAY_MS = 86_400_000;
/** An area not touched for this long gets the quiet "90+ days" marker. */
export const STALE_AFTER_DAYS = SUBJECTIVE_CADENCE_DAYS;
/** Changes by the same person to the same area inside this window fold into one row. */
export const CHANGE_MERGE_WINDOW_MS = 10 * 60_000;
/** How many progressReports the history reads. Same query shape as loadPreviousCheckIn. */
export const ASSESSMENT_HISTORY_LIMIT = 25;
/** The log shows this many rows until "Show all". */
export const HISTORY_COLLAPSED_ROWS = 6;
/** One line of context, not an essay. */
export const CHANGE_NOTE_MAX = 140;

/* ------------------------------------------------------------------ *
 * An area's number
 * ------------------------------------------------------------------ */

/**
 * What is known about the client before the assessment in hand: each
 * statement's last answer (0–10) and each extra area's last number. A draft
 * that answers one sleep statement is scored with the other two carried
 * forward, so "Sleep 6 → 8" compares like with like instead of one statement
 * against three.
 */
export interface LivingBaseline {
  /** Statement id → last answer on the 0–10 scale (scale-1 answers converted). */
  answers: Readonly<Record<string, number>>;
  /** Extra area id → last known number. */
  extras: Readonly<Record<string, number>>;
}

export const EMPTY_BASELINE: LivingBaseline = Object.freeze({
  answers: Object.freeze({}),
  extras: Object.freeze({}),
});

const isCategory = (id: string): id is SubjectiveCategoryKey => id in CATEGORY_BY_KEY;

/** This assessment's own answer to one statement, on the 0–10 scale. */
function ownAnswer(a: SubjectiveAssessment, statementId: string): number | null {
  const raw = a.answers?.[statementId]?.value;
  if (raw === null || raw === undefined || !Number.isFinite(raw)) return null;
  return a.scaleVersion === 1 ? convertLegacyAnswer(raw) : clamp(raw, 0, SCALE_MAX);
}

/** This assessment's own number for an extra area (no carrying forward). */
function ownExtra(id: string, a: SubjectiveAssessment, reviewed: readonly string[]): number | null {
  switch (id) {
    case "protein":
      return a.protein?.daysPerWeekOnTarget ?? null;
    case "hydration":
      return a.hydration?.daysPerWeekOnTarget ?? null;
    case "pain": {
      const points = a.painMap ?? [];
      const active = points.filter((p) => p.status !== "resolved");
      if (active.length) return Math.max(...active.map((p) => p.severity));
      // Only resolved spots, or an explicit "nothing to report": that is an
      // answer, and the answer is no active pain.
      return points.length > 0 || reviewed.includes("pain") ? 0 : null;
    }
    case "stress":
      return a.overallStressLevel ?? null;
    default:
      return null;
  }
}

/** Did this assessment itself say anything about the area? */
export function hasOwnValue(
  sectionId: string,
  a: SubjectiveAssessment | null | undefined,
  reviewed: readonly string[] = [],
): boolean {
  if (!a) return false;
  if (isCategory(sectionId)) {
    return CATEGORY_BY_KEY[sectionId].statements.some((st) => ownAnswer(a, st.id) !== null);
  }
  return ownExtra(sectionId, a, reviewed) !== null;
}

/**
 * Can the area's number be read from this assessment alone? An extra area
 * with its own value, or a category with all three statements answered.
 */
function knownWithoutBaseline(
  sectionId: string,
  a: SubjectiveAssessment,
  reviewed: readonly string[],
): boolean {
  if (isCategory(sectionId)) {
    return CATEGORY_BY_KEY[sectionId].statements.every((st) => ownAnswer(a, st.id) !== null);
  }
  return ownExtra(sectionId, a, reviewed) !== null;
}

/**
 * The area's number: this assessment's own values, with anything it did not
 * ask filled in from `base`. `null` = not assessed.
 */
export function measureSection(
  sectionId: string,
  a: SubjectiveAssessment | null | undefined,
  reviewed: readonly string[] = [],
  base: LivingBaseline = EMPTY_BASELINE,
): number | null {
  if (isCategory(sectionId)) {
    const merged: Record<string, StatementAnswer> = {};
    for (const st of CATEGORY_BY_KEY[sectionId].statements) {
      const v = (a ? ownAnswer(a, st.id) : null) ?? base.answers[st.id] ?? null;
      if (v !== null) merged[st.id] = { value: v };
    }
    return scoreCategory(sectionId, merged, 2).legacyScore;
  }
  if (!(ALL_ASSESSMENT_SECTION_IDS as readonly string[]).includes(sectionId)) return null;
  return (a ? ownExtra(sectionId, a, reviewed) : null) ?? base.extras[sectionId] ?? null;
}

/** `base` with everything `a` itself answered laid over it. */
export function advanceBaseline(
  base: LivingBaseline,
  a: SubjectiveAssessment | null | undefined,
  reviewed: readonly string[] = [],
): LivingBaseline {
  if (!a) return base;
  const answers: Record<string, number> = { ...base.answers };
  const extras: Record<string, number> = { ...base.extras };
  for (const id of ALL_ASSESSMENT_SECTION_IDS) {
    if (isCategory(id)) {
      for (const st of CATEGORY_BY_KEY[id].statements) {
        const v = ownAnswer(a, st.id);
        if (v !== null) answers[st.id] = v;
      }
    } else {
      const v = ownExtra(id, a, reviewed);
      if (v !== null) extras[id] = v;
    }
  }
  return { answers, extras };
}

/* ------------------------------------------------------------------ *
 * The in-draft log
 * ------------------------------------------------------------------ */

/**
 * The draft's change log after an edit from `prev` to `next`.
 *
 * Returns the SAME array when nothing measurable moved (typing a note,
 * picking a protein source), so callers can skip work by identity.
 */
export function recordChanges(opts: {
  prev: SubjectiveAssessment;
  next: SubjectiveAssessment;
  prevReviewed?: readonly string[];
  nextReviewed?: readonly string[];
  /** What the saved assessments already say — see `LivingBaseline`. */
  baseline?: LivingBaseline;
  /**
   * False while the saved history is unknown (still loading, or failed).
   * A "from" that would have needed it is then recorded as unknown rather
   * than as a confident "new".
   */
  baselineKnown?: boolean;
  at: Date;
  byId?: string | null;
  byName?: string | null;
}): AssessmentChange[] {
  const { prev, next, baseline = EMPTY_BASELINE, baselineKnown = true, at } = opts;
  const prevReviewed = opts.prevReviewed ?? [];
  const nextReviewed = opts.nextReviewed ?? prevReviewed;
  const source = next.changeLog ?? prev.changeLog ?? [];
  let log: AssessmentChange[] | null = null; // copied on first write
  const atMs = at.getTime();
  const iso = at.toISOString();
  const byId = opts.byId ?? undefined;
  const byName = opts.byName ?? undefined;

  for (const id of ALL_ASSESSMENT_SECTION_IDS) {
    const measuredFrom = measureSection(id, prev, prevReviewed, baseline);
    const to = measureSection(id, next, nextReviewed, baseline);
    if (measuredFrom === to) continue;
    const fromUnknown = !baselineKnown && !knownWithoutBaseline(id, prev, prevReviewed);
    const from = fromUnknown ? null : measuredFrom;

    const work: AssessmentChange[] = log ?? [...source];
    let lastIdx = -1;
    for (let i = work.length - 1; i >= 0; i--) {
      if (work[i].categoryId === id) {
        lastIdx = i;
        break;
      }
    }
    const last = lastIdx >= 0 ? work[lastIdx] : null;
    const lastMs = last ? Date.parse(last.at) : NaN;
    const samePerson = !!last && (last.byId ?? undefined) === byId;
    if (last && samePerson && Number.isFinite(lastMs) && atMs - lastMs <= CHANGE_MERGE_WINDOW_MS) {
      // A quick correction: keep one row, from where it started to where it is now.
      const merged: AssessmentChange = { ...last, to, at: iso };
      if (merged.from === merged.to && !merged.fromUnknown && !merged.note?.trim()) {
        work.splice(lastIdx, 1);
      }
      else work[lastIdx] = merged;
      log = work;
      continue;
    }
    const row: AssessmentChange = { categoryId: id, from, to, at: iso };
    if (fromUnknown) row.fromUnknown = true;
    if (byId !== undefined) row.byId = byId;
    if (byName !== undefined) row.byName = byName;
    work.push(row);
    log = work;
  }
  // A draft is one document: keep its trail bounded (oldest rows go first).
  return log ? (log.length > MAX_CHANGE_LOG ? log.slice(-MAX_CHANGE_LOG) : log) : source;
}

/** Rows kept in one assessment's change log. */
export const MAX_CHANGE_LOG = 200;

/** The log with one row's note set (an empty note removes it). */
export function withChangeNote(
  log: readonly AssessmentChange[],
  categoryId: string,
  at: string,
  note: string,
): AssessmentChange[] {
  const text = note.slice(0, CHANGE_NOTE_MAX);
  return log.map((c) => {
    if (c.categoryId !== categoryId || c.at !== at) return c;
    if (!text.trim()) {
      const { note: _drop, ...rest } = c;
      return rest;
    }
    return { ...c, note: text };
  });
}

/** The most recent in-draft change to one area, or null. */
export function latestChangeFor(
  log: readonly AssessmentChange[] | undefined,
  categoryId: string,
): AssessmentChange | null {
  if (!log) return null;
  for (let i = log.length - 1; i >= 0; i--) if (log[i].categoryId === categoryId) return log[i];
  return null;
}

/**
 * The `subjective` block a saved assessment stores. One place, used by the
 * draft's finalize and by the quick check-in, so neither can drop the log.
 */
export function finalizedSubjective(
  assessment: SubjectiveAssessment,
  date: string,
  summary: SubjectiveSummary,
): SubjectiveAssessment {
  const out: SubjectiveAssessment = { ...assessment, completedAt: date, summary };
  if (assessment.changeLog) out.changeLog = [...assessment.changeLog];
  return out;
}

/* ------------------------------------------------------------------ *
 * Saved assessments
 * ------------------------------------------------------------------ */

export interface AssessmentHistoryReport {
  id: string;
  /** The assessment's studio day, `YYYY-MM-DD`. */
  date: string;
  /** When the document was last written (the save), epoch ms; null if unknown. */
  savedAtMs: number | null;
  trainerId: string | null;
  trainerName: string | null;
  enteredBy: SubjectiveEnteredBy | null;
  assessment: SubjectiveAssessment;
  /** The draft's "nothing to report" marks, which stay on the document. */
  sectionsReviewed: string[];
}

export interface AssessmentHistory {
  /** Saved (Finalized) assessments, newest first. */
  reports: AssessmentHistoryReport[];
  /** True when the read reached the client's first report: nothing is older. */
  complete: boolean;
  /**
   * When `complete` is false: the oldest moment the read covers. Anything
   * touched after it would be in `reports`.
   */
  coversSinceMs: number | null;
}

export const millisOf = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const o = v as any;
  if (typeof o?.toMillis === "function") return o.toMillis();
  if (typeof o?.seconds === "number") return o.seconds * 1000;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return dayOrInstantMs(v);
  return null;
};

/**
 * A stored day or instant as epoch ms. A date-only string is pinned to LOCAL
 * NOON (the house rule — `new Date("2026-09-20")` is UTC midnight, which is
 * the evening before in Ohio).
 */
export function dayOrInstantMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = value.trim();
  const t = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`).getTime() : Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

/**
 * Shape a `progressReports` read (newest first, `limit(max)`) into the
 * history. Only Finalized reports that carry a check-in count, exactly as in
 * `loadPreviousCheckIn`.
 */
export function historyFromDocs(docs: readonly Record<string, any>[], max: number): AssessmentHistory {
  const reports: AssessmentHistoryReport[] = docs
    .filter((d) => d && d.status === "Finalized" && !!d.subjective)
    .map((d) => ({
      id: String(d.id),
      date: String(d.date ?? d.subjective?.completedAt ?? ""),
      savedAtMs: millisOf(d.updatedAt) ?? millisOf(d.createdAt),
      trainerId: d.trainerId ?? null,
      trainerName: d.trainerName ?? null,
      enteredBy: d.subjective?.enteredBy ?? null,
      assessment: d.subjective as SubjectiveAssessment,
      sectionsReviewed: Array.isArray(d.checkInSectionsReviewed) ? d.checkInSectionsReviewed : [],
    }));
  const complete = docs.length < max;
  let coversSinceMs: number | null = null;
  if (!complete) {
    for (const d of docs) {
      const t = millisOf(d.createdAt) ?? dayOrInstantMs(d.date);
      if (t !== null && (coversSinceMs === null || t < coversSinceMs)) coversSinceMs = t;
    }
  }
  return { reports, complete, coversSinceMs };
}

/** The newest saved assessment, in the shape the scoring code compares against. */
export function previousFromHistory(h: AssessmentHistory | null): PreviousAssessmentRef | null {
  const r = h?.reports[0];
  if (!r) return null;
  return {
    reportId: r.id,
    date: r.date,
    assessment: r.assessment,
    trainerName: r.trainerName,
    enteredBy: r.enteredBy,
  };
}

/** Saved reports oldest first. The input is newest first, so ties keep that order reversed. */
function oldestFirst(reports: readonly AssessmentHistoryReport[]) {
  return reports
    .map((r, i) => ({ r, i, day: dayOrInstantMs(r.date) ?? r.savedAtMs ?? 0 }))
    .sort((a, b) => a.day - b.day || (a.r.savedAtMs ?? 0) - (b.r.savedAtMs ?? 0) || b.i - a.i);
}

/** Everything the saved assessments say, newest answer winning, per statement and area. */
export function baselineFromHistory(h: AssessmentHistory | null): LivingBaseline {
  let base = EMPTY_BASELINE;
  for (const { r } of oldestFirst(h?.reports ?? [])) {
    base = advanceBaseline(base, r.assessment, r.sectionsReviewed);
  }
  return base;
}

/* ------------------------------------------------------------------ *
 * The log
 * ------------------------------------------------------------------ */

/** "updated": the value before is unknown (the history could not be read then). */
export type DeltaKind = "up" | "down" | "new" | "cleared" | "same" | "updated";

export function deltaKind(from: number | null, to: number | null): DeltaKind {
  if (from === null && to === null) return "same";
  if (from === null) return "new";
  if (to === null) return "cleared";
  return to > from ? "up" : to < from ? "down" : "same";
}

/** True when the move is good news for this area (pain going down is). */
export function isImprovement(sectionId: string, from: number | null, to: number | null): boolean | null {
  if (from === null || to === null || from === to) return null;
  return sectionScale(sectionId).lowerIsBetter ? to < from : to > from;
}

export type LogRowSource =
  /** In the open draft; its note can still be edited. */
  | "draft"
  /** Recorded live inside an assessment that has since been saved. */
  | "logged"
  /** Worked out by comparing two saved assessments. */
  | "derived";

export interface AssessmentLogRow {
  key: string;
  sectionId: string;
  pillarId: AssessmentPillar["id"] | null;
  from: number | null;
  to: number | null;
  kind: DeltaKind;
  /** For ordering. Derived rows sit at local noon of their assessment's day. */
  atMs: number;
  /** ISO instant for live rows; the `YYYY-MM-DD` day for derived rows. */
  at: string;
  /** False for derived rows: only the day is known. */
  hasTime: boolean;
  byName: string | null;
  note: string | null;
  source: LogRowSource;
  reportId: string | null;
}

const PILLAR_RANK = new Map<string, number>(
  ASSESSMENT_PILLARS.flatMap((p, pi) => p.sectionIds.map((id, si) => [id, pi * 10 + si] as const)),
);

const rowFromChange = (
  c: AssessmentChange,
  source: "draft" | "logged",
  reportId: string | null,
  index: number,
): AssessmentLogRow | null => {
  const atMs = Date.parse(c.at);
  if (!Number.isFinite(atMs)) return null;
  const from = typeof c.from === "number" ? c.from : null;
  const to = typeof c.to === "number" ? c.to : null;
  return {
    key: `${source}:${reportId ?? "draft"}:${c.categoryId}:${c.at}:${index}`,
    sectionId: c.categoryId,
    pillarId: pillarOf(c.categoryId)?.id ?? null,
    from,
    to,
    kind: c.fromUnknown ? "updated" : deltaKind(from, to),
    atMs,
    at: c.at,
    hasTime: true,
    byName: c.byName?.trim() || null,
    note: c.note?.trim() || null,
    source,
    reportId,
  };
};

/**
 * Changes between consecutive saved assessments, newest first.
 *
 * Unchanged areas are skipped, and an area not asked in an assessment
 * carries its last value forward. A first-ever value is a "new" row only
 * when the history is `complete` — if older reports were not read, nobody
 * knows whether it was new.
 */
export function deriveAssessmentDeltas(
  reports: readonly AssessmentHistoryReport[],
  opts: { complete?: boolean } = {},
): AssessmentLogRow[] {
  const complete = opts.complete ?? true;
  let base = EMPTY_BASELINE;
  const rows: AssessmentLogRow[] = [];
  for (const { r, day } of oldestFirst(reports)) {
    for (const id of ALL_ASSESSMENT_SECTION_IDS) {
      // Only what this assessment itself asked; the rest carries forward.
      if (!hasOwnValue(id, r.assessment, r.sectionsReviewed)) continue;
      const before = measureSection(id, null, [], base);
      const v = measureSection(id, r.assessment, r.sectionsReviewed, base);
      if (before === null ? !complete : before === v) continue;
      rows.push({
        key: `derived:${r.id}:${id}`,
        sectionId: id,
        pillarId: pillarOf(id)?.id ?? null,
        from: before,
        to: v,
        kind: deltaKind(before, v),
        atMs: day,
        at: r.date,
        hasTime: false,
        byName: r.trainerName?.trim() || null,
        note: null,
        source: "derived",
        reportId: r.id,
      });
    }
    base = advanceBaseline(base, r.assessment, r.sectionsReviewed);
  }
  return sortRows(rows);
}

function sortRows(rows: AssessmentLogRow[]): AssessmentLogRow[] {
  const liveFirst = (r: AssessmentLogRow) => (r.source === "derived" ? 1 : 0);
  return rows.sort(
    (a, b) =>
      b.atMs - a.atMs ||
      liveFirst(a) - liveFirst(b) ||
      (PILLAR_RANK.get(a.sectionId) ?? 99) - (PILLAR_RANK.get(b.sectionId) ?? 99),
  );
}

/**
 * Everything the history log shows, newest first: the open draft's changes,
 * the changes recorded inside saved assessments, and the derived changes for
 * whatever those recordings do not already cover.
 */
export function buildHistoryLog(input: {
  history: AssessmentHistory | null;
  draftId?: string | null;
  draftChangeLog?: readonly AssessmentChange[] | null;
}): AssessmentLogRow[] {
  const { history, draftId = null } = input;
  const reports = history?.reports ?? [];
  const rows: AssessmentLogRow[] = [];

  const covered = new Set<string>();
  reports.forEach((r) => {
    (r.assessment.changeLog ?? []).forEach((c, i) => {
      const row = rowFromChange(c, "logged", r.id, i);
      if (!row) return;
      covered.add(`${r.id}:${c.categoryId}`);
      rows.push(row);
    });
  });
  for (const d of deriveAssessmentDeltas(reports, { complete: history?.complete ?? true })) {
    if (!covered.has(`${d.reportId}:${d.sectionId}`)) rows.push(d);
  }
  // A draft that already appears as a saved report (a finalize racing a
  // render) is shown once, as the saved one.
  if (!draftId || !reports.some((r) => r.id === draftId)) {
    (input.draftChangeLog ?? []).forEach((c, i) => {
      const row = rowFromChange(c, "draft", null, i);
      if (row) rows.push(row);
    });
  }
  return sortRows(rows);
}

/* ------------------------------------------------------------------ *
 * Freshness: "2 of 4 updated in the last 90 days", "90+ days"
 * ------------------------------------------------------------------ */

export type Freshness =
  /** Touched within the last 90 days. */
  | "fresh"
  /** Last touched more than 90 days ago (or provably not within them). */
  | "stale"
  /** The whole history was read and this area was never assessed. */
  | "never"
  /** The history could not tell (not loaded, failed, or read only in part). */
  | "unknown";

/** When each area was last touched, epoch ms. */
export function sectionTouches(input: {
  history: AssessmentHistory | null;
  draftChangeLog?: readonly AssessmentChange[] | null;
  /** Areas the open draft has answered or settled. */
  draftDoneIds?: readonly string[];
  /** When the draft was last written. */
  draftSavedAtMs?: number | null;
}): Map<string, number> {
  const out = new Map<string, number>();
  const bump = (id: string, t: number | null) => {
    if (t === null || !Number.isFinite(t)) return;
    const was = out.get(id);
    if (was === undefined || t > was) out.set(id, t);
  };
  for (const r of input.history?.reports ?? []) {
    const day = dayOrInstantMs(r.date);
    for (const id of ALL_ASSESSMENT_SECTION_IDS) {
      if (hasOwnValue(id, r.assessment, r.sectionsReviewed) || r.sectionsReviewed.includes(id)) {
        bump(id, day);
      }
    }
    for (const c of r.assessment.changeLog ?? []) bump(c.categoryId, Date.parse(c.at));
  }
  for (const c of input.draftChangeLog ?? []) bump(c.categoryId, Date.parse(c.at));
  const saved = input.draftSavedAtMs ?? null;
  for (const id of input.draftDoneIds ?? []) bump(id, saved);
  return out;
}

export function freshnessOf(
  sectionId: string,
  touches: ReadonlyMap<string, number>,
  history: AssessmentHistory | null,
  nowMs: number,
): Freshness {
  const limit = STALE_AFTER_DAYS * DAY_MS;
  const t = touches.get(sectionId);
  if (t !== undefined) return nowMs - t > limit ? "stale" : "fresh";
  if (!history) return "unknown";
  if (history.complete) return "never";
  // Only part of the history was read. If even that part reaches back past
  // 90 days, a touch inside the 90 days would have been in it.
  if (history.coversSinceMs !== null && nowMs - history.coversSinceMs > limit) return "stale";
  return "unknown";
}

export interface PillarFreshness {
  total: number;
  fresh: number;
  /** Areas the history could not vouch for either way. */
  unknown: number;
}

export function pillarFreshness(
  pillar: AssessmentPillar,
  freshness: (sectionId: string) => Freshness,
): PillarFreshness {
  let fresh = 0;
  let unknown = 0;
  for (const id of pillar.sectionIds) {
    const f = freshness(id);
    if (f === "fresh") fresh += 1;
    else if (f === "unknown") unknown += 1;
  }
  return { total: pillar.sectionIds.length, fresh, unknown };
}

/** The pillar header's sentence. Never claims a number it cannot back. */
export function pillarFreshnessSentence(p: PillarFreshness, historyStatus: "loading" | "ready" | "error"): string {
  const window = `in the last ${STALE_AFTER_DAYS} days`;
  if (historyStatus === "loading") return "Checking the history…";
  if (p.unknown > 0) {
    return p.fresh > 0
      ? `At least ${p.fresh} of ${p.total} updated ${window}`
      : historyStatus === "error"
        ? "History unavailable — can't say what is up to date"
        : `Not enough history loaded to say what is up to date`;
  }
  if (p.fresh === p.total) return `All ${p.total} updated ${window}`;
  if (p.fresh === 0) return `None of ${p.total} updated ${window}`;
  return `${p.fresh} of ${p.total} updated ${window}`;
}

/** "Last updated" for the header: the newest row, or the last saved assessment. */
export function lastUpdated(
  rows: readonly AssessmentLogRow[],
  previous: PreviousAssessmentRef | null,
): { atMs: number; at: string; hasTime: boolean; byName: string | null } | null {
  const top = rows[0] ?? null;
  const prevMs = previous ? dayOrInstantMs(previous.date) : null;
  if (top && (prevMs === null || top.atMs >= prevMs)) {
    return { atMs: top.atMs, at: top.at, hasTime: top.hasTime, byName: top.byName };
  }
  if (previous && prevMs !== null) {
    return { atMs: prevMs, at: previous.date, hasTime: false, byName: previous.trainerName?.trim() || null };
  }
  return null;
}

/** A value as the log prints it: "9", or "—" for not assessed. */
export const formatMeasure = (v: number | null): string => (v === null ? "—" : String(v));
