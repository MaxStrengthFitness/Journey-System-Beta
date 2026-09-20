/**
 * ADMINS → STANDARD TEMPLATE — what a new studio adopts in one step.
 *
 * AJ (Sep 18): a new studio adopts the standard set Max Strength recommends
 * — usually the standard 20 machines, which the owner of Max Strength may
 * adjust — and with it the company routines and the catalog's house
 * defaults, all in one "adopt the MSF standard" step. "We really want to
 * operate as one unit as a company." Two panels, then: the standard set
 * (membership and order on the catalog documents; adopted by floors, never
 * pushed — features/admin/catalog/StandardSetPanel) and the company
 * routines (features/admin/routines, the company tier; a studio's own
 * templates are edited on Operations → Floor → Routines).
 */
import { ClipboardList } from "lucide-react";
import type { Studio, Trainer } from "../../types";
import { StandardSetPanel } from "../admin/catalog/StandardSetPanel";
import { AdminRoutineTemplatesTab } from "../admin/routines/AdminRoutineTemplatesTab";
import { AdminHeader, AdminScreen } from "../admin/primitives";
import "../admin/catalog/catalog.css";

export interface StandardTemplateTabProps {
  authTrainer: Trainer;
  studios: Studio[];
  activeStudioId: string | null;
  isAdmin: boolean;
}

export function StandardTemplateTab({ authTrainer, studios, activeStudioId, isAdmin }: StandardTemplateTabProps) {
  return (
    <AdminScreen>
      <AdminHeader
        icon={<ClipboardList className="w-5 h-5" />}
        title="The standard template"
        subtitle="What a new studio adopts in one step: the standard set of machines, in order, and the company routines. A floor adopts the standard; it is never pushed one. A studio moves to a newer standard on its own timeline."
      />
      <StandardSetPanel canEdit={isAdmin} />
      <AdminRoutineTemplatesTab studios={studios} activeStudioId={activeStudioId} authTrainer={authTrainer} isAdmin={isAdmin} />
    </AdminScreen>
  );
}
