/**
 * How many active clients each studio has — the count All locations showed,
 * kept for All studios (Admins room, Sep 28 2026).
 *
 * A server-side count per studio (lib/studio-client-count.ts: indexed on
 * clients homeStudioId + isActive, cached five minutes), never the roster
 * the app holds, which is the ACTIVE studio's only. `undefined` while
 * counting, `null` when the count could not be had — said as unknown,
 * never as zero.
 */
import { useEffect, useState } from "react";
import type { Studio } from "../../../types";
import { getStudioClientCounts } from "../../../lib/studio-client-count";

export function useStudioClientCounts(studios: readonly Studio[]): Record<string, number | null> {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const key = studios
    .map((s) => s.id)
    .filter(Boolean)
    .sort()
    .join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;
    void getStudioClientCounts(ids).then((next) => {
      if (!cancelled) setCounts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return counts;
}

/** "312 active clients", "counting…", or "active clients unknown". */
export function clientsLine(count: number | null | undefined): string {
  if (count === undefined) return "Counting active clients…";
  if (count === null) return "Active clients unknown";
  return `${count} active ${count === 1 ? "client" : "clients"}`;
}
