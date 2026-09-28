import { Share2 } from "lucide-react";
import "./machine-db.css";

/**
 * "Offer to all MSF studios" — one switch, on a machine, a note or a tip.
 *
 * Round: Learning + Planner, Sep 2026. AJ chose that the studio picks, each
 * time, so this sits on the thing being shared rather than in a setting.
 *
 * Since Sep 28 2026 sharing waits for an administrator (AJ: it "should
 * submit to admins first for review, we can review in admin dashboard"), so
 * the switch has four states, read from the document itself:
 *
 *   none       "Offer to all MSF studios"         a tap offers it
 *   pending    "Offered · waiting for review"     a tap withdraws the offer
 *   shared     "Shared with all MSF studios"      a tap stops sharing
 *   declined   "Offer again"                      the administrator's note
 *                                                  under it; a tap offers again
 *
 * It is a toggle button (aria-pressed while offered or shared) that says what
 * it is, with one line under it when there is something to know. Taking it
 * back is immediate and reversible, so there is no dialog.
 */

export type ShareState = "none" | "pending" | "shared" | "declined";

export interface Shareable {
  shared?: boolean;
  shareStatus?: "pending" | "approved" | "declined" | null;
  shareReviewNote?: string | null;
}

export function shareStateOf(item: Shareable): ShareState {
  if (item.shared === true) return "shared";
  if (item.shareStatus === "pending") return "pending";
  if (item.shareStatus === "declined") return "declined";
  return "none";
}

/** What a tap on the switch does: offer it (true) or take it back (false). */
export function tapOffers(item: Shareable): boolean {
  const state = shareStateOf(item);
  return state === "none" || state === "declined";
}

const LABEL: Record<ShareState, string> = {
  none: "Offer to all MSF studios",
  pending: "Offered · waiting for review",
  shared: "Shared with all MSF studios",
  declined: "Offer again",
};

export function ShareToggle({
  item,
  busy = false,
  disabled = false,
  onToggle,
}: {
  item: Shareable;
  busy?: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const state = shareStateOf(item);
  const note =
    state === "pending"
      ? "An administrator reads it before other studios see it. Tap to withdraw it."
      : state === "declined"
        ? `Not shared${item.shareReviewNote ? `: ${item.shareReviewNote}` : ". An administrator decided against it."}`
        : null;
  return (
    <span className="mdb-share-wrap">
      <button
        type="button"
        className={`mdb-share${state === "shared" || state === "pending" ? " mdb-share--on" : ""}`}
        aria-pressed={state === "shared" || state === "pending"}
        disabled={busy || disabled}
        onClick={onToggle}
      >
        <Share2 size={13} aria-hidden />
        {busy ? "Saving…" : LABEL[state]}
      </button>
      {note && <span className="mdb-share-note">{note}</span>}
    </span>
  );
}
