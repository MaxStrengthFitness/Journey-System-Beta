/**
 * Renewals (Sep 2026) — the public surface for the rest of the app.
 * The server imports the pure modules directly (engine.ts, settings.ts, ...),
 * never this barrel, so it never pulls in React or the Firebase web SDK.
 */
export type * from "./types";
export { buildRenewalSnapshot, ENGINE_VERSION } from "./engine";
export {
  DEFAULT_RENEWAL_SETTINGS,
  DEFAULT_PACKAGES,
  normalizeRenewalSettings,
  buildPackageNameIndex,
} from "./settings";
export {
  chipText,
  dayLabel,
  paceSentence,
  proofSentence,
  situationSentence,
  SITUATION_TONE,
} from "./sentences";
export {
  CONCERNS,
  LEANINGS,
  effectiveStage,
  latestLine,
  leaningLabel,
  concernLabel,
  promptText,
  renewalPromptDue,
} from "./conversation";
export { canManageRenewals, canTakePartInRenewals } from "./permissions";
export { useRenewalSettings } from "./useRenewalSettings";
export { useLiveRenewal } from "./useLiveRenewal";
export { useRenewalCycle, useRenewalTouches, logRenewalConversation } from "./useRenewalCycle";
export { LogConversationDialog } from "./LogConversationDialog";
export { RenewalCardDialog } from "./RenewalCardDialog";
