/**
 * WHAT A STUDIO'S CHECKLIST IS BUILT FROM — its stored items and its floor,
 * read once for each studio asked about, and again when `refreshKey` moves
 * (Check again, or after a change on the page). No listener. A read that
 * failed is "failed", which the screens say as "couldn't check", never as
 * nothing done.
 */
import { useEffect, useState } from "react";
import type { RosterRead, SetupItemDoc } from "./checklist";
import { fetchFloorCount, fetchSetupItems } from "./setup-store";

export type ItemsRead = { state: "loading" } | { state: "ok"; docs: Record<string, SetupItemDoc> } | { state: "failed" };

export interface SetupData {
  items: ItemsRead;
  roster: RosterRead;
}

export const LOADING_SETUP: SetupData = { items: { state: "loading" }, roster: { state: "loading" } };

export function useSetupData(studioIds: readonly string[], refreshKey: unknown): Record<string, SetupData> {
  const [data, setData] = useState<Record<string, SetupData>>({});
  const key = [...studioIds].sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    // Keep what was read while it is read again, so a Check again doesn't blank the page.
    setData((prev) => Object.fromEntries(ids.map((id) => [id, prev[id] ?? LOADING_SETUP])));
    for (const id of ids) {
      fetchSetupItems(id).then(
        (docs) => !cancelled && setData((d) => ({ ...d, [id]: { ...(d[id] ?? LOADING_SETUP), items: { state: "ok", docs } } })),
        () => !cancelled && setData((d) => ({ ...d, [id]: { ...(d[id] ?? LOADING_SETUP), items: { state: "failed" } } })),
      );
      fetchFloorCount(id).then(
        (onFloor) => !cancelled && setData((d) => ({ ...d, [id]: { ...(d[id] ?? LOADING_SETUP), roster: { state: "ok", onFloor } } })),
        () => !cancelled && setData((d) => ({ ...d, [id]: { ...(d[id] ?? LOADING_SETUP), roster: { state: "failed" } } })),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [key, refreshKey]);

  return data;
}
