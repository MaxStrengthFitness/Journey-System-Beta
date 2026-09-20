import { useState } from "react";
import { Dumbbell, Info, Loader2 } from "lucide-react";
import { CatalogList } from "./CatalogList";
import { CatalogMachineEditor } from "./CatalogMachineEditor";
import { SubmissionsQueue } from "../catalog/SubmissionsQueue";
import { AdminHeader, AdminNotice, AdminScreen } from "../primitives";
import { useMachineCatalog } from "../../../hooks/useMachineCatalog";
import type { MachineCatalogEntry } from "../../../types/machines";
import "../catalog/catalog.css";
import "./editor/editor.css";

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
 * lives on the Admins dashboard beside the Standard template — the catalog is
 * what exists, the template is what a new studio adopts.
 *
 * Machine authoring (Sep 2026): opening a machine REPLACES this screen rather
 * than raising a dialog over it, the same way Overview → Changes does. A
 * machine is sixty fields and eight sections; it was never a modal.
 */
export function AdminMachinesTab({ isAdmin }: { isAdmin: boolean }) {
  const { catalog, loading } = useMachineCatalog();
  const [open, setOpen] = useState<
    { kind: "new" } | { kind: "machine"; machine: MachineCatalogEntry } | null
  >(null);

  if (open) {
    // Re-read the open machine from the live catalog rather than trusting the
    // object captured on click, so a change made elsewhere is not overwritten
    // by a stale copy on save. Same reason TrainerProfileView re-resolves.
    const live =
      open.kind === "machine"
        ? (catalog.find((m) => m.id === open.machine.id) ?? open.machine)
        : undefined;
    return (
      <CatalogMachineEditor
        machine={live}
        existingIds={catalog.map((m) => m.id)}
        catalogSize={catalog.length}
        onBack={() => setOpen(null)}
      />
    );
  }

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
          The catalog is shared by every location, so it is written by
          administrators only. Your own studio&apos;s floor — what it has, its
          settings and notes — is My Studio → Machines, or Operations → Floor.
        </AdminNotice>
      )}

      {isAdmin && <SubmissionsQueue />}

      {loading ? (
        <AdminNotice tone="info">
          <Loader2 className="w-3.5 h-3.5 inline mr-1 animate-spin" /> Loading the
          catalog…
        </AdminNotice>
      ) : (
        <CatalogList
          catalog={catalog}
          canEdit={isAdmin}
          onOpen={(machine) => setOpen({ kind: "machine", machine })}
          onNew={() => setOpen({ kind: "new" })}
        />
      )}
    </AdminScreen>
  );
}
