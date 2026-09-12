import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MACHINE_DISPLAY_ORDER,
  resolveMachineOrder,
} from "./machine-display-order";

/**
 * ONE ORDERING MECHANISM, enforced.
 *
 * WHAT WENT WRONG, so it cannot come back.
 *
 * Machine order was answered three different ways, and the screens disagreed:
 *
 *   studios/{s}/roster/{id}.order         the Catalog / Learning
 *   studioMachineSettings/{s}_{id}.order  the Journey grid, the Active Session
 *   machines/{id}.order + the map below   the fallbacks
 *
 * The middle one had ZERO documents in production and nothing written to it
 * since TrainerControlHubView was deleted in the Sep 5 settings round, so the
 * two screens trainers actually use on the floor sorted by a field no UI could
 * set, while the Catalog sorted by something else. Setting an order was
 * impossible and would have applied to one screen if it hadn't been.
 *
 * Separately, the Leg Extension was filed in Firestore as `m-leg-ext` while
 * every lookup here uses the canonical `m-ext`. One wrong id, and the machine
 * had no order (fell to 999, sorted last), no anatomy and no Academy content.
 * Nothing in the UI could say so. That is what the id test below catches.
 *
 * If you retune an order, the fix is the data or the map, not this test.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

describe("the default order map is well formed", () => {
  const entries = Object.entries(DEFAULT_MACHINE_DISPLAY_ORDER);

  it("covers the twenty standard machines", () => {
    expect(entries).toHaveLength(20);
  });

  it("uses only canonical m-* ids", () => {
    // The bug this catches: an id like `m-leg-ext`, `leg_extension` or
    // `LegExtension` looks fine in a Firestore console and silently misses
    // every lookup in the app. Canonical ids are lowercase, hyphenated, m-*.
    for (const [id] of entries) {
      expect(id, `${id} is not a canonical machine id`).toMatch(/^m-[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("numbers them 1..20 with no gaps or repeats", () => {
    const positions = entries.map(([, n]) => n).sort((a, b) => a - b);
    expect(positions).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });
});

describe("resolveMachineOrder falls back in the documented order", () => {
  it("prefers the studio's own override", () => {
    expect(resolveMachineOrder("m-ext", 11, 3)).toBe(3);
  });

  it("then the standard map", () => {
    expect(resolveMachineOrder("m-ext", 11, undefined)).toBe(
      DEFAULT_MACHINE_DISPLAY_ORDER["m-ext"],
    );
  });

  it("then the machine's own order, for anything off the standard list", () => {
    // A studio's own equipment (sm-*) is never in the map, and its order has
    // to come from somewhere. Dropping this argument is what sent the Leg
    // Extension to the bottom of the Catalog.
    expect(resolveMachineOrder("sm-solon-sled", 7, undefined)).toBe(7);
  });

  it("and sorts the genuinely unknown last rather than first", () => {
    expect(resolveMachineOrder("sm-solon-mystery", undefined, undefined)).toBe(999);
  });

  it("treats an override of 0 as a real position, not as absent", () => {
    // `studioOrderOverride ?? ...` would be correct here but `|| ...` would
    // not, and 0 is exactly the value a naive "first row" writer produces.
    expect(resolveMachineOrder("m-ext", 11, 0)).toBe(0);
  });
});

/* ---------------------------------------------------------------------------
   THE ORPHAN CANNOT RETURN
   --------------------------------------------------------------------------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("nothing sorts by studioMachineSettings again", () => {
  /**
   * studioMachineSettings still exists and is still the right home for a
   * studio's physical setup — settingOptions and standardSettings, written by
   * the Catalog's StudioSetupCard. What must not come back is reading an
   * ORDER off it. The roster is the single answer to sequence.
   */
  it("no file reads .order from a studio machine settings map", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith("machine-order.test.ts")) continue;
      const source = readFileSync(file, "utf8");
      // e.g. studioMachineSettingsById[x]?.order, settingsByMachineId[x].order
      if (/(?:studioMachineSettings|settingsByMachineId)\w*\s*\[[^\]]+\]\s*\??\.\s*order/.test(source)) {
        offenders.push(file.slice(SRC.length + 1));
      }
    }
    expect(
      offenders,
      `These sort by studioMachineSettings.order, which no UI writes. ` +
        `Use the roster: useStudioMachines(studioId).byId[machineId]?.order.`,
    ).toEqual([]);
  });
});
