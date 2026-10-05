import { describe, expect, it } from "vitest";
import {
  blockOrder,
  columnWidthsFor,
  dialogWidthFor,
  menuLayoutFor,
  readingOrder,
  type BlockId,
  type BlockState,
  type MenuLayout,
} from "./doors";

const LAYOUTS: MenuLayout[] = ["phone", "portrait", "landscape"];
const STATES: BlockState[] = [
  { safety: true, firstTime: false },
  { safety: false, firstTime: false },
  { safety: true, firstTime: true },
  { safety: false, firstTime: true },
];

const without = (ids: BlockId[], drop: BlockId): BlockId[] => ids.filter((id) => id !== drop);

describe("the two doors differ ONLY in where Notes sits (AJ, Oct 4 2026)", () => {
  it("is the same card in both doors once Notes is taken out, column by column", () => {
    for (const layout of LAYOUTS) {
      for (const state of STATES) {
        const session = blockOrder("session", layout, state);
        const profile = blockOrder("profile", layout, state);
        expect(session.top).toEqual(profile.top);
        expect(session.trailing).toEqual(profile.trailing);
        expect(without(session.leading, "notes")).toEqual(without(profile.leading, "notes"));
        expect(without(readingOrder(session), "notes")).toEqual(without(readingOrder(profile), "notes"));
        // Notes is in both, once.
        for (const o of [session, profile]) expect(readingOrder(o).filter((id) => id === "notes")).toHaveLength(1);
      }
    }
  });

  it("keeps the settings and the notes in the leading column in every layout, so a turn of the iPad never remounts them", () => {
    for (const door of ["session", "profile"] as const) {
      for (const state of STATES) {
        for (const layout of LAYOUTS) {
          const order = blockOrder(door, layout, state);
          expect(order.leading).toContain("settings");
          expect(order.leading).toContain("notes");
          // Outside landscape the trailing column is empty: the body draws the same two columns stacked.
          if (layout !== "landscape") expect(order.trailing).toEqual([]);
        }
      }
    }
  });

  it("does differ in where Notes sits", () => {
    for (const layout of LAYOUTS) {
      expect(readingOrder(blockOrder("session", layout, STATES[0]))).not.toEqual(readingOrder(blockOrder("profile", layout, STATES[0])));
    }
  });

  it("puts Safety first in both doors, and leaves it out when there is nothing to show", () => {
    for (const layout of LAYOUTS) {
      for (const door of ["session", "profile"] as const) {
        expect(readingOrder(blockOrder(door, layout, { safety: true, firstTime: false }))[0]).toBe("safety");
        expect(readingOrder(blockOrder(door, layout, { safety: true, firstTime: true }))[0]).toBe("safety");
        expect(readingOrder(blockOrder(door, layout, { safety: false, firstTime: false }))).not.toContain("safety");
      }
    }
  });

  it("keeps the settings first after safety in both doors: the primary use", () => {
    for (const layout of LAYOUTS) {
      for (const door of ["session", "profile"] as const) {
        expect(blockOrder(door, layout, STATES[0]).leading[0]).toBe("settings");
      }
    }
  });
});

describe("each door's order", () => {
  it("puts Notes right under the settings in a session", () => {
    expect(readingOrder(blockOrder("session", "portrait", STATES[0]))).toEqual(["safety", "settings", "notes", "chart", "guide", "changes"]);
    expect(blockOrder("session", "landscape", STATES[0])).toEqual({
      layout: "landscape",
      top: ["safety"],
      leading: ["settings", "notes", "guide", "changes"],
      trailing: ["chart"],
    });
  });

  it("puts Notes after the chart on the profile", () => {
    expect(readingOrder(blockOrder("profile", "portrait", STATES[0]))).toEqual(["safety", "settings", "chart", "notes", "guide", "changes"]);
    expect(blockOrder("profile", "landscape", STATES[0])).toEqual({
      layout: "landscape",
      top: ["safety"],
      leading: ["settings", "guide", "changes", "notes"],
      trailing: ["chart"],
    });
  });

  it("moves the guide's set-up part above the tiles the first time, in both doors", () => {
    for (const door of ["session", "profile"] as const) {
      const order = readingOrder(blockOrder(door, "portrait", { safety: false, firstTime: true }));
      expect(order.slice(0, 2)).toEqual(["setupFirst", "settings"]);
      // The execution cues stay folded.
      expect(order).toContain("guide");
    }
  });

  it("lays a phone out like portrait", () => {
    for (const door of ["session", "profile"] as const) {
      expect(readingOrder(blockOrder(door, "phone", STATES[0]))).toEqual(readingOrder(blockOrder(door, "portrait", STATES[0])));
    }
  });
});

describe("the frame's sizes (design §B)", () => {
  it("picks the layout: a phone is always one column, two columns from 1000px landscape", () => {
    expect(menuLayoutFor(820, 1180, false)).toBe("portrait");
    expect(menuLayoutFor(1024, 1366, false)).toBe("portrait");
    expect(menuLayoutFor(1180, 820, false)).toBe("landscape");
    expect(menuLayoutFor(1133, 744, false)).toBe("landscape");
    expect(menuLayoutFor(960, 600, false)).toBe("portrait");
    expect(menuLayoutFor(390, 844, true)).toBe("phone");
    expect(menuLayoutFor(844, 390, true)).toBe("phone");
  });

  it("sizes the dialog: 760 on an 820-wide iPad, 820 on a 13-inch, 1080 in landscape", () => {
    expect(dialogWidthFor(820, "portrait")).toBe(760);
    expect(dialogWidthFor(1024, "portrait")).toBe(820);
    expect(dialogWidthFor(744, "portrait")).toBe(684);
    expect(dialogWidthFor(1180, "landscape")).toBe(1080);
    expect(dialogWidthFor(390, "phone")).toBe(390);
  });

  it("gives the content and the landscape columns their widths", () => {
    expect(columnWidthsFor(760, "portrait")).toEqual({ content: 712, leading: 712, trailing: 0 });
    expect(columnWidthsFor(1080, "landscape")).toEqual({ content: 1032, leading: 400, trailing: 608 });
    expect(columnWidthsFor(390, "phone")).toEqual({ content: 358, leading: 358, trailing: 0 });
  });
});
