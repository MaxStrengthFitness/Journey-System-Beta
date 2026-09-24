/**
 * BODY & PULSE — the page's small lines: its sub-toggle line, and the "How to
 * coach her" strip at the top.
 *
 * Client codex, Sep 2026 (phase 12). Each page area owns the line under its
 * segment (INTEGRATION: page-meta.ts only composes them). Body & Pulse says
 * the thing worth the tap first: how many watch-outs are on file (with the
 * plum dot, crimson only when one is an absolute contraindication), else
 * when the Pulse was last saved, else what the page holds ("Build and
 * Pulse"). Short, because the bar wraps at portrait widths.
 *
 * The strip quotes how to coach her. Goals & Focus owns that sentence
 * (`howToCoachLead`, phase 14); until it lands, the strip quotes the first
 * paragraph of the coach strategy on her record, verbatim, never cut
 * mid-sentence — the whole of it is one tap away on Goals & Focus.
 *
 * Pure: page-lines.test.ts.
 */
import { selectedFlags } from "../../clinical-flags/flag-search";
import type { AssessmentHistory } from "../../subjective-report/assessment-history";
import { studioDayKeyOf } from "../../../lib/studio-time";
import { plural } from "../kit/text";
import { dayWords, roundsNewestFirst } from "./pulse-read";

export interface BodySubline {
  meta: string;
  flag: boolean;
  flagTone: "warn" | "alert";
}

/**
 * "2 watch-outs" (dot), else "Pulse Mar 10", else "Build and Pulse". `pulseDay` is the
 * newest saved round's studio day, when the history is known.
 */
export function bodySubline({
  flagIds,
  pulseDay,
  now,
}: {
  flagIds: readonly string[] | null | undefined;
  pulseDay: string | null | undefined;
  now: Date;
}): BodySubline {
  const flags = selectedFlags(flagIds);
  if (flags.length > 0) {
    // Plum for a caution; crimson only when an absolute contraindication is on file.
    const alert = flags.some((f) => f.tone === "alert");
    return { meta: plural(flags.length, "watch-out"), flag: true, flagTone: alert ? "alert" : "warn" };
  }
  const when = dayWords(pulseDay, now);
  if (when) return { meta: `Pulse ${when}`, flag: false, flagTone: "warn" };
  return { meta: "Build and Pulse", flag: false, flagTone: "warn" };
}

/** The newest saved Pulse round's studio day; null while unknown or when there is none. */
export function newestPulseDay(history: AssessmentHistory | null | undefined): string | null {
  const newest = roundsNewestFirst(history)[0];
  return newest ? studioDayKeyOf(newest.date) : null;
}

/**
 * The first paragraph of the coach strategy, verbatim (a paragraph ends at a
 * blank line). Null when nothing is written.
 */
export function coachStripLine(discoveryNotes: string | null | undefined): string | null {
  const text = (discoveryNotes ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return null;
  const first = text.split(/\n\s*\n/)[0]?.trim() ?? "";
  return first || null;
}

/** Whether the strategy holds more than the paragraph the strip shows. */
export function coachStripHasMore(discoveryNotes: string | null | undefined): boolean {
  const text = (discoveryNotes ?? "").replace(/\r\n?/g, "\n").trim();
  const first = coachStripLine(text);
  return first !== null && text.length > first.length;
}
