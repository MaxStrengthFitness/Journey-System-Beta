/**
 * BODY & PULSE → MEASURED, AND WHAT SHE TOLD US — pairs, never a score.
 *
 * Client codex, Sep 2026 (phase 12). Some things the studio measures and the
 * client also tells us about: how strong she is (InBody's skeletal muscle,
 * and "I feel stronger than I did 3 months ago"), a joint on file and the
 * pain she reports there, how often she comes and whether she says she is
 * consistent. This module lines each measured fact up with what she said,
 * side by side, EACH WITH ITS OWN SOURCE AND DATE — and never merges them
 * into one number, a verdict or a colour.
 *
 *   Strength     InBody skeletal muscle, first scan against the latest,
 *                called a change only beyond her home studio's normal
 *                variation (AJ's decision 8, features/inbody/variation.ts).
 *                With no scan: the nightly renewal check's "stronger on 6 of
 *                9 machines", which Journey measured itself.
 *   {region}     a flag on file there, and the pain map's spot there — only
 *                when BOTH exist; a flag with nothing told is on Watch-outs.
 *   Consistency  the renewal check's pace, and "I am consistent with my
 *                workouts."
 *
 * A told side with no answer reads "Not asked yet" — but only once the Pulse
 * has answered. While the saved rounds or the open round are still loading
 * it says so, and after a failed read it says the saved Pulse couldn't be
 * read: a failed read is unknown, never "not asked" (`toldMissingLine`).
 * Pure: pairs.test.ts.
 */
import type { Client } from "../../../types";
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import type { InBodyScan } from "../../inbody/types";
import type { InBodyScansState } from "../../inbody/useInBodyScans";
import { callChange, type InBodyVariation } from "../../inbody/variation";
import { changeBetween, formatMeasure, sortScans } from "../../inbody/scans";
import { paceSentence } from "../../renewals/sentences";
import { MIN_MACHINE_SESSIONS } from "../../renewals/engine";
import { selectedFlags } from "../../clinical-flags/flag-search";
import type { Pronouns } from "../kit/pronouns";
import { agree } from "../kit/pronouns";
import { dayKeyDate, monthDayYear, monthLabel } from "../kit/text";
import { flagRegions, regionLabel, type FigureRegion } from "./figure-map";
import {
  dayWords,
  previousReading,
  spotWords,
  statementTextOf,
  type PainReading,
  type PulseReading,
  type PulseSource,
} from "./pulse-read";

export const NOT_ASKED_YET = "Not asked yet";
/** A told side after the saved Pulse could not be read (the Pulse card's own words). */
export const PULSE_UNKNOWN = "Not known: the saved Pulse couldn't be read";

/**
 * What a told side with no answer reads: "Not asked yet" only once the Pulse
 * answered. Loading says so; a failed read is unknown, never unasked.
 */
export function toldMissingLine(status: ProgressReportsStatus, pronouns: Pick<Pronouns, "subject">): string {
  if (status === "loading") return `Loading what ${pronouns.subject} told us…`;
  if (status === "failed") return PULSE_UNKNOWN;
  return NOT_ASKED_YET;
}

export interface PairSide {
  text: string;
  source: string | null;
}

export interface PairTold {
  /** The statement in curly quotes, or the spot ("Right knee:"). */
  text: string;
  /** The Dial's word, shown bold. */
  word: string;
  source: string;
}

export interface PairRow {
  key: string;
  label: string;
  measured: PairSide;
  /** Null when there is no answer to show: the row reads `toldMissing`. */
  told: PairTold | null;
  /** What the told side reads when `told` is null (`toldMissingLine`). */
  toldMissing: string;
}

/** "Mar 3", "Mar 3, 2025". */
function day(key: string | null | undefined, now: Date): string {
  const d = dayKeyDate(key);
  return d ? monthDayYear(d, now) : "";
}

/** 1.2 → "1.2", -3 → "3.0" (the scanner's one decimal). */
const lb = (n: number) => Math.abs(n).toFixed(1);

/** What a statement told side reads: the words, the word, "Pulse, Mar 10 · Rarely on Sep 16". */
function toldStatement(
  statementId: string,
  readings: ReadonlyMap<string, PulseReading>,
  source: PulseSource,
  now: Date,
): PairTold | null {
  const reading = readings.get(statementId);
  const text = statementTextOf(statementId);
  if (!reading || !text) return null;
  const prev = previousReading(statementId, source, reading);
  const when = dayWords(reading.day, now);
  const prevWhen = prev ? dayWords(prev.day, now) : "";
  const parts = [`Pulse${when ? `, ${when}` : ""}`];
  if (prev) parts.push(`${prev.word}${prevWhen ? ` on ${prevWhen}` : ""}`);
  return { text: `“${text}”`, word: reading.word, source: parts.join(" · ") };
}

/**
 * The strength row's measured side, from the tab's one InBody stream. Unknown
 * (loading, failed) says so; it is never "No InBody scan yet".
 */
export function strengthMeasured({
  client,
  inbody,
  variation,
  variationOwner,
  pronouns,
  now,
}: {
  client: Pick<Client, "renewal">;
  inbody: Pick<InBodyScansState, "scans" | "loading" | "error">;
  variation: InBodyVariation;
  /** The home studio's name when it set its own numbers; null for Max Strength's defaults. */
  variationOwner: string | null;
  pronouns: Pronouns;
  now: Date;
}): PairSide {
  if (inbody.error) return { text: "The InBody scans couldn't be loaded just now.", source: null };
  if (inbody.loading) return { text: "Loading the InBody scans…", source: null };

  const scans = sortScans((inbody.scans ?? []).filter((s: InBodyScan) => typeof s.skeletalMuscleMassLb === "number"));
  const latest = scans[scans.length - 1] ?? null;
  if (latest && scans.length >= 2) {
    const first = scans[0];
    const delta = changeBetween(first, latest, "skeletalMuscleMassLb");
    const firstDate = dayKeyDate(first.testedAt);
    const text = `Skeletal muscle ${formatMeasure(latest.skeletalMuscleMassLb, "skeletalMuscleMassLb")}; ${formatMeasure(
      first.skeletalMuscleMassLb,
      "skeletalMuscleMassLb",
    )} in ${firstDate ? monthLabel(firstDate, now) : first.testedAt}.`;
    const v = variation.skeletalMuscleMassLb;
    const whose = variationOwner ? `set by ${variationOwner}` : "Max Strength's default";
    const call = callChange("skeletalMuscleMassLb", delta, variation);
    let clause = "";
    if (delta === 0) clause = " The same on both scans.";
    else if (call === "within" && delta !== null)
      clause = ` A ${lb(delta)} lb change is inside the scanner's normal variation (±${v} lb, ${whose}), so it isn't called a change.`;
    else if ((call === "up" || call === "down") && delta !== null)
      clause = ` ${call === "up" ? "Up" : "Down"} ${lb(delta)} lb, beyond the scanner's normal variation (±${v} lb, ${whose}).`;
    return { text, source: `InBody, ${day(latest.testedAt, now)}.${clause}` };
  }
  if (latest) {
    return {
      text: `Skeletal muscle ${formatMeasure(latest.skeletalMuscleMassLb, "skeletalMuscleMassLb")}.`,
      source: `One scan so far, InBody ${day(latest.testedAt, now)}.`,
    };
  }
  const proof = client.renewal?.proof;
  if (
    proof &&
    typeof proof.machinesImproved === "number" &&
    typeof proof.machinesTracked === "number" &&
    proof.machinesTracked > 0
  ) {
    return {
      text: `Stronger on ${proof.machinesImproved} of ${proof.machinesTracked} machines ${pronouns.subject} ${agree(pronouns, "has", "have")} done ${MIN_MACHINE_SESSIONS}+ times.`,
      source: "First logged weight against the latest, in Journey",
    };
  }
  return { text: "No InBody scan yet.", source: null };
}

export function measuredToldPairs({
  client,
  inbody,
  variation,
  variationOwner,
  flagIds,
  pain,
  source,
  readings,
  pulseStatus,
  pronouns,
  now,
}: {
  client: Pick<Client, "renewal">;
  inbody: Pick<InBodyScansState, "scans" | "loading" | "error">;
  variation: InBodyVariation;
  variationOwner: string | null;
  flagIds: readonly string[] | null | undefined;
  pain: PainReading | null;
  source: PulseSource;
  readings: ReadonlyMap<string, PulseReading>;
  /**
   * Whether what she told us is known: "loading" while the saved rounds or the
   * open round are still being read, "failed" when the saved rounds couldn't be.
   */
  pulseStatus: ProgressReportsStatus;
  pronouns: Pronouns;
  now: Date;
}): PairRow[] {
  const rows: PairRow[] = [];
  const toldMissing = toldMissingLine(pulseStatus, pronouns);

  rows.push({
    key: "strength",
    label: "Strength",
    measured: strengthMeasured({ client, inbody, variation, variationOwner, pronouns, now }),
    told: toldStatement("strengthConfidence_1", readings, source, now),
    toldMissing,
  });

  // A region with both a flag on file and a spot she told us about.
  const flags = selectedFlags(flagIds);
  const flagsAt = new Map<FigureRegion, string[]>();
  for (const f of flags) {
    for (const region of flagRegions(f.id)) flagsAt.set(region, [...(flagsAt.get(region) ?? []), f.name]);
  }
  const spotsAt = new Map<FigureRegion, PainReading["spots"]>();
  for (const s of pain?.spots ?? []) {
    const region = s.point.region as FigureRegion;
    spotsAt.set(region, [...(spotsAt.get(region) ?? []), s]);
  }
  for (const [region, names] of flagsAt) {
    const spots = spotsAt.get(region);
    if (!spots || spots.length === 0) continue;
    const when = dayWords(pain?.day, now);
    const prevParts = spots
      .filter((s) => s.prev)
      .map((s) => {
        const pw = dayWords(s.prev!.day, now);
        return `${s.prev!.word}${pw ? ` on ${pw}` : ""}`;
      });
    const spotText = spots.map((s) => spotWords(s.point)).join(", ");
    rows.push({
      key: `region:${region}`,
      label: regionLabel(region),
      measured: { text: `${names.join("; ")}, on file.`, source: "Clinical flag" },
      told: {
        text: `${spotText.charAt(0).toUpperCase()}${spotText.slice(1)}:`,
        word: spots.map((s) => s.word).join(", "),
        source: [`Pulse pain map${when ? `, ${when}` : ""}`, ...prevParts].join(" · "),
      },
      toldMissing,
    });
  }

  const pace = client.renewal ? paceSentence(client.renewal) : null;
  rows.push({
    key: "consistency",
    label: "Consistency",
    measured: pace
      ? { text: `${pace}.`, source: "Last 8 weeks · from the nightly renewal check" }
      : { text: "Pace: not on record yet.", source: null },
    told: toldStatement("consistencyHabits_1", readings, source, now),
    toldMissing,
  });
  return rows;
}
