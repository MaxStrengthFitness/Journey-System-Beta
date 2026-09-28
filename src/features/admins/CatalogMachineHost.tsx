/**
 * ONE CATALOG MACHINE, OPENED FROM SEARCH.
 *
 * The catalog's own list (features/admin/machines/AdminMachinesTab) keeps
 * which machine is open inside itself, so a search result cannot reach into
 * it. This opens the same editor the list opens, on the machine the search
 * found, re-read from the live catalog so a change made elsewhere is not
 * overwritten by a stale copy (the list does the same). Back returns to the
 * catalog.
 */
import { ArrowLeft } from "lucide-react";
import type { MachineCatalogEntry } from "../../types/machines";
import { LoadingMark } from "../../components/LoadingMark";
import { CatalogMachineEditor } from "../admin/machines/CatalogMachineEditor";
import { AdminButton, AdminNotice, AdminScreen } from "../admin/primitives";
import "../admin/catalog/catalog.css";
import "../admin/machines/editor/editor.css";

export function CatalogMachineHost({
  machineId,
  catalog,
  loading,
  failed,
  onBack,
}: {
  machineId: string;
  catalog: MachineCatalogEntry[];
  loading: boolean;
  failed: boolean;
  onBack: () => void;
}) {
  const live = catalog.find((m) => m.id === machineId);
  if (live) {
    return (
      <CatalogMachineEditor
        machine={live}
        existingIds={catalog.map((m) => m.id)}
        catalogSize={catalog.length}
        onBack={onBack}
      />
    );
  }
  return (
    <AdminScreen>
      {loading ? (
        <LoadingMark label="Opening the machine…" size="sm" />
      ) : (
        <AdminNotice tone={failed ? "warn" : "info"}>
          {failed
            ? "The machine catalog couldn't be read just now, so this machine can't be opened."
            : "That machine isn't in the catalog any more."}
        </AdminNotice>
      )}
      <div>
        <AdminButton onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to the catalog
        </AdminButton>
      </div>
    </AdminScreen>
  );
}
