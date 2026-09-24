/**
 * THE STUDIO'S FLOOR, IN THE SHAPE THE FLOOR SCREENS ALREADY SPEAK.
 *
 * Claude Experiment, phase B — Sep 20 2026.
 *
 * ── The problem this exists to solve ─────────────────────────────────────
 *
 * Journey has a good three-layer machine model: the corporate catalog
 * (`machines/{id}`), the studio's own unit (`studios/{s}/roster/{machineId}`)
 * and the client's settings for it. `resolveMachine()` merges the first two,
 * `machine-template.ts` says what a studio may change, and there is a
 * full-screen editor for all of it.
 *
 * The Active Session used none of it. `WorkoutTrackerView` read the app-wide
 * legacy `machines` list and called `useStudioMachines` for exactly one
 * thing — `order`. So a studio's own dial labels, its custom machines, its
 * renamed units and every catalog correction reached the Learning → Catalog
 * page and NOTHING a trainer held during a session. The roster manager even
 * told the leader "Trainers running a session here see exactly this list",
 * which was not true.
 *
 * ── Why this is a merge and not a replacement ────────────────────────────
 *
 * Twenty-odd call sites across the tracker, the briefing, the machine sheet
 * and the routine picker read legacy `Machine` fields — `trainerTips`,
 * `anatomicalRegion`, `requiresHandoff`, `standardWeights`, `imageUrl` and
 * the rest. Swapping the list for `ResolvedMachine[]` would have emptied all
 * of them at once.
 *
 * So: start from the legacy document (everything keeps working), overlay the
 * studio's resolved truth (name, order, dials, defaults), and append the
 * machines the studio has that the global list has never heard of. The
 * result is a `Machine[]` every existing consumer understands, that finally
 * tells the truth about this studio's floor.
 *
 * When the roster is genuinely empty — westlake and Willoughby, as of Sep
 * 2026 — the caller passes `bridgeWhenRosterEmpty` to `useStudioMachines`
 * and the resolved list IS the catalog, so this function degrades to "the
 * legacy list, ordered", which is exactly today's behaviour.
 *
 * This is the first half of the §3.5 migration. The second half is deleting
 * the legacy list once every consumer reads a resolved field instead of a
 * legacy one; nothing here blocks that, and nothing here depends on it.
 */

import type { Machine } from "../types";
import type { ResolvedMachine } from "../types/machines";

/** Dial labels for a resolved machine, in the order the catalog declares them. */
export function dialLabelsOf(resolved: ResolvedMachine): string[] {
  return (resolved.settingFields || [])
    .map((f) => (f.label || f.key || "").trim())
    .filter(Boolean);
}

/**
 * The studio's floor in the legacy `Machine` shape.
 *
 * @param resolved   `useStudioMachines(studioId).machines` — already ordered.
 * @param legacyById the app-wide `machines` prop, keyed by id.
 */
export function toFloorMachines(
  resolved: readonly ResolvedMachine[],
  legacyById: Readonly<Record<string, Machine>>,
): Machine[] {
  return resolved.map((r) => {
    const legacy = legacyById[r.machineId];

    // The studio's dial labels win. A studio that has never touched its
    // roster inherits the catalog's, which is the same list the editor
    // shows — so this is "the catalog, finally", not a new source.
    const dials = dialLabelsOf(r);
    const settingOptions = dials.length ? dials : legacy?.settingOptions;

    // Same precedence for the dial defaults: the resolved machine already
    // carries the studio's override merged over the catalog's.
    const defaults =
      r.defaultSettings && Object.keys(r.defaultSettings).length
        ? { ...r.defaultSettings }
        : legacy?.standardSettings;

    return {
      // Everything the legacy document knows, so no consumer loses a field.
      ...(legacy || {}),

      // What the studio owns, per the template boundary.
      id: r.machineId,
      name: r.name || legacy?.name || r.machineId,
      // Lineage: which catalog machine a studio's own machine is, so the
      // clinical matrix's watch-outs reach "our Hammer leg press" too.
      ...(r.comparisonKey ? { comparisonKey: r.comparisonKey } : {}),
      order: r.order,
      ...(settingOptions ? { settingOptions } : {}),
      ...(defaults ? { standardSettings: defaults } : {}),
      ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}),
      ...(r.formVideoUrl ? { formVideoUrl: r.formVideoUrl } : {}),
    } as Machine;
  });
}

/**
 * True when this machine logs a Left and a Right set.
 *
 * It used to be `name.includes("torso rotation")` inline in the tracker,
 * which meant a studio that renamed its unit — exactly what the template
 * boundary invites — silently lost its per-side fields. The catalog carries
 * no `perSide` flag yet (a gap worth closing), so this still reads the name,
 * but it reads the CANONICAL id first and only falls back to the name.
 */
export function isPerSideMachine(m: {
  id?: string;
  name?: string;
  comparisonKey?: string;
}): boolean {
  const id = (m.comparisonKey || m.id || "").toLowerCase();
  if (id === "m-torso-rotation" || id === "torso_rotation") return true;
  return (m.name || "").toLowerCase().includes("torso rotation");
}
