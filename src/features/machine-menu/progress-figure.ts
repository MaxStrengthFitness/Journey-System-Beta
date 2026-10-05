/**
 * THE MACHINE MENU — the one "how far the weight has come" figure.
 *
 * AJ, Oct 3 2026, on the Now Bar: "show the starting weight and then next to
 * that a green % increase". The card says the same figure in the same green,
 * and both read it HERE, so the two can never disagree (AJ, Oct 4 2026,
 * Q2 (a): "ill take all your recommended").
 *
 * THE RULE (Q2 (a))
 * -----------------
 *   - The start is the STARTING WEIGHT ON FILE (`clientMachineSettings.
 *     startingWeight`): Finish writes it at the client's first Journey
 *     session on the machine, and Programming → Setup corrects it. It is
 *     labelled "Starting weight", never "First in Journey" — a number a
 *     trainer typed from the paper chart is not Journey's first set.
 *   - With no starting weight on file, the start falls back to the first
 *     COUNTED set, but only when every Journey session has been read, so the
 *     first set read really is Journey's first. Then it carries the history
 *     words' label ("First in Journey", or "First performed" for a client
 *     Journey holds the whole story of). With older sessions unread there is
 *     no start, and so no %: the oldest set loaded is not where anyone began.
 *   - The % runs from the start to the newest COUNTED (performed) load and
 *     is shown only when it is up (rounded above 0) — the Now Bar's rule.
 *     Only a performed set moves it (lib/set-outcome.ts).
 *
 * Nothing here suggests a weight. A % is a consequence, never a target.
 *
 * PURE — no React, no Firestore.
 */
import { machineUsageWords } from "../../lib/history-claims";
import type { HistoryCoverage } from "../../lib/prior-history";
import { lastCounted, type TimelineModel } from "./timeline-model";

/** What the label says when the start is the starting weight on file. */
export const STARTING_WEIGHT_LABEL = "Starting weight";

export interface ProgressInput {
  /** `clientMachineSettings.startingWeight`, as stored (a number, or an old row's numeric string). */
  startingWeight?: unknown;
  /** The first counted (performed) load in what was read, in session order. */
  firstCounted?: number | null;
  /** The newest counted (performed) load. */
  lastCounted?: number | null;
  /** Every Journey session has been read, so `firstCounted` is Journey's first. */
  everythingRead: boolean;
  /** The client's coverage (the home studio's cutover), for the fallback's label. */
  coverage?: HistoryCoverage;
}

export interface ProgressFigure {
  /** The load the figure counts from, in lb. */
  start: number;
  /** Where the start came from. */
  source: "on-file" | "first-counted";
  /** "Starting weight", or the history words' "First in Journey" / "First performed". */
  startLabel: string;
  /** The newest counted load, or null when nothing has been counted yet. */
  last: number | null;
  /** Whole percent from the start to `last`; null without a `last`. */
  gain: number | null;
  /** The % is shown: `gain` above 0. */
  up: boolean;
}

/** A load that can be counted from: a finite number above 0 (a numeric string on an old row). */
function asLoad(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The figure, or null when there is no start to count from (no starting
 * weight on file, and either nothing counted or older sessions unread).
 */
export function progressFigure(input: ProgressInput): ProgressFigure | null {
  const onFile = asLoad(input.startingWeight);
  const first = input.everythingRead ? asLoad(input.firstCounted) : null;
  const start = onFile ?? first;
  if (start === null) return null;
  const last = asLoad(input.lastCounted);
  const gain = last === null ? null : Math.round(((last - start) / start) * 100);
  return {
    start,
    source: onFile !== null ? "on-file" : "first-counted",
    startLabel: onFile !== null ? STARTING_WEIGHT_LABEL : machineUsageWords(input.coverage).first,
    last,
    gain,
    up: gain !== null && gain > 0,
  };
}

/** "Starting weight 80 lb" — the start, said. */
export function startWords(fig: ProgressFigure): string {
  return `${fig.startLabel} ${fig.start} lb`;
}

/** "+25%", only when up; null otherwise. Drawn in `--jg-pf-gain`. */
export function gainWords(fig: ProgressFigure | null): string | null {
  return fig && fig.up && fig.gain !== null ? `+${fig.gain}%` : null;
}

/**
 * The card's progress words, appended to its count ("· Starting weight 80 lb,
 * +25%"): only when the weight is up. The Now Bar says the start on its own
 * line even when it isn't (`startWords`), and the % beside it only when up.
 */
export function progressWords(fig: ProgressFigure | null): string | null {
  const gain = gainWords(fig);
  return fig && gain ? `${startWords(fig)}, ${gain}` : null;
}

/** The figure for the card, from the timeline model (counted columns only). */
export function progressFromModel(
  model: Pick<TimelineModel, "columns" | "everythingRead">,
  startingWeight: unknown,
  coverage?: HistoryCoverage,
): ProgressFigure | null {
  const first = model.columns.find((c) => c.counted && c.weight !== null) ?? null;
  return progressFigure({
    startingWeight,
    firstCounted: first?.weight ?? null,
    lastCounted: lastCounted(model)?.weight ?? null,
    everythingRead: model.everythingRead,
    coverage,
  });
}

/**
 * The figure for the Now Bar, from the grid's performed sets in session
 * order (`journey-grid/stats.ts` `orderedSets`, which keeps performed sets
 * only). `everythingRead`: every session in the tracker's listener has had
 * its sets read.
 */
export function progressFromSets(
  sets: readonly { weight: number }[],
  opts: { startingWeight?: unknown; everythingRead: boolean; coverage?: HistoryCoverage },
): ProgressFigure | null {
  return progressFigure({
    startingWeight: opts.startingWeight,
    firstCounted: sets[0]?.weight ?? null,
    lastCounted: sets[sets.length - 1]?.weight ?? null,
    everythingRead: opts.everythingRead,
    coverage: opts.coverage,
  });
}
