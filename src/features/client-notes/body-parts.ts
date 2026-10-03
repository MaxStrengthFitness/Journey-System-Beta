/**
 * THE BODY MAP A NOTE USES — one fixed list, head to toe, the same order every
 * time (notes round, Oct 3 2026).
 *
 * AJ's hand-off: "Body part comes from a fixed, consistent top-to-bottom map
 * (neck, shoulder, chest, upper/lower back, abdominals, hips, knees, ankles,
 * elbows, wrists, hands, feet; left/right), same order every time for muscle
 * memory." It is asked only for Health and Incident, it is optional, and it
 * never moves: a trainer who taps "Knee" twice a day finds it in the same
 * place every time. Feet sit with the legs (after ankles) rather than after
 * hands, so the list reads trunk, legs, arms.
 *
 * It is NOT a fifth body list. The app already has four (the briefing's door
 * map, the Pulse pain map, the Catalog's muscles, the clinical flags), and a
 * note that said "knee" one way could never be counted with a Pulse "knee"
 * said another. So every part here names the Pulse region it is (`pulse`),
 * and a pattern read ("left knee noted at 3 of her last 8 sessions") counts
 * both as one. Abdominals have no Pulse region; wrists and hands share one.
 *
 * Pure: no React, no Firebase.
 */
import type { BodyRegion } from "../subjective-report/types";
import type { NoteBodyMark, NoteBodyPart } from "../../types/journal";

export interface NoteBodyPartMeta {
  id: NoteBodyPart;
  /** The chip's word. */
  label: string;
  /** The word in a sentence ("left knee"). */
  word: string;
  /** Comes in a pair, so a side can be said. */
  paired: boolean;
  /** The Pulse pain map's region for the same part, when it has one. */
  pulse: BodyRegion | null;
}

/** AJ's map, in its fixed order. */
export const NOTE_BODY_PARTS: readonly NoteBodyPartMeta[] = [
  { id: "neck", label: "Neck", word: "neck", paired: false, pulse: "neck" },
  { id: "shoulder", label: "Shoulder", word: "shoulder", paired: true, pulse: "shoulder" },
  { id: "chest", label: "Chest", word: "chest", paired: false, pulse: "chest" },
  { id: "upper_back", label: "Upper back", word: "upper back", paired: false, pulse: "upper_back" },
  { id: "lower_back", label: "Lower back", word: "lower back", paired: false, pulse: "lower_back" },
  { id: "abdominals", label: "Abdominals", word: "abdominals", paired: false, pulse: null },
  { id: "hip", label: "Hip", word: "hip", paired: true, pulse: "hip" },
  { id: "knee", label: "Knee", word: "knee", paired: true, pulse: "knee" },
  { id: "ankle", label: "Ankle", word: "ankle", paired: true, pulse: "ankle" },
  { id: "foot", label: "Foot", word: "foot", paired: true, pulse: "foot" },
  { id: "elbow", label: "Elbow", word: "elbow", paired: true, pulse: "elbow" },
  { id: "wrist", label: "Wrist", word: "wrist", paired: true, pulse: "wrist_hand" },
  { id: "hand", label: "Hand", word: "hand", paired: true, pulse: "wrist_hand" },
];

export const NOTE_BODY_PART_META: Record<NoteBodyPart, NoteBodyPartMeta> = Object.fromEntries(
  NOTE_BODY_PARTS.map((p) => [p.id, p]),
) as Record<NoteBodyPart, NoteBodyPartMeta>;

const isPart = (v: unknown): v is NoteBodyPart => typeof v === "string" && v in NOTE_BODY_PART_META;
const SIDES = new Set(["left", "right", "both"]);

/**
 * The marks as they should be stored: known parts only, each once, a side
 * only on a paired part, in the map's order. Anything unreadable (an old
 * draft, a hand-edited document) is dropped rather than written.
 */
export function normaliseBodyMarks(marks: readonly unknown[] | null | undefined): NoteBodyMark[] {
  if (!Array.isArray(marks)) return [];
  const byPart = new Map<NoteBodyPart, NoteBodyMark>();
  for (const m of marks) {
    if (!m || typeof m !== "object") continue;
    const { part, side } = m as { part?: unknown; side?: unknown };
    if (!isPart(part) || byPart.has(part)) continue;
    const paired = NOTE_BODY_PART_META[part].paired;
    byPart.set(part, { part, side: paired && typeof side === "string" && SIDES.has(side) ? (side as NoteBodyMark["side"]) : null });
  }
  return NOTE_BODY_PARTS.filter((p) => byPart.has(p.id)).map((p) => byPart.get(p.id)!);
}

/** "left knee", "both shoulders", "neck". */
export function bodyMarkWords(mark: NoteBodyMark): string {
  const meta = NOTE_BODY_PART_META[mark.part];
  if (!meta) return "";
  if (!meta.paired || !mark.side) return meta.word;
  if (mark.side === "both") return `both ${meta.word === "foot" ? "feet" : `${meta.word}s`}`;
  return `${mark.side} ${meta.word}`;
}

/** "Left knee · neck" — the line a card wears. Empty when there are none. */
export function bodyMarksLine(marks: readonly NoteBodyMark[] | null | undefined): string {
  const words = normaliseBodyMarks(marks ?? []).map(bodyMarkWords).filter(Boolean);
  if (!words.length) return "";
  const line = words.join(" · ");
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** Add a part, take it away, or change its side — the picker's one move. */
export function toggleBodyPart(marks: readonly NoteBodyMark[], part: NoteBodyPart): NoteBodyMark[] {
  const has = marks.some((m) => m.part === part);
  return normaliseBodyMarks(has ? marks.filter((m) => m.part !== part) : [...marks, { part, side: null }]);
}

export function setBodySide(
  marks: readonly NoteBodyMark[],
  part: NoteBodyPart,
  side: NoteBodyMark["side"],
): NoteBodyMark[] {
  return normaliseBodyMarks(marks.map((m) => (m.part === part ? { ...m, side: m.side === side ? null : side } : m)));
}

/** The Pulse regions a note's marks are, for counting a note and a Pulse answer as one. */
export function pulseRegionsOf(marks: readonly NoteBodyMark[] | null | undefined): BodyRegion[] {
  const out = new Set<BodyRegion>();
  for (const m of normaliseBodyMarks(marks ?? [])) {
    const r = NOTE_BODY_PART_META[m.part].pulse;
    if (r) out.add(r);
  }
  return [...out];
}
