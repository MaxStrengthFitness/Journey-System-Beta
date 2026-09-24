/**
 * MACHINE FIT — the "Similar to" spec this iPad last chose, kept in the
 * browser (one per iPad, never per client).
 *
 * Moved out of SetupView.tsx unchanged (client codex, Sep 2026) so Body &
 * Pulse's "Clients built like her" reads the SAME spec the trainer set on
 * Programming → Setup — the two screens then match clients the same way and
 * cannot disagree about who is "built like her".
 *
 * Never throws: a private window, blocked storage or a spec saved before a
 * factor existed all read as the defaults (merged field by field).
 */
import { DEFAULT_MATCH_SPEC } from "../match-spec";
import type { MatchSpec } from "../types";

export const SPEC_STORE = "msf_fit_match_spec";

export function readStoredSpec(): MatchSpec {
  try {
    const raw = window.localStorage.getItem(SPEC_STORE);
    if (!raw) return DEFAULT_MATCH_SPEC;
    const parsed = JSON.parse(raw) as Partial<MatchSpec>;
    if (!parsed || typeof parsed !== "object" || !parsed.numeric) return DEFAULT_MATCH_SPEC;
    // Merge over the defaults so a spec saved before a factor existed still has it.
    const numeric = { ...DEFAULT_MATCH_SPEC.numeric };
    for (const k of Object.keys(numeric) as (keyof typeof numeric)[]) {
      const saved = parsed.numeric[k];
      if (saved && typeof saved.on === "boolean" && Number.isFinite(saved.maxSteps)) {
        numeric[k] = { ...numeric[k], on: saved.on, maxSteps: Math.max(0, Math.min(6, Math.round(saved.maxSteps))) };
      }
    }
    return { ...DEFAULT_MATCH_SPEC, numeric, gender: parsed.gender === true };
  } catch {
    return DEFAULT_MATCH_SPEC;
  }
}
