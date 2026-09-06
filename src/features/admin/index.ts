/**
 * Admin surface — the shared kit every rebuilt admin screen composes.
 *
 * Read README.md in this folder before adding a screen: it is the list of
 * decisions this round settled, and re-deciding one of them locally is how
 * the surface fragmented the first time.
 */

export {
  AdminScreen,
  AdminHeader,
  AdminPanel,
  AdminRows,
  AdminRow,
  AdminGrid,
  AdminField,
  AdminInput,
  AdminTextarea,
  AdminSelect,
  AdminReadOnly,
  AdminButton,
  AdminBadge,
  AdminTiles,
  AdminStatTile,
  AdminNotice,
  AdminEmpty,
  ConfirmDialog,
  SaveBar,
} from "./primitives";

export { useDirtyForm, type DirtyForm } from "./useDirtyForm";

export { useAutoSync, isSyncConfigured, nextSyncLabel } from "./useAutoSync";
export type { AutoSyncState } from "./useAutoSync";

export {
  DEFAULT_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  claimIsStillDue,
  decideSync,
  intervalWithBackoff,
  nextDueAt,
  normaliseInterval,
  type SyncContext,
  type SyncVerdict,
} from "./syncPolicy";

export { AdminStudiosTab } from "./studios/AdminStudiosTab";
export { ProvisionalPanel } from "./provisional/ProvisionalPanel";
export {
  isProvisional,
  isSuperseded,
  mintProvisionalClient,
  mintProvisionalTrainer,
  nameKey,
  provisionalAgeDays,
  provisionalCount,
  validateMint,
  withoutSuperseded,
} from "./provisional/provisional";
export {
  PROVISIONAL_REASONS,
  type ProvisionalFields,
  type StudioMindbodyMode,
} from "./provisional/types";
export {
  deleteStudioPlan,
  findLocationConflict,
  findOrphans,
  hasOrphans,
  linkPlan,
  mindbodyLinkState,
  repairPlan,
  standardSetSeed,
  unlinkPlan,
  validateStudioIdentity,
  type MindbodyLinkState,
  type RegistryOrphans,
  type RegistryWrite,
} from "./studios/registry";

export { AdminOverviewTab } from "./AdminOverviewTab";
export type { AdminOverviewTabProps } from "./AdminOverviewTab";

export {
  attentionItems,
  entriesForDay,
  loadByDay,
  summariseFloor,
  trainerLanes,
  type AttentionItem,
  type AttentionKind,
  type DayLoad,
  type FloorSummary,
  type TrainerLane,
} from "./overview";

export {
  acknowledgeSaved,
  adoptExternal,
  beginSave,
  changedKeys,
  changedPatch,
  discardEdits,
  editField,
  editFields,
  hasUnsavedWork,
  initForm,
  isDirty,
  sameValue,
  saveFailed,
  saveSucceeded,
  type FormState,
  type SaveStatus,
} from "./formState";
