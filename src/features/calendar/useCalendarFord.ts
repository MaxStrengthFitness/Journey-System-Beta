/**
 * THE CALENDAR'S ONE FORD READ (the Atlas answers, Oct 2 2026).
 *
 * The Month view's Events are clients' FORD dates (ford-events.ts). This is
 * the read behind them: the Hub's own query (ford/hub-read.ts) asked about
 * the days on screen — every annual detail of the studio, and every one-off
 * dated inside the range — so it needs no new index and no new rule. Its
 * third branch ("noted since") is asked about a day that never comes, so it
 * adds nothing.
 *
 * One `getDocs` per studio and month, held for the visit (module memory,
 * reset at sign-out: FORD is a client's home life). No listener, no write.
 * A failure is "couldn't read", never "no events".
 */
import { useEffect, useState } from "react";
import { studioDayBoundsForKey } from "../../lib/studio-time";
import { fetchHubFord, type HubFordRead } from "../ford/hub-read";
import type { FordEntry } from "../ford/types";
import { forgetOnSignOut } from "../sign-out/memory";

export type CalendarFordStatus = "off" | "loading" | "ready" | "failed";

const held = new Map<string, HubFordRead>();
forgetOnSignOut(() => held.clear());

/** A day no detail is ever noted on, so the read's "noted since" branch adds nothing. */
const NEVER = new Date(Date.UTC(9999, 0, 1));

function nextDay(key: string): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function useCalendarFord(
  studioId: string | null | undefined,
  from: string,
  to: string,
  enabled: boolean,
): { status: CalendarFordStatus; details: readonly FordEntry[] | null } {
  const key = studioId && enabled ? `${studioId}|${from}|${to}` : null;
  const [state, setState] = useState<{ key: string | null; read: HubFordRead | null }>(() => ({
    key,
    read: key ? (held.get(key) ?? null) : null,
  }));

  useEffect(() => {
    if (!key || !studioId) return;
    const cached = held.get(key);
    if (cached) {
      setState({ key, read: cached });
      return;
    }
    let live = true;
    setState({ key, read: null });
    void fetchHubFord(studioId, {
      datedFrom: studioDayBoundsForKey(from).start,
      datedUntil: studioDayBoundsForKey(nextDay(to)).start,
      notedFrom: NEVER,
    }).then((read) => {
      if (read.status === "ready" || read.status === "partial") held.set(key, read);
      if (live) setState({ key, read });
    });
    return () => {
      live = false;
    };
  }, [key, studioId, from, to]);

  if (!key) return { status: "off", details: null };
  const read = state.key === key ? state.read : (held.get(key) ?? null);
  if (!read) return { status: "loading", details: null };
  if (read.status === "failed" || read.status === "denied") return { status: "failed", details: null };
  return { status: "ready", details: read.details };
}
