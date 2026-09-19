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

export * from "./academy";
