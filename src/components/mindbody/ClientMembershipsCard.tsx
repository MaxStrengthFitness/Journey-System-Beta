import React, { useMemo, useState } from "react";
import { BadgeCheck, FileText, RefreshCw, Ban } from "lucide-react";
import { Client, MindbodyContract, MindbodyMembership } from "../../types";
import {
  formatMindbodyDate,
  daysUntil,
  toDateSafe,
} from "../../lib/mindbody-dates";
import { syncClientCommercialData } from "../../lib/mindbody-commercial-sync";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";

/**
 * Read-only Mindbody membership + contract panel for the Admin tab.
 *
 * Owns no form state and writes nothing: these records are mirrored onto the
 * client document by the `clientMembershipAssignment.*` / `clientContract.*`
 * webhooks, so the only correct place to change them is Mindbody itself.
 *
 * Cancelled records are kept on the document rather than deleted, so the panel
 * shows active items by default and reveals the rest behind a toggle.
 */

const SECTION_LABEL =
  "text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-300 opacity-70 ml-1";

const CARD =
  "p-5 border border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50 dark:bg-slate-800/60 shadow-sm";

const EMPTY =
  "text-xs text-slate-500 dark:text-slate-400 font-medium italic px-1";

/** Small uppercase key/value pair matching the Admin tab's field rhythm. */
const MetaItem: React.FC<{ label: string; value: React.ReactNode }> = ({
  label,
  value,
}) => (
  <div className="space-y-1">
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
      {label}
    </p>
    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
      {value}
    </p>
  </div>
);

const StatusPill: React.FC<{ active: boolean }> = ({ active }) => (
  <span
    className={`shrink-0 px-3 py-1 rounded-xl text-[10px] font-extrabold uppercase tracking-widest border ${
      active
        ? "bg-[#38BDF8]/15 text-[#0284c7] dark:text-[#38BDF8] border-[#38BDF8]/40"
        : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700"
    }`}
  >
    {active ? "Active" : "Cancelled"}
  </span>
);

const MembershipRow: React.FC<{ membership: MindbodyMembership }> = ({
  membership,
}) => {
  const active = membership.status !== "Cancelled";
  return (
    <div className={`${CARD} flex items-center justify-between gap-4`}>
      <div className="flex items-center gap-3 min-w-0">
        {active ? (
          <BadgeCheck className="w-5 h-5 text-[#38BDF8] shrink-0" />
        ) : (
          <Ban className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200 break-words">
            {membership.membershipName || `Membership #${membership.membershipId}`}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-0.5">
            MBO ID {membership.membershipId}
            {membership.programName ? ` • ${membership.programName}` : ""}
            {typeof membership.sessionsRemaining === "number"
              ? ` • ${membership.sessionsRemaining}${
                  typeof membership.sessionCount === "number"
                    ? `/${membership.sessionCount}`
                    : ""
                } left`
              : ""}
            {active && formatMindbodyDate(membership.expirationDate)
              ? ` • Expires ${formatMindbodyDate(membership.expirationDate)}`
              : ""}
            {!active && formatMindbodyDate(membership.cancelledAt)
              ? ` • Ended ${formatMindbodyDate(membership.cancelledAt)}`
              : ""}
          </p>
        </div>
      </div>
      <StatusPill active={active} />
    </div>
  );
};

const ContractCard: React.FC<{ contract: MindbodyContract }> = ({
  contract,
}) => {
  const active = contract.status !== "Cancelled";
  const start = formatMindbodyDate(contract.startDate);
  const end = formatMindbodyDate(contract.endDate);
  const remaining = active ? daysUntil(contract.endDate) : null;

  // Only worth surfacing while the end date is genuinely near or past.
  const endsSoon = remaining !== null && remaining <= 30;

  return (
    <div className={`${CARD} space-y-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <FileText className="w-5 h-5 text-[#38BDF8] shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-200 break-words">
              {contract.contractName || `Contract #${contract.clientContractId}`}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-0.5">
              Client contract {contract.clientContractId}
              {contract.soldByStaffName
                ? ` • Sold by ${contract.soldByStaffName}`
                : ""}
            </p>
          </div>
        </div>
        <StatusPill active={active} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-3 border-t border-slate-200 dark:border-slate-800">
        <MetaItem label="Starts" value={start || "—"} />
        <MetaItem
          label="Ends"
          value={
            <span
              className={
                endsSoon ? "text-amber-600 dark:text-amber-400" : undefined
              }
            >
              {end || "—"}
            </span>
          }
        />
        <MetaItem
          label="Auto-renew"
          value={
            contract.isAutoRenewing === undefined ? (
              // The pull API reports AutopayStatus instead of a boolean.
              contract.autopayStatus || "—"
            ) : contract.isAutoRenewing ? (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 text-[#38BDF8]" />
                On
              </span>
            ) : (
              "Off"
            )
          }
        />
      </div>

      {active && remaining !== null && remaining <= 30 && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          {remaining < 0
            ? `Expired ${Math.abs(remaining)} day${Math.abs(remaining) === 1 ? "" : "s"} ago`
            : remaining === 0
              ? "Ends today"
              : `Ends in ${remaining} day${remaining === 1 ? "" : "s"}`}
          {contract.isAutoRenewing ? " • renews automatically" : ""}
        </p>
      )}

      {!active && formatMindbodyDate(contract.cancelledAt) && (
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
          Cancelled {formatMindbodyDate(contract.cancelledAt)}
        </p>
      )}
    </div>
  );
};

interface ClientMembershipsCardProps {
  client: Client;
}

export const ClientMembershipsCard: React.FC<ClientMembershipsCardProps> = ({
  client,
}) => {
  const [showInactive, setShowInactive] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const { availableStudios: studios } = useActiveStudio();
  const { success: toastSuccess, error: toastError } = useToast();

  const mindbodyClientId = client.mindbodyClientId || client.mindbodyId;
  // Multi-tenant rule, same as the demographics sync: a client is only ever
  // looked up against their OWN home studio's site. Another studio's site id
  // returns another studio's records.
  const homeStudio = studios.find((s) => s.id === client.homeStudioId);
  const canSync = Boolean(
    client.id && mindbodyClientId && homeStudio?.mindbodySiteId,
  );

  const handleSync = async () => {
    if (!client.id || !mindbodyClientId) {
      toastError("This client has no MindBody ID yet.");
      return;
    }
    if (!homeStudio?.mindbodySiteId) {
      toastError(
        `${homeStudio?.name || "This client's home studio"} has no MindBody Site ID configured.`,
      );
      return;
    }

    setIsSyncing(true);
    try {
      const result = await syncClientCommercialData({
        clientDocId: client.id,
        siteId: homeStudio.mindbodySiteId,
        mindbodyClientId,
      });

      if (result.contracts === 0 && result.memberships === 0) {
        toastSuccess("MindBody returned no contracts or memberships.");
      } else {
        toastSuccess(
          `Synced ${result.memberships} membership${result.memberships === 1 ? "" : "s"} and ${result.contracts} contract${result.contracts === 1 ? "" : "s"}.${
            result.partial ? " (One MindBody endpoint failed.)" : ""
          }`,
        );
      }
    } catch (e: any) {
      toastError(e?.message || "Failed to sync from MindBody.");
    } finally {
      setIsSyncing(false);
    }
  };

  const {
    activeMemberships,
    activeContracts,
    inactiveMemberships,
    inactiveContracts,
    inactiveCount,
  } = useMemo(() => {
    const memberships = Object.values(client.mindbodyMemberships || {});
    const contracts = Object.values(client.mindbodyContracts || {});

    const isActive = (r: { status?: string }) => r.status !== "Cancelled";

    // Soonest expiry first so the row a trainer needs to act on leads.
    const byEndDate = (a: MindbodyContract, b: MindbodyContract) => {
      const aTime = toDateSafe(a.endDate)?.getTime() ?? Infinity;
      const bTime = toDateSafe(b.endDate)?.getTime() ?? Infinity;
      return aTime - bTime;
    };

    const pastMemberships = memberships.filter((m) => !isActive(m));
    const pastContracts = contracts.filter((c) => !isActive(c)).sort(byEndDate);

    return {
      activeMemberships: memberships.filter(isActive),
      activeContracts: contracts.filter(isActive).sort(byEndDate),
      inactiveMemberships: pastMemberships,
      inactiveContracts: pastContracts,
      inactiveCount: pastMemberships.length + pastContracts.length,
    };
  }, [client.mindbodyMemberships, client.mindbodyContracts]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <p className={SECTION_LABEL}>Active Memberships</p>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              MindBody • Read-only
            </span>
            <button
              type="button"
              onClick={handleSync}
              disabled={isSyncing || !canSync}
              title={
                canSync
                  ? "Pull contracts and memberships from MindBody"
                  : "Needs a MindBody ID on the client and a Site ID on their home studio"
              }
              className="h-6 text-[11px] font-bold uppercase tracking-widest text-[#38BDF8] hover:text-[#0ea5e9] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw
                className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`}
              />
              {isSyncing ? "Syncing..." : "Sync"}
            </button>
          </div>
        </div>

        {activeMemberships.length > 0 ? (
          <div className="space-y-3">
            {activeMemberships.map((m) => (
              <MembershipRow key={String(m.membershipId)} membership={m} />
            ))}
          </div>
        ) : (
          <p className={EMPTY}>No active memberships synced from MindBody.</p>
        )}
      </div>

      <div className="space-y-4">
        <p className={SECTION_LABEL}>Active Contracts</p>

        {activeContracts.length > 0 ? (
          <div className="space-y-3">
            {activeContracts.map((c) => (
              <ContractCard key={String(c.clientContractId)} contract={c} />
            ))}
          </div>
        ) : (
          <p className={EMPTY}>No active contracts synced from MindBody.</p>
        )}
      </div>

      {inactiveCount > 0 && (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            className="text-[11px] font-bold uppercase tracking-widest text-[#38BDF8] hover:text-[#0ea5e9] transition-colors cursor-pointer ml-1"
          >
            {showInactive ? "Hide" : "Show"} {inactiveCount} past{" "}
            {inactiveCount === 1 ? "record" : "records"}
          </button>

          {showInactive && (
            <div className="space-y-3 opacity-75">
              {inactiveMemberships.map((m) => (
                <MembershipRow key={String(m.membershipId)} membership={m} />
              ))}
              {inactiveContracts.map((c) => (
                <ContractCard key={String(c.clientContractId)} contract={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ClientMembershipsCard;
