/**
 * THE PULSE — what teammates did, drawn from writes the app already makes.
 *
 * Round: Relay, Sep 2026. Recognition without notification: nobody's phone
 * buzzes, but anyone who opens Relay sees the studio moving. "Marina wiped 6
 * machines · Austin closed a help ask". The events come from documents the
 * Floor already listens to (today's task instances, team jobs, requests), so
 * the ticker costs no read of its own.
 *
 * The Now Bar lives in the shell and the Floor's hooks live in the Floor, so
 * the Floor PUBLISHES its events into a module-level store and the ticker
 * subscribes. When the Floor isn't mounted the ticker shows what it last
 * heard — the Pulse is "the last few hours", and a minute of staleness on
 * the Notes tab is nothing.
 */
import { useSyncExternalStore } from "react";
import type { TaskRequest } from "../../studio-tasks/requests";
import type { TaskRow } from "../../studio-tasks/types";
import type { TeamJob } from "../jobs/types";
import type { KudosTarget } from "./kudos";

export interface PulseEvent {
  id: string;
  /** ms since epoch; events sort newest first. */
  at: number;
  whoId: string | null;
  who: string;
  what: string;
  /** The document a kudos lands on, and the thanks already on it. */
  target: KudosTarget | null;
  kudos: Record<string, true> | undefined;
}

export const PULSE_MAX = 20;
const PULSE_WINDOW_MS = 8 * 60 * 60 * 1000;

function millisOf(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const anyV = v as { toMillis?: () => number; seconds?: number };
  if (typeof anyV.toMillis === "function") return anyV.toMillis();
  if (typeof anyV.seconds === "number") return anyV.seconds * 1000;
  return null;
}

function firstName(name: string): string {
  return name.trim().split(" ")[0] || name;
}

/**
 * Today's completions folded per person and template: nineteen machine
 * wipes by one person are one line, "wiped down 19 machines".
 */
export function pulseEvents(input: {
  rows: TaskRow[];
  jobs: TeamJob[];
  requests: TaskRequest[];
  now: number;
}): PulseEvent[] {
  const since = input.now - PULSE_WINDOW_MS;
  const out: PulseEvent[] = [];

  const groups = new Map<string, { who: string; whoId: string; title: string; count: number; at: number; instanceId: string; kudos: Record<string, true> | undefined }>();
  for (const r of input.rows) {
    const inst = r.instance;
    if (!inst || inst.status !== "done" || !inst.completedBy) continue;
    const at = millisOf(inst.completedAt);
    if (!at || at < since) continue;
    const key = `${inst.completedBy.id}|${r.templateId}`;
    const g = groups.get(key);
    if (g) {
      g.count += 1;
      if (at > g.at) {
        g.at = at;
        g.instanceId = inst.id;
        g.kudos = inst.kudos;
      }
    } else {
      groups.set(key, { who: inst.completedBy.name, whoId: inst.completedBy.id, title: r.title, count: 1, at, instanceId: inst.id, kudos: inst.kudos });
    }
  }
  for (const [key, g] of groups) {
    out.push({
      id: `task:${key}`,
      at: g.at,
      whoId: g.whoId,
      who: firstName(g.who),
      what: g.count > 1 ? `${g.title.toLowerCase()} × ${g.count}` : g.title.toLowerCase(),
      target: { kind: "instance", id: g.instanceId },
      kudos: g.kudos,
    });
  }

  for (const j of input.jobs) {
    if (j.status !== "done" || !j.completedBy) continue;
    const at = millisOf(j.completedAt);
    if (!at || at < since) continue;
    out.push({ id: `job:${j.id}`, at, whoId: j.completedBy.id, who: firstName(j.completedBy.name), what: `finished "${j.title}"`, target: { kind: "job", id: j.id }, kudos: j.kudos });
  }

  for (const r of input.requests) {
    if (r.status === "resolved" && r.resolvedBy) {
      const at = millisOf(r.resolvedAt);
      if (at && at >= since) {
        out.push({ id: `ask:${r.id}`, at, whoId: r.resolvedBy.id, who: firstName(r.resolvedBy.name), what: `closed "${r.title}"`, target: { kind: "request", id: r.id }, kudos: r.kudos });
      }
    } else if (r.status === "open" && r.claimedBy) {
      const at = millisOf(r.claimedAt);
      if (at && at >= since) {
        out.push({ id: `claim:${r.id}`, at, whoId: r.claimedBy.id, who: firstName(r.claimedBy.name), what: `is on "${r.title}"`, target: null, kudos: undefined });
      }
    }
  }

  return out.sort((a, b) => b.at - a.at).slice(0, PULSE_MAX);
}

/* ------------------------------------------------------------------ *
 * The store
 * ------------------------------------------------------------------ */

const kudosKey = (k: Record<string, true> | undefined) => (k ? Object.keys(k).sort().join(",") : "");
const stores = new Map<string, PulseEvent[]>();
const listeners = new Set<() => void>();
const EMPTY: PulseEvent[] = [];

export function publishPulse(studioId: string, events: PulseEvent[]): void {
  const prev = stores.get(studioId);
  if (
    prev &&
    prev.length === events.length &&
    prev.every((e, i) => e.id === events[i].id && e.at === events[i].at && kudosKey(e.kudos) === kudosKey(events[i].kudos))
  )
    return;
  stores.set(studioId, events);
  for (const l of listeners) l();
}

export function readPulse(studioId: string | null): PulseEvent[] {
  return (studioId && stores.get(studioId)) || EMPTY;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePulse(studioId: string | null): PulseEvent[] {
  return useSyncExternalStore(subscribe, () => readPulse(studioId), () => EMPTY);
}

/** Test seam. */
export function resetPulseStore(): void {
  stores.clear();
}
