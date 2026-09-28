/**
 * EVERY STUDIO'S MINDBODY PULL, WORST FIRST — the words for each.
 * PURE: no React, no Firestore.
 *
 * Round: the Admins room (Sep 28 2026). AJ's default for q10: the
 * all-studios sync check lives in Admins, and each studio keeps its own
 * Mindbody panel in Operations. This reads only what is already stored:
 *
 *   the studio document   the Mindbody link (registry.ts's rule), whether
 *                         the automatic pull is on
 *   the sync lease        `studios/{id}/sync/lease` (features/admin/
 *                         sync-lease.ts): when the last pull was claimed,
 *                         how many pulls in a row failed, and when the last
 *                         whole-month pull succeeded — falling back to the
 *                         fields on the studio document from before the
 *                         lease moved (`leaseOf`)
 *
 * It asks Mindbody nothing and starts no timer.
 *
 * WHAT IT WILL NOT SAY. A pull runs only while an iPad at the studio has
 * Journey open, during the studio's hours, so a long gap is not by itself a
 * broken sync: a closed Sunday looks the same. A gap is said as the fact it
 * is ("No pull since Sat, Sep 26") and only failures are called failures.
 * A lease that couldn't be read is "Couldn't check", never "never pulled".
 */
import type { Studio } from "../../../types";
import { isDemoStudio } from "../../demo-mode/is-demo";
import { mindbodyLinkState } from "../../admin/studios/registry";
import { leaseOf, type SyncLease } from "../../admin/syncPolicy";
import { DEFAULT_TIME_ZONE, isValidTimeZone } from "../../../lib/studio-time";
import type { HqTone } from "../kit";

/** One studio's lease, as the read went. */
export type LeaseRead =
  | { state: "loading" }
  | { state: "failed" }
  | { state: "none" }
  | { state: "ok"; lease: SyncLease };

export type SyncKind =
  | "failing"
  | "unknown"
  | "no-site"
  | "no-location"
  | "never"
  | "gap"
  | "manual"
  | "checking"
  | "fine"
  | "offline";

/** Worst first. */
const SEVERITY: Record<SyncKind, number> = {
  failing: 0,
  unknown: 1,
  "no-site": 2,
  "no-location": 3,
  never: 4,
  gap: 5,
  manual: 6,
  checking: 7,
  fine: 8,
  offline: 9,
};

export interface SyncRow {
  studioId: string;
  name: string;
  kind: SyncKind;
  tone: HqTone;
  /** The status in a few words. */
  word: string;
  /** One sentence of proof. */
  detail: string;
  /** "site 29068 · location 3", or null when there is no site. */
  where: string | null;
  failures: number;
}

/** A gap this long, with no failure, is said as a gap. Pulls only run while someone has Journey open. */
export const GAP_MS = 48 * 60 * 60 * 1000;

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

/** "6 min ago", "3 hours ago", "2 days ago", "just now". */
export function agoWords(then: number, now: number): string {
  const min = Math.max(0, Math.floor((now - then) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** "Tue, Sep 29, 9:14 AM" in the studio's own zone. */
export function whenWords(ms: number, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  return new Date(ms).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
  });
}

function dayWords(ms: number, timeZone: string): string {
  const tz = isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
}

/** One studio's pull, in words. */
export function syncRowOf(studio: Studio, studios: readonly Studio[], read: LeaseRead | undefined, now: number): SyncRow {
  const studioId = studio.id ?? "";
  const name = studio.name || "Unnamed studio";
  const site = str(studio.mindbodySiteId);
  const location = str(studio.mindbodyLocationId);
  const where = site ? (location ? `site ${site} · location ${location}` : `site ${site}`) : null;
  const tz = studio.timezone;
  const base = { studioId, name, where, failures: 0 };
  const link = mindbodyLinkState(studio, studios as Studio[]);

  if (link === "offline") {
    return { ...base, kind: "offline", tone: "idle", word: "Runs offline, on purpose", detail: "Nothing to pull: it isn't on Mindbody." };
  }
  if (link === "unlinked") {
    return {
      ...base,
      kind: "no-site",
      tone: "watch",
      word: "No Mindbody Site ID",
      detail: "Marked as linked, with no Site ID, so it can't pull. Add one on its page, or mark it offline if that's on purpose.",
    };
  }
  if (link === "needs-location") {
    const others = studios.filter((s) => s.id !== studioId && str(s.mindbodySiteId) === site).map((s) => s.name);
    return {
      ...base,
      kind: "no-location",
      tone: "watch",
      word: "No Mindbody location",
      detail: `It shares site ${site}${others.length ? ` with ${others.join(", ")}` : ""}, so without a location its bookings would arrive mixed with theirs.`,
    };
  }
  if (!read || read.state === "loading") {
    return { ...base, kind: "checking", tone: "idle", word: "Checking…", detail: "Reading its sync record." };
  }
  if (read.state === "failed") {
    return { ...base, kind: "unknown", tone: "unknown", word: "Couldn't check", detail: "Its sync record couldn't be read just now. That is unknown, not broken." };
  }

  const lease = leaseOf(read.state === "ok" ? read.lease : null, studio);
  const failures = Math.max(0, lease.scheduleSyncFailures ?? 0);
  const last = lease.lastScheduleSyncAt;
  const month =
    lease.lastDeepScheduleSyncAt != null
      ? `The whole month was last read ${whenWords(lease.lastDeepScheduleSyncAt, tz)}.`
      : "The whole month hasn't been read in full yet.";

  if (failures > 0) {
    return {
      ...base,
      failures,
      kind: "failing",
      tone: "watch",
      word: failures === 1 ? "The last pull failed" : `The last ${failures} pulls failed`,
      detail: `${last != null ? `The last one started ${whenWords(last, tz)}. ` : ""}Pulls wait longer between tries while they fail. Operations → Mindbody, with the app in ${name}, says why.`,
    };
  }
  if (studio.autoSyncEnabled === false) {
    return {
      ...base,
      kind: "manual",
      tone: "idle",
      word: "Automatic pull switched off",
      detail: `The schedule refreshes only when someone pulls it.${last != null ? ` The last pull was ${agoWords(last, now)}.` : ""}`,
    };
  }
  if (last == null) {
    return {
      ...base,
      kind: "never",
      tone: "idle",
      word: "Hasn't pulled yet",
      detail: "A pull starts when an iPad at the studio has Journey open during its hours.",
    };
  }
  if (now - last > GAP_MS) {
    return {
      ...base,
      kind: "gap",
      tone: "idle",
      word: `No pull since ${dayWords(last, tz)}`,
      detail: `Nothing failed. A pull runs while an iPad at the studio has Journey open in its hours, so either none has since, or the pulls stopped. ${month}`,
    };
  }
  return { ...base, kind: "fine", tone: "ok", word: `Last pull ${agoWords(last, now)}`, detail: month };
}

/** Every real studio's pull, worst first, then A to Z. The practice studio is left out. */
export function syncRows(studios: readonly Studio[], leases: Record<string, LeaseRead>, now: number): SyncRow[] {
  return studios
    .filter((s) => s.id && !isDemoStudio(s))
    .map((s) => syncRowOf(s, studios, leases[s.id!], now))
    .sort((a, b) => SEVERITY[a.kind] - SEVERITY[b.kind] || b.failures - a.failures || a.name.localeCompare(b.name));
}

function names(list: string[]): string {
  if (list.length <= 1) return list.join("");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** The page's one sentence: what needs a look, then how many are fine. */
export function syncSummary(rows: readonly SyncRow[]): string {
  if (rows.length === 0) return "No studios to check.";
  const parts: string[] = [];
  const of = (kind: SyncKind) => rows.filter((r) => r.kind === kind).map((r) => r.name);
  const failing = of("failing");
  if (failing.length) parts.push(`${names(failing)} ${failing.length === 1 ? "is" : "are"} failing to pull`);
  const unknown = of("unknown");
  if (unknown.length) parts.push(`couldn't check ${names(unknown)}`);
  const setup = [...of("no-site"), ...of("no-location")];
  if (setup.length) parts.push(`${names(setup)} can't pull until ${setup.length === 1 ? "its" : "their"} Mindbody details are filled in`);
  const checking = of("checking").length;
  if (checking) parts.push(`still reading ${checking === 1 ? "one studio" : `${checking} studios`}`);
  const fine = of("fine").length;
  const sentence = parts.length ? `${parts.join("; ")}.` : "Nothing needs a look.";
  const tail = fine ? ` ${fine === 1 ? "1 studio" : `${fine} studios`} pulled in the last two days.` : "";
  return (sentence.charAt(0).toUpperCase() + sentence.slice(1) + tail).trim();
}
