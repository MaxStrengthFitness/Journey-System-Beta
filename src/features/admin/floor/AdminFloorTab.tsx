/**
 * OPERATIONS → FLOOR — the machines, how they fit, and the routines.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): Catalog, Machine fit and
 * Routines become one tab called Floor — "the machines, how they fit, and
 * how they are grouped into routines"; "Catalog" is retired as a name here
 * because it collides with the learning catalog. And, asked whether Floor
 * should only look (My Studio → Machines already edits the floor): "look
 * and edit" — so the studio's floor editor is mounted here too, the SAME
 * component as My Studio → Machines (one implementation, two doors), never
 * a second editor.
 *
 * Three views, one segmented control:
 *   Machines     the floor — adopt the standard, add, retire, local set-up,
 *                the studio's settings and notes, offer a machine to MSF
 *                (my-studio/MachinesSection);
 *   Machine fit  who is set up unusually for their build, per machine
 *                (machine-fit/AdminMachineFitTab);
 *   Routines     company standards and this studio's templates
 *                (routines/AdminRoutineTemplatesTab).
 * Under "All my studios" every view needs one studio.
 */
import { useState } from "react";
import { UnsavedChangesScope, useLeaveScope } from "../../unsaved-changes";
import { ClipboardList, Dumbbell, Ruler } from "lucide-react";
import type { Client, Machine, Studio, Trainer } from "../../../types";
import { MachinesSection } from "../../my-studio/MachinesSection";
import { AdminMachineFitTab } from "../machine-fit/AdminMachineFitTab";
import { AdminRoutineTemplatesTab } from "../routines/AdminRoutineTemplatesTab";
import { AdminHeader, AdminScreen } from "../primitives";
import { PickOneStudio, useOperationsScope } from "../scope-context";
import "../../relay/board/relay.css";

export type FloorView = "machines" | "fit" | "routines";

export interface AdminFloorTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  trainers: Trainer[];
  machines: Machine[];
  clients: Client[];
  activeStudioId: string | null;
  isAdmin: boolean;
  onNavigateProfile?: (clientId: string) => void;
  /** Land on a view — the Overview's Machine fit line opens "fit". */
  initialView?: FloorView;
}

const VIEWS: Array<{ id: FloorView; label: string; icon: typeof Dumbbell }> = [
  { id: "machines", label: "Machines", icon: Dumbbell },
  { id: "fit", label: "Machine fit", icon: Ruler },
  { id: "routines", label: "Routines", icon: ClipboardList },
];

export function AdminFloorTab({ authTrainer, studios, trainers, machines, clients, activeStudioId, isAdmin, onNavigateProfile, initialView = "machines" }: AdminFloorTabProps) {
  const ops = useOperationsScope();
  const [view, setView] = useState<FloorView>(initialView);
  // Machines holds the floor editor, and a studio machine open in it;
  // another view unmounts both, so it asks first (unsaved changes, Sep 24 2026).
  const viewScope = useLeaveScope();
  const studio = studios.find((s) => s.id === activeStudioId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="adm-segmented self-start" role="tablist" aria-label="Floor view">
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" className="adm-seg" aria-selected={view === v.id} onClick={() => v.id !== view && viewScope.guard(() => setView(v.id))}>
            <v.icon className="w-3.5 h-3.5" />
            {v.label}
          </button>
        ))}
      </div>

      <UnsavedChangesScope scope={viewScope}>
      {ops.scope.kind === "all" ? (
        <PickOneStudio what="The Floor" />
      ) : view === "machines" ? (
        <AdminScreen>
          <AdminHeader
            icon={<Dumbbell className="w-5 h-5" />}
            title={studio ? `${studio.name} — Machines` : "Machines"}
            subtitle="The floor as it stands: adopt the MSF standard, add or retire a machine, set it up locally, keep the studio's settings and notes, offer one of yours to the catalog. The same editor as My Studio → Machines."
          />
          <MachinesSection authTrainer={authTrainer} trainers={trainers} />
        </AdminScreen>
      ) : view === "fit" ? (
        <AdminMachineFitTab machines={machines} clients={clients} studios={studios} activeStudioId={activeStudioId} isAdmin={isAdmin} onNavigateProfile={onNavigateProfile} />
      ) : (
        <AdminRoutineTemplatesTab studios={ops.readable} activeStudioId={activeStudioId} authTrainer={authTrainer} isAdmin={isAdmin} />
      )}
      </UnsavedChangesScope>
    </div>
  );
}
