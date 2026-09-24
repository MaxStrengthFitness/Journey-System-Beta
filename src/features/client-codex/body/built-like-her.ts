/**
 * BODY & PULSE → CLIENTS BUILT LIKE HER — what machine fit can say about
 * where similar clients set up, in machine fit's own sentences.
 *
 * Client codex, Sep 2026 (phase 12). The mockup's version ("mostly sit at Leg
 * Press seat 6–8") invented a range the engine does not produce. This one
 * only picks which of the engine's OWN lines to show — the Setup screen's
 * `suggestionSentence`, `noSuggestionSentence` and `auditSummary`, verbatim —
 * so the Body page and Programming → Setup can never disagree, and every
 * claim carries machine fit's named minimum (MIN_CLIENTS similar clients,
 * or it says nothing). AJ accepted this departure from the mockup.
 *
 * It never offers a value to use or a load: settings evidence only, and a
 * door to Setup, where a trainer decides.
 *
 * Pure: built-like-her.test.ts, with fixture rows.
 */
import { auditSummary, noSuggestionSentence, suggestionSentence } from "../../machine-fit/ui/sentences";
import type { SetupRowModel } from "../../machine-fit/ui/useSetupModel";
import { shownValue } from "../../machine-fit/ui/field-values";
import type { FitFactors, MachineAudit } from "../../machine-fit/types";
import type { Pronouns } from "../kit/pronouns";

/** At most this many machines' lines. */
export const BUILT_LIKE_HER_MAX_LINES = 3;

export interface BuiltLikeHerLine {
  machineId: string;
  machineName: string;
  /** "Seat 7 · Gap 2" — the fields similar clients agree on, in the machine's own spelling. */
  picks: string;
  /** Machine fit's own sentence for it, verbatim. */
  sentence: string;
}

export interface BuiltLikeHerView {
  /** The Setup screen's summary, verbatim ("14 of 16 machines set up. …"). */
  summary: string;
  /**
   * The summary after its count ("Nothing looks unusual for this build."),
   * verbatim — the card's head already says how many machines are set up.
   * Null when the summary is only the count.
   */
  verdict: string | null;
  lines: BuiltLikeHerLine[];
  /** Why there are no lines, when machine fit has a reason; null otherwise. */
  reason: string | null;
}

/**
 * The lines for her prescribed machines: the first three whose suggestion
 * rests on similar clients (not only on what everyone uses), in routine
 * order. With none, the reason machine fit gives for the first prescribed
 * machine it looked at; with no height, the one thing that would help.
 */
export function builtLikeHer({
  rows,
  allRows,
  target,
  pronouns,
}: {
  /** Her prescribed machines (useSetupModel with filter "routine"). */
  rows: readonly SetupRowModel[];
  /** Every machine on the floor (for the summary's count). */
  allRows: readonly SetupRowModel[];
  target: Pick<FitFactors, "heightIn">;
  pronouns: Pick<Pronouns, "possessive" | "object">;
}): BuiltLikeHerView {
  const audits = allRows.map((r) => r.audit).filter((a): a is MachineAudit => a !== null);
  const setUp = allRows.filter((r) => r.isSetUp).length;
  const summary = auditSummary(audits, setUp, allRows.length);

  const lines: BuiltLikeHerLine[] = [];
  for (const row of rows) {
    if (lines.length >= BUILT_LIKE_HER_MAX_LINES) break;
    const s = row.suggestion;
    if (!s || s.ok !== true) continue;
    const banded = s.picks.filter((p) => !p.universal);
    if (banded.length === 0) continue;
    const byNk = new Map(row.fields.map((f) => [f.nk, f]));
    const picks = banded
      .map((p) => {
        const field = byNk.get(p.key);
        if (!field) return null;
        return `${field.label} ${row.offer[field.key]?.value ?? shownValue(field, p.value)}`;
      })
      .filter((x): x is string => !!x)
      .join(" · ");
    lines.push({ machineId: row.machine.id, machineName: row.machine.name, picks, sentence: suggestionSentence(s) });
  }

  let reason: string | null = null;
  if (lines.length === 0) {
    const first = rows.find((r) => r.suggestion && r.suggestion.ok === false);
    if (first?.suggestion && first.suggestion.ok === false) reason = noSuggestionSentence(first.suggestion);
    else if (target.heightIn === null) {
      reason = `Add a height to ${pronouns.possessive} record to compare ${pronouns.object} with clients built like ${pronouns.object}.`;
    }
  }
  const verdict = summary.replace(/^\d+ of \d+ machines set up\.\s*/, "").trim() || null;
  return { summary, verdict, lines, reason };
}
