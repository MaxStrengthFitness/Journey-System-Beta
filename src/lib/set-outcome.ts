/**
 * SET OUTCOME — what happened on a planned machine, decided once.
 *
 * Every planned machine in a session ends in exactly one of four states
 * (docs/ARCHITECTURE.md §1.6, decided Sep 12 2026):
 *
 *   performed    a standard set to failure. The ONLY outcome that counts
 *                toward averages, progression, rollups and rep-quality tallies.
 *   practice     the client got on the machine for form, blood flow or
 *                recovery. Load, reps and time are recorded for history and
 *                can be linked to the pain map, but they never move an average.
 *   skipped      explicitly bypassed today, for a reason the trainer picks.
 *                Over time the reasons are data of their own.
 *   not_reached  the session ran out of time first. Never asked of the
 *                trainer — Finish Session derives it from the timestamps.
 *
 * Why one module: set data is read in twenty places (the Journey grid, the
 * rollups, the clinical review, the check-in's machine progression, Insights,
 * the leaderboard job ...). If each of them decided for itself what a blank
 * cell meant, they would disagree within a week. They all ask here.
 *
 * BACKWARD COMPATIBILITY — logs written before this field existed:
 *   a log with no `outcome` is `performed` if it carries a count (reps, or
 *   seconds for a hold) and `skipped` with reason `unknown` if it does not.
 *   A count-less set never counted toward anything (the rollups scored it
 *   zero), so this changes no number; it only names what the blank was.
 *   FileMaker's 0 / X / "no" / emoji cells import the same way — skipped,
 *   reason unknown — which keeps them out of the averages (decided Sep 12).
 */

export type SetOutcome = "performed" | "practice" | "skipped" | "not_reached";

export const SET_OUTCOMES: readonly SetOutcome[] = ["performed", "practice", "skipped", "not_reached"];

export const OUTCOME_LABEL: Record<SetOutcome, string> = {
  performed: "Performed",
  practice: "Practice",
  skipped: "Skipped",
  not_reached: "Not reached",
};

/** One line for a legend or an aria label. */
export const OUTCOME_GLOSS: Record<SetOutcome, string> = {
  performed: "a set to failure — counts toward progression",
  practice: "form, blood flow or recovery — recorded, not counted",
  skipped: "bypassed today for a reason",
  not_reached: "the session ran out of time first",
};

/**
 * Why a machine was skipped. The vocabulary AJ approved on Sep 12 2026, plus
 * `unknown` for the rows history hands us without a reason (pre-outcome logs
 * and the FileMaker import). Keep it short: a picker on the floor is read at
 * arm's length with a client waiting.
 */
export const SKIP_REASONS = [
  "pain_injury",
  "machine_occupied",
  "out_of_service",
  "client_declined",
  "trainers_call",
  "other",
  "unknown",
] as const;

export type SkipReason = (typeof SKIP_REASONS)[number];

export const SKIP_REASON_LABEL: Record<SkipReason, string> = {
  pain_injury: "Pain or injury",
  machine_occupied: "Machine occupied",
  out_of_service: "Out of service",
  client_declined: "Client declined or fatigued",
  trainers_call: "Trainer's call",
  other: "Other",
  unknown: "Unknown",
};

/** The reasons a trainer can pick on the floor — `unknown` is history's word, not theirs. */
export const PICKABLE_SKIP_REASONS: readonly SkipReason[] = SKIP_REASONS.filter((r) => r !== "unknown");

/**
 * The fields this module reads. Structural, so it works on an ExerciseLog,
 * on the grid's LogLike, on a rollup row and on a CSV import row alike.
 */
export interface OutcomeLog {
  outcome?: SetOutcome | null;
  skipReason?: SkipReason | string | null;
  reps?: string | number | null;
  seconds?: string | number | null;
  isTSC?: boolean | null;
  isStaticHold?: boolean | null;
}

const isOutcome = (v: unknown): v is SetOutcome =>
  v === "performed" || v === "practice" || v === "skipped" || v === "not_reached";

/** A real, positive number — "12", 12, "0.5"; not "", "0", "abc", null. */
export function hasCount(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Does the log record an effort? Holds (TSC / static) are measured in
 * seconds, everything else in reps — the same rule lib/log-validation.ts
 * applies when it looks for a set that was begun but never counted.
 */
export function hasEffort(log: OutcomeLog | null | undefined): boolean {
  if (!log) return false;
  const isHold = Boolean(log.isStaticHold || log.isTSC);
  return isHold ? hasCount(log.seconds) : hasCount(log.reps);
}

/**
 * The outcome of a log, explicit or inferred (see the compatibility rule at
 * the top of the file). Never returns undefined: every log has an answer.
 */
export function outcomeOf(log: OutcomeLog | null | undefined): SetOutcome {
  if (!log) return "not_reached";
  if (isOutcome(log.outcome)) return log.outcome;
  return hasEffort(log) ? "performed" : "skipped";
}

/** The skip reason, or null when the log was not skipped. Legacy skips read `unknown`. */
export function skipReasonOf(log: OutcomeLog | null | undefined): SkipReason | null {
  if (outcomeOf(log) !== "skipped") return null;
  const r = log?.skipReason;
  return r && (SKIP_REASONS as readonly string[]).includes(r) ? (r as SkipReason) : "unknown";
}

/** True when the set counts: performed, and only performed. */
export function isPerformedLog(log: OutcomeLog | null | undefined): boolean {
  return outcomeOf(log) === "performed";
}

/** The performed sets of a list, in the order given. */
export function performedOnly<T extends OutcomeLog>(logs: readonly T[] | null | undefined): T[] {
  if (!logs) return [];
  return logs.filter((l) => isPerformedLog(l));
}

/**
 * True when a log records something worth showing in history even though it
 * does not count: a practice set with data, or a skip with a reason.
 */
export function isRecordedOnly(log: OutcomeLog | null | undefined): boolean {
  const o = outcomeOf(log);
  return o === "practice" || o === "skipped";
}

/**
 * What Finish Session stamps on a log that carries no explicit outcome, so
 * nothing leaves the session ambiguous: an effort is performed; a set begun
 * without a count is skipped, reason unknown — unless the trainer answered
 * the End Session question and chose practice, which the caller passes in.
 */
export function outcomeAtFinish(
  log: OutcomeLog | null | undefined,
  chosen?: "practice" | "skipped" | null,
): { outcome: SetOutcome; skipReason?: SkipReason } {
  if (log && isOutcome(log.outcome)) {
    return log.outcome === "skipped" ? { outcome: "skipped", skipReason: skipReasonOf(log) ?? "unknown" } : { outcome: log.outcome };
  }
  if (hasEffort(log)) return { outcome: "performed" };
  if (chosen === "practice") return { outcome: "practice" };
  return { outcome: "skipped", skipReason: "unknown" };
}

/**
 * The machines in today's sequence that have no log at all — the ones Finish
 * Session records as not reached. Sided machines (Torso Rotation) log per
 * side, so any log for the machine, either side, means it was reached.
 */
export function unreachedMachineIds(
  plannedMachineIds: readonly string[],
  logs: readonly { machineId?: string | null }[],
): string[] {
  const touched = new Set<string>();
  for (const l of logs) if (l.machineId) touched.add(l.machineId);
  const out: string[] = [];
  for (const id of plannedMachineIds) {
    if (id && !touched.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Marks a CSV / FileMaker row: a count makes it performed, anything else is a skip we cannot explain. */
export function importedOutcome(row: OutcomeLog): { outcome: SetOutcome; skipReason?: SkipReason } {
  return hasEffort(row) ? { outcome: "performed" } : { outcome: "skipped", skipReason: "unknown" };
}
