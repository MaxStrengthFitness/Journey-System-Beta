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
  | { kind: "open-note"; noteId: string }
  /* Planner rework (Sep 2026): a notification about a team job opens it. */
  | { kind: "open-job"; jobId: string };

/**
 * A notification's `link.id` for the Planner, turned into a request.
 * "job:abc" opens a team job; anything else (older links carry a request id
 * or nothing) just opens the Planner.
 */
export function plannerIntentFromLink(id: string | undefined): PlannerIntent | null {
  if (!id) return null;
  if (id.startsWith("job:") && id.length > 4) return { kind: "open-job", jobId: id.slice(4) };
  return null;
}

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
