/**
 * The Hub's own bookings (speed round, Oct 5 2026, R6). Run with
 * TZ=America/New_York.
 */
import { describe, expect, it } from "vitest";
import { hubWindow, inHubWindow } from "./hub-window";

const at = (iso: string) => ({ id: iso, startTime: new Date(iso) });

describe("hubWindow", () => {
  it("is yesterday to a week from today", () => {
    expect(hubWindow("2026-10-05", "2026-10-05")).toEqual({ from: "2026-10-04", to: "2026-10-12" });
    expect(hubWindow("2026-10-05", "2026-10-11")).toEqual({ from: "2026-10-04", to: "2026-10-12" });
  });

  it("stretches to hold a day picked on purpose that has fallen behind, so it is never read as empty", () => {
    expect(hubWindow("2026-10-05", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-12" });
  });

  it("runs across a month's end", () => {
    expect(hubWindow("2026-10-30", "2026-10-30")).toEqual({ from: "2026-10-29", to: "2026-11-06" });
  });
});

describe("inHubWindow", () => {
  const w = { from: "2026-10-04", to: "2026-10-12" };

  it("keeps the bookings that start on the window's studio days, by the studio's midnight", () => {
    const list = [
      at("2026-10-04T03:59:00Z"), // 11:59 PM on Oct 3 at the studio: out
      at("2026-10-04T04:00:00Z"), // midnight Oct 4: in
      at("2026-10-12T23:30:00Z"), // 7:30 PM Oct 12: in
      at("2026-10-13T03:59:59Z"), // 11:59 PM Oct 12: in
      at("2026-10-13T04:00:00Z"), // Oct 13: out
      at("2026-11-02T14:00:00Z"), // a Calendar month away: out
    ];
    expect(inHubWindow(list, w).map((b) => b.id)).toEqual(["2026-10-04T04:00:00Z", "2026-10-12T23:30:00Z", "2026-10-13T03:59:59Z"]);
  });

  it("reads the start the way the grid always has, and leaves out a booking with none", () => {
    const legacy = { id: "legacy", StartDateTime: "2026-10-06T14:00:00Z" };
    const none = { id: "none" };
    expect(inHubWindow([legacy, none] as never[], w).map((b: { id: string }) => b.id)).toEqual(["legacy"]);
  });

  it("keeps the order it was given", () => {
    const list = [at("2026-10-07T14:00:00Z"), at("2026-10-05T14:00:00Z")];
    expect(inHubWindow(list, w).map((b) => b.id)).toEqual(["2026-10-07T14:00:00Z", "2026-10-05T14:00:00Z"]);
  });
});
