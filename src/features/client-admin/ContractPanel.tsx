import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, Lock, MapPin, ScrollText, Unlock } from "lucide-react";
import { cn } from "../../lib/utils";
import { mindbodyIdOf } from "../../lib/mindbody-id";
import { formatMindbodyDate, toDateSafe } from "../../lib/mindbody-dates";
import { studioTodayKey } from "../../lib/studio-time";
import { useActiveStudio } from "../../ActiveStudioContext";
import type { Client, Studio } from "../../types";
import { chipText, dayLabel, paceSentence, SITUATION_TONE } from "../renewals/sentences";
import {
  buildContractHistory,
  crossStudioClearance,
  currentContract,
  resolveContractTier,
  sessionsOnHand,
  tierLabel,
  PACKAGE_NAME,
  type CommitmentTerm,
  type ContractTermRow,
  type ContractTierOverride,
  type PaymentKind,
} from "./contract";
import "./client-admin.css";

/**
 * ADMIN — the contract, as three answers and the fine print.
 *
 *   What are they on?   Current tier, with where that came from, and a lock
 *   How much is left?   The renewal snapshot's sessions, payments and dates
 *   What have they had? Every package term, newest first
 *   Fine print          Mindbody IDs, sessions on hand, how they found us,
 *                       home studio and cross-studio access
 *
 * The lock is a coach field on the Save bar (`contractTierOverride`), like
 * every other coach field on the record. Nothing here syncs: the header's
 * Master Sync is the one sync.
 */

type FormClient = Partial<Client>;

export interface ContractPanelProps {
  client: Client;
  formData: FormClient;
  updateField: (key: keyof Client, value: unknown) => void;
  studios: Studio[];
  /** Who is signed in — named on a lock. */
  author?: { id?: string; name?: string } | null;
  /** Coach text fields, drawn by the dossier so they keep its look. */
  acquisition?: React.ReactNode;
}

const TERM_CHOICES: { term: CommitmentTerm | null; payment: PaymentKind; label: string }[] = [
  { term: 6, payment: "monthly", label: "6 mo · monthly" },
  { term: 12, payment: "monthly", label: "12 mo · monthly" },
  { term: 18, payment: "monthly", label: "18 mo · monthly" },
  { term: 6, payment: "pif", label: "6 mo · paid in full" },
  { term: 12, payment: "pif", label: "12 mo · paid in full" },
  { term: 18, payment: "pif", label: "18 mo · paid in full" },
  { term: null, payment: "month-to-month", label: "Month-to-month" },
];

const SOURCE_TEXT = {
  override: "Locked by a coach",
  renewal: "From the studio's package table",
  parsed: "Read from Mindbody names",
  unknown: "Mindbody hasn't said",
} as const;

const STATUS_TEXT: Record<ContractTermRow["status"], string> = {
  upcoming: "Starts soon",
  active: "Active",
  ended: "Ended",
  cancelled: "Cancelled",
};

const day = (d: Date | null) => (d ? formatMindbodyDate(d) : null);

export function ContractPanel({ client, formData, updateField, studios, author, acquisition }: ContractPanelProps) {
  const { activeStudioId } = useActiveStudio();
  const today = studioTodayKey();
  const [picking, setPicking] = useState(false);

  // The form holds the unsaved lock, the client the saved one.
  const pendingOverride =
    "contractTierOverride" in formData ? formData.contractTierOverride ?? null : client.contractTierOverride ?? null;
  const tier = useMemo(
    () => resolveContractTier({ ...client, contractTierOverride: pendingOverride }),
    [client, pendingOverride],
  );
  const detected = useMemo(() => resolveContractTier({ ...client, contractTierOverride: null }), [client]);
  const history = useMemo(() => buildContractHistory(client), [client]);
  const onHand = useMemo(() => sessionsOnHand(client), [client]);
  const contract = currentContract(client);
  const r = client.renewal ?? null;

  const lock = (term: CommitmentTerm | null, payment: PaymentKind) => {
    const next: ContractTierOverride = {
      term,
      payment,
      setAt: new Date().toISOString(),
      ...(author?.id ? { setById: author.id } : {}),
      ...(author?.name ? { setByName: author.name } : {}),
    };
    updateField("contractTierOverride", next);
    setPicking(false);
  };
  const unlock = () => {
    updateField("contractTierOverride", null);
    setPicking(false);
  };

  /* ---- time & sessions ---- */
  const contractEnd = toDateSafe(contract?.endDate);
  const sessionsHeld = onHand.reduce((n, s) => n + s.remaining, 0);
  const sessionsLeft = r?.sessionsLeft ?? (onHand.length ? sessionsHeld : null);
  const sessionsSource = r?.sessionsLeft != null ? r.sessionsLeftSource : onHand.length ? "mindbody" : null;
  const renewDate = r?.chargeDate ? dayLabel(r.chargeDate, today) : day(contractEnd);
  const tone = r ? SITUATION_TONE[r.situation] : "neutral";

  const home = studios.find((s) => s.id === client.homeStudioId);
  const clearance = crossStudioClearance(
    { homeStudioId: client.homeStudioId, approvedCrossTrainStudioIds: formData.approvedCrossTrainStudioIds ?? client.approvedCrossTrainStudioIds },
    activeStudioId,
  );
  const hereName = studios.find((s) => s.id === activeStudioId)?.name;
  const approved = formData.approvedCrossTrainStudioIds || client.approvedCrossTrainStudioIds || [];
  const toggleStudio = (id: string) =>
    updateField(
      "approvedCrossTrainStudioIds",
      approved.includes(id) ? approved.filter((s) => s !== id) : [...approved, id],
    );

  const mbId = mindbodyIdOf(client);

  return (
    <div className="cadm">
      <div className="cadm-pillars">
        {/* 1 — what are they on */}
        <section className="cadm-card" aria-label="Current contract tier">
          <span className="cadm-kicker">Current tier</span>
          <p className="cadm-big">{tier.label}</p>
          <p className="cadm-sub">
            <span className={cn("cadm-src", `cadm-src--${tier.source}`)}>
              {tier.source === "override" ? <Lock size={11} aria-hidden /> : null}
              {SOURCE_TEXT[tier.source]}
            </span>
            {tier.evidence ? <span>{tier.evidence}</span> : null}
          </p>
          {tier.source === "override" && detected.source !== "unknown" && detected.label !== tier.label && (
            <p className="cadm-note">Mindbody reads as: {detected.label}</p>
          )}
          <div className="cadm-actions">
            <button type="button" className="cadm-btn" onClick={() => setPicking((v) => !v)} aria-expanded={picking}>
              <Lock size={13} aria-hidden />
              {tier.source === "override" ? "Change lock" : "Lock the tier"}
            </button>
            {pendingOverride && (
              <button type="button" className="cadm-btn cadm-btn--ghost" onClick={unlock}>
                <Unlock size={13} aria-hidden />
                Use Mindbody's
              </button>
            )}
          </div>
          {picking && (
            <div className="cadm-picker" role="group" aria-label="Lock the contract tier">
              {TERM_CHOICES.map((c) => {
                const on = pendingOverride?.payment === c.payment && (pendingOverride?.term ?? null) === c.term;
                return (
                  <button
                    key={c.label}
                    type="button"
                    className={cn("cadm-choice", on && "cadm-choice--on")}
                    aria-pressed={on}
                    onClick={() => lock(c.term, c.payment)}
                    title={c.term ? `${PACKAGE_NAME[c.term]} — ${tierLabel(c.term, c.payment)}` : "Month-to-month"}
                  >
                    {c.label}
                  </button>
                );
              })}
              <p className="cadm-note">Saved with the record. A lock wins over Mindbody until it is removed.</p>
            </div>
          )}
        </section>

        {/* 2 — how much is left */}
        <section className="cadm-card" data-tone={tone} aria-label="Time and sessions remaining">
          <span className="cadm-kicker">Remaining</span>
          <div className="cadm-nums">
            <div>
              <p className="cadm-big">{sessionsLeft ?? "—"}</p>
              <p className="cadm-sub">
                sessions left{sessionsSource === "estimate" ? " (estimated)" : ""}
              </p>
            </div>
            {r?.paymentsLeft != null && (
              <div>
                <p className="cadm-big">{r.paymentsLeft}</p>
                <p className="cadm-sub">payments to go</p>
              </div>
            )}
            <div>
              <p className="cadm-big cadm-big--date">{renewDate ?? "—"}</p>
              <p className="cadm-sub">
                {r?.autoRenews === false ? "billing ends" : r?.chargeDate || contractEnd ? "renews / ends" : "no end date on file"}
              </p>
            </div>
          </div>
          <p className="cadm-line">
            <CalendarClock size={13} aria-hidden />
            {r ? chipText(r, today) : "Renewal not worked out yet — it appears after the nightly run."}
          </p>
          {r && <p className="cadm-note">{paceSentence(r)}</p>}
          {r?.conversationDue && !r.renewalOnBooks && (
            <p className="cadm-due">Time for the renewal conversation — a progress report now lands before the decision.</p>
          )}
          {r?.dataGaps?.length ? <p className="cadm-note">{r.dataGaps[0]}</p> : null}
        </section>
      </div>

      {/* 3 — what have they had */}
      <section className="cadm-card" aria-label="Contract history">
        <span className="cadm-kicker">
          <ScrollText size={12} aria-hidden /> Contract history
        </span>
        {history.length === 0 ? (
          <p className="cadm-note">
            No contracts or paid-in-full packages on file{mbId ? " — Sync at the top of the profile pulls them." : "."}
          </p>
        ) : (
          <ol className="cadm-timeline">
            {history.map((row) => (
              <li key={row.key} className="cadm-term" data-status={row.status}>
                <div className="cadm-term__top">
                  <b>{row.name}</b>
                  <span className="cadm-pill" data-status={row.status}>
                    {STATUS_TEXT[row.status]}
                  </span>
                  {row.tier?.term ? <span className="cadm-pill">{row.tier.term} mo</span> : null}
                  {row.kind === "paid-in-full" ? <span className="cadm-pill">Paid in full</span> : null}
                  {row.autoRenews ? <span className="cadm-pill">Auto-renews</span> : null}
                  {row.boughtOnline ? <span className="cadm-pill">Bought online</span> : null}
                </div>
                <p className="cadm-term__when">
                  {day(row.start) ?? "Start not synced"} → {day(row.end) ?? (row.kind === "contract" ? "open-ended" : "no expiry")}
                  {row.sessions?.count != null
                    ? ` · ${row.sessions.remaining ?? "?"} of ${row.sessions.count} sessions left`
                    : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Access — the question a visiting client raises at the front desk. */}
      <section className="cadm-card" aria-label="Home studio and access">
        <span className="cadm-kicker">
          <MapPin size={12} aria-hidden /> Home studio &amp; access
        </span>
        <p className="cadm-line cadm-line--strong">
          Home: {home?.name || client.homeStudioId || "not set"}
          {clearance === "approved" && hereName ? ` · cleared to train at ${hereName}` : ""}
          {clearance === "not-approved" && hereName ? ` · NOT yet cleared to train at ${hereName}` : ""}
        </p>
        <div className="cadm-picker">
          {studios.filter((s) => s.id && s.id !== client.homeStudioId).length === 0 ? (
            <p className="cadm-note">No other studios to approve.</p>
          ) : (
            studios
              .filter((s) => s.id && s.id !== client.homeStudioId)
              .map((s) => {
                const on = approved.includes(s.id!);
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={on}
                    className={cn("cadm-choice", on && "cadm-choice--on")}
                    onClick={() => toggleStudio(s.id!)}
                  >
                    {s.name}
                  </button>
                );
              })
          )}
        </div>
        <p className="cadm-note">Tap a studio to approve cross-training there. Saved with the record.</p>
      </section>

      {/* The fine print: everything a leader needs once in a while. */}
      <details className="cadm-card cadm-fine">
        <summary>
          <span className="cadm-kicker">Fine print</span>
          <span className="cadm-note">Mindbody IDs, sessions on hand, how they found us</span>
          <ChevronDown size={16} aria-hidden className="cadm-fine__chev" />
        </summary>
        <dl className="cadm-dl">
          <div>
            <dt>Mindbody client ID</dt>
            <dd>{mbId ?? "Not linked"}</dd>
          </div>
          {contract && (
            <div>
              <dt>Current contract</dt>
              <dd>
                #{String(contract.clientContractId)}
                {contract.agreementDate ? ` · signed ${formatMindbodyDate(contract.agreementDate)}` : ""}
                {contract.soldByStaffName ? ` · sold by ${contract.soldByStaffName}` : ""}
                {contract.autopayStatus ? ` · autopay ${contract.autopayStatus.toLowerCase()}` : ""}
              </dd>
            </div>
          )}
          <div>
            <dt>Sessions on hand</dt>
            <dd>
              {onHand.length === 0
                ? "None reported"
                : onHand.map((s) => `${s.name}: ${s.remaining}${s.count != null ? ` of ${s.count}` : ""}`).join(" · ")}
            </dd>
          </div>
          {Object.values(client.mindbodyMemberships || {}).some((m) => m.status === "Active") && (
            <div>
              <dt>Memberships</dt>
              <dd>
                {Object.values(client.mindbodyMemberships || {})
                  .filter((m) => m.status === "Active")
                  .map((m) => m.membershipName || `#${m.membershipId}`)
                  .join(" · ")}
              </dd>
            </div>
          )}
          <div>
            <dt>Last commercial pull</dt>
            <dd>{formatMindbodyDate(client.mindbodyCommercialSyncedAt) ?? "Never"}</dd>
          </div>
        </dl>
        {acquisition}
      </details>
    </div>
  );
}
