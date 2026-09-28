import { describe, expect, it } from "vitest";
import { leaveQuestion } from "../unsaved-changes";
import { backFrom } from "./back-from";
import { normalizeMark, offerable } from "./marks";
import { nextDays, type NextDaysLine } from "./next-days";
import type { Offer } from "./offer";
import {
  CHECKING_COMING,
  CHECK_IN_MINDBODY,
  MARKS_UNKNOWN_OFFERS,
  MARK_INTRO,
  MARK_QUEUED,
  MARK_WORD,
  NO_OFFERS,
  NO_TIMES_NEXT_7,
  OFFER_FOOT,
  YOU_NO_TIMES_NEXT_7,
  backFromSentence,
  builtLine,
  cancellationsLine,
  chips,
  lineDetail,
  lineSentence,
  markChangeLine,
  markLabel,
  markLines,
  markNoteHint,
  markNoteLine,
  nameBook,
  nextDaysStateSentence,
  noOffersWithSentence,
  nothingOpenedWithSentence,
  notCountedLines,
  notEnoughSentence,
  offerSentence,
  offerWho,
  outnumberedLine,
  overviewLines,
  overviewMoreLine,
  regularsLine,
  removeQuestion,
  rotationDaySentence,
  rotationDays,
  rotationLines,
  rotationTimesSentence,
  sinceLine,
  summaryStateSentence,
  teamLine,
  teamNoneSentence,
  thisWeekSentence,
  timesWithRoomByDay,
  unagreedLine,
  usualSentence,
  usuallyBookedLine,
  usuallyInLine,
  whoSays,
  wordLabel,
} from "./present";
import type { CellWeek, OpeningsSummary, SummaryDay } from "./summary-doc";
import { usualTime, type UsualTime, type UsualWord } from "./usual";
import { MONDAYS, TRAINERS, TZ, at as fixtureAt, sam, standingWeek } from "./fixtures";

type Spec = { day?: SummaryDay; cell?: CellWeek };
const F: Spec = { cell: { s: "f", b: 2, i: ["0", "1"] } };
const R: Spec = { cell: { s: "r", b: 1, i: ["0", "1"] } };
const N: Spec = { cell: { s: "n", i: ["0", "1"] } };
const U: Spec = { day: { n: 30, x: "r" } };
const J = (b: number): Spec => ({ day: { n: 4, q: "a" }, cell: { s: "b", b } });

/** The weeks of Monday Nov 23 back to Monday Oct 5 (for a Thanksgiving Thursday). */
const LATER = ["2026-11-23", "2026-11-16", "2026-11-09", "2026-11-02", "2026-10-26", "2026-10-19", "2026-10-12", "2026-10-05"];

function at(key: string, specs: Spec[], mondays = MONDAYS): UsualTime {
  const wd = key[0];
  const s: OpeningsSummary = {
    v: 1,
    builtAt: "2026-11-08T07:00:00.000Z",
    tz: TZ,
    row: 30,
    since: "2026-09-14",
    weeks: specs.map((sp, i) => ({ m: mondays[i], d: { [wd]: sp.day ?? { n: 30, j: 1 } } })),
    who: { "0": { id: "t-pat", n: "Pat Moss" }, "1": { id: "t-sam", n: "Sam Lee" } },
    agreed: {},
    cells: { [key]: Object.fromEntries(specs.flatMap((sp, i) => (sp.cell ? [[String(i), sp.cell]] : []))) },
  };
  return usualTime(s, key);
}

const names = nameBook([
  { id: "t-sam", name: "Sam Lee" },
  { id: "t-pat", name: "Pat Moss" },
  { id: "t-kim", name: "Kim Ray" },
]);
const NOBODY = { trainerId: null };
const SAM = { trainerId: "t-sam", uid: "uid-sam" };

describe("names (AJ's relaxed answer: everyone at the studio sees them)", () => {
  it("first names, the whole name when two share one, never cut short", () => {
    expect(names("t-sam")).toBe("Sam");
    const twins = nameBook([{ id: "a", name: "Alex Doe" }, { id: "b", name: "Alex Moore-Whitfield" }]);
    expect(twins("b")).toBe("Alex Moore-Whitfield");
    expect(names("t-unknown")).toBe("a trainer");
  });

  it("the person looking is 'you', first; everyone else in name order", () => {
    expect(whoSays(["t-sam", "t-pat"], names, SAM)).toBe("you and Pat");
    expect(whoSays(["t-sam", "t-pat", "t-kim"], names, NOBODY)).toBe("Kim, Pat and Sam");
    expect(whoSays(["t-sam", "t-pat", "t-kim"], names, SAM)).toBe("you, Kim and Pat");
  });

  it("the chips: With you, Anyone, then one per trainer in name order, with no counts", () => {
    expect(chips(["t-sam", "t-pat", "t-kim"], names, SAM).map((c) => c.label)).toEqual(["With you", "Anyone", "With Kim", "With Pat"]);
    expect(chips(["t-pat"], names, NOBODY).map((c) => c.label)).toEqual(["Anyone", "With Pat"]);
  });
});

describe("the usual word, in the proposal's own sentences", () => {
  it("Always full, Usually full, Usually has room, Mixed", () => {
    expect(usualSentence(at("1-0800", [F, F, F, F, F, F, F, F]))).toBe("Monday 8:00 AM · Always full: full in all of the last 8 Mondays.");
    expect(usualSentence(at("1-0830", [F, F, F, F, F, F, F, R]))).toBe("Monday 8:30 AM · Usually full: full in 7 of the last 8 Mondays.");
    expect(usualSentence(at("2-1030", [R, N, N, R, N, N, F, F]))).toBe("Tuesday 10:30 AM · Usually has room: room in 6 of the last 8 Tuesdays, and nobody booked in 4 of them.");
    expect(usualSentence(at("4-1700", [F, F, F, F, R, R, R, R]))).toBe("Thursday 5:00 PM · Mixed: full in 4 of the last 8 Thursdays.");
    expect(usualSentence(at("1-0800", [F, F, F, F, F, F, U, U]))).toBe("Monday 8:00 AM · Always full: full in all of the 6 Mondays judged.");
  });

  it("N booked, Rotation, not enough weeks yet, blank", () => {
    expect(usualSentence(at("3-0600", [J(5), J(3), J(3), J(3), J(3), J(3), J(2), U]))).toBe(
      "Wednesday 6:00 AM · Usually 3 booked (3 or more in 6 of the 7 Wednesdays counted). Room can't be judged yet: not every trainer's week is agreed.",
    );
    const rota: Spec = { cell: { s: "o", b: 5, r: 5 } };
    // The whole day only when it is a rotation day (rotationDays); otherwise the time.
    expect(usualSentence(at("6-0900", [rota, rota, rota, rota, rota, rota, rota, rota]), true)).toBe("Saturday 9:00 AM · Usually 5 booked on the rotation. Saturdays run on the rotation: ask the front desk.");
    expect(usualSentence(at("6-0900", [rota, rota, rota, rota, rota, rota, rota, rota]))).toBe("Saturday 9:00 AM · Usually 5 booked on the rotation. This time runs on the rotation: ask the front desk.");
    expect(usualSentence(at("5-1900", [F, F, F, U, U, U, U, U]))).toBe("Friday 7:00 PM · Not enough weeks yet: 3 Fridays counted so far.");
    expect(usualSentence(at("5-1900", [F, U, U, U, U, U, U, U]))).toBe("Friday 7:00 PM · Not enough weeks yet: 1 Friday counted so far.");
    expect(usualSentence(at("1-1900", [{}, {}, {}, {}, {}, {}, {}, {}]))).toBe("Monday 7:00 PM · Nothing booked and nobody in, in all of the last 8 Mondays.");
    expect(usualSentence(at("1-1900", [{}, {}, U, U, U, U, U, U]))).toBe("Monday 7:00 PM · Nothing booked and nobody in, in all of the 2 Mondays counted.");
  });

  it("the grid's button words", () => {
    expect(wordLabel(at("1-0800", [F, F, F, F, F, F, F, F]))).toBe("Always full");
    expect(wordLabel(at("3-0600", [J(3), J(3), J(3), J(3), U, U, U, U]))).toBe("3 booked");
    expect(wordLabel(at("5-1900", [F, U, U, U, U, U, U, U]))).toBe("–");
    expect(wordLabel(at("1-1900", [{}, {}, {}, {}, {}, {}, {}, {}]))).toBe("");
  });
});

describe("the time's sheet", () => {
  it("names the days left out, and why", () => {
    const monday = at("1-0800", [F, F, F, U, F, { day: { n: 30, q: "p" }, cell: { s: "b", b: 2 } }, F, F]);
    expect(notCountedLines(monday, TZ)).toEqual(["Not judged: Mon, Sep 28. A booking that day couldn't be placed with a trainer.", "Not counted: Mon, Oct 12. Journey didn't read it in full."]);
    const closed: Spec = { day: { n: 2, x: "c" } };
    const busy: Spec = { ...F, day: { n: 38, j: 1 } };
    const thanksgiving = at("4-1700", [closed, busy, busy, busy, busy, busy, busy, busy], LATER);
    expect(notCountedLines(thanksgiving, TZ)).toEqual(["Not counted: Thu, Nov 26, 2 bookings (a Thursday usually has 38). Closed, or nearly."]);
  });

  it("cancellations, more booked than in, usually booked, usually in, regulars", () => {
    const cancelled: Spec = { cell: { s: "f", b: 3, c: 1, l: 1, i: ["1"] } };
    const early: Spec = { cell: { s: "f", b: 3, c: 1, i: ["1"] } };
    const u = at("1-0800", [cancelled, cancelled, early, { cell: { s: "f", b: 2, i: ["1"] } }, F, F, { cell: { s: "f", b: 3, i: ["0", "1"] } }, { cell: { s: "f", b: 3, i: ["0", "1"] } }]);
    expect(cancellationsLine(u)).toBe("Cancelled in 3 of the last 8 Mondays (2 of them late).");
    expect(outnumberedLine(u)).toBe("More booked than the agreed weeks have in, in 6 of the last 8 Mondays. Someone's usual week may be missing this time.");
    expect(usuallyBookedLine(u)).toBe("Usually 2 booked.");
    expect(usuallyInLine(u, names, NOBODY)).toBe("Usually in: Sam.");
    expect(usuallyInLine(u, names, SAM)).toBe("Usually in: you.");
    expect(regularsLine(4, "1-0800")).toBe("4 regulars at Monday 8:00 AM on the agreed weeks.");
    expect(regularsLine(1, "1-0800")).toBe("1 regular at Monday 8:00 AM on the agreed weeks.");
    expect(regularsLine(0, "1-0800")).toBeNull();
    // A rotation Saturday: nobody's usual week is missing, so no "more booked than in".
    const rota: Spec = { cell: { s: "o", b: 5, r: 5 } };
    expect(outnumberedLine(at("6-0900", [rota, rota, rota, rota, rota, rota, rota, rota]))).toBeNull();
    // A trainer booked outside their agreed week still says it.
    const outside: Spec = { cell: { s: "o", b: 1 } };
    expect(outnumberedLine(at("1-0800", [outside, outside, outside, outside, outside, outside, F, F]))).toBe(
      "More booked than the agreed weeks have in, in 6 of the last 8 Mondays. Someone's usual week may be missing this time.",
    );
    // Below the minimum, nothing is said.
    expect(usuallyInLine(at("1-0800", [F, F, F, U, U, U, U, U]), names, NOBODY)).toBeNull();
    expect(cancellationsLine(at("1-0800", [F, F, F, F, F, F, F, F]))).toBeNull();
  });

  it("a mark first, then what the bookings say; the disagreement before both; the review after 60 days", () => {
    const jo = (mark: "full" | "room") => normalizeMark("1-0800", { weekday: 1, time: "08:00", mark, by: { id: "uid-jo", name: "Jo Park" }, at: new Date("2026-10-03T14:00:00Z") })!;
    const fiveOfEight = at("1-0800", [F, F, F, F, F, R, R, R]);
    expect(markLines(fiveOfEight, jo("full"), NOBODY, "2026-10-10", TZ)).toEqual(["Marked Always full by Jo, Oct 3.", "The bookings say: full in 5 of the last 8 Mondays."]);
    const roomy = at("1-0800", [R, R, R, R, R, R, F, F]);
    expect(markLines(roomy, jo("full"), NOBODY, "2026-12-06", TZ)).toEqual([
      "The bookings disagree: room in 6 of the last 8 Mondays.",
      "Marked Always full by Jo, Oct 3.",
      "Marked 64 days ago. Still true?",
    ]);
    expect(markLines(roomy, jo("room"), { trainerId: "t-jo", uid: "uid-jo" }, "2026-10-10", TZ)[0]).toBe("Marked Usually has room by you, Oct 3.");
  });
});

describe("above the grid", () => {
  it("the since line, the built line, and the sentence before four weeks", () => {
    const s = { since: "2026-10-05", weeks: [{ m: "2026-11-02", d: {} }, { m: "2026-09-14", d: {} }] };
    expect(sinceLine(s, 6, TZ)).toBe("From the weeks Journey has read in full since Oct 5 (6 weeks).");
    expect(sinceLine({ ...s, since: "2026-08-03" }, 8, TZ)).toBe("From the last 8 weeks, all read in full.");
    expect(sinceLine({ ...s, since: null }, 0, TZ)).toBeNull();
    expect(builtLine({ builtAt: "2026-10-04T07:00:00.000Z" }, TZ)).toBe("Built Sunday, Oct 4.");
    expect(notEnoughSentence(2, "2026-10-05", "2026-10-25", TZ)).toBe(
      "The usual week needs 4 weeks Journey has read in full. It has 2 so far, counted since Oct 5. The first words can come on Sunday, Oct 25.",
    );
    expect(notEnoughSentence(0, null, "2026-11-15", TZ)).toBe("The usual week needs 4 weeks Journey has read in full. It has none so far. The first words can come on Sunday, Nov 15.");
  });

  it("whose week isn't agreed, by name, or the one sentence when none is", () => {
    const team = [
      { id: "t-sam", name: "Sam Lee" },
      { id: "t-kim", name: "Kim Ray" },
      { id: "t-pat", name: "Pat Moss" },
    ];
    expect(unagreedLine(team, [], "Westlake", names)).toBe(
      "Who's in comes from the standing weeks leaders agree on Team. None is agreed at Westlake yet, so this shows how many are usually booked, not whether there's room.",
    );
    const agreed = (trainerId: string) => ({ trainerId, final: { hours: [], regulars: [] } });
    expect(unagreedLine(team, [agreed("t-sam"), agreed("t-pat")], "Westlake", names)).toBe("Kim's week isn't agreed yet.");
    expect(unagreedLine(team, [agreed("t-sam")], "Westlake", names)).toBe("Kim's and Pat's weeks aren't agreed yet.");
    expect(unagreedLine(team, team.map((t) => agreed(t.id)), "Westlake", names)).toBeNull();
  });

  it("the summary's own states", () => {
    expect(summaryStateSentence("never", "Westlake")).toBe("The usual week is built early each Sunday. The first one comes this Sunday.");
    expect(summaryStateSentence("unreadable", "Westlake")).toBe("Can't read the usual week just now.");
    expect(summaryStateSentence("unlinked", "Westlake")).toBe("Westlake's bookings aren't linked to Journey, so Openings can't read them.");
  });
});

const line = (over: Partial<NextDaysLine> = {}): NextDaysLine => ({
  dateKey: "2026-10-05",
  row: 480,
  key: "1-0800",
  reasons: [],
  usual: { word: "usually-full", usuallyBooked: 4 } as UsualTime,
  mark: null,
  usuallyFull: true,
  bookedNow: 3,
  room: { count: 1, with: [] },
  trainerIds: ["t-sam"],
  clients: [],
  ...over,
});
const finding = (over = {}) => ({ kind: "open" as const, dateKey: "2026-10-05", start: "08:00", trainerId: "t-sam", trainerName: "Sam Lee", clientId: "c-judy", clientName: "Judy Smith", ...over });

describe("next 7 days", () => {
  it("a line names no client: 'a regular' or 'a cancellation'", () => {
    const l = line({ reasons: [{ kind: "regular-open", finding: finding() }], clients: [{ clientId: "c-judy", clientName: "Judy Smith", trainerId: "t-sam", reason: "regular-open" }] });
    const s = lineSentence(l, names, NOBODY, TZ, { kind: "booked-again", day: "2026-10-19" });
    expect(s).toBe("Mon, Oct 5 · 8:00 AM · usually full · room with 1 trainer. A regular isn't booked for it; booked again from Mon, Oct 19.");
    expect(s).not.toContain("Judy");
    expect(lineSentence({ ...l, room: { count: 1, with: ["t-sam"] } }, names, NOBODY, TZ)).toBe("Mon, Oct 5 · 8:00 AM · usually full · room with Sam. A regular isn't booked for it.");
    expect(lineSentence({ ...l, room: { count: 1, with: ["t-sam"] } }, names, SAM, TZ)).toContain("room with you.");
  });

  it("a cancellation, a move, and a usually-full time with room", () => {
    const cancelled = line({
      dateKey: "2026-10-08",
      row: 1050,
      key: "4-1730",
      usual: { word: "booked", usuallyBooked: 4 } as UsualTime,
      usuallyFull: false,
      room: null,
      reasons: [{ kind: "cancellation", cancelledOn: "2026-10-02", clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat" }],
      clients: [{ clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat", reason: "cancellation" }],
    });
    expect(lineSentence(cancelled, names, NOBODY, TZ)).toBe("Thu, Oct 8 · 5:30 PM · usually 4 booked. A cancellation on Oct 2, and nobody has booked into it since (3 booked now).");
    // An agreed week there, and room for nobody: still says how many are booked now.
    expect(lineSentence({ ...cancelled, room: { count: 0, with: [] } }, names, NOBODY, TZ)).toContain("nobody has booked into it since (3 booked now).");
    const moved = line({ reasons: [{ kind: "regular-moved", finding: finding({ kind: "moved", movedTo: { dateKey: "2026-10-06", start: "09:30", trainerName: "Sam Lee", sameTrainer: true } }) }] });
    expect(lineSentence(moved, names, NOBODY, TZ)).toBe("Mon, Oct 5 · 8:00 AM · usually full · room with 1 trainer. A regular is booked Tue, Oct 6 at 9:30 AM instead.");
    expect(lineSentence(line({ reasons: [{ kind: "usually-full" }], room: { count: 1, with: ["t-pat"] } }), names, NOBODY, TZ)).toBe(
      "Mon, Oct 5 · 8:00 AM · usually full · room with Pat. Nothing is booked with them yet.",
    );
    const marked = normalizeMark("1-0800", { weekday: 1, time: "08:00", mark: "full", by: { id: "u", name: "Jo" }, at: null })!;
    expect(lineSentence(line({ usual: { word: "mixed" } as UsualTime, mark: marked, reasons: [{ kind: "usually-full" }] }), names, NOBODY, TZ)).toContain("· marked always full ·");
  });

  it("a tap reveals the clients by name", () => {
    const l = line({
      reasons: [
        { kind: "regular-open", finding: finding() },
        { kind: "cancellation", cancelledOn: "2026-10-02", clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat" },
      ],
      clients: [
        { clientId: "c-judy", clientName: "Judy Smith", trainerId: "t-sam", reason: "regular-open" },
        { clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat", reason: "cancellation" },
      ],
    });
    expect(lineDetail(l, names, NOBODY, TZ)).toEqual(["Judy Smith, Sam's regular, isn't booked for it.", "Bob Hart cancelled on Oct 2 (with Pat)."]);
    expect(lineDetail(l, names, SAM, TZ)[0]).toBe("Judy Smith, your regular, isn't booked for it.");
  });

  it("a twice-a-week regular booked Monday and not Thursday: the Thursday line is about the slot, never her week", () => {
    const thursdays = standingWeek({
      final: {
        hours: [
          { weekday: 1, from: "07:00", to: "10:00" },
          { weekday: 4, from: "07:00", to: "10:00" },
        ],
        regulars: [
          { id: "r1", weekday: 1, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" },
          { id: "r2", weekday: 4, start: "08:00", clientId: "c-judy", clientName: "Judy Smith" },
        ],
      },
    });
    const judyMonday = sam("2026-11-09", "08:00", { clientId: "c-judy", clientName: "Judy Smith" });
    const n = nextDays({ today: "2026-11-09", now: fixtureAt("2026-11-09", "06:00"), tz: TZ, read: "ready", connected: true, bookings: [judyMonday], docs: [thursdays], trainers: TRAINERS });
    expect(n.lines.map((l) => [l.dateKey, l.key])).toEqual([["2026-11-12", "4-0800"]]);
    const b = backFrom({ slotDay: "2026-11-12", today: "2026-11-09", studioId: "westlake", clientId: "c-judy", bookings: [judyMonday], monthRead: false, tz: TZ });
    const s = lineSentence(n.lines[0], names, NOBODY, TZ, b);
    expect(s).toBe("Thu, Nov 12 · 8:00 AM · room with Sam. A regular isn't booked for it; not booked again through Sun, Nov 15; can't tell after that yet.");
    expect(s).not.toContain("this week");
    expect(s).not.toContain("next 7 days");
    expect(lineDetail(n.lines[0], names, NOBODY, TZ)).toEqual(["Judy Smith, Sam's regular, isn't booked for it."]);
  });

  it("a cancellation line never says 'not rebooked': on Changes that means she didn't reschedule", () => {
    const cancelled = line({
      room: null,
      reasons: [{ kind: "cancellation", cancelledOn: "2026-11-06", clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat" }],
      clients: [{ clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat", reason: "cancellation" }],
    });
    const s = lineSentence(cancelled, names, NOBODY, TZ, { kind: "booked-again", day: "2026-11-11" });
    expect(s).toBe("Mon, Oct 5 · 8:00 AM · usually full. A cancellation on Nov 6, and nobody has booked into it since (3 booked now); booked again from Wed, Nov 11.");
    expect(s).not.toContain("rebooked");
  });

  it("what the list says when it can't tell, isn't linked, or has nothing agreed", () => {
    for (const state of ["loading", "failed", "offline"] as const) {
      expect(nextDaysStateSentence({ state, agreedAny: true, lines: [] }, "Westlake")).toBe("Can't tell yet. The next 7 days' bookings haven't come back from the server.");
    }
    expect(nextDaysStateSentence({ state: "unconnected", agreedAny: true, lines: [] }, "Westlake")).toBe("Westlake's bookings aren't linked to Journey, so Openings can't read them.");
    expect(nextDaysStateSentence({ state: "ready", agreedAny: false, lines: [] }, "Westlake")).toBe("No standing week is agreed yet, so this lists cancellations only.");
    expect(nextDaysStateSentence({ state: "ready", agreedAny: true, lines: [] }, "Westlake")).toBe("Nothing has opened up in the next 7 days.");
    expect(nextDaysStateSentence({ state: "ready", agreedAny: true, lines: [line()] }, "Westlake")).toBeNull();
    expect(CHECK_IN_MINDBODY).toBe("Check it in Mindbody before you promise it.");
  });

  it("booked again from, each of its answers", () => {
    expect(backFromSentence({ kind: "booked-again", day: "2026-10-19" }, TZ)).toBe("Booked again from Mon, Oct 19.");
    expect(backFromSentence({ kind: "next-on-file", day: "2026-10-19" }, TZ)).toBe("Next booking on file after it: Mon, Oct 19.");
    // A "none" names the day it reaches, counted from the slot, never "the next 7 / 30 days" from today.
    expect(backFromSentence({ kind: "none-30", through: "2026-12-07" }, TZ)).toBe("Not booked again through Mon, Dec 7.");
    expect(backFromSentence({ kind: "none-7", through: "2026-11-13" }, TZ)).toBe("Not booked again through Fri, Nov 13; can't tell after that yet.");
    expect(backFromSentence({ kind: "cant-tell" }, TZ)).toBe("Can't tell yet.");
  });
});

describe("a new regular time", () => {
  const offer = (over: Partial<Offer> = {}): Offer => ({
    key: "2-1030",
    weekday: 2,
    row: 630,
    usual: at("2-1030", [R, R, R, R, R, R, F, F]),
    mark: null,
    who: ["t-pat"],
    coming: { state: "free", days: ["2026-10-13", "2026-10-20", "2026-10-27"] },
    thisWeek: { day: "2026-10-06", state: "room" },
    ...over,
  });

  it("in the proposal's words, with this week beside it and the foot", () => {
    expect(offerSentence(offer(), TZ)).toBe("Tuesday 10:30 AM · usually has room: room in 6 of the last 8 Tuesdays, and free on the next 3 Tuesdays on file.");
    expect(offerSentence(offer({ coming: { state: "cant-check", days: [] } }), TZ)).toBe("Tuesday 10:30 AM · usually has room: room in 6 of the last 8 Tuesdays. Can't check the coming Tuesdays yet.");
    expect(offerSentence(offer({ coming: { state: "checking", days: [] } }), TZ)).toContain("Checking the coming weeks…");
    expect(thisWeekSentence(offer(), TZ)).toBe("This Tuesday, Oct 6: room.");
    expect(thisWeekSentence(offer({ thisWeek: { day: "2026-10-06", state: "full" } }), TZ)).toBe("This Tuesday, Oct 6: full.");
    expect(thisWeekSentence(offer({ thisWeek: null }), TZ)).toBeNull();
    expect(offerWho(offer(), names, NOBODY)).toBe("With Pat");
    expect(OFFER_FOOT).toBe("Check it in Mindbody before you promise it. Journey doesn't book.");
    expect(NO_OFFERS).toBe("No usual times with room right now. The front desk can see every opening in Mindbody.");
  });

  it("a time offered on a mark says who marked it and what the bookings say", () => {
    const mark = normalizeMark("2-1030", { weekday: 2, time: "10:30", mark: "room", by: { id: "uid-jo", name: "Jo Park" }, at: new Date("2026-10-03T14:00:00Z") })!;
    expect(offerSentence(offer({ mark, usual: at("2-1030", [F, F, F, F, R, R, R, R]) }), TZ)).toBe(
      "Tuesday 10:30 AM · marked Usually has room by Jo, Oct 3 (the bookings say: full in 4 of the last 8 Tuesdays), and free on the next 3 Tuesdays on file.",
    );
  });
});

describe("the Wrap-up's times, Team's line, the Overview's line", () => {
  it("times with room grouped by day, this week's only marked", () => {
    const days = timesWithRoomByDay(
      [
        { dateKey: "2026-10-05", row: 690, thisWeekOnly: false },
        { dateKey: "2026-10-05", row: 360, thisWeekOnly: false },
        { dateKey: "2026-10-05", row: 480, thisWeekOnly: true },
        { dateKey: "2026-10-06", row: 540, thisWeekOnly: false },
      ],
      TZ,
    );
    expect(days.map((d) => d.sentence)).toEqual(["Mon, Oct 5: 6:00 AM · 8:00 AM (this week only) · 11:30 AM", "Tue, Oct 6: 9:00 AM"]);
    // Each chip as the sheet shows it, "(this week only)" included: the sheet never splits the sentence.
    expect(days[0].times.map((t) => t.said)).toEqual(["6:00 AM", "8:00 AM (this week only)", "11:30 AM"]);
    expect(rotationDaySentence(6)).toBe("Saturdays run on the rotation. Ask the front desk.");
    expect(rotationTimesSentence(1, [390, 360])).toBe("Mondays at 6:00 AM · 6:30 AM run on the rotation. Ask the front desk.");
  });

  it("a weekday runs on the rotation only when every time on it with a word reads Rotation (the final review)", () => {
    const rota: Spec = { cell: { s: "o", b: 1, r: 1 } };
    const eight = (s: Spec) => [s, s, s, s, s, s, s, s];
    const times = (list: UsualTime[]) => new Map(list.map((u) => [u.key, u]));
    // A whole Saturday on the rotation, with a blank time and a "–" beside it: a rotation day.
    const saturday = [at("6-0900", eight(rota)), at("6-0930", eight(rota)), at("6-1000", eight({})), at("6-1030", [F, F, F, U, U, U, U, U])];
    expect(rotationDays(times(saturday))).toEqual([6]);
    // One Rotation half-hour on a Monday beside times with room and full times: that time, not the day.
    const monday = [at("1-0600", eight(rota)), at("1-0700", eight(R)), at("1-0800", eight(F))];
    expect(rotationDays(times(monday))).toEqual([]);
    expect(rotationDays(times([...monday, ...saturday]))).toEqual([6]);
    expect(rotationLines(times([...monday, ...saturday])).map((l) => l.sentence)).toEqual([
      "Mondays at 6:00 AM run on the rotation. Ask the front desk.",
      "Saturdays run on the rotation. Ask the front desk.",
    ]);
  });

  it("Team keeps one line and a door, counting the regulars Openings lists", () => {
    const open = { kind: "regular-open" as const, finding: finding() };
    const moved = { kind: "regular-moved" as const, finding: finding({ kind: "moved" }) };
    const cancellation = { kind: "cancellation" as const, cancelledOn: "2026-10-02", clientId: "c-bob", clientName: "Bob Hart", trainerId: "t-pat" };
    const ready = (lines: NextDaysLine[]) => ({ state: "ready" as const, lines });
    // Two trainers' regulars out at one half-hour: one line, two free slots. Cancellations and usually-full don't count.
    expect(teamLine(ready([line({ reasons: [open, moved, cancellation, { kind: "usually-full" }] }), line({ reasons: [open] })]))).toBe(
      "3 free slots in the next 7 days · See them on Openings.",
    );
    expect(teamLine(ready([line({ reasons: [open] })]))).toBe("1 free slot in the next 7 days · See it on Openings.");
    expect(teamLine(ready([line({ reasons: [cancellation] })]))).toBeNull();
    expect(teamLine(ready([]))).toBeNull();
    expect(teamLine({ state: "offline", lines: [line({ reasons: [open] })] })).toBeNull();
  });

  it("Team says there is no free slot only once the week is read, and never beside a line", () => {
    const open = { kind: "regular-open" as const, finding: finding() };
    const ready = (lines: NextDaysLine[]) => ({ state: "ready" as const, lines });
    expect(teamNoneSentence(ready([]))).toBe("No free slots ahead in the next 7 days.");
    expect(teamNoneSentence(ready([line({ reasons: [{ kind: "usually-full" }] })]))).toBe("No free slots ahead in the next 7 days.");
    expect(teamNoneSentence(ready([line({ reasons: [open] })]))).toBeNull();
    expect(teamNoneSentence({ state: "loading", lines: [] })).toBeNull();
    expect(teamNoneSentence({ state: "offline", lines: [] })).toBeNull();
  });

  it("Team's count leaves out what Openings leaves out: a slot earlier today, and Sundays", () => {
    const regular = (id: string, weekday: number, start: string) => ({ id, weekday, start, clientId: `c-${id}`, clientName: `Client ${id}` });
    const doc = standingWeek({
      final: {
        hours: [
          { weekday: 1, from: "07:00", to: "10:00" },
          { weekday: 0, from: "10:00", to: "11:00" },
        ],
        regulars: [regular("a", 1, "07:00"), regular("b", 1, "09:00"), regular("c", 0, "10:00")],
      },
    });
    const run = (clock: string) => nextDays({ today: "2026-11-09", now: fixtureAt("2026-11-09", clock), tz: TZ, read: "ready", connected: true, bookings: [], docs: [doc], trainers: TRAINERS });
    // The raw check holds all three (7:00 already past, Sunday's 10:00); Openings lists 9:00 only.
    expect(run("08:05").check?.findings).toHaveLength(3);
    expect(teamLine(run("08:05"))).toBe("1 free slot in the next 7 days · See it on Openings.");
    expect(teamLine(run("06:00"))).toBe("2 free slots in the next 7 days · See them on Openings.");
    expect(teamLine(run("09:05"))).toBeNull();
  });

  it("the Overview a line for a usually-full time with room", () => {
    const lines = [line(), line({ dateKey: "2026-10-09" }), line({ usuallyFull: false })];
    expect(overviewLines(lines, "2026-10-05", TZ)).toEqual(["Mon, Oct 5 · 8:00 AM, usually full, has room · See it on Openings."]);
    expect(overviewMoreLine(2)).toBe("and 2 more on Openings");
  });
});

/*
 * The screens' own words (they were ui/words.ts, ui/mark-words.ts and the
 * Wrap-up sheet's until the round's integration pass): quoted here, so a
 * change to one is a change someone chose.
 */

describe("a chip that narrows a list to nothing", () => {
  it("names the chip, never the whole studio", () => {
    expect(nothingOpenedWithSentence("t-sam", names, SAM)).toBe("Nothing has opened up with you in the next 7 days. Anyone shows the rest of the studio.");
    expect(nothingOpenedWithSentence("t-pat", names, SAM)).toBe("Nothing has opened up with Pat in the next 7 days. Anyone shows the rest of the studio.");
  });

  it("says whose times have nothing to offer", () => {
    expect(noOffersWithSentence("t-sam", names, SAM)).toBe("You have no usual times with room to offer right now. Anyone shows the rest of the studio.");
    expect(noOffersWithSentence("t-pat", names, SAM)).toBe("Pat has no usual times with room to offer right now. Anyone shows the rest of the studio.");
    // An id nobody can name still starts a sentence.
    expect(noOffersWithSentence("t-gone", names, SAM)).toBe("A trainer has no usual times with room to offer right now. Anyone shows the rest of the studio.");
  });
});

describe("the marks, unread", () => {
  it("offers nothing for good, and says why", () => {
    expect(MARKS_UNKNOWN_OFFERS).toBe("Can't tell just now whether anyone has marked a time Always full, so no time is offered for good yet.");
  });
});

describe("the Wrap-up's Times with room", () => {
  it("hedges an empty next 7 days as NO_OFFERS does, and points a narrowed one to Anyone", () => {
    expect(NO_TIMES_NEXT_7).toBe("No times with room in the next 7 days. The front desk can see every opening in Mindbody.");
    expect(YOU_NO_TIMES_NEXT_7).toBe("You have no times with room in the next 7 days. Anyone shows the rest of the studio.");
  });

  it("says 'Checking the coming weeks…' in one place: an offer's sentence and Most weeks' line", () => {
    expect(CHECKING_COMING).toBe("Checking the coming weeks…");
  });
});

/** A time that reads `word`: markChangeLine reads only the word (and the key it names). */
const timeReading = (word: UsualWord) => ({ key: "1-0800", weekday: 1, row: 480, word }) as unknown as UsualTime;
const WORDS: UsualWord[] = ["always-full", "usually-full", "usually-room", "mixed", "booked", "rotation", "not-enough", "blank"];

describe("Mark this time's words", () => {
  it("names a mark's two words as the grid does", () => {
    expect(MARK_WORD).toEqual({ full: "Always full", room: "Usually has room" });
  });

  it("says a mark never replaces the numbers", () => {
    expect(MARK_INTRO).toContain("never replaces them");
  });

  it("says who sees the note, and how much is left", () => {
    expect(markNoteHint("Westlake", 12)).toBe("Everyone at Westlake sees it, with your name. 12 of 200.");
  });

  it("asks once before a mark goes, for everyone", () => {
    expect(removeQuestion("Westlake")).toBe("Remove this mark? It goes for everyone at Westlake.");
  });

  it("names a half-written mark in the leave question", () => {
    expect(leaveQuestion([markLabel("1-0800")])).toBe("You have unsaved changes to the mark on Monday 8:00 AM. Leave without saving?");
    expect(markLabel("6-1930")).toBe("the mark on Saturday 7:30 PM");
  });

  it("says a write saved on the iPad is on its way, rather than Saving… until the Wi-Fi returns", () => {
    expect(MARK_QUEUED).toEqual({
      save: "Saved on this iPad. It goes to the studio when the connection is back.",
      keep: "Kept on this iPad. It goes to the studio when the connection is back.",
      remove: "Removed on this iPad. It goes to the studio when the connection is back.",
    });
  });

  it("shows a note in quotation marks, as it was written", () => {
    expect(markNoteLine("Always taken")).toBe("\u201cAlways taken\u201d");
  });
});

describe("what the chosen word changes, for this time", () => {
  it("Always full: counts as full on Next 7 days and is never offered, whatever the time reads", () => {
    for (const word of WORDS) {
      expect(markChangeLine(timeReading(word), "full")).toBe("Always full counts as usually full on Next 7 days, and is never offered as a new regular time.");
    }
  });

  it("Usually has room on a time that reads Always full: never offered, whatever the mark", () => {
    const said = markChangeLine(timeReading("always-full"), "room");
    expect(said).toBe("This time reads Always full, so it isn't offered as a new regular time, whatever the mark.");
    expect(said).not.toContain("can be offered");
  });

  it("Usually has room on a time that reads Usually has room: the offer is the numbers' own, and names no mark", () => {
    expect(markChangeLine(timeReading("usually-room"), "room")).toBe(
      "Usually has room can be offered as a new regular time when someone's agreed week has them in then with no regular there, and the coming weeks don't show it taken.",
    );
  });

  it("Usually has room elsewhere: offered with the mark, and the numbers when there are any", () => {
    for (const word of ["usually-full", "mixed", "booked", "rotation"] as const) {
      expect(markChangeLine(timeReading(word), "room")).toBe(
        "Usually has room can be offered as a new regular time when someone's agreed week has them in then with no regular there, and the coming weeks don't show it taken, with the mark and the numbers beside it.",
      );
    }
    for (const word of ["not-enough", "blank"] as const) {
      expect(markChangeLine(timeReading(word), "room")).toMatch(/taken, with the mark beside it\.$/);
    }
  });

  it("never says a time can be offered when the core would not offer it", () => {
    const mark = { id: "1-0800", weekday: 1, time: "08:00", mark: "room" as const, note: "", by: { id: "uid", name: "" }, at: null };
    for (const word of WORDS) {
      expect(markChangeLine(timeReading(word), "room").includes("can be offered")).toBe(offerable(word, mark));
    }
  });
});
