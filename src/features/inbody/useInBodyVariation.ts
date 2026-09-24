/**
 * A client's InBody variation, from the studios the app already holds.
 *
 * No read: every studio document streams into ActiveStudioContext at start-up
 * (`useStudios`), so this is a lookup. While the studios have not arrived, or
 * for a studio the app cannot see, the answer is Max Strength's defaults —
 * the cautious numbers, never "no threshold".
 *
 * Both hooks take the CLIENT, never a studio id: the answer is always the
 * client's HOME studio's numbers (`variationStudioIdOf`), never the studio
 * the iPad is in, so a client reads the same way wherever her profile is
 * opened. The pure half, and why, is variation.ts.
 */

import { useCallback, useMemo } from "react";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import {
  inbodyVariationOf,
  variationForClient,
  variationStudioIdOf,
  type ClientStudioIds,
  type InBodyVariation,
} from "./variation";

export function useInBodyVariation(client: ClientStudioIds | null | undefined): InBodyVariation {
  // `studios` may be missing where a test stands in for the context.
  const { studios } = useActiveStudio();
  const studioId = variationStudioIdOf(client);
  const studio = studioId ? (studios ?? []).find((s) => s.id === studioId) ?? null : null;
  const stored = studio?.inbodyVariation;
  return useMemo(() => inbodyVariationOf({ inbodyVariation: stored }), [stored]);
}

/** For a list of clients from possibly different studios (the renewals pipeline). */
export function useInBodyVariationLookup(): (client: ClientStudioIds | null | undefined) => InBodyVariation {
  const { studios } = useActiveStudio();
  return useCallback((client: ClientStudioIds | null | undefined) => variationForClient(studios, client), [studios]);
}
