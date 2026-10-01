/**
 * The view chips and the remembered sort.
 */
import { describe, expect, it } from "vitest";
import { buildDirectoryRow } from "./row";
import { DEFAULT_SORT, SORT_STORE_PREFIX, inView, inactiveHow, isMine, readSavedSort, saveSort, viewCounts } from "./views";
import { TODAY, eastern, makeBooking, makeClient, makeContext } from "./fixtures";

const ME = ["t-me", "uid-me"];

describe("Inactive (Oct 1 2026)", () => {
  const ctx = makeContext({ schedules: [makeBooking({ clientId: "back", start: eastern("2026-09-29", "09:00"), trainerId: "t-me" })] });
  const rowOf = (id: string, renewal: Record<string, unknown> | null, extra: Record<string, unknown> = {}) =>
    buildDirectoryRow(makeClient({ id, ...(renewal ? { lastSessionDate: renewal.lastVisitDate as string, renewal: renewal as never } : {}), ...extra }), ctx);
  const mark = { day: "2026-09-20" };

  it("says how a row is inactive: a leader's mark, past the line, or Mindbody's own", () => {
    expect(inactiveHow(rowOf("marked", { lastVisitDate: "2026-09-10" }), mark, TODAY, 90)).toBe("manual");
    expect(inactiveHow(rowOf("gone", { lastVisitDate: "2026-06-01", situation: "on-track" }), null, TODAY, 90)).toBe("automatic");
    expect(inactiveHow(rowOf("mb", null, { isActive: false }), null, TODAY, 90)).toBe("mindbody");
  });

  it("never calls her inactive when she is booked, Away, short of the line, or can't be judged", () => {
    expect(inactiveHow(rowOf("back", { lastVisitDate: "2026-06-01" }), mark, TODAY, 90)).toBeNull();
    expect(inactiveHow(rowOf("away", { lastVisitDate: "2026-06-01", situation: "away" }), null, TODAY, 90)).toBeNull();
    expect(inactiveHow(rowOf("lapsed", { lastVisitDate: "2026-08-01" }), null, TODAY, 90)).toBeNull();
    expect(inactiveHow(rowOf("norecord", null, { lastSessionDate: "2026-05-01" }), null, TODAY, 90)).toBeNull();
    // She visited after the mark: it no longer holds.
    expect(inactiveHow(rowOf("visited", { lastVisitDate: "2026-09-25" }), mark, TODAY, 90)).toBeNull();
  });
});

describe("Mine", () => {
  it("counts coached, logged, top trainer, primary trainer, booked with me and Kaizen", () => {
    const ctx = makeContext({
      schedules: [makeBooking({ clientId: "booked", start: eastern("2026-09-29", "09:00"), trainerId: "t-me" })],
      kaizen: [{ clientId: "kz", clientName: "x", reason: "Form", addedAt: null, addedByTrainerId: "t-me" }],
    });
    const mine = [
      makeClient({ id: "coached", renewal: { coachIds: ["t-me"] } as never }),
      makeClient({ id: "logged", trainerTally: { "uid-me": 3 } }),
      makeClient({ id: "top", topTrainerId: "t-me" }),
      makeClient({ id: "primary", renewal: { coachIds: [], primaryTrainerId: "t-me" } as never }),
      makeClient({ id: "booked" }),
      makeClient({ id: "kz" }),
    ].map((c) => buildDirectoryRow(c, ctx));
    for (const row of mine) expect(isMine(row, ME), row.id).toBe(true);
    const other = buildDirectoryRow(makeClient({ id: "other", trainerTally: { "t-mike": 9 } }), ctx);
    expect(isMine(other, ME)).toBe(false);
    expect(viewCounts([...mine, other], ME)).toEqual({ all: 7, mine: 6, kaizen: 1, today: 0 });
  });

  it("In today is anyone with a booking today", () => {
    const ctx = makeContext({ schedules: [makeBooking({ clientId: "a", start: eastern(TODAY, "16:00") })] });
    expect(inView(buildDirectoryRow(makeClient({ id: "a" }), ctx), "today", ME)).toBe(true);
    expect(inView(buildDirectoryRow(makeClient({ id: "b" }), ctx), "today", ME)).toBe(false);
  });
});

describe("the remembered sort", () => {
  function memoryStorage() {
    const data = new Map<string, string>();
    return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  }

  it("is kept per trainer", () => {
    const s = memoryStorage();
    saveSort(s, "t-me", { key: "age", dir: "asc" });
    expect(readSavedSort(s, "t-me")).toEqual({ key: "age", dir: "asc" });
    expect(readSavedSort(s, "t-mike")).toEqual(DEFAULT_SORT);
  });

  it("falls back to the default on anything odd, and never throws", () => {
    const s = memoryStorage();
    s.data.set(`${SORT_STORE_PREFIX}t-me`, "{not json");
    expect(readSavedSort(s, "t-me")).toEqual(DEFAULT_SORT);
    s.data.set(`${SORT_STORE_PREFIX}t-me`, JSON.stringify({ key: "shoeSize", dir: "asc" }));
    expect(readSavedSort(s, "t-me")).toEqual(DEFAULT_SORT);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSavedSort(throwing, "t-me")).toEqual(DEFAULT_SORT);
    expect(() => saveSort(throwing, "t-me", { key: "age", dir: "asc" })).not.toThrow();
    expect(readSavedSort(null, "t-me")).toEqual(DEFAULT_SORT);
  });

  it("does not remember In today's clock sort as the trainer's choice", () => {
    const s = memoryStorage();
    saveSort(s, "t-me", { key: "time", dir: "asc" });
    expect(s.data.size).toBe(0);
  });
});
