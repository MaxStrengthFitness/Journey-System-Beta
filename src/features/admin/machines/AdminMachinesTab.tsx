import { Dumbbell, Info } from "lucide-react";
import { AdminMachineCreator } from "./AdminMachineCreator";
import { StandardSetPanel } from "../../features/admin/catalog/StandardSetPanel";
import { SubmissionsQueue } from "../../features/admin/catalog/SubmissionsQueue";
import {
  AdminHeader,
  AdminNotice,
  AdminScreen,
} from "../primitives";
import "../catalog/catalog.css";

/**
 * MACHINE CATALOG — the global default set every studio picks from.
 *
 * This used to be two sub-tabs: Catalog, and Studio Equipment with its own
 * studio picker. The studio half has moved onto the Studios screen (section 5
 * of the admin overhaul), where the location it edits is the one already
 * selected — a picker inside a picker was one of the four "which studio am I
 * editing" answers the prep audit counted, and the most confusing of them.
 *
 * What is left is genuinely global and genuinely admin-only: the catalog is
 * live-inherited by every location that has not deliberately overridden a
 * field, which is why firestore.rules limits writes here to admins and above
 * rather than to franchise owners.
 *
 * Operations round (Sep 2026): the MSF standard set is a view of its own
 * (StandardSetPanel — membership and order, adopted by floors, never
 * pushed), and machines studios offer the catalog are decided here
 * (SubmissionsQueue, administrators). A franchise owner reads; the creator
 * no longer offers a form the rules will refuse.
 */
export function AdminMachinesTab({ isAdmin }: { isAdmin: boolean }) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<Dumbbell className="w-5 h-5" />}
        title="Machine catalog"
        subtitle="The MSF standard. Every studio inherits these, so a correction here reaches every floor that has not overridden that field — and a floor adopts the standard set, it is never pushed one."
      />

      {!isAdmin && (
        <AdminNotice tone="info">
          <Info className="w-3.5 h-3.5 inline mr-1" />
          The catalog is shared by every location, so it is written by administrators only. Your own studio's floor — what it has, its
          settings and notes — is My Studio → Machines.
        </AdminNotice>
      )}

      {isAdmin && <SubmissionsQueue />}
      <StandardSetPanel canEdit={isAdmin} />
      <AdminMachineCreator canEdit={isAdmin} />
    </AdminScreen>
  );
}
