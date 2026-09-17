/**
 * MACHINE FIT — the Kaizen report's sentences.
 *
 * The report (kaizen.ts) is numbers with their sample sizes; this turns each
 * one into what a head trainer would say out loud, and into "not enough data
 * yet" when the number is missing. A correlation is never shown as a number:
 * it is read in three broad bands — follows closely, loosely follows, does
 * not follow — because a setting is a notch on a machine, not a measurement,
 * and two decimals of r would claim a precision nobody has.
 *
 * Pure and tested, like ui/sentences.ts.
 */

import { formatInches } from "../factors";
import {
  LINK_CLOSE,
  LINK_MIN_CLIENTS,
  type BodyStats,
  type FactorLink,
  type FieldReport,
  type HeightBand,
  type KaizenReport,
  type StudioFitReport,
  type StudioHabit,
} from "../kaizen";
import type { NumericFactor } from "../types";

const clients = (n: number) => `${n} ${n === 1 ? "client" : "clients"}`;

export const NOT_ENOUGH = "not enough data yet";

/** 5'4", or 5'3"–5'5" when the band is wider than one height. */
export function bandLabel(band: Pick<HeightBand, "from" | "to">): string {
  return band.from === band.to ? formatInches(band.from) : `${formatInches(band.from)}–${formatInches(band.to)}`;
}

const MEASURE: Record<NumericFactor, { name: string; more: string; one: string; many: string; roundTo: number }> = {
  height: { name: "height", more: "Taller clients", one: "inch", many: "inches", roundTo: 1 },
  wingspan: { name: "wingspan", more: "Clients with a longer wingspan", one: "inch", many: "inches", roundTo: 1 },
  weight: { name: "weight", more: "Heavier clients", one: "lb", many: "lb", roundTo: 5 },
  age: { name: "age", more: "Older clients", one: "year", many: "years", roundTo: 5 },
  bodyFat: { name: "body fat", more: "Clients with more body fat", one: "point", many: "points", roundTo: 1 },
  muscle: { name: "muscle mass", more: "Clients with more muscle", one: "lb", many: "lb", roundTo: 5 },
};

/** "about one lower for every 2 inches of height" — or per inch, when it moves faster than that. */
function pacePhrase(link: FactorLink): string {
  const m = MEASURE[link.factor];
  const direction = link.slope < 0 ? "lower" : "higher";
  const size = Math.abs(link.slope);
  if (size >= 1) {
    const per = Math.round(size * 10) / 10;
    return `about ${per} ${direction} for every ${m.one} of ${m.name}`;
  }
  const span = Math.max(m.roundTo, Math.round(1 / size / m.roundTo) * m.roundTo);
  return span === 1
    ? `about one ${direction} for every ${m.one} of ${m.name}`
    : `about one ${direction} for every ${span} ${m.many} of ${m.name}`;
}

/** One link, as a sentence. Only ever called for a link the report kept (|r| ≥ LINK_LOOSE). */
export function linkSentence(label: string, link: FactorLink): string {
  const m = MEASURE[link.factor];
  const direction = link.slope < 0 ? "lower" : "higher";
  if (Math.abs(link.r) >= LINK_CLOSE) {
    return `${label} follows ${m.name} closely: ${pacePhrase(link)} (${clients(link.clients)}).`;
  }
  return `${label} loosely follows ${m.name}: ${m.more.toLowerCase()} tend to be set ${direction}, with plenty of exceptions (${clients(link.clients)}).`;
}

/**
 * Everything the report can say about what one setting follows. Always at
 * least one sentence — silence would read as "fine" when it means "unknown".
 */
export function linkSentences(label: string, field: FieldReport): string[] {
  if (!field.numeric) {
    return [`${label} is a choice, not a number, so it is not compared with height — see who uses which under By setting.`];
  }
  const out = field.links.map((l) => linkSentence(label, l));
  const height = field.tested.find((t) => t.factor === "height");
  const followsHeight = field.links.some((l) => l.factor === "height");
  if (!height) {
    out.push(`${label}: ${NOT_ENOUGH} to say whether it follows height (it takes ${LINK_MIN_CLIENTS} clients with a height on file, and more than one value in use).`);
  } else if (!followsHeight) {
    out.push(`${label} does not follow height on this machine (${clients(height.clients)}) — clients of the same height are set in different places, so height alone will not predict it.`);
  }
  return out;
}

/** Who is on a value: "avg 5'4" (5'2"–5'6") · 9 women, 3 men · avg 148 lb · avg 61 yr". */
export function bodyLine(stats: BodyStats): string {
  const parts: string[] = [];
  if (stats.avgHeightIn !== null && stats.minHeightIn !== null && stats.maxHeightIn !== null) {
    const avg = formatInches(Math.round(stats.avgHeightIn));
    parts.push(
      stats.minHeightIn === stats.maxHeightIn
        ? `all ${avg}`
        : `avg ${avg} (${formatInches(stats.minHeightIn)}–${formatInches(stats.maxHeightIn)})`,
    );
  } else {
    parts.push(`heights: ${NOT_ENOUGH}`);
  }
  const gender: string[] = [];
  if (stats.women > 0) gender.push(`${stats.women} ${stats.women === 1 ? "woman" : "women"}`);
  if (stats.men > 0) gender.push(`${stats.men} ${stats.men === 1 ? "man" : "men"}`);
  if (gender.length) parts.push(gender.join(", "));
  if (stats.avgWeightLb !== null) parts.push(`avg ${stats.avgWeightLb} lb`);
  if (stats.avgAgeYears !== null) parts.push(`avg ${stats.avgAgeYears} yr`);
  return parts.join(" · ");
}

/** The line under the machine's name. */
export function coverageSentence(report: Pick<KaizenReport, "onFile" | "clients" | "withHeight" | "studios">, scope: "studio" | "company"): string {
  if (report.onFile === 0) return scope === "studio" ? "Nobody at this studio is set up on this machine yet." : "Nobody is set up on this machine yet.";
  const where = scope === "company" ? ` across ${report.studios} ${report.studios === 1 ? "studio" : "studios"}` : "";
  const held = report.onFile - report.clients;
  const waiting =
    held > 0
      ? ` ${clients(held)} ${held === 1 ? "has" : "have"} only accepted suggestions so far, which do not count until they have trained on them.`
      : "";
  const noHeight = report.clients - report.withHeight;
  const heights = noHeight > 0 ? ` ${clients(noHeight)} ${noHeight === 1 ? "has" : "have"} no height on file and ${noHeight === 1 ? "is" : "are"} left out of anything by height.` : "";
  return `${clients(report.onFile)} set up${where}.${waiting}${heights}`;
}

/** The check, summed up. */
export function checkSentence(report: Pick<KaizenReport, "onFile" | "checked" | "unusual">): string {
  if (report.onFile === 0) return "";
  if (report.checked === 0) return `Nobody could be compared yet — it takes five similar clients to check one.`;
  const could = `${report.checked} of ${clients(report.onFile)} could be compared with similar clients`;
  if (report.unusual === 0) return `${could}; nobody is set somewhere unusual for their build.`;
  return `${could}; ${report.unusual} ${report.unusual === 1 ? "is" : "are"} set somewhere nobody similar is, and nobody has reviewed it yet.`;
}

export function studioSentence(name: string, s: StudioFitReport): string {
  if (s.clients === 0) return `${name}: nobody set up on this machine yet.`;
  if (s.checked === 0) return `${name}: ${clients(s.clients)} set up; none could be compared yet.`;
  const unusual =
    s.unusual === 0
      ? "none set somewhere unusual"
      : `${s.unusual} set somewhere nobody similar is`;
  return `${name}: ${clients(s.clients)} set up, ${s.checked} compared, ${unusual}.`;
}

export function habitSentence(
  habit: StudioHabit,
  show: { label: (key: string) => string; value: (key: string, value: string) => string },
): string {
  const label = show.label(habit.key);
  return (
    `${label}: mostly ${show.value(habit.key, habit.studioValue)} here (${habit.studioClients} of ${habit.studioOutOf}), ` +
    `mostly ${show.value(habit.key, habit.elsewhereValue)} at the other studios (${habit.elsewhereClients} of ${habit.elsewhereOutOf}). ` +
    `Worth a look: a different machine, a different habit, or the same thing written two ways.`
  );
}
