/**
 * features/openings/ui — the reads another feature reuses (the Wrap-up's
 * "Times with room" sheet, Team's door). See README.md.
 *
 * READS ONLY. The section lives in ./OpeningsSection and is imported from
 * its module (MyStudioView does), never through this door: the Wrap-up sits
 * in the session's chunk, and a section here would pull the section, Relay's
 * Context Panel and their stylesheets into it (the section's review, Sep 27
 * 2026). Nothing exported here imports a stylesheet.
 */
export {
  loadSummary,
  useOpeningsData,
  useOpeningsMarks,
  useOpeningsSummary,
  type MarksState,
  type OpeningsData,
  type OpeningsInput,
  type SummaryState,
} from "./useOpeningsData";
export { lineKey, useComingWeeks, useMonthRead, useNextSevenDays, type NextSevenDays } from "./useNextSevenDays";
export { showOpenings, type OpeningsPart, type WhoseTimes } from "./part-memory";
