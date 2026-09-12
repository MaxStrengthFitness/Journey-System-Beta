import { createContext, useContext } from "react";
import type { MentionPerson } from "./comments";
import type { CommentAuthor } from "./mutations";

/**
 * Who is commenting, where, and who they can tag — provided once by the
 * Learning tab, read by every CommentsPanel on every page.
 *
 * A context rather than props because the panel sits on six kinds of page in
 * two screens (a machine, in both Catalog scopes; a studio page; an Academy
 * topic, card, script and deep dive), and threading four props through each
 * route is six chances to miss one. Outside the provider the panel renders
 * nothing, which is also what keeps it off the harness and any other
 * standalone use.
 */
export interface CommentsContextValue {
  studioId: string | null;
  studioName: string;
  /** The Firebase Auth uid and name; null when nobody is signed in. */
  author: CommentAuthor | null;
  /** The people at this studio who can be tagged. */
  people: MentionPerson[];
  /** The studio's leaders and administrators may take any comment down. */
  isLeaderHere: boolean;
}

const CommentsContext = createContext<CommentsContextValue | null>(null);

export const CommentsProvider = CommentsContext.Provider;

export function useCommentsContext(): CommentsContextValue | null {
  return useContext(CommentsContext);
}
