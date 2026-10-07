/**
 * RENEWALS — suggesting which package an unmatched Mindbody name is (the
 * renewals dashboard, Oct 7 2026). Pure; name-suggest.test.ts holds it to
 * the real names.
 *
 * Found on Strongsville's Renewals screen: 44 Mindbody names waiting to be
 * matched ("48 Sessions w/ Roll Over", "SV 6 Months/48 Sessions PIF", "SV 18
 * Months/144 Sessions PIF", "144 Sessions w/ Roll Over", …), so 130 clients
 * read "Missing Mindbody data". Matching each by hand in Renewal settings is
 * the slow part, so this reads the name and SUGGESTS: a leader confirms each
 * suggestion, or all of them at once, and nothing is matched until they do.
 *
 * THE RULES
 *   - The studio's own package table is the vocabulary: "48 sessions" is the
 *     package with 48 sessions, "6 months" the one with 6 months. When the
 *     two disagree, or more than one package fits, there is no suggestion.
 *   - "PIF", "prepay", "paid in full" say paid in full; "Roll Over" says the
 *     sessions roll over. Both are noted, and the name still belongs to the
 *     package (the engine tells paid in full from the option's count).
 *   - "Comp", "complimentary", "free", "won", "bonus", "gift", "referral",
 *     "prize": extra sessions (AJ, Oct 6 2026: won sessions are "added to
 *     mindbody" as pricing options). Only a pricing option: a contract is
 *     never extra sessions.
 *   - Anything unsure is no suggestion: an intro, a consultation, a drop-in,
 *     a single session, month-to-month, a name with no number.
 *   A wrong match would put the wrong price in a conversation, so a missing
 *   suggestion is always the safer answer.
 */

import { MAX_EXTRA_SESSION_NAMES, MAX_NAMES_PER_PACKAGE, buildPackageNameIndex, normalizeMindbodyName } from "./settings";
import type { PackageTier, RenewalNamesSeen, RenewalSettings } from "./types";

export type NameSuggestion =
  | {
      kind: "package";
      packageKey: string;
      /** The package's label, for the row. */
      label: string;
      paidInFull: boolean;
      rollOver: boolean;
    }
  | { kind: "extra" };

const EXTRA = /\b(?:comp|comped|complimentary|free|won|winner|prize|bonus|gift(?:ed)?|referral)\b/;
const UNSURE = /\b(?:intro(?:ductory)?|consult(?:ation)?|assessment|evaluation|drop[\s-]?in|single|guest|gift\s*card|month[\s-]*to[\s-]*month|m2m|unlimited)\b/;
const PIF = /\bpif\b|paid[\s-]*in[\s-]*full|\bprepa(?:id|y)\b/;
const ROLL_OVER = /\broll[\s-]*overs?\b|\brollover\b/;
const SESSIONS = /\b(\d{1,3})\s*(?:sessions?|sess\b|pif\b|prepa(?:id|y)\b)/g;
const MONTHS = /\b(\d{1,2})\s*(?:months?|mos?|mths?)\b/g;

function numbers(re: RegExp, text: string): number[] {
  return Array.from(new Set(Array.from(text.matchAll(re), (m) => Number(m[1])).filter((n) => n > 0)));
}

/**
 * Which package (or extra sessions) a Mindbody name most likely is, from the
 * studio's own table; null when unsure.
 */
export function suggestName(
  name: string,
  settings: Pick<RenewalSettings, "packages">,
  kind: "contract" | "pricing-option" = "pricing-option",
): NameSuggestion | null {
  // Slashes and dashes split "6 Months/48 Sessions"; normalise the rest as the index does.
  const text = normalizeMindbodyName(name).replace(/[/_|]+/g, " ");
  if (!text) return null;
  if (UNSURE.test(text)) return null;
  if (EXTRA.test(text)) return kind === "pricing-option" ? { kind: "extra" } : null;

  const sessions = numbers(SESSIONS, text);
  const months = numbers(MONTHS, text);
  if (sessions.length > 1 || months.length > 1) return null;
  if (sessions.length === 0 && months.length === 0) return null;
  const fits = (t: PackageTier) =>
    (sessions.length === 0 || t.sessions === sessions[0]) && (months.length === 0 || t.months === months[0]);
  const matches = settings.packages.filter(fits);
  if (matches.length !== 1) return null;
  const tier = matches[0];
  return {
    kind: "package",
    packageKey: tier.key,
    label: tier.label,
    paidInFull: PIF.test(text),
    rollOver: ROLL_OVER.test(text),
  };
}

/** "The Trial · paid in full", "Life Transformed · sessions roll over", "Extra sessions (complimentary or won)". */
export function suggestionWords(s: NameSuggestion): string {
  if (s.kind === "extra") return "Extra sessions (complimentary or won)";
  return [s.label, s.paidInFull ? "paid in full" : null, s.rollOver ? "sessions roll over" : null]
    .filter(Boolean)
    .join(" · ");
}

/** Where a suggestion goes in the settings form (`settings-form.ts` assignNameInForm's target). */
export function suggestionTarget(s: NameSuggestion): string {
  return s.kind === "extra" ? "__extra__" : s.packageKey;
}

export interface WaitingName {
  /** As Mindbody spells it. */
  name: string;
  kind: "contract" | "pricing-option";
  /** Clients holding it at the last nightly run. */
  clients: number;
  /** Null when the name is too unsure to suggest. */
  suggestion: NameSuggestion | null;
}

/**
 * The names the nightly job met at the studio (config/renewalsSeen) that no
 * package or extra-sessions name matches yet, most clients first, each with
 * its suggestion. A contract name that a package's pricing options already
 * identify is still listed: matching it costs nothing and quietens the
 * "contract isn't matched" gap.
 */
export function waitingNames(seen: Pick<RenewalNamesSeen, "names"> | null | undefined, settings: RenewalSettings): WaitingName[] {
  const index = buildPackageNameIndex(settings);
  const out: WaitingName[] = [];
  const met = new Set<string>();
  for (const entry of Object.values(seen?.names ?? {})) {
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    const key = normalizeMindbodyName(name);
    if (!key || met.has(key)) continue;
    met.add(key);
    if (index.tierFor(name) || index.isExtraSessions(name)) continue;
    const kind = entry.kind === "contract" ? "contract" : "pricing-option";
    out.push({
      name,
      kind,
      clients: typeof entry.clients === "number" && entry.clients > 0 ? entry.clients : 0,
      suggestion: suggestName(name, settings, kind),
    });
  }
  return out.sort((a, b) => b.clients - a.clients || a.name.localeCompare(b.name));
}

/** "44 names waiting · Review suggestions": the one line on the pipeline. Null with none waiting. */
export function waitingLine(waiting: readonly WaitingName[]): string | null {
  if (waiting.length === 0) return null;
  return `${waiting.length} name${waiting.length === 1 ? "" : "s"} waiting`;
}

/**
 * The settings patch that matches the accepted names: each name added to its
 * package's Mindbody names, or to the extra-sessions names. Only the two
 * fields it changes, for `saveRenewalSettings` (leaders only, as today).
 * `skipped` names did not fit (the list is full, or the package is gone),
 * so a screen can say so instead of dropping them.
 */
export function withAcceptedNames(
  settings: RenewalSettings,
  accepted: ReadonlyArray<{ name: string; suggestion: NameSuggestion }>,
): { patch: Pick<RenewalSettings, "packages" | "extraSessionNames">; added: string[]; skipped: string[] } {
  const packages = settings.packages.map((p) => ({ ...p, mindbodyNames: [...p.mindbodyNames] }));
  const extra = [...settings.extraSessionNames];
  const taken = new Set<string>([
    ...packages.flatMap((p) => p.mindbodyNames.map(normalizeMindbodyName)),
    ...extra.map(normalizeMindbodyName),
  ]);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const { name, suggestion } of accepted) {
    const shown = name.replace(/\s+/g, " ").trim().slice(0, 80);
    const key = normalizeMindbodyName(shown);
    if (!key || taken.has(key)) continue;
    if (suggestion.kind === "extra") {
      if (extra.length >= MAX_EXTRA_SESSION_NAMES) {
        skipped.push(shown);
        continue;
      }
      extra.push(shown);
    } else {
      const tier = packages.find((p) => p.key === suggestion.packageKey);
      if (!tier || tier.mindbodyNames.length >= MAX_NAMES_PER_PACKAGE) {
        skipped.push(shown);
        continue;
      }
      tier.mindbodyNames.push(shown);
    }
    taken.add(key);
    added.push(shown);
  }
  return { patch: { packages, extraSessionNames: extra }, added, skipped };
}
