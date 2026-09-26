/**
 * PACKAGES — whether a studio's prices may be shown yet, in one place, for
 * the post-session card and the sheet alike.
 *
 * useRenewalSettings answers a refused or failed read by KEEPING the
 * defaults and setting an error, and for one render after a studio switch it
 * still holds the previous studio's table. Prices vary by location
 * (docs/business/packages-and-pricing.md), so either of those shown as this
 * studio's prices would be a confident wrong number. The order here is the
 * order every price-drawing screen checks: no studio, failed, loading (or
 * the table is another studio's), ready.
 */

import type { RenewalSettingsState } from "../renewals/useRenewalSettings";
import type { RenewalSettings } from "../renewals/types";

export type PricesState =
  | { status: "no-studio" }
  | { status: "failed" }
  | { status: "loading" }
  | {
      status: "ready";
      settings: RenewalSettings;
      /** False: Max Strength's standard prices, because the studio has not saved its own table. */
      ownTable: boolean;
    };

export function pricesState(
  studioId: string | null | undefined,
  hook: Pick<RenewalSettingsState, "settings" | "ownPackageTable" | "forStudioId" | "loading" | "error">,
): PricesState {
  if (!studioId) return { status: "no-studio" };
  if (hook.forStudioId === studioId && hook.error) return { status: "failed" };
  if (hook.loading || hook.forStudioId !== studioId) return { status: "loading" };
  return { status: "ready", settings: hook.settings, ownTable: hook.ownPackageTable };
}
