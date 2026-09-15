/**
 * "Synced 3 days ago" — the sub-label under the header's Master Sync button.
 * Pure so the rule (and its date handling) is tested; the sync stamp is an
 * ISO date-TIME written by runMasterSync, so plain Date parsing is right.
 */
export function masterSyncLabel(stamp: unknown, now: Date = new Date()): string {
  const d = toDate(stamp);
  if (!d) return "Never synced";
  const mins = (now.getTime() - d.getTime()) / 60_000;
  if (mins < 2) return "Synced just now";
  if (mins < 60) return `Synced ${Math.round(mins)} min ago`;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return "Synced today";
  if (days === 1) return "Synced yesterday";
  if (days < 14) return `Synced ${days} days ago`;
  return `Synced ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const anyV = v as { toDate?: () => Date };
  if (typeof anyV.toDate === "function") return anyV.toDate();
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Whole years between a date of birth and today, or null. A date-ONLY string
 * is read as a LOCAL calendar day (see the date trap in CLAUDE.md), so a
 * birthday is never a day early in Eastern time.
 */
export function ageFromDob(dob: string | null | undefined, now: Date = new Date()): number | null {
  const m = String(dob ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (y < 1900 || mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < day)) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}
