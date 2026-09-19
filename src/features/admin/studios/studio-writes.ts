/**
 * Turning a details-form patch into the Firestore write.
 *
 * My Studio round, Sep 2026. Two screens save the same form
 * (StudioDetailsForm): Operations → Studios and My Studio → Studio. The
 * conversions below used to live inline in the Operations tab; they are
 * here so both doors write the same shape. Only the fields the form rendered
 * and the person changed are in `patch` — that is the whole point of the
 * diff — and an emptied optional field is removed, not written as "".
 *
 * PURE MODULE apart from Firestore's deleteField sentinel.
 */

import { deleteField } from "firebase/firestore";
import type { StudioForm } from "./StudioDetailsForm";

export function studioPatchPayload(patch: Partial<StudioForm>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...patch };
  if ("mindbodyLocationId" in payload) {
    const v = String(payload.mindbodyLocationId ?? "").trim();
    payload.mindbodyLocationId = v ? v : deleteField();
  }
  if ("mindbodySiteId" in payload) {
    payload.mindbodySiteId = String(payload.mindbodySiteId ?? "").trim();
  }
  if ("journeyCutoverDate" in payload) {
    // yyyy-mm-dd from a date input, or nothing: an unset cutover is "unknown"
    // (lib/prior-history), which is the honest state, so it is removed rather
    // than stored as an empty string that reads as a date.
    const v = String(payload.journeyCutoverDate ?? "").trim();
    payload.journeyCutoverDate = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : deleteField();
  }
  return payload;
}
