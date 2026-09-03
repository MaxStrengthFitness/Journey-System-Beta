/**
 * STABLE TRAINER COLOUR.
 *
 * Round: Calendar redesign, Sep 2026.
 *
 * The old views did this:
 *
 *     TRAINER_COLORS[trainerIdx % TRAINER_COLORS.length]
 *
 * where `trainerIdx` was the trainer's POSITION in whatever list the view had
 * just built. Filter to one trainer, switch studios, or have a trainer with no
 * sessions drop out, and everyone shifts a colour. Christian is orange in the
 * month view and blue in the day view, and the colour stops meaning anything.
 *
 * A tone is now derived from the trainer's ID, so it is stable for the life of
 * that trainer across every view, every filter and every session.
 */

/** Eight tones. Enough for a studio's roster without repeating. */
export const TONE_COUNT = 8;

/**
 * FNV-1a. Small, dependency-free, and — the property that matters here —
 * stable across reloads and machines, which `Math.random()` and insertion
 * order are not.
 */
function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function toneFor(trainerId: string | null | undefined): number {
  if (!trainerId) return 0;
  return hashString(String(trainerId)) % TONE_COUNT;
}

/** Class hook for the tone. CSS owns the actual colour values. */
export function toneClass(tone: number): string {
  return `cal-tone-${tone % TONE_COUNT}`;
}

export function initialsOf(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function shortNameOf(name: string): string {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts[0] || "Unknown";
}
