/**
 * RENEWALS — does this contract renew by itself? Decided in ONE place.
 *
 * AJ, Sep 25 2026, two messages:
 *   "just allow trainers to mark a check box on a profile if the client is on
 *    auto renewal", and
 *   "the corporate studios do not have auto renewal on but franchise studios
 *    do. Studios will have the ability to turn auto renewals off if they
 *    want, but it's default on."
 *
 * THE ORDER — the first that answers wins:
 *
 *   1. Nothing running or coming (paid in full, banked sessions, no
 *      package): no answer. Nothing bills, so nothing renews.
 *   2. Mindbody's own flag on the contract (`isAutoRenewing`, written only by
 *      the webhook). Mindbody owns contracts, so its word beats Journey's.
 *   3. A trainer's mark on the client's profile (`client.autoRenewMark`) FOR
 *      THIS CONTRACT. Auto-renew belongs to a contract, and a mark carried
 *      onto the next one would silently switch off that contract's "before
 *      the charge" warning — so a mark made on an earlier contract is shown,
 *      never used.
 *   4. The contract isn't matched to a package in Renewal settings: no
 *      answer. "Packages at {studio} renew" is a claim about the studio's OWN
 *      packages, and a confident wrong answer is worse than a missing one;
 *      the words stay "payments finish" until it is matched or marked.
 *   5. The package's own answer (`PackageTier.renewsAutomatically`).
 *   6. The studio's answer (`RenewalSettings.packagesRenewAutomatically`,
 *      My Studio → Studio → Renewals).
 *   7. The standard: ON (`STUDIO_AUTO_RENEW_DEFAULT`), for a studio that
 *      never answered. The screens say "the standard answer", never "the
 *      studio's answer", so a studio isn't credited with a choice it hasn't
 *      made.
 *
 * A malformed value (a string, a mark with no boolean) is skipped, never
 * trusted.
 *
 * WHO READS IT. The engine (engine.ts) decides it every night and in the
 * live Renewal card, and stores the decided answer, where it came from, and
 * the answer WITHOUT her mark on the snapshot. A single-client screen reads
 * `renewalOf(client)`, which re-decides from that snapshot with the mark and
 * Mindbody's flag as they are NOW — so a saved tick, or a webhook that
 * landed today, shows at once. renewalOf only ever turns a warning OFF: the
 * snapshot doesn't carry the studio's warning window, so a warning that a
 * change would turn ON waits for the night. The lists follow the nightly run.
 *
 * Pure: no React, no Firebase. The nightly job imports it through engine.ts.
 * auto-renew.test.ts.
 */

import type { AutoRenewMark, Client } from "../../types";
import type { AutoRenewAnswer, PackageTier, RenewalSettings, RenewalSnapshot } from "./types";

/**
 * What a studio that never answered reads as (AJ, Sep 25 2026: "it's
 * default on"). The one place the default lives.
 */
export const STUDIO_AUTO_RENEW_DEFAULT = true;

export interface AutoRenewInputs {
  /** The running (or coming) contract's id; null = nothing is running or coming. */
  contractId: string | null;
  /** That contract's `isAutoRenewing`, as Mindbody's webhook wrote it. */
  mindbody?: unknown;
  /** `client.autoRenewMark`. */
  mark?: AutoRenewMark | null;
  /** The contract (or the package she holds) is matched to a package in Renewal settings. */
  tierMatched: boolean;
  /** That package's `renewsAutomatically`. */
  pkg?: unknown;
  /** The studio's `packagesRenewAutomatically`. */
  studio?: unknown;
}

/** A mark a decision may use: well formed, and made on this contract. */
export function markFor(mark: unknown, contractId: string | null | undefined): mark is AutoRenewMark {
  if (!contractId || !mark || typeof mark !== "object") return false;
  const m = mark as Partial<AutoRenewMark>;
  return typeof m.renews === "boolean" && typeof m.contractId === "string" && m.contractId === contractId;
}

/** A well-formed mark, on any contract. */
export function isAutoRenewMark(mark: unknown): mark is AutoRenewMark {
  if (!mark || typeof mark !== "object") return false;
  const m = mark as Partial<AutoRenewMark>;
  return typeof m.renews === "boolean" && typeof m.contractId === "string" && m.contractId !== "";
}

/** Steps 5 to 7: a matched package's answer, else the studio's, else the standard. */
function standingAnswer(pkg: unknown, studio: unknown): AutoRenewAnswer {
  if (typeof pkg === "boolean") return { renews: pkg, from: "package" };
  if (typeof studio === "boolean") return { renews: studio, from: "studio" };
  return { renews: STUDIO_AUTO_RENEW_DEFAULT, from: "default" };
}

/** THE order. Null when there is no answer (see the header). */
export function decideAutoRenew(i: AutoRenewInputs): AutoRenewAnswer | null {
  if (!i.contractId) return null;
  if (typeof i.mindbody === "boolean") return { renews: i.mindbody, from: "mindbody" };
  if (markFor(i.mark, i.contractId)) return { renews: i.mark.renews, from: "client" };
  if (!i.tierMatched) return null;
  return standingAnswer(i.pkg, i.studio);
}

/**
 * Whether a package of this studio's table renews by itself: its own answer,
 * else the studio's, else the standard. The packages screen reads it, so a
 * prospect hears what a client on the package reads.
 */
export function packageRenews(
  tier: Pick<PackageTier, "renewsAutomatically">,
  settings: Pick<RenewalSettings, "packagesRenewAutomatically">,
): boolean {
  return standingAnswer(tier.renewsAutomatically, settings.packagesRenewAutomatically).renews;
}

function sameAnswer(a: AutoRenewAnswer | null | undefined, b: AutoRenewAnswer | null | undefined): boolean {
  if (!a || !b) return (a ?? null) === (b ?? null);
  return a.renews === b.renews && a.from === b.from;
}

/** Mindbody's flag on one contract as the client document holds it NOW; undefined when it hasn't said. */
export function liveMindbodyFlag(
  contracts: Client["mindbodyContracts"] | undefined,
  contractId: string,
): boolean | undefined {
  // The map key is the ClientContract id (lib/mindbody-commercial-map.ts
  // toMapKey), the same string the engine uses; the scan is a fallback for a
  // record keyed some other way.
  const c = (contracts?.[contractId] ??
    Object.values(contracts ?? {}).find((v) => v && String(v.clientContractId).trim() === contractId)) as
    | { isAutoRenewing?: unknown }
    | undefined;
  return typeof c?.isAutoRenewing === "boolean" ? c.isAutoRenewing : undefined;
}

export type RenewalOfClient = Partial<Pick<Client, "renewal" | "autoRenewMark" | "mindbodyContracts">>;

/**
 * THE accessor for a single client's renewal on screen: the stored snapshot,
 * with auto-renew re-decided from the mark and Mindbody's flag as they are
 * now. Returns the SAME object when nothing changed, and the stored snapshot
 * untouched when it predates this round (version 1), or isn't a monthly
 * contract. Only ever turns `chargeWarning` OFF (see the header).
 */
export function renewalOf(client: RenewalOfClient | null | undefined): RenewalSnapshot | null {
  const r = client?.renewal ?? null;
  if (!r) return null;
  if (!(typeof r.version === "number" && r.version >= 2) || r.paymentMode !== "monthly") return r;
  const contractId = r.clientContractId ?? null;
  const stored = r.autoRenewsInherited ?? null;
  const live = contractId ? liveMindbodyFlag(client?.mindbodyContracts, contractId) : undefined;
  const inputs: AutoRenewInputs = {
    contractId,
    mindbody: live ?? (stored?.from === "mindbody" ? stored.renews : undefined),
    tierMatched: stored !== null && stored.from !== "mindbody" && stored.from !== "client",
    pkg: stored?.from === "package" ? stored.renews : undefined,
    studio: stored?.from === "studio" ? stored.renews : undefined,
  };
  const inherited = decideAutoRenew({ ...inputs, mark: null });
  const decided = decideAutoRenew({ ...inputs, mark: client?.autoRenewMark ?? null });
  const autoRenews = decided?.renews ?? null;
  const from = decided?.from ?? null;
  if (r.autoRenews === autoRenews && (r.autoRenewsFrom ?? null) === from && sameAnswer(stored, inherited)) return r;
  return {
    ...r,
    autoRenews,
    autoRenewsFrom: from,
    autoRenewsInherited: inherited,
    // The engine's rule: never a "before the charge" warning on a contract
    // that won't renew. Turning one ON needs the studio's window: tonight.
    chargeWarning: decided?.renews === false ? false : r.chargeWarning,
  };
}

/**
 * The mark a tap on the profile's box stages. Tapping back to the SAVED
 * answer returns the saved mark itself, so the form is clean again; any
 * other tap is a new, stamped mark — even one that matches the inherited
 * answer, so "yes, she is on it" survives a studio later switching off.
 * Clearing the mark ("Use the studio's answer") is a separate action that
 * stages null.
 */
export function markAfterTap({
  want,
  saved,
  contractId,
  author,
  now,
}: {
  want: boolean;
  saved: AutoRenewMark | null | undefined;
  contractId: string;
  author: { id?: string | null; name?: string | null } | null | undefined;
  now: Date;
}): AutoRenewMark {
  if (markFor(saved, contractId) && saved.renews === want) return saved;
  return {
    renews: want,
    contractId,
    setAt: now.toISOString(),
    ...(author?.id ? { setById: author.id } : {}),
    ...(author?.name ? { setByName: author.name } : {}),
  };
}
