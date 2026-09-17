/**
 * MACHINE FIT — the sentences.
 *
 * "Sentences, not scores": every claim this feature makes is said in words a
 * trainer would use, names how many clients it rests on, and says so plainly
 * when there are too few. They live here, pure and tested, so the Setup
 * screen, the evidence sheet and the Operations report cannot drift apart.
 */

import { formatInches } from "../factors";
import { FACTOR_UNITS } from "../match-spec";
import type { ClusterSuggestion, Cohort, FitFlag, FitTier, MachineAudit, NoSuggestion, NumericFactor } from "../types";

const clients = (n: number) => `${n} ${n === 1 ? "client" : "clients"}`;

/** 5'6"–5'8", or 5'7" when the band is one height. */
export function heightBand(cohort: Pick<Cohort, "bands">): string | null {
  const band = cohort.bands.height;
  if (!band) return null;
  return band.lo === band.hi ? formatInches(band.lo) : `${formatInches(band.lo)}–${formatInches(band.hi)}`;
}

/** Who the comparison group is: "clients 5'6"–5'8" at this studio". */
export function cohortPhrase(cohort: Pick<Cohort, "bands" | "used">, tier: FitTier | null): string {
  const parts: string[] = [];
  const height = heightBand(cohort);
  const who = cohort.used.includes("gender") ? "clients of the same gender" : "clients";
  parts.push(height ? `${who} ${height}` : who);
  const extras: string[] = [];
  for (const f of ["wingspan", "weight", "age", "bodyFat", "muscle"] as NumericFactor[]) {
    const band = cohort.bands[f];
    if (!band) continue;
    const reach = (band.hi - band.lo) / 2;
    const names: Record<string, string> = { wingspan: "wingspan", weight: "weight", age: "age", bodyFat: "body fat", muscle: "muscle mass" };
    extras.push(`${names[f]} within ${reach} ${FACTOR_UNITS[f]}`);
  }
  if (extras.length) parts.push(`(${extras.join(", ")})`);
  parts.push(tier === "company" ? "across MSF" : "at this studio");
  return parts.join(" ");
}

/** "Wingspan is not on file for her, so it was left out." */
export function missingPhrase(cohort: Cohort): string | null {
  if (cohort.missing.length === 0) return null;
  const names: Record<string, string> = {
    height: "height",
    gender: "gender",
    wingspan: "wingspan",
    weight: "weight",
    age: "age",
    bodyFat: "InBody body fat",
    muscle: "InBody muscle mass",
  };
  const list = cohort.missing.map((m) => names[m]);
  const joined = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `No ${joined} on file for this client, so ${list.length === 1 ? "it was" : "they were"} left out of the match.`;
}

/** The line under a suggested set-up. */
export function suggestionSentence(s: ClusterSuggestion): string {
  if (s.picks.every((p) => p.universal)) {
    return `What nearly every client uses, whatever their build (${s.tier === "company" ? "across MSF" : "at this studio"}).`;
  }
  const who = cohortPhrase(s.cohort, s.tier);
  const banded = s.picks.filter((p) => !p.universal);
  const lead =
    banded.length > 1 && s.seenTogether >= 2
      ? `${s.seenTogether} of ${clients(s.cohort.clients)} use exactly this`
      : banded.length === 1
        ? `${banded[0].support} of ${banded[0].outOf} use this`
        : `Built from ${clients(s.cohort.clients)}`;
  const pinned =
    s.pinnedScope === "all"
      ? " Read across every height, from clients who share what you set."
      : s.pinnedScope === "band"
        ? " Read from the ones who share what you set."
        : "";
  return `${lead} — ${who}.${pinned}`;
}

/**
 * How the set-up was reasoned, in the order it was reasoned: "Gap 0 (11 of
 * 12), then Back Pad 3 among those (5 of 11), then Seat 7 among those (3 of
 * 5)". This is what explains a pick that is NOT the single most common value
 * in the band — it is the most common among the clients who share the rest.
 */
export function chainSentence(
  s: ClusterSuggestion,
  show: { label: (key: string) => string; value: (key: string, value: string) => string },
): string | null {
  const banded = s.picks.filter((p) => !p.universal);
  if (banded.length < 2) return null;
  const ordered = [...banded].sort((a, b) => Object.keys(a.given).length - Object.keys(b.given).length);
  const parts = ordered.map((p, i) => {
    // From the second step on, a pick with anything in `given` was read among
    // the clients who share the steps before it.
    const amongThose = i > 0 && Object.keys(p.given).length > 0;
    return `${show.label(p.key)} ${show.value(p.key, p.value)}${amongThose ? " among those" : ""} (${p.support} of ${p.outOf})`;
  });
  return `Worked out in order: ${parts.join(", then ")}.`;
}

/** Why nothing is offered. Never silence. */
export function noSuggestionSentence(n: NoSuggestion): string {
  if (n.reason === "unknown") return "What similar clients use could not be loaded just now.";
  if (n.reason === "no-height") return "Add a height to this client's record to see what similar clients use.";
  if (n.reason === "no-agreement") {
    const count = n.cohort?.clients ?? 0;
    return `${clients(count)} of a similar build are set up on this, but no two of them use the same value — nothing to suggest from.`;
  }
  if (n.reason === "thin") {
    const count = n.cohort?.clients ?? 0;
    return `Only ${clients(count)} of a similar build ${count === 1 ? "is" : "are"} set up on this so far — not enough to suggest from.`;
  }
  return "Nobody is set up on this machine yet, so there is nothing to suggest from.";
}

/** One flag, as a sentence. `label` and the shown values are in the machine's own spelling. */
export function flagSentence(
  flag: FitFlag,
  show: { label: (key: string) => string; value: (key: string, value: string) => string },
  cohort: Pick<Cohort, "bands" | "used"> | null,
  tier: FitTier | null,
): string {
  const who = cohort ? cohortPhrase(cohort, tier) : "similar clients";
  if (flag.kind === "combo") {
    const [a, b] = flag.keys;
    const [va, vb] = flag.values;
    return (
      `${show.label(a)} ${show.value(a, va)} with ${show.label(b)} ${show.value(b, vb)}: each is common, ` +
      `but none of the ${flag.outOf} ${who} use them together.`
    );
  }
  const top = flag.distribution.slice(0, 2).map((d) => `${show.value(flag.key, d.value)} (${d.clients})`);
  const usual = top.length ? ` Most use ${top.join(" or ")}.` : "";
  const mine =
    flag.clients === 0
      ? `none of the ${flag.outOf} ${who} use it`
      : `${flag.clients} of the ${flag.outOf} ${who} ${flag.clients === 1 ? "uses" : "use"} it`;
  return `${show.label(flag.key)} ${show.value(flag.key, flag.value)} — ${mine}.${usual}`;
}

/** The line at the top of Check mode. */
export function auditSummary(audits: readonly MachineAudit[], setUp: number, total: number): string {
  const checked = audits.filter((a) => a.state === "checked");
  const rare = checked.reduce((n, a) => n + a.flags.filter((f) => f.level === "rare").length, 0);
  const waiting = audits.filter((a) => a.state === "not-enough").length;
  const head = `${setUp} of ${total} machines set up`;
  if (audits.some((a) => a.state === "no-height") && checked.length === 0) {
    return `${head}. Add a height to this client's record to check the set-up against similar clients.`;
  }
  const verdict =
    rare === 0
      ? checked.length > 0
        ? "Nothing looks unusual for this build."
        : ""
      : `${rare} ${rare === 1 ? "setting is" : "settings are"} worth a look.`;
  const thin = waiting > 0 ? ` ${waiting} ${waiting === 1 ? "machine has" : "machines have"} too few similar clients to check yet.` : "";
  // Could not be READ is its own sentence: it is neither "fine" nor "too few".
  const unknown = audits.some((a) => a.state === "unknown") ? " What similar clients use could not be loaded just now, so not everything was checked." : "";
  return `${head}. ${verdict}${thin}${unknown}`.replace(/\s+/g, " ").trim();
}
