/**
 * YOUR OWN COLUMN, IN WORDS (hub cherry round, Sep 28 2026). Pure:
 * your-day.test.ts.
 *
 * Hub direction B's focus column (the Redesign Blueprints' Hub room, held
 * for this last round): "your column goes wide with words … your own day
 * reads in words." On the grid that means three things, and this file
 * decides the words of the first:
 *
 *   - the head of your column says your day in one line: how many, from
 *     when to when, and on today how many are still to go —
 *     "12 sessions · 6:00 AM – 12:00 PM · 8 to go";
 *   - your column takes more of the room there is (hub-grid.css,
 *     `data-focus`), never more than there is;
 *   - your cards say every mark they may say out loud, not only the first,
 *     once they have the room (card-marks.ts `sayableWord` with `yours`,
 *     HubCard `wordy`).
 *
 * Nothing here is a claim about a CLIENT, only about the day's bookings, so
 * a client standing at the iPad reads nothing she shouldn't. "To go" is the
 * clock's answer (a slot not over yet), never "done": done means logged, and
 * the cards say that.
 */
import { rangeWords, type Span } from "./grid-model";

export interface YourDayInput {
  /** Your bookings on the day, in studio minutes (never Mindbody's "Unavailable"). */
  spans: ReadonlyArray<Span>;
  /** Minutes since the studio's midnight when the day on screen is today; null on any other day. */
  nowMin: number | null;
}

/** Your day, in its three parts, so a narrow column head can leave the middle one out. */
export interface YourDay {
  /** "12 sessions". */
  count: string;
  /** "6:00 AM – 12:00 PM": your first booking's start to your last one's end. */
  span: string;
  /** "8 to go" on today, while some but not all are still to come; otherwise null. */
  toGo: string | null;
}

const valid = (s: Span) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > s.from;

/** Your day, or null when you have nothing booked (the head then says what every head says). */
export function yourDay({ spans, nowMin }: YourDayInput): YourDay | null {
  const booked = spans.filter(valid);
  if (booked.length === 0) return null;
  const count = booked.length;
  const from = Math.min(...booked.map((s) => s.from));
  const to = Math.max(...booked.map((s) => s.to));
  let toGo: string | null = null;
  if (nowMin !== null && Number.isFinite(nowMin)) {
    const left = booked.filter((s) => s.to > nowMin).length;
    // All of them still to come says nothing the count doesn't; none says
    // nothing either (over is not done — the cards say what was logged).
    if (left > 0 && left < count) toGo = `${left} to go`;
  }
  return { count: `${count} ${count === 1 ? "session" : "sessions"}`, span: rangeWords({ from, to }), toGo };
}

/** The whole line: "12 sessions · 6:00 AM – 12:00 PM · 8 to go". */
export function yourDayWords(input: YourDayInput): string | null {
  const day = yourDay(input);
  if (!day) return null;
  return [day.count, day.span, day.toGo].filter(Boolean).join(" · ");
}
