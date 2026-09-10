/**
 * features/catalog — the barrel AppContent lazy-loads.
 *
 * ROLLBACK IS ONE LINE, AND IT IS THIS ONE
 * ----------------------------------------
 * AppContent imports `CatalogView` from here and knows nothing else about
 * this feature. The Wiki Redesign (Sep 2026) therefore ships as a re-point:
 * `CatalogView` now resolves to CatalogWikiView, and the previous screen is
 * still on disk, still compiling, exported as `LegacyCatalogView`.
 *
 * To go back to the old Catalog, swap the two lines below. No other file in
 * the app needs to change, and nothing has been deleted to make room.
 *
 * Once the new one has been used on the floor for a couple of weeks, delete
 * CatalogView.tsx, CatalogLanding.tsx, MachineDetail.tsx, MachinePicker.tsx,
 * MachinePickerBar.tsx, AnatomyStage.tsx, ClinicalWarnings.tsx, Section.tsx,
 * useLayoutMode.ts, catalog.css and catalog.tokens.css — and move the
 * `@import` at the top of features/academy/academy.css onto
 * features/wiki/wiki.tokens.css, which is the one thing outside this folder
 * that still depends on the old token file.
 */

export { CatalogWikiView as CatalogView } from "./CatalogWikiView";
export type { CatalogWikiViewProps as CatalogViewProps } from "./CatalogWikiView";

/** The pre-wiki screen. Kept compiling as the rollback. See above. */
export { CatalogView as LegacyCatalogView } from "./CatalogView";

export type { CatalogMachine } from "./types";
export { CatalogLanding } from "./CatalogLanding";
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
