import React from "react";
import { Dumbbell, Info } from "lucide-react";
import { AdminMachineCreator } from "./AdminMachineCreator";
import {
  AdminHeader,
  AdminNotice,
  AdminScreen,
} from "../../features/admin/primitives";

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
 */
export function AdminMachinesTab({ isAdmin }: { isAdmin: boolean }) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<Dumbbell className="w-5 h-5" />}
        title="Machine catalog"
        subtitle="The shared default set. Every studio inherits these, so a correction here reaches every floor that has not overridden that field."
      />

      {!isAdmin && (
        <AdminNotice tone="info">
          <Info className="w-3.5 h-3.5 inline mr-1" />
          The catalog is shared by every location, so writes are limited to
          admins. To change what your own studio runs, open it under Studios —
          its Equipment panel is where local setup lives.
        </AdminNotice>
      )}

      <AdminMachineCreator />
    </AdminScreen>
  );
}
