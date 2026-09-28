/**
 * The Hub grid's geometry: blocks at their real length, the empty middle of
 * the day folded (never over a booking), overlaps side by side, and the words
 * on the axis and the bands.
 */
import { describe, expect, it } from "vitest";
import {
  BAND_PX,
  CARD_GAP_PX,
  EMPTY_DAY,
  PX_PER_MIN,
  bandWords,
  busyStretches,
  clockWords,
  dayExtent,
  foldableGaps,
  layoutDay,
  placeColumn,
  rangeWords,
  yOf,
  type Span,
} from "./grid-model";

const t = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const span = (from: string, to: string): Span => ({ from: t(from), to: t(to) });

describe("the day's extent", () => {
  it("runs from the first booking's hour to the last booking's end", () => {
    expect(dayExtent([span("07:30", "08:00"), span("16:00", "16:30")])).toEqual({ from: t("07:00"), to: t("16:30"), empty: false });
  });

  it("draws the studio's usual hours, empty, when nothing is booked", () => {
    expect(dayExtent([])).toEqual({ ...EMPTY_DAY, empty: true });
    expect(layoutDay([]).empty).toBe(true);
  });
});

describe("folding the empty middle of the day", () => {
  const day = [span("07:30", "08:00"), span("08:00", "08:30"), span("12:00", "12:45"), span("15:00", "15:30")];

  it("joins touching and overlapping blocks into busy stretches", () => {
    expect(busyStretches(day)).toEqual([span("07:30", "08:30"), span("12:00", "12:45"), span("15:00", "15:30")]);
  });

  it("folds a gap of an hour or more with nothing booked anywhere, trimmed to the half hour", () => {
    // 12:45 rounds up to 1:00, so the second gap is 1:00 to 3:00.
    expect(foldableGaps(day)).toEqual([span("08:30", "12:00"), span("13:00", "15:00")]);
  });

  it("never folds a half-hour gap", () => {
    expect(foldableGaps([span("09:00", "09:30"), span("10:00", "10:30")])).toEqual([]);
  });

  it("lays the folds out as bands, and a band the trainer opened stays open", () => {
    const folded = layoutDay(day);
    expect(folded.segments.map((s) => [s.from, s.to, s.folded])).toEqual([
      [t("07:00"), t("08:30"), false],
      [t("08:30"), t("12:00"), true],
      [t("12:00"), t("13:00"), false],
      [t("13:00"), t("15:00"), true],
      [t("15:00"), t("15:30"), false],
    ]);
    expect(folded.height).toBeCloseTo((90 + 60 + 30) * PX_PER_MIN + 2 * BAND_PX);
    const opened = layoutDay(day, new Set([t("13:00")]));
    expect(opened.segments.filter((s) => s.folded).map((s) => s.from)).toEqual([t("08:30")]);
    expect(opened.height).toBeCloseTo((90 + 60 + 120 + 30) * PX_PER_MIN + BAND_PX);
  });

  it("starts a booking that begins where a band ends below the band, never inside it", () => {
    const layout = layoutDay([span("12:30", "13:00"), span("14:00", "14:30")]);
    const band = layout.segments.find((s) => s.folded)!;
    expect(band).toMatchObject({ from: t("13:00"), to: t("14:00") });
    expect(yOf(layout, t("14:00"))).toBe(band.y + BAND_PX);
    expect(yOf(layout, t("13:00"))).toBe(band.y);
  });

  it("puts a minute inside a band at the band's middle, and a minute off the day nowhere", () => {
    const layout = layoutDay(day);
    const band = layout.segments[1];
    expect(yOf(layout, t("10:00"))).toBe(band.y + BAND_PX / 2);
    expect(yOf(layout, t("07:00"))).toBe(0);
    expect(yOf(layout, t("08:00"))).toBeCloseTo(60 * PX_PER_MIN);
    expect(yOf(layout, t("06:00"))).toBeNull();
    expect(yOf(layout, t("16:00"))).toBeNull();
  });

  it("marks the lines on a band's edges, whose labels the band's own words replace", () => {
    const layout = layoutDay([span("12:30", "13:00"), span("14:00", "14:30")]);
    expect(layout.ticks.filter((x) => x.edge).map((x) => x.min)).toEqual([t("13:00"), t("14:00")]);
  });

  it("draws half-hour lines only where the day is open, the hours marked", () => {
    const layout = layoutDay([span("09:00", "10:00")]);
    expect(layout.ticks.map((x) => [x.min, x.hour])).toEqual([
      [t("09:00"), true],
      [t("09:30"), false],
      [t("10:00"), true],
    ]);
  });
});

describe("a column's blocks", () => {
  const layout = layoutDay([span("09:00", "12:00")]);

  it("sit at their real length: a 30-minute session is 64px, a 45-minute consult 97px", () => {
    const placed = placeColumn(
      [
        { item: "session", span: span("09:00", "09:30") },
        { item: "consult", span: span("10:00", "10:45") },
      ],
      layout,
    );
    expect(placed[0]).toMatchObject({ item: "session", lane: 0, lanes: 1 });
    expect(placed[0].height).toBeCloseTo(30 * PX_PER_MIN - CARD_GAP_PX);
    expect(placed[0].height).toBeCloseTo(64);
    expect(placed[1].height).toBeCloseTo(45 * PX_PER_MIN - CARD_GAP_PX);
    expect(placed[1].top).toBeCloseTo(60 * PX_PER_MIN + CARD_GAP_PX / 2);
  });

  it("share the column side by side where they overlap, and only there", () => {
    const placed = placeColumn(
      [
        { item: "consult", span: span("10:00", "10:45") },
        { item: "session", span: span("10:30", "11:00") },
        { item: "later", span: span("11:00", "11:30") },
      ],
      layout,
    );
    const by = Object.fromEntries(placed.map((p) => [p.item, p]));
    expect([by.consult.lane, by.consult.lanes]).toEqual([0, 2]);
    expect([by.session.lane, by.session.lanes]).toEqual([1, 2]);
    expect([by.later.lane, by.later.lanes]).toEqual([0, 1]);
  });
});

describe("words", () => {
  it("says the axis's times", () => {
    expect(clockWords(t("09:00"))).toBe("9 AM");
    expect(clockWords(t("12:00"))).toBe("12 PM");
    expect(clockWords(t("13:30"))).toBe("1:30 PM");
    expect(clockWords(t("00:00"))).toBe("12 AM");
  });

  it("says a band's stretch with one AM or PM where both ends share it", () => {
    expect(bandWords(span("13:00", "15:00"))).toBe("No sessions 1:00 – 3:00 PM");
    expect(bandWords(span("11:00", "13:00"))).toBe("No sessions 11:00 AM – 1:00 PM");
    expect(bandWords(span("12:30", "14:00"))).toBe("No sessions 12:30 – 2:00 PM");
  });

  it("says any stretch of the day the same way (your column's head, hub cherry round)", () => {
    expect(rangeWords(span("06:00", "12:00"))).toBe("6:00 AM – 12:00 PM");
    expect(rangeWords(span("09:00", "10:00"))).toBe("9:00 – 10:00 AM");
    expect(rangeWords(span("15:00", "18:30"))).toBe("3:00 – 6:30 PM");
  });
});
