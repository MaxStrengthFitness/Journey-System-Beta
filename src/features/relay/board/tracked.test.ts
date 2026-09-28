import { afterEach, describe, expect, it } from "vitest";
import { forgetPersonalMemory } from "../../sign-out/memory";
import { publishTrackedProgress, readTracked, resetTracked, trackItem, trackedChipWords, untrack } from "./tracked";

afterEach(() => resetTracked());

const deep = { id: "group:deep:any", title: "Deep clean", done: 0, total: 3 };

describe("tracking the job this trainer took", () => {
  it("remembers one job per studio and studio day", () => {
    trackItem("s1", "2026-09-28", deep);
    expect(readTracked("s1", "2026-09-28")).toEqual(deep);
    // Another studio, and tomorrow, have taken nothing.
    expect(readTracked("s2", "2026-09-28")).toBeNull();
    expect(readTracked("s1", "2026-09-29")).toBeNull();
    // Taking another replaces it: the header tracks one job.
    trackItem("s1", "2026-09-28", { id: "ask:a1", title: "Cover at 4:20", done: null, total: null });
    expect(readTracked("s1", "2026-09-28")?.id).toBe("ask:a1");
  });

  it("stops tracking only the job named, so finishing another card never clears it", () => {
    trackItem("s1", "2026-09-28", deep);
    untrack("s1", "2026-09-28", "ask:other");
    expect(readTracked("s1", "2026-09-28")).not.toBeNull();
    untrack("s1", "2026-09-28", deep.id);
    expect(readTracked("s1", "2026-09-28")).toBeNull();
  });

  it("follows the Board's live count, and lets go when the job is no longer open", () => {
    trackItem("s1", "2026-09-28", deep);
    publishTrackedProgress("s1", "2026-09-28", deep.id, { title: "Deep clean", done: 2, total: 3 });
    expect(readTracked("s1", "2026-09-28")?.done).toBe(2);
    // News about a job that isn't the tracked one changes nothing.
    publishTrackedProgress("s1", "2026-09-28", "ask:other", null);
    expect(readTracked("s1", "2026-09-28")?.id).toBe(deep.id);
    publishTrackedProgress("s1", "2026-09-28", deep.id, null);
    expect(readTracked("s1", "2026-09-28")).toBeNull();
  });

  it("is forgotten at sign-out: the next trainer on the iPad has taken nothing", () => {
    trackItem("s1", "2026-09-28", deep);
    forgetPersonalMemory();
    expect(readTracked("s1", "2026-09-28")).toBeNull();
  });

  it("says what it is tracking in words, with the count only when there are parts", () => {
    expect(trackedChipWords(null)).toBe("Tracking: nothing yet");
    expect(trackedChipWords({ ...deep, done: 1 })).toBe("Tracking: Deep clean · 1 of 3");
    expect(trackedChipWords({ id: "ask:a1", title: "Cover Farmer Maggot at 4:20", done: null, total: null })).toBe(
      "Tracking: Cover Farmer Maggot at 4:20",
    );
    // One part is not a count worth saying.
    expect(trackedChipWords({ id: "row:r1", title: "Restock towels", done: 0, total: 1 })).toBe("Tracking: Restock towels");
  });
});
