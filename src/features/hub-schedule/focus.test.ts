/**
 * Me / Everyone (hub cherry round): Me by default, remembered on this iPad
 * (a sign-out clears local storage), and a refused storage still answers Me.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_FOCUS, FOCUS_KEY, focusColumnId, readFocus, writeFocus } from "./focus";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const refusing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("Me / Everyone", () => {
  it("starts on Me", () => {
    expect(DEFAULT_FOCUS).toBe("me");
    expect(readFocus(memoryStore())).toBe("me");
    expect(readFocus(null)).toBe("me");
  });

  it("remembers Everyone on this iPad, and anything else it finds reads as Me", () => {
    const store = memoryStore();
    writeFocus("everyone", store);
    expect(store.data.get(FOCUS_KEY)).toBe("everyone");
    expect(readFocus(store)).toBe("everyone");
    store.data.set(FOCUS_KEY, "something old");
    expect(readFocus(store)).toBe("me");
  });

  it("a refused storage never throws: Me, and the choice holds for the visit", () => {
    expect(readFocus(refusing)).toBe("me");
    expect(() => writeFocus("everyone", refusing)).not.toThrow();
  });

  it("the focus column is yours on Me, and nobody's on Everyone or with no column", () => {
    expect(focusColumnId("me", "t-ioreth")).toBe("t-ioreth");
    expect(focusColumnId("everyone", "t-ioreth")).toBeNull();
    expect(focusColumnId("me", null)).toBeNull();
  });
});
