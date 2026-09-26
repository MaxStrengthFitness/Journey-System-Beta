/**
 * What the Active Session says about where its sets are (session record, Sep 26 2026).
 *
 * AJ, on the Screen Atlas: "We need to have something that kind of notifies the
 * trainer that they have lost connection ... if the trainer has the screen open
 * and they run out of Wi-fi they should be able to just continue on and write
 * everything in and just once it reconnects it should save what is on the iPad."
 *
 * The sets already do that: every set is written to the iPad's own copy of the
 * database the moment it is sent, and the iPad passes it on when it can. What was
 * missing is the sentence. So: nothing at all while saves reach the database as
 * they should; one calm line while the iPad is offline; and one line if saves have
 * been waiting long enough to mean the connection is poor even though the iPad
 * thinks it is online (studio Wi-Fi with no internet behind it). Never red: this
 * is reassurance, not an error, and red is the rep-quality mark.
 */

/** Long enough that an ordinary save never shows it; short enough to be useful. */
export const STILL_SENDING_AFTER_MS = 8_000;

export type SendStatusKind = "offline" | "sending";

export interface SendStatus {
  kind: SendStatusKind;
  text: string;
}

export interface SendFacts {
  /** The browser's own answer. False is reliable; true can still mean no internet. */
  online: boolean;
  /** How long the oldest save not yet confirmed by the database has waited, 0 if none. */
  unsentForMs: number;
}

export function sendStatus({ online, unsentForMs }: SendFacts): SendStatus | null {
  if (!online) {
    return {
      kind: "offline",
      text: "Offline. Everything you enter is saved on this iPad and sends when the connection is back.",
    };
  }
  if (unsentForMs >= STILL_SENDING_AFTER_MS) {
    return {
      kind: "sending",
      text: "Saved on this iPad. Still sending: the connection is slow.",
    };
  }
  return null;
}
