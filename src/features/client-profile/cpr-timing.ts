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
