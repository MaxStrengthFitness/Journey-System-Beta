/**
 * HOW LONG AN OPEN TOOK (the speed round, Oct 5 2026, R30, the code half).
 *
 * Three marks on the browser's own timeline (`performance.mark`), each once a
 * page load:
 *
 *   journey:auth-ready     Firebase said who is signed in (or nobody)
 *   journey:trainer-ready  the app opened on the trainer record
 *   journey:hub-data       the Hub's day first answered
 *
 * They show in Safari's Web Inspector timeline on an iPad, so a walk with a
 * cable can read them. And on a COLD open (this tab had not opened Journey
 * before: no sessionStorage flag yet, which is what an iPad evicting the tab
 * or killing the Home Screen app looks like) ONE small report goes through
 * the client error reporter as kind "boot": the marks in ms since the page
 * started, cold or warm, Safari tab or Home Screen app (display-mode), the
 * user agent and the build. Nothing about the person: no name, no id, no
 * studio. It decides whether the Home Screen app pays Auth's iframe (R14) and
 * how many cold opens a floor day has.
 *
 * Rules: at most one report a page load; never awaited and never blocking
 * anything; skipped offline; under 2 KB (the server caps the endpoint at
 * 16 KB and about 60 a minute per address); sent when the Hub's data lands,
 * or after REPORT_AFTER_MS with whatever marks there are (a sign-in screen
 * left open is an open too).
 */
import { sendClientReport } from "../../lib/client-error-report";
import { APP_BUILD } from "../new-version/build";

export type BootMark = "auth-ready" | "trainer-ready" | "hub-data";

/** The tab's flag: present means this tab has opened Journey before (a reload, a deploy's load). */
export const BOOT_SEEN_KEY = "journey_boot_seen";
/** How long to wait for the Hub before reporting what there is. */
export const REPORT_AFTER_MS = 60_000;
/** The report's ceiling, well under the endpoint's 16 KB. */
export const MAX_REPORT_BYTES = 2048;

export interface BootReport {
  type: "boot";
  kind: "boot";
  message: string;
  cold: boolean;
  standalone: boolean;
  marks: Partial<Record<BootMark, number>>;
  userAgent: string;
  build: string;
}

/** Pure: the report, trimmed under the ceiling (the user agent gives way first). */
export function bootReport(input: {
  cold: boolean;
  standalone: boolean;
  marks: Partial<Record<BootMark, number>>;
  userAgent: string;
  build: string;
}): BootReport {
  const marks: Partial<Record<BootMark, number>> = {};
  for (const [k, v] of Object.entries(input.marks)) {
    if (typeof v === "number" && Number.isFinite(v)) marks[k as BootMark] = Math.round(v);
  }
  const report: BootReport = {
    type: "boot",
    kind: "boot",
    message: `boot ${input.cold ? "cold" : "warm"} ${input.standalone ? "home-screen" : "tab"}`,
    cold: input.cold,
    standalone: input.standalone,
    marks,
    userAgent: input.userAgent.slice(0, 400),
    build: input.build.slice(0, 80),
  };
  while (JSON.stringify(report).length > MAX_REPORT_BYTES && report.userAgent.length > 0) {
    report.userAgent = report.userAgent.slice(0, Math.max(0, report.userAgent.length - 100));
  }
  return report;
}

/** Pure: whether a report goes now. */
export function shouldReport(input: { cold: boolean; sent: boolean; online: boolean }): boolean {
  return input.cold && !input.sent && input.online;
}

/* ---------------- the page's own state ---------------- */

let started = false;
let cold = false;
let sent = false;
const marked = new Map<BootMark, number>();
let timer: ReturnType<typeof setTimeout> | null = null;

function standaloneNow(): boolean {
  try {
    const nav = navigator as Navigator & { standalone?: boolean };
    return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone);
  } catch {
    return false;
  }
}

function onlineNow(): boolean {
  try {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  } catch {
    return true;
  }
}

function report(): void {
  if (!shouldReport({ cold, sent, online: onlineNow() })) return;
  sent = true;
  if (timer) clearTimeout(timer);
  try {
    sendClientReport(
      bootReport({
        cold,
        standalone: standaloneNow(),
        marks: Object.fromEntries(marked),
        userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
        build: APP_BUILD,
      }) as unknown as Record<string, unknown>,
    );
  } catch {
    /* never let telemetry break the page it is reporting on */
  }
}

/**
 * Called once from main.tsx, first thing: decides cold or warm from the tab's
 * flag, sets it, and arms the late report.
 */
export function startBootTiming(): void {
  if (started) return;
  started = true;
  try {
    cold = sessionStorage.getItem(BOOT_SEEN_KEY) === null;
    sessionStorage.setItem(BOOT_SEEN_KEY, "1");
  } catch {
    cold = false; // storage blocked: can't tell, so no report
  }
  if (cold) timer = setTimeout(report, REPORT_AFTER_MS);
}

/** Mark one moment of this open, once. The Hub's data sends the report. */
export function markBoot(name: BootMark): void {
  if (marked.has(name)) return;
  let at = 0;
  try {
    at = typeof performance !== "undefined" ? performance.now() : 0;
    performance?.mark?.(`journey:${name}`);
  } catch {
    /* an old browser without marks still gets the number */
  }
  marked.set(name, at);
  if (name === "hub-data") report();
}

/** For tests: start again as a fresh page. */
export function resetBootTimingForTests(): void {
  started = false;
  cold = false;
  sent = false;
  marked.clear();
  if (timer) clearTimeout(timer);
  timer = null;
}
