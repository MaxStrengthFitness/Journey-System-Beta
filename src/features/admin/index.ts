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

export { StudioEquipmentPanel } from "./equipment/StudioEquipmentPanel";
export { UpkeepDialog } from "./upkeep/UpkeepDialog";
export { useStudioUpkeep } from "./upkeep/useStudioUpkeep";
export {
  DEFAULT_UPKEEP_POLICY,
  UPKEEP_LABEL,
  mergeUpkeepHistory,
  tallyUpkeep,
  upkeepStatus,
  worstStatus,
  type UpkeepEvent,
  type UpkeepKind,
  type UpkeepLogEntry,
  type UpkeepStatus,
  type UpkeepTally,
} from "./upkeep/upkeepLog";
export { LocalSetupDialog } from "./equipment/LocalSetupDialog";
export {
  REPLACING_SAFETY_FIELDS,
  buildClone,
  describeOverrides,
  isPlainAdoption,
  overriddenSafetyFields,
  pruneOverrides,
  type LocalMetadata,
} from "./equipment/clone";

export { AdminClientsTab } from "./clients/AdminClientsTab";
export {
  DEFAULT_READ_BUDGET,
  MIN_SEARCH_LENGTH,
  PAGE_SIZE,
  budgetLeft,
  matchesClient,
  newBudget,
  planClientQuery,
  spend,
  summarisePage,
  toPrefix,
  type ClientQueryPlan,
  type ReadBudget,
} from "./clients/clientQuery";

export { AdminStaffTab } from "./staff/AdminStaffTab";
export {
  buildStaffRoster,
  summariseRoster,
  type AccessRequest,
  type MindbodyStaff,
  type StaffRow,
  type StaffState,
} from "./staff/roster";

export { AdminStudiosTab } from "./studios/AdminStudiosTab";
export { ProvisionalPanel } from "./provisional/ProvisionalPanel";
export { ReconcileDialog } from "./provisional/ReconcileDialog";
export { mergeProvisionalClient } from "./provisional/mergeClient";
export {
  CLIENT_COMPOSITE_ID_COLLECTION,
  CLIENT_REFERENCE_FIELDS,
  checkMerge,
  isMergedAway,
  mergeSteps,
  rankCandidates,
  scoreCandidate,
  survivorPatch,
  tombstonePatch,
  type Candidate,
} from "./provisional/reconcile";
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

export { AdminAnnouncementsTab } from "./announcements/AdminAnnouncementsTab";
export { AnnouncementComposer } from "./announcements/AnnouncementComposer";
export {
  EMPTY_DRAFT,
  SHORT_CONTENT_MAX,
  announcementBody,
  audienceLabel,
  expiryFor,
  isTargeted,
  millis,
  resolveAudience,
  trainerStudioIds,
  unreadFor,
  validateDraft,
  visibleAnnouncements,
  type AnnouncementAuthor,
  type AnnouncementDraft,
  type AnnouncementScope,
  type AudienceFields,
  type Lifespan,
  type NetworkOption,
} from "./announcements/audience";

export { AdminMindbodyTab } from "./mindbody/AdminMindbodyTab";
export {
  DEFAULT_INTERVAL_MINUTES as MB_DEFAULT_INTERVAL_MINUTES,
  auditStudios,
  formatAge,
  linkStateOf,
  minutesSince,
  normaliseLog,
  orderLogs,
  summariseEstate,
  summariseHealth,
  syncStateOf,
  type EstateSummary,
  type HealthInput,
  type HealthSummary,
  type LinkState,
  type LogLevel,
  type LogLine,
  type StudioDiagnosis,
  type SyncState,
} from "./mindbody/diagnostics";

export { AdminBugReportsTab } from "./bugs/AdminBugReportsTab";
export {
  EMPTY_FILTER as EMPTY_REPORT_FILTER,
  KIND_LABEL as REPORT_KIND_LABEL,
  STATUS_LABEL as REPORT_STATUS_LABEL,
  STATUS_ORDER as REPORT_STATUS_ORDER,
  countReports,
  describeUserAgent,
  filterReports,
  orderReports,
  reportAsText,
  toReportView,
  type DiagnosticRow,
  type RawReport,
  type ReportCounts,
  type ReportFilter,
  type ReportStatus,
  type ReportView,
} from "./bugs/reportView";
