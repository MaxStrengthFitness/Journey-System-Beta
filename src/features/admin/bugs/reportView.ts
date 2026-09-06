/**
 * READING A BUG REPORT.
 *
 * Round: Admin Overhaul, Round 2 Phase 3 (Section 13).
 *
 * THE SCREEN WAS THROWING THE DIAGNOSTICS AWAY
 * --------------------------------------------
 * features/feedback captures a great deal at the moment the drawer opens: the
 * screen the trainer was on, the studio, the client, the session, the viewport
 * and orientation, the theme, the device pixel ratio, the app version, the URL
 * and the last five runtime errors. All of it goes into `context` on the
 * document.
 *
 * AdminBugReports read `report.browser`, `report.os`, `report.platform` and
 * `report.studioName` - TOP-LEVEL fields, which the writer has never written.
 * The badges were behind `if (report.browser || report.os)`, so that block was
 * dead and the screen showed a description, an email and a timestamp. Every
 * diagnostic the app collected was discarded on the way to the only person who
 * could use it.
 *
 * So this module's job is not to gather anything new. It is to read what is
 * already there - including the pre-Sep-2026 documents, which really did keep
 * `platform` and `browser` at the top level - and hand the screen one shape.
 *
 * THE ERRORS ARE THE POINT
 * ------------------------
 * `recentErrors` is usually the actual answer to the report, and it is the one
 * field a trainer could never have typed. `hasDiagnostics` and the ordering
 * below exist so a report carrying a stack trace does not sit third in a list
 * behind two "the button is blue" notes.
 */

import type {
  FeedbackContext,
  FeedbackErrorSample,
  FeedbackKind,
} from "../../feedback/types";

export type ReportStatus = "open" | "investigating" | "fixed" | "wont-fix";

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Open",
  investigating: "Looking at it",
  fixed: "Fixed",
  "wont-fix": "Not doing",
};

/** The order a triage list wants: unhandled first, closed last. */
export const STATUS_ORDER: ReportStatus[] = [
  "open",
  "investigating",
  "fixed",
  "wont-fix",
];

export const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: "Broken",
  ui: "Feels wrong",
  idea: "Missing",
};

/** A document out of `bug_reports`, in any generation's shape. */
export interface RawReport {
  id?: string;
  kind?: string;
  issueType?: string;
  description?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  studioId?: string;
  status?: string;
  createdAt?: unknown;
  context?: FeedbackContext;
  /** Pre-Sep-2026 documents kept these at the top level. */
  platform?: string;
  browser?: string;
  os?: string;
  studioName?: string;
  userAgent?: string;
  [k: string]: unknown;
}

/** One label/value pair for the diagnostics table. */
export interface DiagnosticRow {
  label: string;
  value: string;
  /** True for things a person will want to paste somewhere. */
  mono?: boolean;
}

export interface ReportView {
  id: string;
  kind: FeedbackKind | null;
  /** What to show as the type. Falls back to the old free-text issueType. */
  kindLabel: string;
  description: string;
  status: ReportStatus;
  reporter: string;
  reporterEmail: string;
  studioId: string | null;
  studioName: string | null;
  createdAt: number | null;
  /** Where the trainer was standing, in label/value pairs. */
  diagnostics: DiagnosticRow[];
  errors: FeedbackErrorSample[];
  /** True when there is anything beyond the description to look at. */
  hasDiagnostics: boolean;
}

const KINDS = new Set<FeedbackKind>(["bug", "ui", "idea"]);
const STATUSES = new Set<ReportStatus>(STATUS_ORDER);

function millis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const ts = v as { toMillis?: () => number; toDate?: () => Date };
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  if (typeof v === "string") {
    const p = Date.parse(v);
    return Number.isNaN(p) ? null : p;
  }
  return null;
}

function push(rows: DiagnosticRow[], label: string, value: unknown, mono = false) {
  if (value === undefined || value === null || value === "") return;
  rows.push({ label, value: String(value), mono });
}

/**
 * Browser and OS out of a user agent string.
 *
 * Deliberately crude. A user agent cannot be parsed correctly and every
 * library that claims to is a table of exceptions going stale. What a person
 * triaging needs is "is this the iPad or somebody's laptop", and the full
 * string is kept in the table below for when the answer matters more.
 */
export function describeUserAgent(ua: string | undefined): string | null {
  if (!ua) return null;
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPad|Macintosh.*Mobile/.test(ua)
    ? "iPad"
    : /iPhone/.test(ua)
      ? "iPhone"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X/.test(ua)
            ? "macOS"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

export function toReportView(raw: RawReport, index = 0): ReportView {
  const ctx = raw.context ?? {};
  const kind = KINDS.has(raw.kind as FeedbackKind)
    ? (raw.kind as FeedbackKind)
    : null;
  const status = STATUSES.has(raw.status as ReportStatus)
    ? (raw.status as ReportStatus)
    : "open";

  // Top-level first for the old documents, then context for the new ones.
  const userAgent = raw.userAgent ?? ctx.userAgent;
  const platform = raw.platform ?? ctx.platform;
  const studioName = raw.studioName ?? ctx.studioName ?? null;

  const rows: DiagnosticRow[] = [];
  push(rows, "Screen", ctx.view);
  push(rows, "Studio", studioName ?? raw.studioId);
  push(rows, "Client", ctx.clientName ?? ctx.clientId);
  push(rows, "Session", ctx.sessionId, true);
  push(
    rows,
    "Viewport",
    ctx.viewport
      ? `${ctx.viewport}${ctx.orientation ? ` (${ctx.orientation})` : ""}`
      : undefined,
  );
  push(rows, "Pixel ratio", ctx.devicePixelRatio);
  push(rows, "Theme", ctx.theme);
  push(rows, "Device", describeUserAgent(userAgent) ?? raw.browser ?? raw.os);
  push(rows, "Platform", platform);
  push(rows, "App version", ctx.appVersion, true);
  push(rows, "URL", ctx.url, true);
  push(rows, "User agent", userAgent, true);

  const errors = ctx.recentErrors ?? [];

  return {
    id: raw.id ?? `report-${index}`,
    kind,
    kindLabel: kind ? KIND_LABEL[kind] : (raw.issueType ?? "Report"),
    description: String(raw.description ?? "").trim() || "(no description)",
    status,
    reporter: raw.userName || raw.userEmail || "Unknown",
    reporterEmail: raw.userEmail ?? "",
    studioId: raw.studioId ?? ctx.studioId ?? null,
    studioName,
    createdAt: millis(raw.createdAt),
    diagnostics: rows,
    errors,
    hasDiagnostics: rows.length > 0 || errors.length > 0,
  };
}

/* ------------------------------------------------------------------ *
 * TRIAGE
 * ------------------------------------------------------------------ */

export interface ReportFilter {
  status: ReportStatus | "all";
  kind: FeedbackKind | "all";
  studioId: string | "all";
  /** Matched against the description and the reporter, case-insensitively. */
  search: string;
}

export const EMPTY_FILTER: ReportFilter = {
  status: "all",
  kind: "all",
  studioId: "all",
  search: "",
};

export function filterReports(
  reports: ReportView[],
  filter: ReportFilter,
): ReportView[] {
  const needle = filter.search.trim().toLowerCase();
  return reports.filter((r) => {
    if (filter.status !== "all" && r.status !== filter.status) return false;
    if (filter.kind !== "all" && r.kind !== filter.kind) return false;
    if (filter.studioId !== "all" && r.studioId !== filter.studioId) return false;
    if (!needle) return true;
    return (
      r.description.toLowerCase().includes(needle) ||
      r.reporter.toLowerCase().includes(needle) ||
      r.reporterEmail.toLowerCase().includes(needle)
    );
  });
}

/**
 * Newest first within status, and open before closed.
 *
 * Not newest-first overall: a list where a fixed report from this morning
 * outranks an open one from yesterday is a list nobody can triage from.
 */
export function orderReports(reports: ReportView[]): ReportView[] {
  const rank = (s: ReportStatus) => STATUS_ORDER.indexOf(s);
  return [...reports].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      (b.createdAt ?? 0) - (a.createdAt ?? 0),
  );
}

export interface ReportCounts {
  total: number;
  open: number;
  investigating: number;
  withErrors: number;
}

export function countReports(reports: ReportView[]): ReportCounts {
  return {
    total: reports.length,
    open: reports.filter((r) => r.status === "open").length,
    investigating: reports.filter((r) => r.status === "investigating").length,
    withErrors: reports.filter((r) => r.errors.length > 0).length,
  };
}

/**
 * Everything about one report as plain text, for pasting into an issue.
 *
 * The reason this exists rather than "select the panel and copy": the useful
 * half of a report is a dozen label/value pairs and a stack trace, and getting
 * those out of a rendered table by hand is exactly the friction that stops
 * somebody filing the bug properly.
 */
export function reportAsText(r: ReportView, at: (ms: number) => string): string {
  const lines = [
    `${r.kindLabel} - ${STATUS_LABEL[r.status]}`,
    `Reported by ${r.reporter}${r.reporterEmail ? ` <${r.reporterEmail}>` : ""}`,
    r.createdAt ? `At ${at(r.createdAt)}` : "At an unrecorded time",
    "",
    r.description,
  ];
  if (r.diagnostics.length) {
    lines.push("", "Context:");
    for (const d of r.diagnostics) lines.push(`  ${d.label}: ${d.value}`);
  }
  if (r.errors.length) {
    lines.push("", `Recent errors (${r.errors.length}, newest first):`);
    for (const e of r.errors) {
      lines.push(`  [${e.type}] ${e.message}${e.at ? ` (${at(e.at)})` : ""}`);
    }
  }
  return lines.join("\n");
}
