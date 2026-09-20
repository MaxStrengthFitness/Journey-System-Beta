import { isDemoRecord, isDemoStudioId } from "./is-demo";

/**
 * Demo Mode guards.
 *
 * Two directions have to be blocked, and they fail in OPPOSITE ways on
 * purpose:
 *
 *  1. REAL DATA REACHED FROM DEMO MODE. A trainer practising deletes a client
 *     or logs a session — and it lands on a real record. This is the one that
 *     actually destroys something, so it THROWS rather than warns.
 *
 *  2. DEMO DATA REACHING REAL SYSTEMS. Practice sessions counted in a studio's
 *     numbers, a demo client pushed to Mindbody, a demo row on a payroll
 *     sheet. Nothing is destroyed, but the numbers quietly stop being true,
 *     which is worse than an obvious failure because nobody notices. These
 *     SKIP — a nightly job that threw on the demo studio would take the real
 *     studios queued behind it down with it.
 *
 * These are belt AND braces with the Firestore rules, deliberately: the rules
 * are the boundary that cannot be bypassed, and these are the boundary that
 * produces a readable sentence instead of PERMISSION_DENIED.
 */

/** Thrown when a write would cross the demo/real boundary. */
export class DemoBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoBoundaryError";
  }
}

/**
 * Operations that must never run against the demo studio, because they reach
 * the world outside the app. Demo Mode has no Mindbody site of its own, and
 * syncing it would pull REAL client records into the sandbox — the leak runs
 * in both directions.
 */
export const EXTERNAL_OPERATIONS = [
  "mindbody_sync",
  "mindbody_push",
  "client_notification",
  "trainer_notification",
  "scheduled_report",
  "data_export",
] as const;

export type ExternalOperation = (typeof EXTERNAL_OPERATIONS)[number];

/**
 * True when an outward-facing operation should be skipped for this studio.
 * Callers SKIP rather than throw — see the header.
 */
export function skipsForDemo(
  operation: ExternalOperation,
  studioId?: string | null,
): boolean {
  return (
    EXTERNAL_OPERATIONS.includes(operation) && isDemoStudioId(studioId ?? null)
  );
}

/**
 * The important one. Called before a write, with the studio the trainer is
 * currently inside and the record being written.
 *
 * Inside the demo studio you may only touch demo records; inside a real studio
 * you may not touch demo records. A mismatch means a screen passed the wrong
 * id somewhere, which is a bug worth surfacing loudly rather than persisting.
 */
export function assertSameRealm(
  activeStudioId: string | null | undefined,
  target: Parameters<typeof isDemoRecord>[0],
  description = "record",
): void {
  const inDemo = isDemoStudioId(activeStudioId ?? null);
  const targetIsDemo = isDemoRecord(target);

  if (inDemo && !targetIsDemo) {
    throw new DemoBoundaryError(
      `Demo Mode cannot change a live ${description}. Leave Demo Mode to work with real clients.`,
    );
  }
  if (!inDemo && targetIsDemo) {
    throw new DemoBoundaryError(
      `This ${description} belongs to Demo Mode and cannot be changed from a live studio.`,
    );
  }
}

/** Non-throwing form, for rendering a disabled state instead of an error. */
export function isSameRealm(
  activeStudioId: string | null | undefined,
  target: Parameters<typeof isDemoRecord>[0],
): boolean {
  return isDemoStudioId(activeStudioId ?? null) === isDemoRecord(target);
}
