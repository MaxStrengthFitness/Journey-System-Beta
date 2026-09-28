import { describe, expect, it } from "vitest";
import type { FranchiseNetwork, Studio } from "../../../types";
import { dayLabel, groupStudios, standingOf, studiosCount } from "./stages";

const tz = "America/New_York";
const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3", locationType: "corporate", journeyCutoverDate: "2026-09-14" },
  { id: "strongsville", name: "Strongsville", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "5", locationType: "corporate" },
  { id: "willoughby", name: "Willoughby", timezone: tz, mindbodySiteId: "29068", locationType: "corporate" },
  { id: "solon", name: "Solon", timezone: tz, mindbodySiteId: "5746957", mindbodyLocationId: "1", journeyCutoverDate: "2026-10-12", networkId: "ohio" },
  { id: "avon", name: "Avon", timezone: tz, mindbodyMode: "offline" },
  { id: "mentor", name: "Mentor", timezone: tz },
  { id: "demo-studio", name: "Demo Studio", timezone: tz, isDemo: true, mindbodyMode: "offline", journeyCutoverDate: "2025-08-01" },
] as unknown as Studio[];
const networks = [{ id: "ohio", name: "Max Strength Ohio", studioIds: ["solon"] }] as unknown as FranchiseNetwork[];

// Monday Sep 28 2026, 9 AM Eastern.
const now = new Date("2026-09-28T13:00:00Z");

describe("dayLabel", () => {
  it("names the stored day itself, never the evening before", () => {
    expect(dayLabel("2026-09-14")).toBe("Mon, Sep 14, 2026");
    expect(dayLabel("not a day")).toBe("not a day");
  });
});

describe("where a studio stands", () => {
  it("reads the Mindbody link and the cutover in words", () => {
    const w = standingOf(studios[0], studios, networks, now);
    expect(w).toMatchObject({ stage: "on-journey", context: "MSF corporate", link: "Mindbody site 29068, location 3", linkTone: "ok", cutover: "On Journey since Mon, Sep 14, 2026" });
    const s = standingOf(studios[3], studios, networks, now);
    expect(s).toMatchObject({ stage: "cutover-coming", context: "Max Strength Ohio", cutover: "Moves onto Journey on Mon, Oct 12, 2026" });
    expect(standingOf(studios[1], studios, networks, now)).toMatchObject({ stage: "no-cutover", cutover: "No Journey cutover date yet" });
  });

  it("names what is missing from a Mindbody link", () => {
    expect(standingOf(studios[2], studios, networks, now)).toMatchObject({
      stage: "needs-mindbody",
      link: "Shares Mindbody site 29068 with Westlake, Strongsville but names no location",
      linkTone: "watch",
    });
    expect(standingOf(studios[5], studios, networks, now)).toMatchObject({
      stage: "needs-mindbody",
      link: "Marked as linked to Mindbody, with no Site ID",
      context: "Independent",
    });
    expect(standingOf(studios[4], studios, networks, now)).toMatchObject({ stage: "offline", link: "Runs offline, on purpose", linkTone: "idle" });
  });

  it("counts a cutover on the studio's own day: today is On Journey", () => {
    const today = { ...studios[1], journeyCutoverDate: "2026-09-28" } as Studio;
    expect(standingOf(today, studios, networks, now).stage).toBe("on-journey");
    const tomorrow = { ...studios[1], journeyCutoverDate: "2026-09-29" } as Studio;
    expect(standingOf(tomorrow, studios, networks, now).stage).toBe("cutover-coming");
    // 11 PM Eastern on the 28th is already the 29th in UTC; the studio's day decides.
    expect(standingOf(tomorrow, studios, networks, new Date("2026-09-29T03:00:00Z")).stage).toBe("cutover-coming");
  });
});

describe("grouping every studio", () => {
  it("puts what needs a person first, the practice studio last, names A to Z", () => {
    const groups = groupStudios(studios, networks, now);
    expect(groups.map((g) => [g.title, g.studios.map((s) => s.name)])).toEqual([
      ["Mindbody not set up", ["Mentor", "Willoughby"]],
      ["Runs offline", ["Avon"]],
      ["No cutover date yet", ["Strongsville"]],
      ["Moving onto Journey", ["Solon"]],
      ["On Journey", ["Westlake"]],
      ["Demo Mode", ["Demo Studio"]],
    ]);
  });

  it("leaves out a group with nobody in it", () => {
    expect(groupStudios([studios[0]], networks, now).map((g) => g.stage)).toEqual(["on-journey"]);
    expect(groupStudios([], networks, now)).toEqual([]);
  });

  it("counts studios in words", () => {
    expect(studiosCount(1)).toBe("1 studio");
    expect(studiosCount(4)).toBe("4 studios");
  });
});
