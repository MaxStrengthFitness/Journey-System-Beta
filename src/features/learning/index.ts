/**
 * features/learning — the Learning tab: its front page, its one search, and
 * the link format every other feature uses to point into it.
 *
 * AppContent lazy-loads LearningView from here. The link helpers in ./ref are
 * pure and tiny, so AppContent (and the bell) import them from "./ref"
 * directly rather than through this barrel, which would pull the whole tab
 * into the first download.
 */

export { LearningView, type LearningViewId, type LearningViewProps } from "./LearningView";
export {
  LEARNING_KIND_LABEL,
  learningRefKey,
  learningRefLabel,
  learningSectionOf,
  parseLearningRef,
  refForWikiTarget,
  sameLearningRef,
  toStoredLearningRef,
  type LearningRef,
  type LearningRefKind,
  type StoredLearningRef,
} from "./ref";
