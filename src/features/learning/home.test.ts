import { describe, expect, it } from "vitest";
import {
  academyFacts,
  floorStatus,
  homeCategoryTiles,
  plural,
  readingTime,
  recentPages,
  toMillis,
} from "./home";
import type { CatalogMachine } from "../catalog/types";

const m = (id: string, name: string, extra: Partial<CatalogMachine> = {}): CatalogMachine =>
  ({
    id,
    name,
    movementPattern: "",
    anatomicalRegion: "",
    isStudioCustom: false,
    rosterStatus: "active",
    targetMuscles: [],
    ...extra,
  }) as CatalogMachine;

describe("homeCategoryTiles", () => {
  it("lists every machine under its Academy category, in the Academy's order, with its code", () => {
    const tiles = homeCategoryTiles([
      m("m-leg-press", "Leg Press"),
      m("m-chest-press", "Chest Press"),
      m("m-compound-row", "Compound Row"),
      m("sm-solon-sled", "Sled Push"),
    ]);
    expect(tiles.map((t) => t.key)).toEqual(["upper-pull", "upper-push", "legs", "uncategorised"]);
    expect(tiles[1]).toMatchObject({
      label: "Upper Body — Push",
      accent: "push",
      machines: [{ id: "m-chest-press", name: "Chest Press", code: "CP" }],
    });
    // A studio's own machine is never dropped; it has no Academy code.
    expect(tiles[3].machines).toEqual([{ id: "sm-solon-sled", name: "Sled Push", code: null }]);
  });
});

describe("floorStatus", () => {
  it("counts flags, out-of-service and cleaning that is due", () => {
    const machines = [
      m("a", "A", { rosterStatus: "maintenance" }),
      m("b", "B"),
      m("c", "C"),
    ];
    expect(
      floorStatus(machines, { a: "ok", b: "overdue", c: "due" }, new Set(["b"])),
    ).toEqual({ flagged: 1, outOfService: 1, due: 2 });
  });
});

describe("academyFacts / readingTime", () => {
  it("adds up modules, topics and reading time", () => {
    const facts = academyFacts({
      modules: [
        { topics: [{ readingMinutes: 5 }, { readingMinutes: 10 }] },
        { topics: [{ readingMinutes: 30 }] },
      ],
      glossaryCount: 200,
      cardCount: 18,
    });
    expect(facts).toEqual({ modules: 2, topics: 3, minutes: 45, glossary: 200, cards: 18, scripts: 0 });
  });

  it("says minutes under an hour and a half, hours after", () => {
    expect(readingTime(0.4)).toBe("1 min");
    expect(readingTime(45)).toBe("45 min");
    expect(readingTime(561)).toBe("about 9 hours");
  });
});

describe("recentPages / toMillis", () => {
  it("puts the most recently changed first and a just-written page on top", () => {
    const pages = [
      { id: "old", createdAt: { seconds: 100 } },
      { id: "edited", createdAt: { seconds: 50 }, updatedAt: { toMillis: () => 900_000 } },
      { id: "pending" },
      { id: "mid", createdAt: new Date(500_000) },
    ];
    expect(recentPages(pages).map((p) => p.id)).toEqual(["pending", "edited", "mid", "old"]);
    expect(recentPages(pages, 2)).toHaveLength(2);
  });

  it("reads every timestamp shape it meets", () => {
    expect(toMillis(null)).toBe(0);
    expect(toMillis(42)).toBe(42);
    expect(toMillis({ seconds: 2 })).toBe(2000);
    expect(toMillis("yesterday")).toBe(0);
  });
});

describe("plural", () => {
  it("counts in words", () => {
    expect(plural(1, "machine")).toBe("1 machine");
    expect(plural(6, "machine")).toBe("6 machines");
    expect(plural(2, "glossary term")).toBe("2 glossary terms");
  });
});
