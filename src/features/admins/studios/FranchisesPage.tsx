/**
 * ADMINS → STUDIOS → FRANCHISES — who owns which studios, and whether the
 * registry agrees with itself.
 *
 * Round: the Admins room (Sep 28 2026). The two panels All locations held
 * under its list of studios, on a page of their own: the registry's health
 * (franchise links whose two sides disagree, with the repair) and the
 * franchises themselves (create, delete). Both moved, not rewritten.
 */
import { Network } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import { AdminHeader, AdminScreen } from "../../admin/primitives";
import { NetworksPanel } from "../../admin/studios/NetworksPanel";
import { RegistryHealthPanel } from "../../admin/studios/RegistryHealthPanel";

export function FranchisesPage({
  studios,
  networks,
  trainers,
  isAdmin,
  onRefresh,
}: {
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  isAdmin: boolean;
  onRefresh?: (collectionName: "studios" | "networks" | "trainers") => Promise<void>;
}) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<Network className="w-5 h-5" />}
        title="Franchises"
        subtitle="A franchise groups studios under one owner, for reporting and access. A studio belongs to at most one; which one is set on the studio's page too."
      />
      <RegistryHealthPanel networks={networks} studios={studios} onRefresh={onRefresh} />
      <NetworksPanel networks={networks} studios={studios} trainers={trainers} isAdmin={isAdmin} onRefresh={onRefresh} />
    </AdminScreen>
  );
}
