/**
 * What the Active Session says when it has nothing to draw (session record,
 * Sep 26 2026).
 *
 * It used to draw nothing at all: a blank page under the bottom bar, with no
 * header and no sentence. That happened when the client's record couldn't be
 * read, when the record wasn't there, and when a session and client were
 * both gone from the screen. A trainer on the floor then had nothing to tap
 * but the bottom bar, and no idea whether their session was lost. Now each
 * case says one honest sentence and offers the way on.
 */

export type NothingKind = "loading" | "failed" | "missing" | "no-session";

export interface NothingWords {
  title: string;
  body: string;
  /** The way forward first; "Back to the Hub" is always offered after it. */
  primary: "retry" | "find-client" | null;
}

export function nothingWords(kind: NothingKind): NothingWords {
  switch (kind) {
    case "loading":
      return { title: "Opening the client's record…", body: "This takes a moment on a slow connection.", primary: null };
    case "failed":
      return {
        title: "Couldn't read this client's record.",
        body: "Check the connection, then try again. Anything already saved on this iPad stays saved.",
        primary: "retry",
      };
    case "missing":
      return {
        title: "Journey has no record for this client.",
        body: "Find them in the client list, or go back to the Hub.",
        primary: "find-client",
      };
    case "no-session":
      return {
        title: "No session is open here.",
        body: "Choose a client to start one.",
        primary: "find-client",
      };
  }
}

/**
 * Which case it is. A client chosen but not on screen is still loading, or
 * its read failed, or it has no record; no client chosen means no session.
 */
export function nothingKind(clientId: string | null, lookup: "ready" | "loading" | "failed" | "missing" | undefined): NothingKind {
  if (!clientId) return "no-session";
  if (lookup === "failed" || lookup === "missing") return lookup;
  return "loading";
}
