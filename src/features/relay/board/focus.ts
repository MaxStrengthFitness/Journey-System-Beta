/**
 * THE NETWORK'S FOCUS THIS QUARTER — the one shape both sides read.
 *
 * Relay round, Sep 2026: the quarter's mastery series, a machine to try and a
 * line for the floor, kept on the network document (networks/{id}.relayFocus)
 * and shown on every studio's Floor as a quiet banner (FocusBanner). It was
 * set on My Studio → Relay → Network; since the voice-review round (Sep 27
 * 2026) it is set on Operations → All my studios (admin/network/
 * NetworkActions.tsx). The banner stays on the Floor, where the trainers are.
 *
 * PURE MODULE.
 */

export interface RelayFocus {
  mastery: string;
  machine: string;
  note: string;
  setBy?: { id: string; name: string };
  setAt?: unknown;
}

/** The focus on a network document, or null when none of its three lines is set. */
export function focusOf(network: { relayFocus?: unknown } | null | undefined): RelayFocus | null {
  const raw = network?.relayFocus as Partial<RelayFocus> | undefined;
  if (!raw || (!raw.mastery && !raw.machine && !raw.note)) return null;
  return { mastery: raw.mastery ?? "", machine: raw.machine ?? "", note: raw.note ?? "", setBy: raw.setBy, setAt: raw.setAt };
}

/**
 * The banner's first line: "This quarter · Mastery: Hip hinge · Try the Leg
 * Curl", or plain "This quarter" when only the line for the floor is set, so
 * the Floor never shows a separator with nothing after it.
 */
export function focusHeadline(focus: Pick<RelayFocus, "mastery" | "machine">): string {
  const parts = [focus.mastery && `Mastery: ${focus.mastery}`, focus.machine && `Try the ${focus.machine}`].filter(Boolean);
  return parts.length > 0 ? `This quarter · ${parts.join(" · ")}` : "This quarter";
}
