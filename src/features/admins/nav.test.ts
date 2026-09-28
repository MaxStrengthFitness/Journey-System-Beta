import { describe, expect, it } from "vitest";
import { ADMINS_NAV, ADMINS_PLACES, ADMINS_START, allNavPages, labelOf, navKeyOf, pagesOf, placeOf } from "./nav";

describe("the Admins dashboard's map", () => {
  it("never has more than four places, so the portrait bar fits", () => {
    expect(ADMINS_PLACES.length).toBeLessThanOrEqual(4);
    expect(ADMINS_NAV.map((g) => g.place)).toEqual(ADMINS_PLACES.map((p) => p.place));
  });

  it("lists every page once, under exactly one place", () => {
    const pages = allNavPages();
    expect(new Set(pages).size).toBe(pages.length);
    for (const page of pages) {
      expect(ADMINS_NAV.filter((g) => g.items.some((i) => i.page === page))).toHaveLength(1);
    }
  });

  it("opens each place on one of its own pages, and the dashboard on a real page", () => {
    for (const p of ADMINS_PLACES) expect(placeOf(p.opens)).toBe(p.place);
    expect(allNavPages()).toContain(ADMINS_START);
  });

  it("names the pages the way the sidebar does", () => {
    expect(labelOf("studios")).toBe("All studios");
    expect(labelOf("studio")).toBe("Studio");
    expect(labelOf("franchises")).toBe("Franchises");
    expect(labelOf("review")).toBe("Waiting for review");
    expect(labelOf("bugs")).toBe("Bug reports");
  });

  it("keeps every screen that was a tab", () => {
    const pages = allNavPages();
    for (const page of ["studios", "machines", "template", "limbo", "system", "bugs", "data"] as const) {
      expect(pages).toContain(page);
    }
  });

  it("gives a place's pages to its chips, and lights the item a page came from", () => {
    expect(pagesOf("machinery").map((i) => i.page)).toEqual(["limbo", "sync", "bugs", "data", "system"]);
    expect(pagesOf("studios").map((i) => i.page)).toEqual(["studios", "franchises"]);
    expect(navKeyOf("machines")).toBe("machines");
    // A studio's own page is reached from All studios, and lights it.
    expect(navKeyOf("studio")).toBe("studios");
    expect(placeOf("studio")).toBe("studios");
    expect(allNavPages()).not.toContain("studio");
  });
});
