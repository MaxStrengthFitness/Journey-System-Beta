/**
 * IS MINDBODY WORKING, AND IF NOT, WHERE.
 *
 * Round: Admin Overhaul, Round 2 Phase 2 (Sections 10-12).
 *
 * WHAT THIS REPLACES
 * ------------------
 * Three screens claimed to be about Mindbody:
 *
 *   Mindbody       a fixture mockup. "Downtown Studio", trainer Marina,
 *                  clients Marquita R. and "Foreign C.", a shift roster with
 *                  hard-coded 07:00-10:00 columns, and approve/deny buttons
 *                  wired to console.log. One real control was buried in it -
 *                  a live API check against the active studio's Site ID.
 *   Integrations   the real one. API parameters, the webhook URL and its
 *                  end-to-end test, schedule sync, the event log.
 *   Limbo          the real queue of Mindbody records that could not be
 *                  matched to a client. Kept, untouched, as its own screen.
 *
 * A mockup sitting in the admin navigation under a plausible name is worse
 * than a missing screen. Someone reads "Downtown Studio: 11 sessions" and
 * believes it. The spec asked for the hub to go and the sections to become
 * one diagnostic dashboard; this module is the part of that dashboard that
 * can be reasoned about without a browser.
 *
 * WHY THE STUDIO AUDIT IS THE CENTRE OF IT
 * ----------------------------------------
 * The old screens answered "is the integration up?" from a single health
 * document, which is the question you ask second. The first one is "which of
 * my studios is actually connected", and no screen answered it. A studio with
 * no Site ID looks identical to a studio deliberately running offline, which
 * is precisely the distinction Round 1 added `mindbodyMode` to record - and
 * nothing displayed it. A studio whose sync last succeeded four hours ago on
 * a fifteen-minute interval looks identical to one that synced a minute ago.
 *
 * So `auditStudios` is the primary output, and it sorts by severity: the
 * things that need a human first appear first, and a fully healthy estate
 * produces an empty list of problems rather than a wall of green cards.
 */

import type { Studio, Trainer } from "../../../types";

export type MindbodyStatus = "healthy" | "degraded" | "error" | "offline";

/** How a studio relates to Mindbody, once every field has been read. */
export type LinkState =
  /** Site ID present, mode linked or unset. Working as intended. */
  | "linked"
  /** Deliberately without Mindbody. Not a problem; do not count it as one. */
  | "offline"
  /** Marked linked, or unmarked, but no Site ID. Somebody left a field blank. */
  | "misconfigured";

export type SyncState =
  /** Synced within one interval. */
  | "current"
  /** Between one and three intervals late. */
  | "lagging"
  /** More than three intervals late, or never. */
  | "stalled"
  /** Automatic sync is switched off here; lateness is not a fault. */
  | "manual"
  /** No Mindbody, so nothing to sync. */
  | "n/a";

export interface StudioDiagnosis {
  studioId: string;
  name: string;
  link: LinkState;
  sync: SyncState;
  siteId: string | null;
  locationId: string | null;
  intervalMinutes: number;
  /** Epoch ms of the last successful pull, or null if it has never run. */
  lastSyncAt: number | null;
  /** Whole minutes since that pull. null when it has never run. */
  minutesSinceSync: number | null;
  consecutiveFailures: number;
  /** Trainers at this studio carrying a Mindbody staff id. */
  linkedStaff: number;
  staffTotal: number;
  /** One line naming the problem, or null when there is nothing to say. */
  problem: string | null;
}

/** Minutes without a sync before a studio is lagging, as a multiple of its interval. */
export const LAG_INTERVALS = 1;
/** ...and before it is stalled. */
export const STALL_INTERVALS = 3;
/** Used when a studio has never had an interval set. Matches syncPolicy. */
export const DEFAULT_INTERVAL_MINUTES = 15;

/**
 * Severity order for the studio list. Misconfiguration outranks staleness
 * because a studio with no Site ID will never sync, so reporting it as
 * "stalled" would send someone to look at the sync when the fault is a blank
 * field. Deliberately offline studios sort last: they are the one state that
 * is not a problem at all.
 */
const LINK_RANK: Record<LinkState, number> = {
  misconfigured: 0,
  linked: 1,
  offline: 2,
};

const SYNC_RANK: Record<SyncState, number> = {
  stalled: 0,
  lagging: 1,
  manual: 2,
  current: 3,
  "n/a": 4,
};

export function linkStateOf(studio: Pick<Studio, "mindbodySiteId" | "mindbodyMode">): LinkState {
  if (studio.mindbodyMode === "offline") return "offline";
  const siteId = String(studio.mindbodySiteId ?? "").trim();
  return siteId ? "linked" : "misconfigured";
}

export function syncStateOf(
  link: LinkState,
  studio: Pick<Studio, "autoSyncEnabled" | "syncIntervalMinutes" | "lastScheduleSyncAt">,
  now: number,
): SyncState {
  if (link !== "linked") return "n/a";
  if (studio.autoSyncEnabled === false) return "manual";
  const interval = studio.syncIntervalMinutes || DEFAULT_INTERVAL_MINUTES;
  const last = studio.lastScheduleSyncAt;
  if (!last) return "stalled";
  const minutes = (now - last) / 60_000;
  if (minutes <= interval * LAG_INTERVALS) return "current";
  if (minutes <= interval * STALL_INTERVALS) return "lagging";
  return "stalled";
}

/** Whole minutes, rounded down, never negative — a clock ahead of us is "now". */
export function minutesSince(then: number | null | undefined, now: number): number | null {
  if (!then) return null;
  return Math.max(0, Math.floor((now - then) / 60_000));
}

function problemFor(d: Omit<StudioDiagnosis, "problem">): string | null {
  if (d.link === "misconfigured") {
    return "No Mindbody Site ID. Add one, or mark the studio offline so it stops being reported here.";
  }
  if (d.link === "offline") return null;
  if (d.consecutiveFailures >= 3) {
    return `${d.consecutiveFailures} syncs in a row have failed. The event log below will say why.`;
  }
  if (d.sync === "stalled") {
    return d.lastSyncAt === null
      ? "Linked, but the schedule has never synced here."
      : `Last sync was ${formatAge(d.minutesSinceSync)} ago, on a ${d.intervalMinutes}-minute interval.`;
  }
  if (d.sync === "lagging") {
    return `Last sync was ${formatAge(d.minutesSinceSync)} ago, a little behind the ${d.intervalMinutes}-minute interval.`;
  }
  if (d.link === "linked" && d.staffTotal > 0 && d.linkedStaff === 0) {
    return "No trainer here is linked to a Mindbody staff record, so the schedule will not attribute sessions.";
  }
  return null;
}

/** "4 minutes", "3 hours", "2 days" — enough precision to act, no more. */
export function formatAge(minutes: number | null): string {
  if (minutes === null) return "never";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export function auditStudios(
  studios: Studio[],
  trainers: Trainer[],
  now: number,
): StudioDiagnosis[] {
  const rows = studios.map((s) => {
    const studioId = s.id ?? "";
    const link = linkStateOf(s);
    const sync = syncStateOf(link, s, now);
    const here = trainers.filter(
      (t) =>
        t.primaryHomeStudioId === studioId ||
        (t.accessibleStudioIds ?? []).includes(studioId),
    );
    const base: Omit<StudioDiagnosis, "problem"> = {
      studioId,
      name: s.name,
      link,
      sync,
      siteId: s.mindbodySiteId ? String(s.mindbodySiteId) : null,
      locationId:
        s.mindbodyLocationId === undefined || s.mindbodyLocationId === null
          ? null
          : String(s.mindbodyLocationId),
      intervalMinutes: s.syncIntervalMinutes || DEFAULT_INTERVAL_MINUTES,
      lastSyncAt: s.lastScheduleSyncAt ?? null,
      minutesSinceSync: minutesSince(s.lastScheduleSyncAt, now),
      consecutiveFailures: s.scheduleSyncFailures ?? 0,
      linkedStaff: here.filter((t) => Boolean(t.mindbodyStaffId)).length,
      staffTotal: here.length,
    };
    return { ...base, problem: problemFor(base) };
  });

  return rows.sort(
    (a, b) =>
      LINK_RANK[a.link] - LINK_RANK[b.link] ||
      SYNC_RANK[a.sync] - SYNC_RANK[b.sync] ||
      b.consecutiveFailures - a.consecutiveFailures ||
      a.name.localeCompare(b.name),
  );
}

export interface EstateSummary {
  total: number;
  linked: number;
  offline: number;
  misconfigured: number;
  stalled: number;
  lagging: number;
  /** Rows with something to say. This is the list the screen leads with. */
  needsAttention: StudioDiagnosis[];
}

export function summariseEstate(rows: StudioDiagnosis[]): EstateSummary {
  return {
    total: rows.length,
    linked: rows.filter((r) => r.link === "linked").length,
    offline: rows.filter((r) => r.link === "offline").length,
    misconfigured: rows.filter((r) => r.link === "misconfigured").length,
    stalled: rows.filter((r) => r.sync === "stalled").length,
    lagging: rows.filter((r) => r.sync === "lagging").length,
    needsAttention: rows.filter((r) => r.problem !== null),
  };
}

/* ------------------------------------------------------------------ *
 * THE SERVICE ITSELF
 * ------------------------------------------------------------------ */

export interface HealthInput {
  status: MindbodyStatus;
  lastSuccessfulEventAt: Date | null;
  lastFailureAt: Date | null;
  dlqDepth: number;
  signatureFailures24h: number;
  webhookSubscriptionActive: boolean;
  hasData: boolean;
}

export interface HealthSummary {
  status: MindbodyStatus;
  /** One sentence a manager can act on, not a status word. */
  headline: string;
  /** Specific things wrong, most serious first. Empty when healthy. */
  faults: string[];
  minutesSinceLastEvent: number | null;
}

/**
 * `status` on the health document is written by the backend and is the first
 * thing to report, but "degraded" alone tells nobody what to do. The faults
 * list is derived from the individual counters so the screen can say which
 * of them is unhappy.
 *
 * A missing document reads as offline rather than healthy. The wrong way to
 * be wrong here is to show green because nothing has written a status yet.
 */
export function summariseHealth(h: HealthInput, now: number): HealthSummary {
  const minutesSinceLastEvent = minutesSince(
    h.lastSuccessfulEventAt ? h.lastSuccessfulEventAt.getTime() : null,
    now,
  );

  if (!h.hasData) {
    return {
      status: "offline",
      headline:
        "No health record has been written yet, so nothing here is confirmed. Treat the studio rows below as the source of truth.",
      faults: [],
      minutesSinceLastEvent,
    };
  }

  const faults: string[] = [];
  if (!h.webhookSubscriptionActive) {
    faults.push(
      "The Mindbody webhook subscription is not active, so changes made in Mindbody will not reach the app until the next scheduled pull.",
    );
  }
  if (h.dlqDepth > 0) {
    faults.push(
      `${h.dlqDepth} event${h.dlqDepth === 1 ? "" : "s"} failed processing and are parked in the dead-letter queue.`,
    );
  }
  if (h.signatureFailures24h > 0) {
    faults.push(
      `${h.signatureFailures24h} webhook${h.signatureFailures24h === 1 ? "" : "s"} in the last 24 hours failed signature checks. Usually a stale signing key.`,
    );
  }

  const headline =
    h.status === "healthy" && faults.length === 0
      ? minutesSinceLastEvent === null
        ? "Connected, but no event has arrived yet."
        : `Connected. Last event ${formatAge(minutesSinceLastEvent)} ago.`
      : h.status === "offline"
        ? "Not connected to Mindbody."
        : faults[0] ?? "Reported as degraded, with no specific fault recorded.";

  return { status: h.status, headline, faults, minutesSinceLastEvent };
}

/* ------------------------------------------------------------------ *
 * THE EVENT LOG
 * ------------------------------------------------------------------ */

export type LogLevel = "error" | "warn" | "info";

export interface RawLogEntry {
  id?: string;
  /** `mindbodyEventLog` writes this one. */
  status?: string;
  type?: string;
  level?: string;
  message?: string;
  eventType?: string;
  /** `mindbodyEventLog` writes this one; older writers used the others. */
  processedAt?: unknown;
  timestamp?: unknown;
  createdAt?: unknown;
  [k: string]: unknown;
}

export interface LogLine {
  id: string;
  level: LogLevel;
  message: string;
  at: number | null;
}

/**
 * The log documents were written by several generations of code and disagree
 * about the field name for both the level and the time. Rather than teaching
 * the screen all of them, normalise once here - and default to "info", so an
 * unrecognised shape shows up as an ordinary line rather than a red one.
 */
export function normaliseLog(raw: RawLogEntry, index: number): LogLine {
  const rawLevel = String(
    raw.level ?? raw.status ?? raw.type ?? "",
  ).toLowerCase();
  const level: LogLevel =
    rawLevel.includes("error") || rawLevel.includes("fail")
      ? "error"
      : rawLevel.includes("warn")
        ? "warn"
        : "info";
  const t = raw.processedAt ?? raw.timestamp ?? raw.createdAt;
  let at: number | null = null;
  if (t) {
    const ts = t as { toMillis?: () => number; toDate?: () => Date };
    if (typeof ts.toMillis === "function") at = ts.toMillis();
    else if (typeof ts.toDate === "function") at = ts.toDate().getTime();
    else if (typeof t === "number") at = t;
    else if (t instanceof Date) at = t.getTime();
    else if (typeof t === "string") {
      const parsed = Date.parse(t);
      at = Number.isNaN(parsed) ? null : parsed;
    }
  }
  const message =
    String(raw.message ?? "").trim() ||
    (raw.eventType ? `Mindbody event: ${raw.eventType}` : "") ||
    "(no message)";

  return { id: raw.id ?? `log-${index}`, level, message, at };
}

/** Newest first, and undated entries last rather than pretending to be oldest. */
export function orderLogs(lines: LogLine[]): LogLine[] {
  return [...lines].sort((a, b) => {
    if (a.at === null && b.at === null) return 0;
    if (a.at === null) return 1;
    if (b.at === null) return -1;
    return b.at - a.at;
  });
}
