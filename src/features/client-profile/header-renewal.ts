/**
 * The renewal on the profile header's second line, beside "Client since"
 * (AJ, Oct 2 2026: "right after that, let's add a renews on, and shows the
 * renewal date").
 *
 * Read from the nightly renewal snapshot (`renewalOf(client)`), whose
 * `chargeDate` is when the contract's payments run out. The words follow the
 * DECIDED auto-renew answer, as every renewal screen's do
 * (renewals/sentences.ts, billingEndPhrase): only a contract that renews says
 * "Renews on". A next package already signed says when it starts. Paid in
 * full, banked sessions, no snapshot or no date: nothing is said.
 *
 * Until the nightly job has written her snapshot, the contract Mindbody says
 * is billing her answers instead (`headerContractWords`): its end date, and
 * "Renews on" only when Mindbody's flag or a trainer's mark says it renews.
 * With neither, it is "Contract ends", which is true either way.
 */
import type { Client } from "../../types";
import type { RenewalSnapshot } from "../renewals/types";
import { decideAutoRenew } from "../renewals/auto-renew";
import { studioDayKeyOf } from "../../lib/studio-time";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Nov 14, 2026" from "2026-11-14"; null for anything else. */
export function headerDay(ymd: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? "");
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${MONTHS[month - 1]} ${day}, ${m[1]}`;
}

export function headerRenewalWords(r: RenewalSnapshot | null | undefined): string | null {
  if (!r) return null;
  if (r.renewalOnBooks) {
    const starts = headerDay(r.renewalOnBooks.startsOn);
    return starts ? `Renewed · next starts ${starts}` : null;
  }
  if (r.paymentMode !== "monthly") return null;
  const day = headerDay(r.chargeDate);
  if (!day) return null;
  const est = r.chargeDateSource === "estimate" ? " (est.)" : "";
  if (r.autoRenews === true) return `Renews on ${day}${est}`;
  if (r.autoRenews === false) return `Billing ends ${day}${est}`;
  return `Payments finish ${day}${est}`;
}

type ContractLike = {
  status?: unknown;
  autopayStatus?: unknown;
  endDate?: unknown;
  isAutoRenewing?: unknown;
};

/** The renewal words from her Mindbody contracts, for a client with no snapshot yet. */
export function headerContractWords(
  client: Partial<Pick<Client, "mindbodyContracts" | "autoRenewMark" | "contractTierOverride">> | null | undefined,
  today: string,
): string | null {
  let best: { key: string; end: string; c: ContractLike } | null = null;
  for (const [key, raw] of Object.entries(client?.mindbodyContracts ?? {})) {
    const c = raw as ContractLike | null;
    if (!c || c.status !== "Active" || c.autopayStatus !== "Active") continue;
    const end = studioDayKeyOf(c.endDate as never);
    if (!end || end < today) continue;
    if (!best || end > best.end) best = { key, end, c };
  }
  if (!best) return null;
  const day = headerDay(best.end);
  if (!day) return null;
  const decided = decideAutoRenew({
    contractId: best.key,
    mindbody: best.c.isAutoRenewing,
    mark: client?.autoRenewMark ?? null,
    lock: client?.contractTierOverride ?? null,
    tierMatched: false,
  });
  if (decided?.renews === true) return `Renews on ${day}`;
  if (decided?.renews === false) return `Billing ends ${day}`;
  return `Contract ends ${day}`;
}
