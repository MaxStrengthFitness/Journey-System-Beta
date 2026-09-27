/**
 * The profile's tab row as DRAWN (voice review follow-up, Sep 27 2026).
 *
 * AJ, Sep 27 2026, recorded exactly as approved: "The four tabs run by depth:
 * Journey (what she has done, the glance on the floor), Programming (what
 * she's meant to do), Notes & Profile (who she is), Activity Archive (the
 * whole record). Don't reorder, merge or add a tab without asking."
 *
 * profile-nav.test.ts holds PROFILE_TABS, the list. This holds the bar the
 * trainer actually sees to that list: one TabsList, a trigger only from
 * PROFILE_TABS.map, the four panels in the same order, and the grid's column
 * count equal to the number of tabs. A trigger or panel written by hand next
 * to the map, or a fifth entry squeezed into four columns, fails here. The
 * profile is too large to mount in a test, so this reads its source, in the
 * style of ClientProfileView.discard.test.ts.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROFILE_TABS } from "../features/client-profile/profile-nav";

const source = readFileSync(join(__dirname, "ClientProfileView.tsx"), "utf8");
const count = (needle: string | RegExp) =>
  typeof needle === "string"
    ? source.split(needle).length - 1
    : (source.match(new RegExp(needle.source, "g")) ?? []).length;

describe("the profile's tab row, as drawn", () => {
  it("is one TabsList", () => {
    expect(count("<TabsList")).toBe(1);
    expect(count("</TabsList>")).toBe(1);
    expect(count(/<Tabs[\s>]/)).toBe(1);
  });

  it("draws its triggers only from PROFILE_TABS.map, inside that list", () => {
    expect(count("<TabsTrigger")).toBe(1);
    const list = source.slice(source.indexOf("<TabsList"), source.indexOf("</TabsList>"));
    expect(list).toContain("{PROFILE_TABS.map((tab) => (");
    expect(list).toContain("<TabsTrigger");
    expect(list).toContain("value={tab.id}");
    expect(list).toContain("{tab.label}");
  });

  it("has one panel per tab, in AJ's order", () => {
    const panels = Array.from(source.matchAll(/<TabsContent\s+value="([a-z]+)"/g), (m) => m[1]);
    expect(count("<TabsContent")).toBe(panels.length);
    expect(panels).toEqual(PROFILE_TABS.map((t) => t.id));
    expect(panels).toEqual(["journey", "programming", "record", "clinical"]);
  });

  it("gives every tab its own column: the literal grid-cols-N is PROFILE_TABS.length", () => {
    // Tailwind cannot build a class name at runtime, so the count stays a
    // literal in the source and this is what keeps it honest.
    const list = source.slice(source.indexOf("<TabsList"), source.indexOf(">", source.indexOf("<TabsList")));
    const cols = list.match(/\bgrid-cols-(\d+)\b/g) ?? [];
    expect(cols).toHaveLength(1);
    expect(cols[0]).toBe(`grid-cols-${PROFILE_TABS.length}`);
  });

  it("styles the chosen tab only through data-active, which Base UI sets", () => {
    // Base UI marks the chosen tab data-active and never sets data-state, so
    // a data-[state=active] class never applies. Five of them sat here, dead,
    // one of them a raw hex orange.
    expect(source).not.toContain("data-[state=active]");
  });
});
