/**
 * THE HUDDLE — the morning's agenda, from the brief. Pure: team-week.test.ts.
 *
 * The redesign's Operations room, phase 6 (Sep 28 2026; research-operations
 * §6.4, the blueprint's Huddle mode). A leader taps "Start huddle" on Today
 * and holds the iPad up to the team: five items, big enough to point at,
 * each tapped as it is covered. Nothing is sent to anyone and nothing is
 * written: the covered marks live as long as the huddle is open, and what a
 * leader put on it from Team → This week lives in this iPad's memory for
 * the day (huddle-memory.ts), forgotten at sign-out.
 *
 *   1  A concern and a win   the first thing Needs you is waiting on (pain,
 *                            an incident, a Critical note), and the first
 *                            thing going right (someone back, a milestone)
 *   2  Today                 who to catch in person, in the order they're in,
 *                            and whose usual trainer is in and may know why
 *                            they've drifted
 *   3  The floor             sessions nobody logged yet, and machine fit
 *   4  Recognition           what the leader recognised on Team, and who is
 *                            back after a gap
 *   5  Announcements         what the bell is showing
 *
 * Every line is a sentence the brief already says, so the huddle and Today
 * never disagree. A part that couldn't be read says so; it is never blank.
 */

export interface HuddleLine {
  /** A short tag before the line: "9:40 AM", "Ask", "Concern". */
  tag?: string;
  text: string;
}

export interface HuddleItem {
  n: number;
  title: string;
  sub?: string;
  lines: HuddleLine[];
}

export interface HuddleInput {
  /** The first concern; null for none, undefined while it is still being read. */
  concern: string | null | undefined;
  win: string | null | undefined;
  /** Who to catch today; null when today's bookings couldn't be read. */
  catchLines: HuddleLine[] | null;
  floor: string[];
  recognition: string[];
  announcements: string[];
}

/**
 * What Today hands the huddle: everything but what the huddle reads itself
 * while it is open (the bell's announcements, and what Team recognised).
 */
export type BriefHuddleInput = Omit<HuddleInput, "announcements">;

export function huddleAgenda(i: HuddleInput): HuddleItem[] {
  const said = (lines: HuddleLine[], empty: string): HuddleLine[] => (lines.length ? lines : [{ text: empty }]);
  return [
    {
      n: 1,
      title: "A concern and a win",
      sub: "one of each, from the brief",
      lines: [
        { tag: "Concern", text: i.concern === undefined ? "Still reading…" : (i.concern ?? "Nothing is waiting to be acknowledged.") },
        { tag: "Win", text: i.win === undefined ? "Still reading…" : (i.win ?? "Nothing on record yet.") },
      ],
    },
    {
      n: 2,
      title: "Today",
      sub: "who to catch",
      lines: i.catchLines === null ? [{ text: "Today's bookings couldn't be read, so who to catch is unknown." }] : said(i.catchLines, "Nobody to catch in person today."),
    },
    { n: 3, title: "The floor", lines: said(i.floor.map((text) => ({ text })), "Nothing on the floor to raise.") },
    { n: 4, title: "Recognition", lines: said(i.recognition.map((text) => ({ text })), "Nothing yet. Recognise someone on Team → This week and it lands here.") },
    { n: 5, title: "Announcements", lines: said(i.announcements.map((text) => ({ text })), "None showing in the bell.") },
  ];
}
