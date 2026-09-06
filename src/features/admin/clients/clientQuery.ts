/**
 * What the System Clients screen is allowed to ask Firestore for.
 *
 * WHAT WAS WRONG
 *
 * The old screen's fetch effect depended on `searchTerm`, so it ran a
 * Firestore query on EVERY KEYSTROKE — typing "Adelman" was seven queries of
 * up to 100 documents each. It also counted the entire `clients` collection on
 * mount, unscoped, which at sixty studios of two to three hundred clients is a
 * scan of roughly eighteen thousand documents to render one number. And its
 * search took the first three letters of the term, ranged over `firstName`
 * with them, then re-filtered in JavaScript — so searching a surname returned
 * a hundred arbitrary people and then showed none of them.
 *
 * THE POLICY
 *
 * Every read is bounded, and the two unbounded shapes are refused outright
 * rather than made slow: a whole-network listing with no filter, and a query
 * fired before someone has typed enough to mean anything. A budget is spent
 * per mount and needs an explicit tap to extend, so a screen left open cannot
 * quietly page through the collection.
 *
 * Pure, because the interesting part is the refusals.
 */

import type { Client } from "../../../types";

export const PAGE_SIZE = 50;

/** Below this a search term is still being typed. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Documents one mount may read before asking. Four pages is enough to scroll
 * a studio's roster; past that someone is browsing, and browsing should be a
 * decision rather than a side effect of leaving a tab open.
 */
export const DEFAULT_READ_BUDGET = PAGE_SIZE * 4;

export type QueryRefusal =
  | { code: "needs-filter"; message: string }
  | { code: "search-too-short"; message: string }
  | { code: "budget-spent"; message: string };

export interface ClientQueryPlan {
  /** null means every studio — only allowed alongside a search term. */
  studioId: string | null;
  /**
   * The server-side range prefix, already cased for Firestore's byte
   * ordering, or null when the query is an unfiltered page.
   */
  prefix: string | null;
  pageSize: number;
  /** Set when the query must not run. */
  refusal: QueryRefusal | null;
}

export interface ReadBudget {
  spent: number;
  cap: number;
}

export function newBudget(cap: number = DEFAULT_READ_BUDGET): ReadBudget {
  return { spent: 0, cap };
}

export function spend(budget: ReadBudget, n: number): ReadBudget {
  return { ...budget, spent: budget.spent + n };
}

export function budgetLeft(budget: ReadBudget): number {
  return Math.max(0, budget.cap - budget.spent);
}

/**
 * Firestore orders strings by byte value, so a range query has to match the
 * stored casing. Names are stored title-cased, so "adel" has to become
 * "Adel" or the range starts after every capitalised name and returns
 * nothing — which is a search box that silently finds no one.
 */
export function toPrefix(term: string): string | null {
  const letters = term.trim().replace(/[^\p{L}\p{N}' -]/gu, "");
  if (letters.length < MIN_SEARCH_LENGTH) return null;
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase();
}

export function planClientQuery(input: {
  studioId: string | null;
  search: string;
  budget: ReadBudget;
  /** The user asked for more after the budget ran out. */
  extended?: boolean;
}): ClientQueryPlan {
  const search = input.search.trim();
  const base = { studioId: input.studioId, prefix: null, pageSize: PAGE_SIZE };

  // A search that is one character is not a search; it is the first keystroke
  // of one, and answering it costs a page of reads that gets thrown away.
  if (search.length > 0 && search.length < MIN_SEARCH_LENGTH) {
    return {
      ...base,
      refusal: {
        code: "search-too-short",
        message: `Type at least ${MIN_SEARCH_LENGTH} characters.`,
      },
    };
  }

  // Listing every client in the network with no filter is the one shape that
  // cannot be bounded usefully — it is a scan, and the count it produces is
  // already on the Overview.
  if (!input.studioId && !search) {
    return {
      ...base,
      refusal: {
        code: "needs-filter",
        message:
          "Pick a studio, or search by name. Listing every client in the network reads the whole collection.",
      },
    };
  }

  if (!input.extended && budgetLeft(input.budget) <= 0) {
    return {
      ...base,
      refusal: {
        code: "budget-spent",
        message: "That is as far as this page goes without asking again.",
      },
    };
  }

  return {
    ...base,
    prefix: search ? toPrefix(search) : null,
    pageSize: input.extended
      ? PAGE_SIZE
      : Math.min(PAGE_SIZE, budgetLeft(input.budget)),
    refusal: null,
  };
}

/**
 * The client-side refine over a page the server already narrowed.
 *
 * Needed because Firestore can range over ONE field, and a person searching
 * "adel" may mean a first name, a surname, or a Mindbody id. The server range
 * runs on the surname — the useful one for a client list — and this catches
 * the rest within the page that came back.
 */
export function matchesClient(client: Client, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    client.firstName,
    client.lastName,
    `${client.firstName ?? ""} ${client.lastName ?? ""}`,
    client.email,
    client.mindbodyId,
    client.mindbodyClientId,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/**
 * What a page of results means when the server narrowed on surname but the
 * user might have typed a first name.
 *
 * Returned separately from the rows so the screen can say "showing 3 of 50
 * read" rather than silently presenting a filtered page as though it were the
 * whole answer — which is what made the old screen's search look broken.
 */
export interface PageOutcome {
  read: number;
  shown: number;
  /** True when the server returned a full page, so more may exist. */
  mayHaveMore: boolean;
}

export function summarisePage(
  read: number,
  shown: number,
  pageSize: number,
): PageOutcome {
  return { read, shown, mayHaveMore: read >= pageSize };
}
