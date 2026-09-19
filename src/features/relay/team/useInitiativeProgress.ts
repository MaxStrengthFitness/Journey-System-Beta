import { useEffect, useMemo, useState } from "react";
import { watchSubmissions } from "../../studio-tasks/playbook-mutations";
import {
  initiativeProgress,
  type InitiativeSubmission,
  type InitiativeTarget,
} from "../../studio-tasks/initiatives";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { InitiativeLike } from "./accountability";

/**
 * Progress on every open initiative, for the Team tab.
 *
 * One listener per open initiative — the same subscription the roll-up card
 * uses — and a studio runs one or two at a time, so this is a handful of
 * reads, never a loop over clients.
 */
export function useInitiativeProgress(
  studioId: string | null,
  requests: TaskRequest[],
  roster: { id: string; name: string }[],
): InitiativeLike[] {
  const initiatives = useMemo(
    () => requests.filter((r) => r.kind === "initiative" && r.status === "open"),
    [requests],
  );
  const key = initiatives.map((r) => r.id).join(",");
  const [subs, setSubs] = useState<Record<string, InitiativeSubmission[]>>({});

  useEffect(() => {
    if (!studioId || !key) {
      setSubs({});
      return;
    }
    const offs = key.split(",").map((id) =>
      watchSubmissions(studioId, id, (list) => setSubs((prev) => ({ ...prev, [id]: list }))),
    );
    return () => offs.forEach((off) => off());
  }, [studioId, key]);

  return useMemo(
    () =>
      initiatives.map((r) => {
        const target = (r as { target?: InitiativeTarget }).target;
        return {
          id: r.id,
          title: r.title,
          dueOn: target?.dueOn,
          progress: initiativeProgress(subs[r.id] ?? [], roster, target),
        };
      }),
    [initiatives, subs, roster],
  );
}
