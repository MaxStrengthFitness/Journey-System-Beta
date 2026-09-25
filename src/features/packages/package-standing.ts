/**
 * PACKAGES — should the post-session screen offer the packages, and what may
 * it honestly say about this client's package?
 *
 * AJ, Sep 24 2026: packages are not decided in the consultation, so a trainer
 * whose client has no package should see the package information on the
 * post-session screen. The hard part is "has no package" during the
 * migration: most long-standing clients have little in Journey, a package on
 * the other Mindbody site reads as nothing, and last night's snapshot is a
 * day old. So there are five answers, and only one of them says "no package":
 *
 *   has      a package is on file: live in the client's Mindbody records
 *            (a contract running or about to start, package sessions on
 *            hand) or in the snapshot. No door; the Renewal conversation
 *            button is the tool for these.
 *   away     on a Vacation / Snowbird / Medical pause. No door.
 *   ended    Journey knows the package and that it ended. A door, worded
 *            from the snapshot ("Committed ended Aug 3"), never "no package".
 *   none     Mindbody was checked and shows no package: no contract, current,
 *            coming or ended, no package sessions, no name the studio hasn't
 *            matched, on the site the studio reads. The only answer that says
 *            so, and it says when it was checked.
 *   unknown  anything else: never checked, not checked for sessions, a name
 *            not matched to a package yet, the other Mindbody site, the
 *            package table not loaded, a temporary profile. A door with the
 *            reason, never "new" and never "no package".
 *
 * `pricesOnScreen` is true only when the post-session card may show prices
 * itself: a client Mindbody shows with no package AND whose whole story
 * Journey holds (coverage complete), or a temporary profile. Everyone else
 * gets the door, and the prices wait inside the sheet, where the trainer
 * chooses to open them. A long-standing client is never shown a price list
 * on the celebration screen because a record looks empty.
 *
 * Pure: the engine's own pickContracts / sessionBalance do the Mindbody
 * reading, so this can never disagree with the nightly job about what a
 * contract or a package pricing option is.
 */

import { pickContracts, sessionBalance } from "../renewals/engine";
import { buildPackageNameIndex, DEFAULT_RENEWAL_SETTINGS } from "../renewals/settings";
import { dayLabel } from "../renewals/sentences";
import type { RenewalSettings } from "../renewals/types";
import type { Client } from "../../types";
import type { HistoryCoverage } from "../../lib/prior-history";
import { studioDayKeyOf } from "../../lib/studio-time";

export type StandingKind = "has" | "away" | "ended" | "none" | "unknown";

export interface PackageStanding {
  kind: StandingKind;
  /** Whether the post-session screen offers the packages at all. */
  showDoor: boolean;
  /** The one line under the door's heading. Null when there is nothing to say. */
  sentence: string | null;
  /** Whether the post-session card may show prices itself (see the header). */
  pricesOnScreen: boolean;
}

export interface StandingInput {
  client: Pick<
    Client,
    | "renewal"
    | "mindbodyContracts"
    | "mindbodyServices"
    | "mindbodyServicesSyncedAt"
    | "mindbodyCommercialSyncedAt"
    | "mindbodySiteId"
    | "provisional"
  >;
  /** "Judy": clientFirstName(client), the nickname rule. */
  firstName: string;
  /** The studio's day, "2026-09-24" (studioTodayKey()). */
  today: string;
  /**
   * The client's home studio's package table, for matching Mindbody names.
   * Null while it loads or when it could not be read: the answer is then
   * never "none", because a name may be a package the table would know.
   */
  settings: RenewalSettings | null;
  /** How much of the client's story Journey holds (lib/client-coverage.ts). */
  coverage: HistoryCoverage;
  /** The Mindbody site of the studio whose table is read, when known. */
  studioSiteId?: string | number | null;
  /** The studio's name, for "isn't matched to one of Westlake's packages". */
  studioName?: string | null;
}

const NO_DOOR = (kind: "has" | "away"): PackageStanding => ({
  kind,
  showDoor: false,
  sentence: null,
  pricesOnScreen: false,
});

const unknown = (sentence: string): PackageStanding => ({
  kind: "unknown",
  showDoor: true,
  sentence,
  pricesOnScreen: false,
});

export function packageStanding(input: StandingInput): PackageStanding {
  const { client, firstName, today, settings, coverage } = input;
  const name = firstName || "this client";
  const snap = client.renewal ?? null;

  if (snap?.situation === "away") return NO_DOOR("away");
  // The Renewal conversation button already stands in this slot.
  if (snap?.cycleKey) return NO_DOOR("has");

  // Contracts: whether one is running or coming does not depend on names.
  const index = buildPackageNameIndex(settings ?? DEFAULT_RENEWAL_SETTINGS);
  const contracts = pickContracts(client.mindbodyContracts, today, index);
  if (contracts.current || contracts.upcoming) return NO_DOOR("has");
  if (snap?.paymentMode || snap?.renewalOnBooks) return NO_DOOR("has");

  if (snap && (snap.situation === "ended" || snap.situation === "lapsed")) {
    const when = dayLabel(snap.focusDate, today);
    const label = snap.packageLabel?.split(" · ")[0] ?? null;
    const sentence =
      snap.situation === "ended"
        ? `${label ? `${label} ended` : "Their package ended"}${when ? ` ${when}` : ""}.`
        : `No package since ${when || "their last one ended"}.`;
    return { kind: "ended", showDoor: true, sentence, pricesOnScreen: false };
  }

  if (client.provisional) {
    return {
      kind: "unknown",
      showDoor: true,
      sentence: `A temporary profile: Mindbody has no account for ${name} yet.`,
      pricesOnScreen: true,
    };
  }

  const theirSite = client.mindbodySiteId == null ? "" : String(client.mindbodySiteId).trim();
  const ourSite = input.studioSiteId == null ? "" : String(input.studioSiteId).trim();
  if (theirSite && ourSite && theirSite !== ourSite) {
    return unknown(`${name}'s Mindbody account is on the other Mindbody site, so Journey can't see a package here.`);
  }

  const servicesSynced = Boolean(client.mindbodyServicesSyncedAt);
  const commercialSynced = Boolean(client.mindbodyCommercialSyncedAt);
  if (!servicesSynced && !commercialSynced) {
    return unknown(`Journey hasn't checked Mindbody for ${name}'s package yet.`);
  }
  if (!servicesSynced) {
    return unknown(`Mindbody's session balance for ${name} hasn't come through yet.`);
  }
  if (!settings) {
    return unknown(`Journey couldn't check ${name}'s package just now.`);
  }

  const balance = sessionBalance(client.mindbodyServices, index, today);
  if (balance.packageOnHand > 0) return NO_DOOR("has");
  if (balance.unmatched.length > 0) {
    const where = input.studioName ? `one of ${input.studioName}'s packages` : "a package";
    return unknown(`Mindbody shows “${balance.unmatched[0].name}” for ${name}, which isn't matched to ${where} yet.`);
  }
  if (contracts.lastEnded || balance.packageService || !commercialSynced) {
    // Something package-shaped is on record, or contracts were never read.
    return unknown(`Journey can't tell yet whether ${name} has a package.`);
  }

  const checked = studioDayKeyOf(client.mindbodyServicesSyncedAt as Parameters<typeof studioDayKeyOf>[0]);
  const on = checked ? dayLabel(checked, today) : "";
  return {
    kind: "none",
    showDoor: true,
    sentence: on
      ? `Mindbody showed no package for ${name} when it was last checked, ${on}.`
      : `Mindbody shows no package for ${name}.`,
    pricesOnScreen: coverage === "complete",
  };
}
