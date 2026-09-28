import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  OUT_OF_SERVICE_REASON_MAX,
  outOfServiceLineOf,
  outOfServiceOf,
  outOfServiceOfEntry,
  outOfServiceShort,
  reasonToStore,
} from "./out-of-service";

describe("reading a reason off a roster entry", () => {
  it("reads the reason, who set it and when, from a Firestore timestamp", () => {
    const at = { toMillis: () => Date.UTC(2026, 8, 27, 12, 52) };
    expect(
      outOfServiceOf({ reason: " A new cable is on order ", by: { uid: "uid-glorfindel", name: "Glorfindel of the Golden Flower" }, at }),
    ).toEqual({
      reason: "A new cable is on order",
      by: { uid: "uid-glorfindel", name: "Glorfindel of the Golden Flower" },
      at: Date.UTC(2026, 8, 27, 12, 52),
    });
  });

  it("is nothing when there is no record, or no reason in it", () => {
    expect(outOfServiceOf(undefined)).toBeNull();
    expect(outOfServiceOf("A new cable")).toBeNull();
    expect(outOfServiceOf({ reason: "   ", by: { uid: "u", name: "N" } })).toBeNull();
    expect(outOfServiceOf({ reason: 42 })).toBeNull();
  });

  it("keeps a reason whose time is still on its way, with the time unknown", () => {
    // serverTimestamp() reads back as null until the server answers.
    expect(outOfServiceOf({ reason: "Cable", by: { uid: "u", name: "Beregond" }, at: null })?.at).toBe(0);
  });

  it("reads an old entry with no reason as it always read: no record", () => {
    expect(outOfServiceOfEntry({ machineId: "m-leg-press", status: "maintenance" })).toBeNull();
    expect(outOfServiceOfEntry({ status: "maintenance", outOfService: { reason: "Cable", by: { uid: "u", name: "Beregond" } } })?.reason).toBe(
      "Cable",
    );
  });
});

describe("what a leader typed", () => {
  it("stores it tidied: one space between words, none at the ends", () => {
    expect(reasonToStore("  A new   cable\nis on order ")).toEqual({ ok: true, reason: "A new cable is on order" });
  });

  it("asks for a reason rather than storing nothing", () => {
    const r = reasonToStore("   ");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.why).toContain("Say why");
  });

  it("holds it to the rules' length", () => {
    expect(reasonToStore("x".repeat(OUT_OF_SERVICE_REASON_MAX)).ok).toBe(true);
    const long = reasonToStore("x".repeat(OUT_OF_SERVICE_REASON_MAX + 1));
    expect(long.ok === false && long.why).toBe(`Keep it to ${OUT_OF_SERVICE_REASON_MAX} characters.`);
  });

  it("and the rules say the same number", () => {
    const rules = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "firestore.rules"), "utf8");
    expect(rules).toMatch(new RegExp(`o\\.reason\\.size\\(\\) <= ${OUT_OF_SERVICE_REASON_MAX}\\b`));
  });
});

describe("the reason as a screen says it", () => {
  it("names who set it by first name, and when, in the studio's zone", () => {
    const line = outOfServiceLineOf(
      { reason: "A new cable is on order", by: { uid: "u", name: "Glorfindel of the Golden Flower" }, at: Date.UTC(2026, 8, 27, 12, 52) },
      "America/New_York",
    );
    expect(line).toEqual({ reason: "A new cable is on order", who: "Glorfindel", when: "Sep 27, 8:52 AM" });
  });

  it("never invents a name or a time", () => {
    expect(outOfServiceLineOf({ reason: "Cable", by: { uid: "", name: "" }, at: 0 })).toEqual({
      reason: "Cable",
      who: "a leader",
      when: null,
    });
  });

  it("gives a row one short line: why, and who", () => {
    expect(outOfServiceShort({ reason: "A new cable is on order", by: { uid: "u", name: "Glorfindel" }, at: 0 })).toBe(
      "A new cable is on order · Glorfindel",
    );
  });
});
