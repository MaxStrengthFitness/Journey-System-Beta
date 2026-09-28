/**
 * What a Hub card shows: the triangle's own slot, at most two glyphs in the
 * Key's order, "+N" for the rest, and only sayable words beside a glyph.
 */
import { describe, expect, it } from "vitest";
import type { Moment } from "../hub-opportunities/moments-today";
import { CARD_MAX_GLYPHS, cardMarks, sayableWord } from "./card-marks";

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
