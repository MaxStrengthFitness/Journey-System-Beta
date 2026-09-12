/**
 * OPENING THE PLANNER AT A PARTICULAR PLACE, from elsewhere in the app.
 *
 * Round: Learning + Planner, Sep 2026. A client's profile shows the plans the
 * team has shared (Goals → Plans from the team), and from there a trainer can
 * start a plan for that client or open their own note to change it. Both land
 * in the Planner's Notes tab.
 *
 * Module state rather than a prop threaded through AppContent: the Planner
 * is not mounted while the profile is showing, so the request waits here
 * and the Planner reads it when it opens.
 *
 * Read with peek and cleared after mount, not taken in one call: React's
 * StrictMode runs state initialisers twice in development, and a take-once
 * read would hand the second run nothing.
 */

import type { NoteKind } from "./notes/types";

export type PlannerIntent =
  | { kind: "new-note"; client: { id: string; name: string }; noteKind?: NoteKind }
  | { kind: "open-note"; noteId: string };

let pending: PlannerIntent | null = null;

export function requestPlanner(intent: PlannerIntent): void {
  pending = intent;
}

export function peekPlannerIntent(): PlannerIntent | null {
  return pending;
}

export function clearPlannerIntent(intent: PlannerIntent | null): void {
  // Only clear the request this Planner read — never a newer one.
  if (intent && pending === intent) pending = null;
}
