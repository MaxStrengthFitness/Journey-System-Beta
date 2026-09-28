import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Studio } from "../../types";
import { buildSearchIndex, fold, matchCount, scoreEntry, searchEntries, type SearchTrainer } from "./search";

const studios = [
  { id: "westlake", name: "Westlake", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyLocationId: "3", locationType: "corporate" },
  { id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957", networkId: "ohio" },
  { id: "avon", name: "Avon", timezone: "America/New_York", mindbodyMode: "offline" },
  { id: "demo-studio", name: "Demo Studio", timezone: "America/New_York", isDemo: true, mindbodyMode: "offline" },
] as unknown as Studio[];

const networks = [{ id: "ohio", name: "Max Strength Ohio", studioIds: ["solon"] }] as unknown as FranchiseNetwork[];

const machines = [
  { id: "m-leg-press", name: "Leg Press", status: "active" },
  { id: "m-ext", name: "Leg Extension", status: "active", inStandardSet: false },
  { id: "m-curl", name: "Leg Curl", status: "retired" },
  { id: "m-lumbar", name: "Lumbar Extension" },
];

const trainers: SearchTrainer[] = [
  { id: "t1", fullName: "Ioreth of Gondor", role: "LifeTransformer", primaryHomeStudioId: "westlake" },
  { id: "t2", fullName: "Imrahil", role: "HeadTrainer", primaryHomeStudioId: "westlake" },
  { id: "t3", fullName: "Círdan", role: "Owner", primaryHomeStudioId: "solon" },
  { id: "t4", fullName: "Beregond", role: "LifeTransformer", primaryHomeStudioId: "westlake", isActive: false },
  { id: "t5", fullName: "Old Beregond", role: "LifeTransformer", primaryHomeStudioId: "westlake", supersededByUid: "t4" },
  { id: "t6", fullName: "Practice Person", role: "LifeTransformer", primaryHomeStudioId: "demo-studio", isDemo: true },
];

const index = buildSearchIndex({ studios, networks, machines, trainers });

describe("fold", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(fold("  Círdan  THE   Shipwright ")).toBe("cirdan the shipwright");
  });
});

describe("the search index", () => {
  it("holds every real studio, every machine and every live account, and nothing of Demo Mode", () => {
    const titles = index.map((e) => e.title);
    expect(titles).toContain("Westlake");
    expect(titles).toContain("Leg Curl");
    expect(titles).toContain("Imrahil");
    expect(titles).not.toContain("Demo Studio");
    expect(titles).not.toContain("Practice Person");
    expect(titles).not.toContain("Old Beregond");
  });

  it("says what each thing is in one line", () => {
    const find = (title: string) => index.find((e) => e.title === title)!;
    expect(find("Westlake").detail).toBe("Studio · MSF corporate · Mindbody site 29068, location 3");
    expect(find("Solon").detail).toBe("Studio · Max Strength Ohio · Mindbody site 5746957");
    expect(find("Avon").detail).toBe("Studio · Independent · Runs offline");
    expect(find("Leg Press").detail).toBe("Machine · In the MSF catalog and the standard set");
    expect(find("Leg Extension").detail).toBe("Machine · In the MSF catalog, not in the standard set");
    expect(find("Leg Curl").detail).toBe("Machine · Retired from the catalog");
    expect(find("Imrahil").detail).toBe("Head Trainer · Westlake");
    expect(find("Círdan").detail).toBe("Franchise Owner · Solon");
    expect(find("Beregond").detail).toBe("Life Transformer · Westlake · Account switched off");
  });

  it("sends a person to their home studio", () => {
    expect(index.find((e) => e.title === "Imrahil")!.target).toEqual({ kind: "person", trainerId: "t2", studioId: "westlake" });
  });
});

describe("searching", () => {
  it("finds a name without its accent, and every word must match", () => {
    expect(searchEntries(index, "cirdan").people.map((e) => e.title)).toEqual(["Círdan"]);
    expect(searchEntries(index, "leg ext").machines.map((e) => e.title)).toEqual(["Leg Extension"]);
  });

  it("puts a name that starts with the query before one that only contains it", () => {
    expect(searchEntries(index, "leg").machines.map((e) => e.title)).toEqual(["Leg Curl", "Leg Extension", "Leg Press"]);
    const ext = searchEntries(index, "extension").machines.map((e) => e.title);
    expect(ext).toEqual(["Leg Extension", "Lumbar Extension"]);
  });

  it("scores an exact name best, and a match only in the detail last", () => {
    const westlake = index.find((e) => e.title === "Westlake")!;
    expect(scoreEntry(westlake, "westlake")).toBe(0);
    expect(scoreEntry(westlake, "west")).toBe(1);
    expect(scoreEntry(westlake, "29068")).toBe(4);
    expect(scoreEntry(westlake, "")).toBeNull();
    expect(scoreEntry(westlake, "solon")).toBeNull();
  });

  it("groups studios, machines and people, and says when nothing matches", () => {
    const groups = searchEntries(index, "westlake");
    expect(groups.studios.map((e) => e.title)).toEqual(["Westlake"]);
    // Everyone whose home is Westlake matches on their detail line.
    expect(groups.people.map((e) => e.title)).toEqual(["Beregond", "Imrahil", "Ioreth of Gondor"]);
    expect(matchCount(searchEntries(index, "mordor"))).toBe(0);
  });
});
