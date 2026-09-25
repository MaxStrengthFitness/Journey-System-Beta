/**
 * PACKAGES — what the post-session screen's packages card shows, worked out
 * in one place so the screen only draws it.
 *
 * Whose table: the client's home studio (the studio the package would be
 * bought at, the table the nightly job prices them against), falling back to
 * where the session was hosted when the record has no home studio. Its name
 * and Mindbody site come from the app's studio list, never guessed; without
 * a provider (a test mounting the screen alone) the card simply says
 * "Packages".
 *
 * The screen mounts the card only when `packageStanding` without the table
 * already says a door is possible, so a client with a package on file never
 * costs a read of the table.
 */

import { useMemo } from "react";
import { useOptionalActiveStudio } from "../../contexts/ActiveStudioContext";
import { useRenewalSettings } from "../renewals/useRenewalSettings";
import { recordStudioIdOf } from "../client-codex/access";
import { clientFirstName } from "../../lib/client-name";
import type { HistoryCoverage } from "../../lib/prior-history";
import type { Client } from "../../types";
import { doorRows, type DoorRow } from "./package-copy";
import { lineup } from "./package-table";
import { packageStanding, type PackageStanding } from "./package-standing";
import { pricesState, type PricesState } from "./prices-state";

export interface PackagesDoor {
  standing: PackageStanding;
  studioId: string | null;
  studioName: string | null;
  prices: PricesState;
  /** The lengths in one line each, only when prices may be on this screen and are loaded. */
  rows: DoorRow[] | null;
}

/** The studio whose package table the card and the sheet read. */
export function doorStudioId(
  client: Parameters<typeof recordStudioIdOf>[0],
  hostedAtStudioId: string | null | undefined,
): string | null {
  return recordStudioIdOf(client) ?? (hostedAtStudioId ? hostedAtStudioId : null);
}

export function usePackagesDoor(args: {
  client: Client;
  hostedAtStudioId: string | null | undefined;
  coverage: HistoryCoverage;
  today: string;
}): PackagesDoor {
  const { client, hostedAtStudioId, coverage, today } = args;
  const studioCtx = useOptionalActiveStudio();
  const studioId = doorStudioId(client, hostedAtStudioId);
  const studio = studioId ? studioCtx?.studios?.find((s) => s.id === studioId) ?? null : null;
  const studioName = studio?.name?.trim() ? studio.name.trim() : null;
  const hook = useRenewalSettings(studioId);
  const prices = pricesState(studioId, hook);
  const settings = prices.status === "ready" ? prices.settings : null;

  const standing = useMemo(
    () =>
      packageStanding({
        client,
        firstName: clientFirstName(client),
        today,
        settings,
        coverage,
        studioSiteId: (studio as { mindbodySiteId?: string | number | null } | null)?.mindbodySiteId ?? null,
        studioName,
      }),
    [client, today, settings, coverage, studio, studioName],
  );

  const rows = standing.pricesOnScreen && settings ? doorRows(lineup(settings).headline) : null;
  return { standing, studioId, studioName, prices, rows };
}
