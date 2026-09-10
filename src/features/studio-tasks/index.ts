export { StudioTasksView } from "./StudioTasksView";
export type { StudioTasksViewProps } from "./StudioTasksView";
export { useMachineUpkeep } from "./useMachineUpkeep";
export type { MachineUpkeep } from "./useMachineUpkeep";
export { useStudioTasks } from "./useStudioTasks";
export { useStudioTaskCategories } from "./useStudioTaskCategories";
export type {
  TaskTemplate,
  TaskInstance,
  TaskRow,
  TaskCategory,
  StudioTaskCategory,
  UpkeepRole,
} from "./types";
export {
  BUILT_IN_CATEGORIES,
  CATEGORY_LABEL,
  categoryLabel,
  upkeepRoleOf,
} from "./types";
export { MachineUpkeepCard } from "./MachineUpkeepCard";
export { notifyTaskCompletion, shouldNotifyOnComplete } from "./notify";
export { ManagePanel } from "./ManagePanel";
export { useTaskCompliance } from "./useTaskCompliance";
export { useStudioRequests, useRequestReplies } from "./useStudioRequests";
export {
  createRequest,
  setRequestClaim,
  resolveRequest,
  reopenRequest,
  addRequestReply,
  deleteRequest,
  REQUEST_KIND_LABEL,
  REQUEST_KIND_HINT,
} from "./requests";
export type {
  TaskRequest,
  TaskRequestReply,
  RequestKind,
  RequestPriority,
  RequestStatus,
} from "./requests";
export { TaskNoteDialog } from "./TaskNoteDialog";
export {
  setTaskStatus,
  setTaskClaim,
  setManyTaskClaims,
  setManyTaskAssignments,
  studioLocation,
  saveStudioCategory,
  deleteStudioCategory,
  newCategoryId,
} from "./mutations";

/* ------------------------------------------------------------------ *
 * STUDIO HUB (Sep 2026)
 *
 * Added alongside StudioTasksView rather than replacing it, so both can be
 * rendered while the new screen is reviewed on the iPad.
 * ------------------------------------------------------------------ */
export { StudioHubView } from "./StudioHubView";
export type { StudioHubViewProps } from "./StudioHubView";
export { ShiftStrip } from "./ShiftStrip";
export { AssignDialog, ASSIGN_DURATIONS } from "./AssignDialog";
export type { AssignDialogProps } from "./AssignDialog";
export { ClientTasksLane } from "./ClientTasksLane";
export { InitiativeRollup } from "./InitiativeRollup";
export { MachinePlaybookCard } from "./MachinePlaybookCard";
export { PlaybookLane } from "./PlaybookLane";
export { useTaskActions } from "./useTaskActions";
export type { TaskActions } from "./useTaskActions";
export { ResolveDialog } from "./ResolveDialog";
export { SubmitInitiativeDialog } from "./SubmitInitiativeDialog";
export { PostInitiativeDialog } from "./PostInitiativeDialog";

export {
  shiftGroups,
  shiftGroupCredit,
  shiftTotals,
  mineRows,
  buildBoard,
  topicCounts,
  topicOf,
  heatOf,
  daysUntil,
  matchesTopic,
  BOARD_TOPIC_LABEL,
} from "./board";
export type {
  BoardTopic,
  BoardHeat,
  BoardCardView,
  ShiftGroup,
  TaskActor,
} from "./board";

export {
  draftFromRequest,
  searchPlaybook,
  staleness,
  needsReview,
  withConfirmation,
  PLAYBOOK_TITLE_MAX,
  PLAYBOOK_BODY_MAX,
} from "./playbook";
export type { PlaybookEntry, PlaybookDraft, PlaybookHit } from "./playbook";

export { usePlaybook, useMachinePlaybook } from "./usePlaybook";
export {
  savePlaybookEntry,
  confirmPlaybookEntry,
  retirePlaybookEntry,
  restorePlaybookEntry,
  saveSubmission,
  fetchSubmissions,
  watchSubmissions,
} from "./playbook-mutations";

export {
  initiativeProgress,
  myShare,
  studioRoster,
  withEntry,
  withoutEntry,
} from "./initiatives";
export type {
  InitiativeTarget,
  InitiativeSubmission,
  SubmissionEntry,
  InitiativeProgress,
  TrainerProgress,
} from "./initiatives";

export { resolveAndMaybeKeep } from "./resolve-flow";
export { outcomeMessage } from "./resolve-outcome";
export type { ResolveOutcome } from "./resolve-outcome";
