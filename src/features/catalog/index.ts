/**
 * features/catalog — the barrel AppContent lazy-loads.
 *
 * `CatalogView` IS CatalogWikiView (Wiki Redesign, Sep 10 2026). The pre-wiki
 * screen was kept compiling for a week as a one-line rollback
 * (`LegacyCatalogView`) and nobody imported it; the beta-prep trim deleted it
 * on Sep 17 2026 - CatalogView.tsx, CatalogLanding.tsx, MachineDetail.tsx,
 * MachinePicker.tsx, MachinePickerBar.tsx, AnatomyStage.tsx,
 * ClinicalWarnings.tsx, Section.tsx, useLayoutMode.ts, accents.ts, and the old
 * Academy pane (features/academy/AcademyView.tsx + academy.css). The rollback
 * is now `git revert` of that commit.
 *
 * catalog.css and catalog.tokens.css STAY: main.tsx loads them for the whole
 * app, and StudioSetupCard and StudioNotesCard (both drawn by CatalogWikiView)
 * are styled by them.
 */

export { CatalogWikiView as CatalogView } from "./CatalogWikiView";
export type { CatalogWikiViewProps as CatalogViewProps } from "./CatalogWikiView";

export type { CatalogMachine } from "./types";
export {
  GROUPING_LABEL,
  GROUPING_MODES,
  academyCategoryOf,
  catalogOverview,
  dayKey,
  groupKeyOf,
  groupLabelOf,
  groupMachines,
  landingTiles,
  searchMachines,
  upkeepByMachine,
  upkeepEventsFrom,
  type CatalogOverview,
  type LandingTile,
} from "./grouping";
export type { GroupingMode } from "./types";
