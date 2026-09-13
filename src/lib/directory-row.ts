/**
 * WHAT A DIRECTORY ROW SAYS ABOUT A PACKAGE (tracker round, Sep 2026).
 *
 * "Membership isn't working, sessions remaining isn't working — both should
 * be connected to the contract — and next session isn't working." The row
 * used to read three fields nothing keeps current (`packageTier`,
 * `remainingSessions`, `nextSessionDate`). It now reads the renewal
 * snapshot the nightly job computes from the Mindbody contract
 * (`client.renewal`), and says "unknown" honestly when there is none.
 */

import type { Client } from "../types";
import { dayLabel } from "../features/renewals/sentences";

export interface DirectoryPackageRead {
  /** "12-Month · monthly" or "No package on file". */
  membership: string;
  membershipKnown: boolean;
  /** "38 left", "Auto-renews", "Unknown". */
  sessionsLeft: string;
  sessionsLeftTone: "ok" | "low" | "unknown";
  /** "Sep 16" or null when nothing is booked. */
  nextSession: string | null;
}

const MODE_WORD: Record<string, string> = {
  monthly: "monthly",
  prepaid: "paid in full",
  "sessions-only": "sessions",
};

export function directoryPackageRead(client: Client, today?: string): DirectoryPackageRead {
  const r = client.renewal;
  const label = r?.packageLabel?.trim() || null;
  const mode = r?.paymentMode ? MODE_WORD[r.paymentMode] : null;
  const membership = label ? (mode ? `${label} · ${mode}` : label) : client.packageTier && client.packageTier !== "None" ? client.packageTier : "No package on file";

  let sessionsLeft = "Unknown";
  let sessionsLeftTone: DirectoryPackageRead["sessionsLeftTone"] = "unknown";
  if (r) {
    if (typeof r.sessionsLeft === "number") {
      sessionsLeft = `${r.sessionsLeft} left`;
      sessionsLeftTone = r.sessionsLeft <= 3 ? "low" : "ok";
    } else if (r.paymentMode === "monthly" && r.autoRenews) {
      sessionsLeft = "Auto-renews";
      sessionsLeftTone = "ok";
    }
  }

  const nextSession = r?.nextBookingDate ? dayLabel(r.nextBookingDate, today) : null;

  return { membership, membershipKnown: !!label, sessionsLeft, sessionsLeftTone, nextSession };
}
