/**
 * When to write a Client Progress Report (client-profile audit, Sep 2026):
 * "trainers are trained to run and present these reports right BEFORE a client
 * begins thinking about contract renewal". The renewal snapshot already knows
 * when that is; this turns it into one cue for the Activity Archive's Reports
 * shelf. Pure — nothing is read that the profile doesn't hold.
 */
import type { ProgressReport } from "../../types";
import type { RenewalSnapshot } from "../renewals/types";

/** A full report this recent already did the job. */
export const RECENT_REPORT_DAYS = 45;

export interface CprCue {
  text: string;
}

function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key || "");
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000 : null;
}

export function cprTimingCue(
  renewal: RenewalSnapshot | null | undefined,
  reports: readonly Pick<ProgressReport, "date" | "status" | "isCheckInOnly">[],
  today: string,
): CprCue | null {
  if (!renewal || renewal.renewalOnBooks) return null;
  const approaching =
    renewal.conversationDue || renewal.chargeWarning || renewal.situation === "will-run-out";
  if (!approaching) return null;

  const t = dayNumber(today);
  const recent = reports.some((r) => {
    if (r.isCheckInOnly || r.status !== "Finalized") return false;
    const d = dayNumber(r.date);
    return t !== null && d !== null && t - d >= 0 && t - d <= RECENT_REPORT_DAYS;
  });
  if (recent) return null;

  const left = renewal.sessionsLeft;
  const why =
    left !== null && left !== undefined
      ? `${left} session${left === 1 ? "" : "s"} left`
      : renewal.chargeWarning
        ? "the renewal charge is close"
        : "the package is running out";
  return {
    text: `Renewal is coming up (${why}). This is the moment for a progress report — before the decision, not after it.`,
  };
}

/* ------------------------------------------------------------------ *
 * WHEN A PROGRESS REPORT IS DUE — the one rule (Atlas answers, Oct 2 2026)
 * ------------------------------------------------------------------ */

/**
 * AJ, Oct 2 2026: due three months after the last FULL report; "not every
 * single client will want a progress report", so a per-client switch turns
 * the prompt off for her (`client.noProgressReports`); and an approaching
 * renewal makes one "definitely very important". One quiet line on the
 * profile replaced the red strip, and the Activity Archive's Reports cue
 * says the same thing from this same function.
 *
 * A FULL report is a Finalized one that is not a Pulse round on its own
 * (`isCheckInOnly`): a Pulse round or a draft never resets the clock.
 */
export const REPORT_EVERY_MONTHS = 3;
/** "Due soon" this many days before the three months are up. */
export const REPORT_SOON_DAYS = 21;

export type ReportDueLevel = "renewal" | "due" | "soon";

export interface ReportDue {
  /** "renewal" says it more strongly: the renewal conversation is close. */
  level: ReportDueLevel;
  /** The one quiet line. */
  text: string;
  /** The day the three months are up (yyyy-mm-dd), when there is a full report to count from. */
  dueOn: string | null;
}

const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** yyyy-mm-dd plus whole calendar months (Jan 31 + 1 month is the last day of Feb). */
export function addMonths(key: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key || "");
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1 + months;
  const target = new Date(Date.UTC(y, mo, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const d = Math.min(Number(m[3]), last);
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(d)}`;
}

function words(key: string): string {
  return `${MONTH[Number(key.slice(5, 7)) - 1]} ${Number(key.slice(8, 10))}, ${key.slice(0, 4)}`;
}

/** The newest full report's day, or null with none. */
export function lastFullReportDay(reports: readonly Pick<ProgressReport, "date" | "status" | "isCheckInOnly">[]): string | null {
  let best: string | null = null;
  for (const r of reports) {
    if (r.isCheckInOnly || r.status !== "Finalized") continue;
    const day = /^\d{4}-\d{2}-\d{2}/.test(r.date || "") ? r.date.slice(0, 10) : null;
    if (day && (!best || day > best)) best = day;
  }
  return best;
}

export function progressReportDue(input: {
  /** Her reports (any order, any kind); null while unread or after a failed read — then nothing is said. */
  reports: readonly Pick<ProgressReport, "date" | "status" | "isCheckInOnly">[] | null;
  /** `client.noProgressReports`: the prompt is off for her. */
  optedOut?: boolean | null;
  /** Her renewal, with her auto-renew mark applied (`renewalOf`). */
  renewal?: RenewalSnapshot | null;
  /**
   * She has been with the studio three months (`isEstablishedClient`): with
   * no full report at all, one is expected only then.
   */
  established: boolean;
  /** The studio's day, yyyy-mm-dd. */
  today: string;
}): ReportDue | null {
  if (input.optedOut) return null;
  if (!input.reports) return null;
  const last = lastFullReportDay(input.reports);
  const dueOn = last ? addMonths(last, REPORT_EVERY_MONTHS) : null;

  // Strongest: the renewal is close and no full report has done the job lately.
  const renewalCue = cprTimingCue(input.renewal ?? null, input.reports, input.today);
  if (renewalCue) return { level: "renewal", text: renewalCue.text, dueOn };

  if (!last) {
    return input.established
      ? { level: "due", text: "Progress report due: no full report in Journey yet.", dueOn: null }
      : null;
  }
  if (!dueOn) return null;
  if (input.today >= dueOn) {
    return { level: "due", text: `Progress report due: three months since the last full report (${words(last)}).`, dueOn };
  }
  const t = dayNumber(input.today);
  const d = dayNumber(dueOn);
  if (t !== null && d !== null && d - t <= REPORT_SOON_DAYS) {
    return { level: "soon", text: `Next progress report due ${words(dueOn)}.`, dueOn };
  }
  return null;
}
