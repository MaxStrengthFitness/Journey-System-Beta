export { ProfileHeader } from "./ProfileHeader";
export { resolvePackage } from "./client-package";
export { useTopTrainer } from "./useTopTrainer";
/* The door to Sessions before Journey (Sep 24 2026). */
export {
  canEditPriorHistory,
  draftFromPrior,
  priorHistoryDoorText,
  readPriorHistoryDraft,
  recordedByLine,
  statementChangesRecord,
} from "./prior-history-door";

/* The four-tab profile (Sep 2026). profile-nav.ts is the model; the two
   shells below are the consolidated tabs. */
export { ProgrammingTab } from "./ProgrammingTab";
export { ClinicalHistoryTab } from "./ClinicalHistoryTab";
export { useProfileNav } from "./useProfileNav";
export {
  PROFILE_TABS,
  defaultProgrammingView,
} from "./profile-nav";
