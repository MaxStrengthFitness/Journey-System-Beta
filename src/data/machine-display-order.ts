/**
 * DEFAULT MACHINE DISPLAY ORDER
 *
 * A code-level, always-consistent fallback order for the app's two
 * "flat list" machine views — the Client Profile Journey grid and the
 * Active Session table's unfocused ("Focus" toggled off) view. This is
 * deliberately separate from MOVEMENT_PATTERN_ORDER / MACHINE_ANATOMY
 * (machine-anatomy-map.ts), which drives the kinematic-grouped views
 * (Edit Routine drawer, Catalog) — those are a different, standing UI
 * direction and are not touched by this map.
 *
 * AJ's requested sequence (Aug 2026):
 *   1. CX (4 Way Neck)      6. Leg Press           11. Seated Pullover  16. Simple Row
 *   2. Hip Adduction        7. Pulldown            12. Seated Dip       17. Lateral Raise
 *   3. Hip Abduction        8. Chest Press         13. Tricep Extension 18. Lumbar
 *   4. Leg Curl             9. Compound Row        14. Bicep            19. Torso Rotation
 *   5. Leg Extension       10. Overhead Press      15. Chest/Pec Fly    20. Seated Abdominals
 *
 * A per-studio custom order (studioMachineSettings.order, set from Hub →
 * Machine Settings) overrides this default when present. This map is only
 * the fallback used when a studio hasn't set its own order for a machine.
 */
export const DEFAULT_MACHINE_DISPLAY_ORDER: Record<string, number> = {
  "m-neck": 1,
  "m-hip-add": 2,
  "m-hip-abd": 3,
  "m-leg-curl": 4,
  "m-ext": 5,
  "m-leg-press": 6,
  "m-pulldown": 7,
  "m-chest-press": 8,
  "m-compound-row": 9,
  "m-overhead-press": 10,
  "m-pullover": 11,
  "m-dip": 12,
  "m-tricep-ext": 13,
  "m-bicep": 14,
  "m-chest-fly": 15,
  "m-simple-row": 16,
  "m-lateral-raise": 17,
  "m-lumbar": 18,
  "m-torso-rotation": 19,
  "m-abs": 20,
};

/**
 * Resolve a machine's effective display order: an optional per-studio
 * override first, then the default map above, then the machine's own
 * legacy `order` field (for any machine not covered by either), then a
 * high fallback so unknown machines sort last instead of first.
 */
export function resolveMachineOrder(
  machineId: string | undefined,
  legacyOrder: number | undefined,
  studioOrderOverride?: number,
): number {
  if (studioOrderOverride !== undefined) return studioOrderOverride;
  if (machineId && DEFAULT_MACHINE_DISPLAY_ORDER[machineId] !== undefined) {
    return DEFAULT_MACHINE_DISPLAY_ORDER[machineId];
  }
  return legacyOrder ?? 999;
}
