import { describe, expect, it } from "vitest";
import type { Client } from "../../../types";
import {
  DEFAULT_READ_BUDGET,
  MIN_SEARCH_LENGTH,
  PAGE_SIZE,
  budgetLeft,
  matchesClient,
  newBudget,
  planClientQuery,
  spend,
  summarisePage,
  toPrefix,
} from "./clientQuery";

const client = (over: Partial<Client> = {}): Client => ({
  firstName: "Laura",
  lastName: "Adelman",
  homeStudioId: "solon",
  height: "",
  isActive: true,
  remainingSessions: 0,
  ...over,
});

describe("toPrefix", () => {
  it("cases the prefix the way Firestore stores names", () => {
    // Firestore orders strings by byte value. "adel" starts AFTER every
    // capitalised name, so an uncased prefix is a search box that silently
    // finds nobody.
    expect(toPrefix("adel")).toBe("Adel");
    expect(toPrefix("ADELMAN")).toBe("Adelman");
    expect(toPrefix("  o'brien ")).toBe("O'brien");
  });

  it("refuses a term too short to be a search", () => {
    expect(toPrefix("a")).toBeNull();
    expect(toPrefix(" ")).toBeNull();
  });

  it("strips characters that would break the range", () => {
    expect(toPrefix("ade*")).toBe("Ade");
  });
});

describe("planClientQuery", () => {
  const budget = newBudget();

  it("allows a studio listing", () => {
    const plan = planClientQuery({ studioId: "solon", search: "", budget });
    expect(plan.refusal).toBeNull();
    expect(plan.prefix).toBeNull();
    expect(plan.pageSize).toBe(PAGE_SIZE);
  });

  it("allows a network-wide search", () => {
    const plan = planClientQuery({ studioId: null, search: "adelman", budget });
    expect(plan.refusal).toBeNull();
    expect(plan.prefix).toBe("Adelman");
  });

  it("refuses to list every client in the network", () => {
    // The one shape that cannot be bounded usefully: a scan whose only
    // product is a count that already exists on the Overview.
    expect(
      planClientQuery({ studioId: null, search: "", budget }).refusal,
    ).toMatchObject({ code: "needs-filter" });
  });

  it("refuses a one-character search", () => {
    // Not a search — the first keystroke of one. The old screen answered
    // every keystroke with a hundred-document query and threw each away.
    expect(
      planClientQuery({ studioId: "solon", search: "a", budget }).refusal,
    ).toMatchObject({ code: "search-too-short" });
    expect(MIN_SEARCH_LENGTH).toBeGreaterThan(1);
  });

  it("refuses once the mount's budget is spent", () => {
    const spentBudget = spend(newBudget(), DEFAULT_READ_BUDGET);
    expect(
      planClientQuery({ studioId: "solon", search: "", budget: spentBudget })
        .refusal,
    ).toMatchObject({ code: "budget-spent" });
  });

  it("lets an explicit request past the budget", () => {
    // Browsing past four pages should be a decision, not a side effect of
    // leaving a tab open.
    const spentBudget = spend(newBudget(), DEFAULT_READ_BUDGET);
    const plan = planClientQuery({
      studioId: "solon",
      search: "",
      budget: spentBudget,
      extended: true,
    });
    expect(plan.refusal).toBeNull();
    expect(plan.pageSize).toBe(PAGE_SIZE);
  });

  it("shrinks the last page to whatever budget remains", () => {
    const nearlySpent = spend(newBudget(), DEFAULT_READ_BUDGET - 10);
    expect(
      planClientQuery({ studioId: "solon", search: "", budget: nearlySpent })
        .pageSize,
    ).toBe(10);
  });

  it("checks the term before the filter, so a stray keystroke is not a scan", () => {
    const plan = planClientQuery({ studioId: null, search: "a", budget });
    expect(plan.refusal?.code).toBe("search-too-short");
  });
});

describe("budget", () => {
  it("counts down and never goes negative", () => {
    let b = newBudget(100);
    b = spend(b, 60);
    expect(budgetLeft(b)).toBe(40);
    b = spend(b, 80);
    expect(budgetLeft(b)).toBe(0);
  });
});

describe("matchesClient", () => {
  it("matches a first name, a surname, or the two together", () => {
    const c = client();
    expect(matchesClient(c, "laura")).toBe(true);
    expect(matchesClient(c, "adel")).toBe(true);
    expect(matchesClient(c, "laura adel")).toBe(true);
  });

  it("matches a Mindbody id", () => {
    expect(matchesClient(client({ mindbodyClientId: "100012" }), "100012")).toBe(
      true,
    );
  });

  it("keeps everything when the term is empty", () => {
    expect(matchesClient(client(), "  ")).toBe(true);
  });

  it("rejects a non-match", () => {
    expect(matchesClient(client(), "sexton")).toBe(false);
  });
});

describe("summarisePage", () => {
  it("says how many were read as well as how many are shown", () => {
    // The server ranges on surname; someone may have typed a first name. Not
    // saying so is what made the old search look broken — a hundred documents
    // read, none displayed, no explanation.
    const outcome = summarisePage(50, 3, 50);
    expect(outcome).toEqual({ read: 50, shown: 3, mayHaveMore: true });
  });

  it("knows a short page is the end", () => {
    expect(summarisePage(12, 12, 50).mayHaveMore).toBe(false);
  });
});
