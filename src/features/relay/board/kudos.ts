/**
 * KUDOS — one tap of thanks on something a teammate closed.
 *
 * Round: Relay, Sep 2026. Recognition without a scoreboard: a `kudos` map
 * ({ [uid]: true }) on the closed document — a task instance, a team job, a
 * request — so a person can thank once and the count is the map's size.
 * Received kudos roll up per person on My Studio → Team for the last seven
 * days (from the task rows Team already reads for the seven-day table, the
 * jobs and the answered asks); they are shown to leaders and to the person,
 * never ranked against peers.
 *
 * Voice review follow-up, Sep 27 2026: an ask's kudos go to whoever answered
 * it, so Team passes the ANSWERED asks (useStudioRequests' recentlyResolved)
 * — it used to pass the open ones, which have nobody to credit, so thanks
 * for an answered ask never reached anyone's card. And `since` holds every
 * source to the seven days the card says.
 *
 * The one tap also rings the recipient's bell (kind "kudos"), which is the
 * only notification here — and it is the good kind.
 */
import { deleteField, updateDoc } from "firebase/firestore";
import { studioDateKey, type DateLike } from "../../../lib/studio-time";
import { notify } from "../../notifications";
import { instanceRef, type TaskAuthor } from "../../studio-tasks/mutations";
import { requestDocRef, type TaskRequest } from "../../studio-tasks/requests";
import type { TaskInstance } from "../../studio-tasks/types";
import { teamJobRef } from "../jobs/mutations";
import type { TeamJob } from "../jobs/types";

export type KudosTarget = { kind: "instance"; id: string } | { kind: "job"; id: string } | { kind: "request"; id: string };

export function kudosCount(kudos: Record<string, true> | undefined): number {
  return kudos ? Object.keys(kudos).length : 0;
}

export function hasKudosFrom(kudos: Record<string, true> | undefined, uid: string | null): boolean {
  return Boolean(uid && kudos && kudos[uid]);
}

export async function toggleKudos(params: {
  studioId: string;
  target: KudosTarget;
  from: TaskAuthor;
  /** Whose work it was, to ring their bell on a new kudos. */
  to: TaskAuthor | null;
  on: boolean;
  what: string;
}): Promise<void> {
  const { studioId, target, from, to, on, what } = params;
  const ref =
    target.kind === "instance" ? instanceRef(studioId, target.id) : target.kind === "job" ? teamJobRef(studioId, target.id) : requestDocRef(studioId, target.id);
  await updateDoc(ref, { [`kudos.${from.id}`]: on ? true : deleteField() });
  if (on && to && to.id !== from.id) {
    await notify({
      to: to.id,
      actor: from,
      kind: "kudos",
      title: `${from.name.split(" ")[0]} sent kudos: ${what}`.slice(0, 200),
      studioId,
      link: { view: "studio-tasks", id: "mine" },
    });
  }
}

/**
 * Kudos received per person across the documents given.
 *
 * With `since` (a studio day, "YYYY-MM-DD"), only work closed on or after
 * that day counts: a task row by its day, a job by the day it was closed, an
 * ask by the day it was answered. Something with no day to go by is left
 * out rather than guessed into the window.
 */
export function kudosReceived(input: {
  instances: TaskInstance[];
  jobs: TeamJob[];
  requests: TaskRequest[];
  since?: string;
}): Map<string, number> {
  const { since } = input;
  const inWindow = (day: string | null | undefined) => !since || Boolean(day && day >= since);
  const out = new Map<string, number>();
  const add = (who: { id: string } | null | undefined, kudos: Record<string, true> | undefined) => {
    if (!who || !kudos) return;
    const n = kudosCount(kudos);
    if (n) out.set(who.id, (out.get(who.id) ?? 0) + n);
  };
  for (const i of input.instances) {
    if (inWindow(i.localDate)) add(i.completedBy, (i as { kudos?: Record<string, true> }).kudos);
  }
  for (const j of input.jobs) {
    if (inWindow(j.closedOn ?? dayOf(j.completedAt))) add(j.completedBy, j.kudos);
  }
  for (const r of input.requests) {
    if (inWindow(dayOf(r.resolvedAt))) add(r.resolvedBy, r.kudos);
  }
  return out;
}

const dayOf = (v: unknown): string | null => (v ? studioDateKey(v as DateLike) : null);
