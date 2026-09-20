import { Dumbbell, Info } from "lucide-react";
import { AdminMachineCreator } from "./AdminMachineCreator";
import { SubmissionsQueue } from "../catalog/SubmissionsQueue";
import {
  AdminHeader,
  AdminNotice,
  AdminScreen,
} from "../primitives";
import "../catalog/catalog.css";

/**
 * MACHINE CATALOG — the master: every machine MSF knows, and the queue of
 * machines studios have offered it.
 *
 * This used to be two sub-tabs: Catalog, and Studio Equipment with its own
 * studio picker. The studio half moved onto the Studios screen (admin
 * overhaul), then to My Studio → Machines and Operations → Floor — the one
 * floor editor, two doors.
 *
 * What is left is genuinely global and genuinely admin-only: the catalog is
 * live-inherited by every location that has not deliberately overridden a
 * field, which is why firestore.rules limits writes here to admins and above
 * rather than to franchise owners.
 *
 * Operations round (Sep 2026): machines studios offer the catalog are
 * decided here (SubmissionsQueue). Operations overhaul (Sep 19): the tab
 * lives on the Admins dashboard beside the Standard template, which took the
 * standard set's membership and order (features/admins/StandardTemplateTab)
 * — the catalog is what exists, the template is what a new studio adopts.
 */
export function AdminMachinesTab({ isAdmin }: { isAdmin: boolean }) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<Dumbbell className="w-5 h-5" />}
        title="Machine catalog"
        subtitle="Every machine MSF knows. Every studio inherits these, so a correction here reaches every floor that has not overridden that field. Which of them make the standard set is the Standard template."
      />

      {!isAdmin && (
        <AdminNotice tone="info">
          <Info className="w-3.5 h-3.5 inline mr-1" />
          The catalog is shared by every location, so it is written by administrators only. Your own studio's floor — what it has, its
          settings and notes — is My Studio → Machines, or Operations → Floor.
        </AdminNotice>
      )}

      {isAdmin && <SubmissionsQueue />}
      <AdminMachineCreator canEdit={isAdmin} />
    </AdminScreen>
  );
}
