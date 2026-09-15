export { ProfileHeader, type ProfileHeaderProps } from "./ProfileHeader";
export { BrandTiles, BRAND_TILE_COLORS } from "./BrandTiles";
export { resolvePackage, remainingLabel, type PackageSummary, type PackageSource } from "./client-package";
export { useTopTrainer, type TopTrainerState, type TopTrainerSource } from "./useTopTrainer";

/* The four-tab profile (Sep 2026). profile-nav.ts is the model; the two
   shells below are the consolidated tabs. */
export { ProgrammingTab, type ProgrammingTabProps } from "./ProgrammingTab";
export { ClinicalHistoryTab, type ClinicalHistoryTabProps } from "./ClinicalHistoryTab";
export { ProfileSubnav, type ProfileSubnavProps, type SubnavItem } from "./ProfileSubnav";
export { useProfileNav, type UseProfileNav } from "./useProfileNav";
export {
  DEFAULT_LOCATION,
  PROFILE_TABS,
  defaultProgrammingView,
  legacyLocation,
  type ClinicalView,
  type ProfileLocation,
  type ProfileTab,
  type ProgrammingView,
} from "./profile-nav";
