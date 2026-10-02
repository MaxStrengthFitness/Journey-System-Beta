/**
 * Is Journey on a phone? The one answer (Journey Lite, Oct 1 2026).
 *
 * Lite is not a second app: it is Journey laid out for a phone (AJ, Oct 1
 * 2026: "its not that its a serperat app its just the phone style of it").
 * Every screen that draws differently on a phone asks THIS, never its own
 * width check, so a phone is the same phone everywhere.
 *
 * A phone held upright is under 600px wide. Turned sideways it is 700–930px
 * wide but under 500px tall, which no iPad ever is (an iPad mini in landscape
 * is 744px tall), so a short screen with a touch pointer is a phone too.
 */
import { useMediaQuery } from "../../hooks/useMediaQuery";

export const PHONE_QUERY = "(max-width: 599px), (max-height: 499px) and (pointer: coarse)";

/** True while the screen is a phone's; re-renders when that changes. */
export function usePhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/** The same answer outside React (once, at the moment it is asked). */
export function isPhoneNow(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(PHONE_QUERY).matches
  );
}
