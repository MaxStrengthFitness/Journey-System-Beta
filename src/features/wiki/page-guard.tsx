import { createContext, useContext } from "react";

/**
 * ASK BEFORE A LINK UNMOUNTS THE PAGE (voice review follow-up, Sep 27 2026).
 *
 * Every Catalog and Academy page is plain state inside its section: a
 * breadcrumb, a related machine or a "See also" card swaps the page in place,
 * and whatever was typed on it (a studio note, the setup card, a page being
 * written, a comment) went with it without a word. WikiShell makes each page
 * a leave scope (features/unsaved-changes) and hands its `guard` down through
 * this context, so a link INSIDE the page can ask about the page before it
 * leaves it. Only typing inside the page is asked about.
 *
 * Without a WikiShell above it, the guard proceeds at once: a link rendered
 * anywhere else behaves exactly as it did.
 */
export type WikiPageGuard = (proceed: () => void) => void;

const proceedAtOnce: WikiPageGuard = (proceed) => proceed();

export const WikiPageGuardContext = createContext<WikiPageGuard>(proceedAtOnce);

export function useWikiPageGuard(): WikiPageGuard {
  return useContext(WikiPageGuardContext);
}
