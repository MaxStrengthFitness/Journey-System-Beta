import { useMemo } from "react";
import { useActiveStudio } from "../contexts/ActiveStudioContext";
import { coverageOfClient, homeCutoverOf, type CoverageClient } from "../lib/client-coverage";
import type { HistoryCoverage } from "../lib/prior-history";

/**
 * How much of a client's story Journey holds, for a container that sits
 * inside the studio context (lib/client-coverage.ts is the rule).
 *
 * The cutover is the client's HOME studio's, never the iPad's: where her
 * history lives depends on when HER studio moved onto Journey. A studio list
 * that has not loaded - or a test context without one - reads as unknown,
 * which is the cautious wording.
 *
 * Returns the cutover too, for a screen that needs the day itself (the
 * History tab's breaks: lib/history-claims.ts `ownedWindow`).
 */
export function useClientCoverage(
  client: (CoverageClient & { homeStudioId?: string | null; studioId?: string | null }) | null | undefined,
): { coverage: HistoryCoverage; cutover: string | null } {
  const { studios } = useActiveStudio();
  const cutover = homeCutoverOf(studios, client);
  const coverage = useMemo(() => coverageOfClient(client, cutover), [client, cutover]);
  return { coverage, cutover };
}
