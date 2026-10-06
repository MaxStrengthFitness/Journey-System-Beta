/**
 * THE CLIENT ERROR REPORTER: the one thing that posts to /api/log-error from
 * a running app. It lived inside src/main.tsx until the speed round (Oct 5
 * 2026), which moved it here, word for word, so the boot report (R30,
 * features/boot-timing) goes through the same door, under the same cap.
 *
 * The cap matters: the Firestore multi-tab assertion bug produced 3,664
 * errors in a single session, and the server is one Node process.
 * Unthrottled, an error storm turns into an accidental self-DoS.
 */

declare global {
  interface Window {
    /** Ring buffer of the last 10 reported errors, read by the feedback drawer. */
    __recentClientErrors?: { message: string; type: string; at: number }[];
  }
}

const MAX_ERROR_REPORTS = 50;
let errorReportCount = 0;

function post(payload: Record<string, unknown>): void {
  if (errorReportCount >= MAX_ERROR_REPORTS) return;
  errorReportCount += 1;
  const body =
    errorReportCount === MAX_ERROR_REPORTS
      ? { ...payload, note: "report cap reached; further errors go to the console only" }
      : payload;
  fetch("/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export function reportClientError(payload: Record<string, unknown>): void {
  // Mirrored into a small ring buffer the beta feedback drawer reads, so a
  // trainer's "it broke" arrives with the actual errors attached. Kept OUTSIDE
  // the report cap: the cap exists to stop an error storm from DoSing the
  // single Node process, and an in-memory array of 10 costs nothing.
  try {
    const buf = (window.__recentClientErrors ??= []);
    buf.push({
      message: String((payload as { message?: unknown }).message ?? "unknown"),
      type: String((payload as { type?: unknown }).type ?? "unknown"),
      at: Date.now(),
    });
    if (buf.length > 10) buf.splice(0, buf.length - 10);
  } catch {
    /* never let telemetry break the page it is reporting on */
  }
  post(payload);
}

/**
 * A report that is not an error (the boot timing): the same endpoint and the
 * same cap, but kept out of the feedback drawer's list of recent errors.
 * Never awaited, never throws.
 */
export function sendClientReport(payload: Record<string, unknown>): void {
  try {
    post(payload);
  } catch {
    /* never let telemetry break the page it is reporting on */
  }
}
