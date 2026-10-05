import { describe, expect, it } from "vitest";
import { LEG_PRESS_HISTORY, LEG_PRESS_JOURNAL } from "./fixtures";
import { parseSettingHistory } from "./setting-history";
import { COPY_WINDOW_MS, isSettingsCopy, rebuildCopyBody, withoutSettingsCopies } from "./settings-copy";

const rows = parseSettingHistory(LEG_PRESS_HISTORY, "avery");
const byId = (id: string) => LEG_PRESS_JOURNAL.find((e) => e.id === id)!;

describe("rebuilding the body saveSettings writes", () => {
  it("is the writer's own sentence, an empty dial as —", () => {
    expect(rebuildCopyBody(rows[0], "Leg Press")).toBe(
      "Leg Press — Seat — → 4, Back pad — → 3, Foot plate — → High. Initial setup",
    );
    expect(rebuildCopyBody(rows[1], "Leg Press")).toBe("Leg Press — Seat 4 → 5. Range of motion");
  });

  it("has nothing to rebuild for a starting-weight row", () => {
    expect(rebuildCopyBody(rows[2], "Leg Press")).toBeNull();
  });
});

describe("isSettingsCopy", () => {
  it("recognises each of the three copies", () => {
    for (const id of ["copy-1", "copy-2", "copy-3"]) expect(isSettingsCopy(byId(id), rows, "Leg Press")).toBe(true);
  });

  it("never hides a note a trainer typed, even one that reads like a change", () => {
    const typed = {
      ...byId("copy-2"),
      body: "Leg Press — Seat 4 -> 5 helps the knee",
    };
    expect(isSettingsCopy(typed, rows, "Leg Press")).toBe(false);
    const arrow = { ...byId("copy-2"), body: "Leg Press — Seat 4 → 5 helps the knee" };
    expect(isSettingsCopy(arrow, rows, "Leg Press")).toBe(false);
    for (const id of ["n1", "n2", "n3"]) expect(isSettingsCopy(byId(id), rows, "Leg Press")).toBe(false);
  });

  it("needs the time to match too: the same words a week later are a note", () => {
    const later = { ...byId("copy-2"), occurredAt: new Date(Date.parse("2026-01-13T15:31:40-05:00") + COPY_WINDOW_MS + 1000) };
    expect(isSettingsCopy(later, rows, "Leg Press")).toBe(false);
    const near = { ...byId("copy-2"), occurredAt: new Date(Date.parse("2026-01-13T15:31:40-05:00") + COPY_WINDOW_MS - 1000) };
    expect(isSettingsCopy(near, rows, "Leg Press")).toBe(true);
  });

  it("needs the kind and category a copy carries", () => {
    expect(isSettingsCopy({ ...byId("copy-2"), kind: "coaching", category: "Posture" }, rows, "Leg Press")).toBe(false);
    expect(isSettingsCopy({ ...byId("copy-2"), category: "Pace" }, rows, "Leg Press")).toBe(false);
  });

  it("hides nothing when the history wasn't read", () => {
    expect(isSettingsCopy(byId("copy-2"), null, "Leg Press")).toBe(false);
    expect(isSettingsCopy(byId("copy-2"), [], "Leg Press")).toBe(false);
    expect(withoutSettingsCopies(LEG_PRESS_JOURNAL, null, "Leg Press")).toHaveLength(LEG_PRESS_JOURNAL.length);
  });

  it("knows a copy written under the machine's other name, and not under a name it never had", () => {
    const studioName = { ...byId("copy-2"), body: "Leg Press (Westlake) — Seat 4 → 5. Range of motion" };
    expect(isSettingsCopy(studioName, rows, ["Leg Press", "Leg Press (Westlake)"])).toBe(true);
    expect(isSettingsCopy(studioName, rows, "Leg Press")).toBe(false);
  });

  it("leaves only the notes", () => {
    expect(withoutSettingsCopies(LEG_PRESS_JOURNAL, rows, "Leg Press").map((e) => e.id)).toEqual(["n1", "n2", "n2-u1", "n3"]);
  });
});
