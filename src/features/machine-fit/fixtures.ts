/**
 * MACHINE FIT — a small studio, for the tests.
 *
 * A Compound Row the way the brief describes it: the SEAT follows height, the
 * CHEST pad follows the seat (move one and you must move the other), the GAP
 * is nearly always 0, and HANDLES are a preference that follows nothing.
 * Short clients sit high (Seat 5–6) with the pad in (Chest 2); tall clients
 * sit low (Seat 2–3) with the pad out (Chest 4–5).
 *
 * Not a test file (no `.test.`), so vitest does not run it and the app never
 * imports it: only the tests here do.
 */

import type { FitFactors, FitSample } from "./types.ts";

export const ROW_FIELDS = ["gap", "seat", "chest", "handles"] as const;

let nextId = 0;

export function client(
  heightIn: number,
  settings: Record<string, string>,
  extra: Partial<FitFactors> & { clientId?: string } = {},
): FitSample {
  nextId += 1;
  const { clientId, ...factors } = extra;
  return {
    clientId: clientId ?? `c${nextId}`,
    n: 1,
    settings,
    factors: { heightIn, gender: "f", ...factors },
  };
}

/** Twenty-four clients, 5'1" to 6'2". */
export function compoundRowStudio(): FitSample[] {
  return [
    // 5'1"–5'3": high seat, pad in
    client(61, { gap: "0", seat: "6", chest: "2", handles: "in" }),
    client(62, { gap: "0", seat: "6", chest: "2", handles: "in" }),
    client(62, { gap: "0", seat: "6", chest: "2", handles: "out" }),
    client(63, { gap: "0", seat: "5", chest: "2", handles: "in" }),
    client(63, { gap: "0", seat: "6", chest: "2" }),
    // 5'4"–5'6"
    client(64, { gap: "0", seat: "5", chest: "2", handles: "in" }),
    client(64, { gap: "0", seat: "5", chest: "3", handles: "out" }),
    client(65, { gap: "0", seat: "5", chest: "3", handles: "in" }),
    client(65, { gap: "0", seat: "4", chest: "3", handles: "in" }),
    client(66, { gap: "0", seat: "4", chest: "3", handles: "out" }),
    client(66, { gap: "0", seat: "4", chest: "3" }),
    // 5'7"–5'9"
    client(67, { gap: "0", seat: "4", chest: "3", handles: "in" }),
    client(67, { gap: "0", seat: "4", chest: "3", handles: "in" }),
    client(68, { gap: "0", seat: "4", chest: "3", handles: "out" }),
    client(68, { gap: "0", seat: "3", chest: "4", handles: "in" }, { gender: "m" }),
    client(69, { gap: "0", seat: "3", chest: "4", handles: "out" }, { gender: "m" }),
    client(69, { gap: "2", seat: "3", chest: "4", handles: "in" }, { gender: "m" }),
    // 5'10"–6'2": low seat, pad out
    client(70, { gap: "0", seat: "3", chest: "4", handles: "out" }, { gender: "m" }),
    client(71, { gap: "0", seat: "3", chest: "4", handles: "in" }, { gender: "m" }),
    client(72, { gap: "0", seat: "2", chest: "5", handles: "out" }, { gender: "m" }),
    client(72, { gap: "0", seat: "2", chest: "5", handles: "in" }, { gender: "m" }),
    client(73, { gap: "0", seat: "2", chest: "5", handles: "out" }, { gender: "m" }),
    client(74, { gap: "0", seat: "2", chest: "5" }, { gender: "m" }),
    client(74, { gap: "0", seat: "2", chest: "5", handles: "in" }, { gender: "m" }),
  ];
}

export function body(heightIn: number | null, extra: Partial<FitFactors> = {}): FitFactors {
  return {
    heightIn,
    gender: null,
    wingspanIn: null,
    weightLb: null,
    ageYears: null,
    bodyFatPct: null,
    muscleLb: null,
    ...extra,
  };
}
