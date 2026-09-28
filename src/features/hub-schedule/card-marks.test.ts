/**
 * What a Hub card shows: the triangle's own slot, at most two glyphs in the
 * Key's order, "+N" for the rest, and only sayable words beside a glyph.
 */
import { describe, expect, it } from "vitest";
import type { Moment } from "../hub-opportunities/moments-today";
import { CARD_MAX_GLYPHS, cardMarks, sayableWord, usualServiceOf } from "./card-marks";

const m = (over: Partial<Moment> & Pick<Moment, "kind" | "family">): Moment => ({ chip: over.kind, sentence: over.kind, ...over });

const critical = m({ kind: "critical", family: "read-first", chip: "Read first", words: "Critical: no overhead press" });
const waiver = m({ kind: "waiver", family: "watch", chip: "No waiver signed", words: "No waiver signed" });
const pulse = m({ kind: "pulse", family: "watch", chip: "Pulse flag", words: "Sleep & Recovery is Red" });
const back = m({ kind: "back", family: "welcome", chip: "Back after 5 wk" });
const milestone = m({ kind: "milestone", family: "celebrate", chip: "100th today" });
const decade = m({ kind: "birthday", family: "celebrate", chip: "Turns 80 Thu" });
const birthday = m({ kind: "birthday", family: "celebrate", chip: "Birthday Thu" });
const renew = m({ kind: "renew", family: "renew", chip: "Renewal talk" });

describe("the card's marks", () => {
  it("nothing to show is nothing", () => {
    expect(cardMarks([])).toEqual({ critical: null, glyphs: [], more: 0, moreLabel: null });
    expect(cardMarks(null)).toEqual({ critical: null, glyphs: [], more: 0, moreLabel: null });
  });

  it("gives Read first its own slot, with the note's words whole, and never spends a glyph on it", () => {
    const marks = cardMarks([critical, milestone]);
    expect(marks.critical).toBe("Critical: no overhead press");
    expect(marks.glyphs.map((g) => g.kind)).toEqual(["milestone"]);
  });

  it("shows at most two glyphs in the order it was given (the Key's), then +N with its words", () => {
    expect(CARD_MAX_GLYPHS).toBe(2);
    const marks = cardMarks([critical, waiver, pulse, back, milestone, renew]);
    expect(marks.glyphs.map((g) => g.kind)).toEqual(["waiver", "pulse"]);
    expect(marks.more).toBe(3);
    expect(marks.moreLabel).toBe("Back after 5 wk, 100th today, Renewal talk");
  });

  it("chooses by the Key's order, then puts a mark that can say a word first", () => {
    const early = m({ kind: "early-session", family: "welcome", chip: "First session" });
    const marks = cardMarks([waiver, early]);
    expect(marks.glyphs.map((g) => g.kind)).toEqual(["early-session", "waiver"]);
    expect(marks.glyphs[0].word).toBe("1st session");
    // The choosing is still the Key's: a third mark folds, whatever its word.
    expect(cardMarks([waiver, pulse, early]).glyphs.map((g) => g.kind)).toEqual(["waiver", "pulse"]);
  });

  it("labels a glyph with the mark's own words when it has them", () => {
    const marks = cardMarks([pulse]);
    expect(marks.glyphs[0]).toMatchObject({ label: "Sleep & Recovery is Red", word: null });
  });
});

describe("only sayable words beside a glyph (a client stands at the iPad)", () => {
  it("says a milestone, a decade birthday, an early session, a consult and a return", () => {
    expect(sayableWord(milestone)).toBe("100th");
    expect(sayableWord(decade)).toBe("turns 80");
    expect(sayableWord(m({ kind: "early-session", family: "welcome", chip: "First session" }))).toBe("1st session");
    expect(sayableWord(m({ kind: "early-session", family: "welcome", chip: "3rd session" }))).toBe("3rd session");
    expect(sayableWord(m({ kind: "consult", family: "welcome", chip: "Consultation" }))).toBe("Consult");
    expect(sayableWord(back)).toBe("back");
  });

  it("keeps the Pulse flag, the waiver, a renewal talk and a plain birthday to their glyph", () => {
    for (const x of [pulse, waiver, renew, birthday]) expect(sayableWord(x)).toBeNull();
  });
});

describe("your own column, in words (hub cherry round)", () => {
  const firstWith = m({ kind: "first-with-trainer", family: "welcome", chip: "First with Ioreth" });

  it("says 'first with you' in your column, and leaves it a glyph in anyone else's", () => {
    expect(sayableWord(firstWith, { yours: true })).toBe("first with you");
    expect(sayableWord(firstWith)).toBeNull();
    const marks = cardMarks([waiver, firstWith], undefined, { yours: true });
    // A mark that can say a word goes first, where the card has room for it.
    expect(marks.glyphs.map((g) => [g.kind, g.word])).toEqual([
      ["first-with-trainer", "first with you"],
      ["waiver", null],
    ]);
  });

  it("still never says a Pulse flag, a waiver, a renewal talk or a plain birthday out loud", () => {
    for (const x of [pulse, waiver, renew, birthday]) expect(sayableWord(x, { yours: true })).toBeNull();
    expect(sayableWord(milestone, { yours: true })).toBe("100th");
    expect(sayableWord(back, { yours: true })).toBe("back");
  });
});

describe("Get to know on the card (wave 2 hub): the ✎ alone, and the first to fold", () => {
  const ask = m({ kind: "ask-about", family: "get-to-know", chip: "Ask: the recital · Sat", sentence: "Ask about: …", words: "Something to ask about" });

  it("is a glyph alone, in anyone's column and in your own: FORD's words never on the grid", () => {
    expect(sayableWord(ask)).toBeNull();
    expect(sayableWord(ask, { yours: true })).toBeNull();
    expect(cardMarks([ask]).glyphs).toEqual([{ kind: "ask-about", family: "get-to-know", word: null, label: "Something to ask about" }]);
  });

  it("keeps the two-glyph rule: behind two others it is part of the +N, labelled without the detail", () => {
    const marks = cardMarks([waiver, milestone, ask]);
    expect(marks.glyphs.map((g) => g.kind)).toEqual(["milestone", "waiver"]);
    expect(marks.more).toBe(1);
    expect(marks.moreLabel).toBe("Something to ask about");
  });
});

describe("the day's usual service (AJ's Mindbody screenshots: it repeated on every block)", () => {
  const b = (serviceName: string, clientName = "Client") => ({ serviceName, clientName });

  it("is the name most of the day's bookings carry", () => {
    expect(usualServiceOf([b("1:1 Strength Training"), b("1:1 Strength Training"), b("New Client Consultation")])).toBe("1:1 Strength Training");
  });

  it("leaves Mindbody's Unavailable blocks out of the count", () => {
    expect(usualServiceOf([b("Staff time", "Unavailable"), b("Staff time", "Unavailable"), b("1:1 Strength Training"), b("1:1 Strength Training")])).toBe("1:1 Strength Training");
  });

  it("claims nothing from a single booking or an empty day", () => {
    expect(usualServiceOf([b("1:1 Strength Training")])).toBeNull();
    expect(usualServiceOf([])).toBeNull();
  });
});
