import { describe, expect, it } from "vitest";
import type { DialValue, PreSessionCheckIn, WorkoutSession } from "../../../types";
import { READINESS_SCALES, RECOVERY_ASKED_FROM } from "../../rating/scales";
import { pronounsOf } from "../kit/pronouns";
import {
  ARRIVE_ORDER,
  SESSION_REGION_TO_FIGURE,
  arriveDetail,
  arriveSentence,
  arriveSummary,
  arrivalsOf,
  originOf,
  pageReach,
  readArrivals,
  regionTaps,
  type ArriveKey,
  type ArriveSummary,
} from "./arrivals";
import { SPOTS } from "./figure-map";
import { BODY_REGIONS } from "../../../data/body-regions";

const NOW = new Date(2027, 2, 24, 12);
const her = pronounsOf({ gender: "Female" });
const him = pronounsOf({ gender: "Male" });
const WINDOW = { from: "2026-09-23", to: "2027-03-24" };

let seq = 0;
/**
 * A completed session run in Journey: it carries the tablet's start time, as
 * every session the live flow writes does (mid-morning Eastern, same day).
 * `over` can take it away — an imported one has none.
 */
function session(date: string, over: Partial<WorkoutSession> = {}, check?: Partial<PreSessionCheckIn>): WorkoutSession {
  seq += 1;
  return {
    id: `s${seq}`,
    clientId: "c1",
    date,
    status: "Completed",
    ...(/^\d{4}-\d{2}-\d{2}$/.test(date) ? { clientStartTime: `${date}T15:00:00.000Z` } : {}),
    ...(check ? { preSessionCheckIn: check as PreSessionCheckIn } : {}),
    ...over,
  } as WorkoutSession;
}

/** Brought in by the chart importer with a trainer it matched: no start time, no legacy marker. */
const charted = (date: string, over: Partial<WorkoutSession> = {}) =>
  session(date, { clientStartTime: undefined, trainerId: "t-ann", trainerInitials: "AN", ...over });
/** Brought in from FileMaker. */
const fileMaker = (date: string) => session(date, { clientStartTime: undefined, legacy_filemaker_id: "fm-1" });
/** Log past session: the 12:00 UTC placeholder start. */
const loggedLater = (date: string) => session(date, { clientStartTime: undefined, startTime: `${date}T12:00:00.000Z` });

const recovery = (v: DialValue): Partial<PreSessionCheckIn> => ({ readiness: { recovery: v } } as Partial<PreSessionCheckIn>);

const summary = (over: Partial<ArriveSummary>): ArriveSummary => ({
  key: "recovery",
  asked: 0,
  sessions: 0,
  below: 0,
  sinceDay: null,
  imported: 0,
  logged: 0,
  before: 0,
  ...over,
});

describe("reading a session", () => {
  it("reads a legacy session's sleepQuality 'poor' as a bit short (−1)", () => {
    const [a] = arrivalsOf([session("2027-03-01", {}, { sleepQuality: "poor" })], WINDOW);
    expect(a.readiness.sleep).toBe(-1);
  });

  it("keeps an untouched dial null — not asked, never 0 — and does not count it as asked", () => {
    const list = arrivalsOf([session("2027-03-01", {}, { readiness: { sleep: 1 } } as Partial<PreSessionCheckIn>)], WINDOW);
    expect(list[0].readiness.recovery).toBeNull();
    expect(list[0].readiness.energy).toBeNull();
    expect(list[0].dose).toBeNull();
    const s = arriveSummary({ arrivals: list, sinceDay: null }, "recovery");
    expect(s).toMatchObject({ asked: 0, sessions: 1, below: 0 });
  });

  it("reads the dose from the legacy clientFeel 'Wiped Out' as −2", () => {
    const [a] = arrivalsOf([session("2027-03-01", { clientFeel: "Wiped Out" })], WINDOW);
    expect(a.dose).toBe(-2);
  });

  it("drops an in-progress session and a session whose day can't be told", () => {
    const list = arrivalsOf(
      [
        session("2027-03-01", { status: "In-Progress" }, recovery(0)),
        session("not a date", {}, recovery(0)),
        session("2027-03-02", {}, recovery(0)),
      ],
      WINDOW,
    );
    expect(list.map((a) => a.day)).toEqual(["2027-03-02"]);
  });

  it("parses an M/D/YYYY date, and leaves out a session outside the window", () => {
    const list = arrivalsOf(
      [session("3/5/2027", {}, recovery(-1)), session("2026-09-22", {}, recovery(-1)), session("2026-09-23", {}, recovery(1))],
      WINDOW,
    );
    expect(list.map((a) => a.day)).toEqual(["2026-09-23", "2027-03-05"]);
  });

  it("puts the arrivals oldest first", () => {
    const list = arrivalsOf([session("2027-03-10"), session("2027-01-05"), session("2027-02-01")], WINDOW);
    expect(list.map((a) => a.day)).toEqual(["2027-01-05", "2027-02-01", "2027-03-10"]);
  });

  it("maps the briefing's body map onto the figure's regions, once per session", () => {
    const [a] = arrivalsOf(
      [
        session("2027-03-01", {}, {
          bodyStates: [
            { region: "Knees", state: "stiff", dial: -1 },
            { region: "Knees", state: "prime" },
            { region: "Lower Back", state: "stiff" },
          ],
        }),
      ],
      WINDOW,
    );
    expect(a.regions).toEqual([
      { region: "knee", dial: -1 },
      { region: "lower_back", dial: -1 },
    ]);
  });

  it("maps every region on the briefing's body map to a region the figure has", () => {
    for (const r of BODY_REGIONS) {
      const region = SESSION_REGION_TO_FIGURE[r];
      expect(region, r).toBeTruthy();
      expect(SPOTS[region], r).toBeTruthy();
    }
  });
});

describe("how far the journal's page reaches", () => {
  it("is all of them when fewer than the page came back", () => {
    expect(pageReach([{ date: "2027-01-01" }], 40)).toEqual({ kind: "all" });
  });

  it("is since the smallest date on a full page", () => {
    const page = Array.from({ length: 3 }, (_, i) => ({ date: `2027-03-0${i + 1}` }));
    expect(pageReach(page, 3)).toEqual({ kind: "since", day: "2027-03-01" });
  });

  it("covers every Journey day when the page ends below the year 2000 (an old '1/5/2019' date)", () => {
    expect(pageReach([{ date: "2027-03-01" }, { date: "1/5/2019" }], 2)).toEqual({ kind: "all" });
  });

  it("cannot say which recent sessions it holds when old dates sort above every Journey day", () => {
    expect(pageReach([{ date: "9/1/2024" }, { date: "8/1/2024" }], 2)).toEqual({ kind: "unknown" });
  });

  it("says since when on a full page that stops short of the window", () => {
    const sessions = [session("2027-03-10", {}, recovery(0)), session("2027-01-05", {}, recovery(0))];
    const read = readArrivals({ sessions, state: "ready", window: WINDOW, limit: 2 });
    expect(read).toMatchObject({ state: "ready", sinceDay: "2027-01-05" });
    expect(read.arrivals).toHaveLength(2);
  });

  it("is unknown, never empty, while the sessions load or after they failed", () => {
    expect(readArrivals({ sessions: [], state: "loading", window: WINDOW, limit: 40 })).toMatchObject({ state: "loading" });
    expect(readArrivals({ sessions: [], state: "failed", window: WINDOW, limit: 40 })).toMatchObject({ state: "failed" });
    expect(readArrivals({ sessions: [], state: undefined, window: WINDOW, limit: 40 })).toMatchObject({ state: "loading" });
    expect(
      readArrivals({ sessions: [session("9/1/2024"), session("8/1/2024")], state: "ready", window: WINDOW, limit: 2 }),
    ).toMatchObject({ state: "unordered", arrivals: [] });
  });
});

describe("the sentences", () => {
  const ask = READINESS_SCALES.recovery.ask;

  it("says not asked yet — never as usual — when Journey holds no session in the window", () => {
    const s = arriveSentence(summary({ sessions: 0 }), her, NOW);
    expect(s).toBe("Not asked yet: Journey holds no session of hers in these six months.");
    expect(s).not.toContain("As usual");
  });

  it("names the briefing's question when it was asked at none of her sessions", () => {
    expect(arriveSentence(summary({ sessions: 12 }), her, NOW)).toBe(
      `The briefing asks “${ask}” at the door. It wasn't asked at any of her last 12 sessions.`,
    );
    expect(arriveSentence(summary({ key: "sleep", sessions: 12 }), her, NOW)).toBe(
      "“How'd you sleep?” wasn't asked at any of her last 12 sessions.",
    );
  });

  it("says there is not enough for a line below three answers (the rule of three)", () => {
    expect(arriveSentence(summary({ asked: 2, sessions: 12, below: 2 }), her, NOW)).toBe(
      `“${ask}” asked at 2 of her last 12 sessions, not enough for a line yet (needs 3).`,
    );
  });

  it("says how often she arrived below her usual, from three answers on", () => {
    expect(arriveSentence(summary({ asked: 3, sessions: 12, below: 3 }), her, NOW)).toBe(
      `“${ask}” asked at 3 of her last 12 sessions. “Still feeling it” or “Still wrecked” at 3 of them.`,
    );
    expect(arriveSentence(summary({ asked: 12, sessions: 24, below: 0 }), him, NOW)).toBe(
      `“${ask}” asked at 12 of his last 24 sessions. At or above “As usual” every time.`,
    );
  });

  it("says since when when the page stops short of six months", () => {
    expect(arriveSentence(summary({ asked: 12, sessions: 40, below: 3, sinceDay: "2026-12-01" }), her, NOW)).toBe(
      `“${ask}” asked at 12 of her last 40 sessions (since Dec 1, 2026). “Still feeling it” or “Still wrecked” at 3 of them.`,
    );
  });

  it("words the dose as the trainer's judgement, and never as 'better'", () => {
    expect(arriveSentence(summary({ key: "dose", asked: 5, sessions: 6, below: 2 }), her, NOW)).toBe(
      "How it landed, judged by the trainer after 5 of her last 6 sessions. “Drained” or “Wiped out” at 2 of them.",
    );
    expect(arriveSentence(summary({ key: "dose", asked: 5, sessions: 6, below: 0 }), her, NOW)).toBe(
      "How it landed, judged by the trainer after 5 of her last 6 sessions. Never “Drained” or “Wiped out”.",
    );
    expect(arriveSentence(summary({ key: "dose", sessions: 6 }), her, NOW)).toBe(
      "How it landed wasn't judged after any of her last 6 sessions.",
    );
    expect(arriveSentence(summary({ key: "dose", sessions: 0 }), her, NOW)).toBe(
      "Not judged yet: Journey holds no session of hers in these six months.",
    );
  });

  it("says one session plainly", () => {
    expect(arriveSentence(summary({ asked: 1, sessions: 1 }), her, NOW)).toBe(
      `“${ask}” asked at her one session in these six months, not enough for a line yet (needs 3).`,
    );
    expect(arriveSentence(summary({ key: "energy", sessions: 1 }), her, NOW)).toBe(
      "“How are you feeling?” wasn't asked at her one session in these six months.",
    );
  });

  it("drops the question for a lane whose title already is the question", () => {
    expect(arriveDetail(summary({ key: "sleep", asked: 5, sessions: 24, below: 2 }), her, NOW)).toBe(
      "Asked at 5 of her last 24 sessions. “A bit short” or “Rough night” at 2 of them.",
    );
    expect(arriveDetail(summary({ key: "stress", sessions: 24 }), her, NOW)).toBe("Not asked at any of her last 24 sessions.");
    expect(arriveDetail(summary({ key: "dose", asked: 4, sessions: 6, below: 0 }), her, NOW)).toBe(
      "Judged at 4 of her last 6 sessions. Never “Drained” or “Wiped out”.",
    );
    expect(arriveDetail(summary({ key: "dose", sessions: 1 }), her, NOW)).toBe(
      "Not judged at her one session in these six months.",
    );
    expect(arriveDetail(summary({ sessions: 0 }), her, NOW)).toBe(
      "Not asked yet: Journey holds no session of hers in these six months.",
    );
  });

  it("never says 'next time' or suggests anything — the app describes", () => {
    const keys: ArriveKey[] = [...ARRIVE_ORDER];
    const shapes: Array<Partial<ArriveSummary>> = [
      { sessions: 0 },
      { sessions: 12 },
      { asked: 2, sessions: 12, below: 1 },
      { asked: 3, sessions: 12, below: 0 },
      { asked: 12, sessions: 40, below: 3, sinceDay: "2026-12-01" },
      { asked: 1, sessions: 1 },
    ];
    for (const key of keys) {
      for (const shape of shapes) {
        for (const s of [arriveSentence(summary({ ...shape, key }), her, NOW), arriveDetail(summary({ ...shape, key }), her, NOW)]) {
          expect(s).not.toMatch(/next time|lighter|room to add|increase|progress/i);
          expect(s).not.toMatch(/\d+%|\/10/);
        }
      }
    }
  });
});

describe("the body map at the door", () => {
  it("counts the sessions a region was tapped at, and keeps the newest word", () => {
    const read = readArrivals({
      sessions: [
        session("2027-03-10", {}, { bodyStates: [{ region: "Knees", state: "stiff", dial: -2 }] }),
        session("2027-02-10", {}, { bodyStates: [{ region: "Knees", state: "prime", dial: 1 }] }),
        session("2027-01-10", {}, recovery(0)),
      ],
      state: "ready",
      window: WINDOW,
      limit: 40,
    });
    const taps = regionTaps(read);
    expect(taps.get("knee")).toEqual({ k: 2, n: 3, runOnly: false, latest: { word: "Pain", day: "2027-03-10" } });
    expect(taps.has("lower_back")).toBe(false);
  });

  it("counts only the sessions whose door could have been recorded, and says so", () => {
    const read = readArrivals({
      sessions: [
        session("2027-03-10", {}, { bodyStates: [{ region: "Knees", state: "stiff", dial: -1 }] }),
        session("2027-02-10", {}, recovery(0)),
        charted("2027-01-10"),
        loggedLater("2027-01-03"),
      ],
      state: "ready",
      window: WINDOW,
      limit: 40,
    });
    expect(regionTaps(read).get("knee")).toEqual({ k: 1, n: 2, runOnly: true, latest: { word: "Stiff", day: "2027-03-10" } });
  });
});

/* ---- only where it could have been asked -------------------------------- */

describe("sessions where nothing could be recorded", () => {
  const ask = READINESS_SCALES.recovery.ask;
  const read = (sessions: WorkoutSession[], window = WINDOW) => readArrivals({ sessions, state: "ready", window, limit: 40 });

  it("tells a session run in Journey from an imported one and one logged later", () => {
    expect(originOf(session("2027-03-01"))).toBe("run");
    const timestamp = { seconds: 1_803_000_000, nanoseconds: 0 } as unknown as WorkoutSession["startTime"];
    expect(originOf(session("2027-03-01", { clientStartTime: undefined, startTime: timestamp }))).toBe("run");
    expect(originOf(fileMaker("2027-03-01"))).toBe("imported");
    expect(originOf(session("2027-03-01", { trainerInitials: "Chart" }))).toBe("imported");
    expect(originOf(session("2027-03-01", { trainerId: "legacy-trainer" }))).toBe("imported");
    // The chart importer writes no start time even when it matched the trainer.
    expect(originOf(charted("2027-03-01"))).toBe("imported");
    expect(originOf(loggedLater("2027-03-01"))).toBe("logged");
  });

  it("never says imported chart sessions weren't asked (the migration rule)", () => {
    const s = arriveSummary(read([charted("2027-03-10"), charted("2027-02-10"), fileMaker("2027-01-10")]), "recovery");
    expect(s).toMatchObject({ asked: 0, sessions: 0, imported: 3 });
    const text = arriveSentence(s, her, NOW);
    expect(text).toBe(
      `The briefing asks “${ask}” at the door. Her 3 sessions in these six months were imported, and imports don't record the door.`,
    );
    expect(text).not.toMatch(/wasn't asked|not asked/i);
    expect(arriveSentence(arriveSummary(read([charted("2027-03-10")]), "dose"), her, NOW)).toBe(
      "The trainer judges how it landed after each session. Her one session in these six months was imported, and imports don't record how it landed.",
    );
  });

  it("never says sessions from Log past session weren't asked or judged", () => {
    const r = read([loggedLater("2027-03-10"), loggedLater("2027-02-10")]);
    expect(arriveSentence(arriveSummary(r, "recovery"), her, NOW)).toBe(
      `The briefing asks “${ask}” at the door. Her 2 sessions in these six months were logged later, and Log past session doesn't record the door.`,
    );
    expect(arriveSentence(arriveSummary(r, "dose"), her, NOW)).not.toMatch(/wasn't judged|not judged/i);
  });

  it("names the sessions left out beside the ones counted", () => {
    const r = read([
      session("2027-03-20", {}, recovery(-1)),
      session("2027-03-13", {}, recovery(0)),
      session("2027-03-06"),
      charted("2027-01-10"),
      charted("2027-01-03"),
      loggedLater("2027-02-01"),
    ]);
    expect(arriveSentence(arriveSummary(r, "recovery"), her, NOW)).toBe(
      `“${ask}” asked at 2 of her last 3 sessions run in Journey, not enough for a line yet (needs 3). 2 more were imported and 1 logged later; neither records the door.`,
    );
    expect(arriveDetail(arriveSummary(read([session("2027-03-20"), charted("2027-01-10")]), "stress"), her, NOW)).toBe(
      "Not asked at her one session run in Journey in these six months. 1 more was imported, and imports don't record the door.",
    );
  });

  describe("before the briefing asked about recovery", () => {
    // Oct 20 2026: the six months reach back past the day the question was added.
    const NOW2 = new Date(2026, 9, 20, 12);
    const W2 = { from: "2026-04-21", to: "2026-10-20" };
    const oldBriefing = (date: string) => session(date, {}, { sleepQuality: "poor" });

    it("is the day the reporting round shipped", () => {
      expect(RECOVERY_ASKED_FROM).toBe("2026-09-16");
    });

    it("never says the question wasn't asked at sessions before it existed", () => {
      // Thirty old-briefing sessions, May to early September 2026.
      const days = Array.from({ length: 30 }, (_, i) => `2026-0${5 + Math.floor(i / 8)}-${String(1 + (i % 8) * 3).padStart(2, "0")}`);
      const r = read(days.map(oldBriefing), W2);
      const s = arriveSummary(r, "recovery");
      expect(s).toMatchObject({ asked: 0, sessions: 0, before: 30 });
      const text = arriveSentence(s, her, NOW2);
      expect(text).toBe(
        `The briefing asks “${ask}” at the door. Her 30 sessions in these six months came before the question was added (Sep 16).`,
      );
      expect(text).not.toMatch(/wasn't asked/);
      // Sleep has its legacy field: asked at all thirty.
      expect(arriveSummary(r, "sleep")).toMatchObject({ asked: 30, sessions: 30, before: 0 });
    });

    it("counts from the day the question was added, and a recovery answer always counts", () => {
      const r = read(
        [
          session("2026-10-14", {}, recovery(-1)),
          session("2026-10-07"),
          session("2026-09-30", {}, recovery(0)),
          oldBriefing("2026-09-10"),
          oldBriefing("2026-09-03"),
          charted("2026-06-01"),
        ],
        W2,
      );
      const s = arriveSummary(r, "recovery");
      expect(s).toMatchObject({ asked: 2, sessions: 3, before: 2, imported: 1 });
      expect(arriveSentence(s, her, NOW2)).toBe(
        `“${ask}” asked at 2 of her 3 sessions run in Journey since the question was added (Sep 16), not enough for a line yet (needs 3). 1 more was imported, and imports don't record the door.`,
      );
      // A session before the day that DID answer it is counted, not left out.
      expect(arriveSummary(read([session("2026-09-15", {}, recovery(1))], W2), "recovery")).toMatchObject({
        asked: 1,
        sessions: 1,
        before: 0,
      });
    });

    it("says every reason when no session could record it", () => {
      const r = read([oldBriefing("2026-09-10"), oldBriefing("2026-09-03"), charted("2026-06-01")], W2);
      expect(arriveSentence(arriveSummary(r, "recovery"), her, NOW2)).toBe(
        `The briefing asks “${ask}” at the door. None of her 3 sessions in these six months could record it: 2 came before the question was added (Sep 16) and 1 was imported.`,
      );
    });
  });
});
