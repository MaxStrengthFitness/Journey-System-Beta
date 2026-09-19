/**
 * Routine Builder — public surface.
 *
 * Round: Unified Routine Builder, Sep 2026.
 *
 * Callers should need `RoutineBuilder` and the types. Everything else is
 * exported for the surfaces that show a piece of the analysis outside the
 * builder itself — the Routines tab renders a coverage strip beside its
 * read-only cards, and the briefing shows the rotation panel before a routine
 * has been chosen.
 */

export { RoutineBuilder } from "./RoutineBuilder";

export type { MachineHistoryEntry } from "./types";

// The client-history dialogs ("Log past session", the session pop-up) render
// these three directly and run the analysis themselves, so they stay public.
export { CoverageStrip } from "./CoverageStrip";
export { MachinePicker } from "./MachinePicker";
export { SequenceMachineRow } from "./SequenceMachineRow";
export { analyzeRoutine } from "./engine";

export * from "./academy";
