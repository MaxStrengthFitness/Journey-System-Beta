/**
 * Cutting text to a length without cutting a character in half.
 *
 * Learning + Planner round (review). `slice` counts UTF-16 units, and an
 * emoji is two of them: a title or excerpt cut at the wrong place ended in
 * half a character, which draws as a box. This drops the stray half. The
 * result is never longer than `max` units, so a rule's size limit still holds.
 */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  // A high surrogate is the first half of a pair whose second half was cut.
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}
