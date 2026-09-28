/**
 * REGISTRY NEEDS ATTENTION — franchise links whose two sides disagree.
 *
 * Moved from the All locations screen in the Admins room (Sep 28 2026),
 * unchanged. Left alone these quietly break studio filters; the repair is
 * registry.ts's repairPlan, applied as one batch. It renders nothing when
 * the registry agrees with itself.
 */
import { useMemo, useState } from "react";
import { ShieldCheck, Wrench } from "lucide-react";
import type { FranchiseNetwork, Studio } from "../../../types";
import { OperationType, handleFirestoreError } from "../../../lib/firestore-errors";
import { useToast } from "../../../contexts/ToastContext";
import { AdminButton, AdminNotice, AdminPanel } from "../primitives";
import { findOrphans, hasOrphans, repairPlan } from "./registry";
import { applyPlan } from "./registry-writes";

type Refresh = (c: "studios" | "networks" | "trainers") => Promise<void>;

export function RegistryHealthPanel({
  networks,
  studios,
  onRefresh,
}: {
  networks: FranchiseNetwork[];
  studios: Studio[];
  onRefresh?: Refresh;
}) {
  const { success: toastSuccess } = useToast();
  const [busy, setBusy] = useState(false);
  const orphans = useMemo(() => findOrphans(networks, studios), [networks, studios]);
  if (!hasOrphans(orphans)) return null;

  const total =
    orphans.danglingStudioIds.reduce((n, d) => n + d.studioIds.length, 0) +
    orphans.strandedStudios.length +
    orphans.oneSidedLinks.length;

  const repair = async () => {
    setBusy(true);
    try {
      await applyPlan(repairPlan(networks, studios));
      await onRefresh?.("networks");
      await onRefresh?.("studios");
      toastSuccess("Registry repaired.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, "networks");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPanel
      title="Registry needs attention"
      icon={<ShieldCheck className="w-3.5 h-3.5" />}
      subtitle="Franchise links where the two sides disagree. Left alone these quietly break studio filters."
      actions={
        <AdminButton variant="primary" size="sm" busy={busy} onClick={() => void repair()}>
          <Wrench className="w-3.5 h-3.5" />
          Repair {total}
        </AdminButton>
      }
    >
      <div className="flex flex-col gap-2">
        {orphans.danglingStudioIds.map((d) => (
          <AdminNotice key={d.networkId} tone="warn">
            <b>{d.networkName}</b> lists {d.studioIds.length} studio{d.studioIds.length === 1 ? "" : "s"} that no longer exist.
          </AdminNotice>
        ))}
        {orphans.strandedStudios.map((s) => (
          <AdminNotice key={s.studioId} tone="warn">
            <b>{s.studioName}</b> belongs to a franchise that no longer exists.
          </AdminNotice>
        ))}
        {orphans.oneSidedLinks.map((l) => (
          <AdminNotice key={`${l.networkId}-${l.studioId}`} tone="info">
            {l.side === "studio-only" ? (
              <>
                <b>{l.studioName}</b> says it is in {l.networkName}, but the franchise does not list it.
              </>
            ) : (
              <>
                <b>{l.networkName}</b> lists {l.studioName}, which says it belongs elsewhere.
              </>
            )}
          </AdminNotice>
        ))}
      </div>
    </AdminPanel>
  );
}
