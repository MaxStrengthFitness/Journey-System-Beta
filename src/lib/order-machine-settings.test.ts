/**
 * `orderMachineSettings` decides what the trainer reads on the settings rail —
 * on the Now Bar, the Journey grid, the Equipment rail and the routine rows.
 * It had no test until Sep 20 2026 (Claude Experiment, phase C), and it was
 * carrying two defects that a test would have caught immediately:
 *
 *   1. it invented `Gap 0` for every machine and every client, so a client
 *      with nothing on file read "G 0" — a confident wrong number on the one
 *      strip the floor doc says is read twice per machine;
 *   2. it shortened every dial to its first letter, and the caller keyed a
 *      map by that letter, so a machine with two dials starting with the same
 *      letter silently lost one of them.
 *
 * Both are pinned below by the real machine that exhibits them.
 */

import { describe, it, expect } from "vitest";
import { orderMachineSettings } from "./utils";

/** [shortKey, value, fullName] → a readable map for assertions. */
const asMap = (entries: [string, string, string][]) =>
  Object.fromEntries(entries.map(([k, v]) => [k, v]));

const fullNames = (entries: [string, string, string][]) =>
  entries.map(([, , full]) => full);

describe("orderMachineSettings — the gap is never invented", () => {
  it("returns nothing for a client with no settings and a machine with no standard", () => {
    expect(orderMachineSettings({})).toEqual([]);
    expect(orderMachineSettings(undefined)).toEqual([]);
    expect(orderMachineSettings(null)).toEqual([]);
  });

  it("does not invent a gap when the client has other dials but no gap", () => {
    const entries = orderMachineSettings({ Seat: "4", Handles: "N" });
    expect(fullNames(entries)).toEqual(["Seat", "Handles"]);
    expect(asMap(entries).G).toBeUndefined();
  });

  it("uses the machine's standard gap when the client has none", () => {
    // The Academy's starting gap is 2 on the compound row, pulldown, pullover,
    // chest press and chest fly — not 0.
    const entries = orderMachineSettings({ Seat: "4" }, { Gap: "2" });
    expect(asMap(entries)).toEqual({ G: "2", S: "4" });
  });

  it("prefers the client's own gap over the machine's standard", () => {
    const entries = orderMachineSettings({ Gap: "9" }, { Gap: "2" });
    expect(asMap(entries)).toEqual({ G: "9" });
  });

  it("keeps a real zero — a gap of 0 that someone actually recorded is data", () => {
    expect(asMap(orderMachineSettings({ Gap: "0" }))).toEqual({ G: "0" });
    expect(asMap(orderMachineSettings({}, { Gap: "0" }))).toEqual({ G: "0" });
  });

  it("drops an explicitly blank gap rather than rendering an empty chip", () => {
    expect(orderMachineSettings({ Gap: "" })).toEqual([]);
    expect(orderMachineSettings({ Gap: "   " })).toEqual([]);
  });
});

describe("orderMachineSettings — no dial is lost to a shared first letter", () => {
  it("keeps all three S-dials on the Leg Press", () => {
    // The regression: these three collapsed to one key and the client's seat
    // position vanished from the Now Bar.
    const entries = orderMachineSettings({
      Gap: "2",
      "Seat Angle": "P2",
      "Seat Distance": "7",
      "Shoulder Pads": "3",
    });

    expect(entries).toHaveLength(4);
    expect(fullNames(entries).sort()).toEqual([
      "Gap",
      "Seat Angle",
      "Seat Distance",
      "Shoulder Pads",
    ]);

    const map = asMap(entries);
    expect(Object.keys(map)).toHaveLength(4);
    expect(map).toEqual({ G: "2", SA: "P2", SD: "7", SP: "3" });
  });

  it("leaves a lone dial on its plain letter", () => {
    expect(asMap(orderMachineSettings({ Seat: "4" }))).toEqual({ S: "4" });
  });

  it("widens every member of a colliding group, not only the later ones", () => {
    // "S" and "SD" would read as two unrelated dials; "SA" and "SD" read as a pair.
    const map = asMap(orderMachineSettings({ "Seat Angle": "1", "Seat Distance": "2" }));
    expect(map).toEqual({ SA: "1", SD: "2" });
    expect(map.S).toBeUndefined();
  });

  it("keeps the back/chest/arm letters when they do not collide", () => {
    const map = asMap(
      orderMachineSettings({ "Back Pad": "4", "Arm Pad": "2", Handles: "W" }),
    );
    expect(map).toEqual({ B: "4", A: "2", H: "W" });
  });

  it("numbers a dial whose widened form still collides, rather than overwriting it", () => {
    const entries = orderMachineSettings({ "Seat Pad": "1", "Side Panel": "2" });
    expect(entries).toHaveLength(2);
    const keys = Object.keys(asMap(entries));
    expect(new Set(keys).size).toBe(2);
  });

  it("carries the full name for every entry, so the rail can speak it", () => {
    const entries = orderMachineSettings({ "Seat Angle": "P2", "Seat Distance": "7" });
    for (const [short, , full] of entries) {
      expect(short.length).toBeGreaterThan(0);
      expect(full.length).toBeGreaterThan(short.length - 1);
    }
  });
});

describe("orderMachineSettings — the canonical order survives", () => {
  it("puts gap first, then pads, then seat, with handles last", () => {
    const entries = orderMachineSettings({
      Handles: "N",
      Seat: "4",
      "Back Pad": "2",
      Gap: "6",
    });
    expect(fullNames(entries)).toEqual(["Gap", "Back Pad", "Seat", "Handles"]);
  });

  it("accepts FileMaker-shaped values: decimals and letters", () => {
    // The legacy chart records 1.5, N, W, M and SH as setting values.
    const map = asMap(
      orderMachineSettings({ Seat: "1.5", Handles: "N", "Back Pad": "SH" }),
    );
    expect(map).toEqual({ S: "1.5", H: "N", B: "SH" });
  });
});
