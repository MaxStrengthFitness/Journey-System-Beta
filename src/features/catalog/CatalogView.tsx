import { useEffect, useMemo, useState } from "react";
import type { Machine, Trainer } from "../../types";
import { useActiveStudio } from "../../ActiveStudioContext";
import { AnatomyStage } from "./AnatomyStage";
import { MachineDetail } from "./MachineDetail";
import { MachinePicker } from "./MachinePicker";
import { machinesForBodySlug } from "./anatomy";
import { useCatalogMachines } from "./useCatalogMachines";
import { useLayoutMode } from "./useLayoutMode";
import type { GroupingMode } from "./types";

/**
 * THE CATALOG.
 *
 * Round: Catalog Redesign, Sep 2026. Replaces
 * components/MachineAnatomyCatalogView.tsx (956 lines).
 *
 * This file owns four pieces of state — which machine, which side, which
 * figure, how the list is grouped — and nothing else. Everything below it is
 * derived, so selecting a machine costs no fetch.
 *
 * The old file was long for a structural reason, not a content one: portrait
 * and landscape were written as two independent render trees over the same
 * data, and they drifted. Same markup, different colours (#F06C22 inline in one
 * tree, bg-cta in the other), a line-clamp on one clinical note and not the
 * other, and a max-h-[50vh] scroll box on the portrait copy alone — which is
 * what buried Clinical Warnings inside a half-screen box on a screen that
 * already scrolled. One <MachineDetail>, two hosts, no drift.
 *
 * Layout, in full:
 *
 *   split  grid of three columns. The rail and the detail pane are the only
 *          scrollers, so the figure column simply never moves. No sticky
 *          positioning and no scroll listener are involved in keeping the
 *          model on screen.
 *
 *   stack  the root scrolls; nothing inside it does.
 */
export interface CatalogViewProps {
  /** The global list. Used only until this studio's roster is populated. */
  machines: Machine[];
  authTrainer?: Trainer | null;
}

export function CatalogView({ machines, authTrainer }: CatalogViewProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const layout = useLayoutMode();

  const { machines: catalogMachines, source } = useCatalogMachines(
    activeStudioId,
    machines,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"front" | "back">("front");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [grouping, setGrouping] = useState<GroupingMode>("movement");

  const selected = useMemo(
    () => catalogMachines.find((m) => m.id === selectedId) ?? null,
    [catalogMachines, selectedId],
  );

  // Land on a machine rather than an "Awaiting Selection" placeholder that
  // occupies the widest pane on the screen and says nothing.
  useEffect(() => {
    if (catalogMachines.length === 0) return;
    if (selectedId && catalogMachines.some((m) => m.id === selectedId)) return;
    setSelectedId(catalogMachines[0].id);
  }, [catalogMachines, selectedId]);

  // Turn the figure to the side that actually shows the activation, on EVERY
  // path that can change the selection. Doing this inside the click handler is
  // what let swiping the old carousel leave Hip Abduction rendered on the
  // anterior view, where none of its target muscles are visible.
  const preferredView = selected?.anatomy.preferredView;
  useEffect(() => {
    if (preferredView) setView(preferredView);
  }, [selectedId, preferredView]);

  const handleRegionClick = (slug: string) => {
    const owned = new Set(catalogMachines.map((m) => m.id));
    const target = machinesForBodySlug(slug).find((id) => owned.has(id));
    if (target) setSelectedId(target);
  };

  const author = authTrainer?.id
    ? { id: authTrainer.id, name: authTrainer.fullName ?? "" }
    : null;

  const stage = selected ? (
    <AnatomyStage
      anatomy={selected.anatomy}
      view={view}
      gender={gender}
      onViewChange={setView}
      onGenderChange={setGender}
      onRegionClick={handleRegionClick}
    />
  ) : null;

  const picker = (
    <MachinePicker
      machines={catalogMachines}
      selectedId={selectedId}
      onSelect={setSelectedId}
      grouping={grouping}
      onGroupingChange={setGrouping}
    />
  );

  if (catalogMachines.length === 0) {
    return (
      <div className={`cat cat--${layout}`}>
        <div className="cat__placeholder">
          <p className="cat__placeholder-title">No machines yet</p>
          <p className="cat__placeholder-body">
            {activeStudioId
              ? `${activeStudio?.name ?? "This studio"} has no machines on its roster. Add equipment from Hub → Machine Settings.`
              : "Select a studio to see its equipment."}
          </p>
        </div>
      </div>
    );
  }

  if (layout === "split") {
    return (
      <div className="cat cat--split" data-source={source}>
        <aside className="cat__pane" aria-label="Machines">
          {picker}
        </aside>

        <div className="cat__stage-col">{stage}</div>

        <aside className="cat__pane" aria-label="Machine detail">
          <div className="cat__scroller">
            {selected && (
              <MachineDetail
                machine={selected}
                studioId={activeStudioId}
                studioName={activeStudio?.name}
                author={author}
              />
            )}
          </div>
        </aside>
      </div>
    );
  }

  return (
    <div className="cat cat--stack" data-source={source}>
      {stage}

      <div className="cat__stack-picker">{picker}</div>

      {selected && (
        <MachineDetail
          machine={selected}
          studioId={activeStudioId}
          studioName={activeStudio?.name}
          author={author}
        />
      )}
    </div>
  );
}
