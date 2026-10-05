// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { sayAfterClose, whenRefusedLater } from "./late-refusal";

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  delete (window as unknown as { __showToast?: unknown }).__showToast;
});

describe("a write refused after the card said it was saved on this iPad", () => {
  it("is heard when the write is refused, and not when it lands", async () => {
    const refused = vi.fn();
    whenRefusedLater(Promise.reject(new Error("permission-denied")), refused);
    whenRefusedLater(Promise.resolve("j-1"), refused);
    await flush();
    expect(refused).toHaveBeenCalledTimes(1);
    expect((refused.mock.calls[0][0] as Error).message).toBe("permission-denied");
  });

  it("takes an answer the writer says is a refusal", async () => {
    const refused = vi.fn();
    whenRefusedLater(Promise.resolve(null), refused, (v) => !v);
    await flush();
    expect(refused).toHaveBeenCalledWith(null);
  });

  it("says it in the app's toast once the card has closed, and is silent with no toast to say it in", () => {
    expect(() => sayAfterClose("A note on Leg Press couldn't be saved.")).not.toThrow();
    const show = vi.fn();
    (window as unknown as { __showToast: typeof show }).__showToast = show;
    sayAfterClose("A note on Leg Press couldn't be saved.");
    expect(show).toHaveBeenCalledWith("A note on Leg Press couldn't be saved.", "error", 8000);
  });
});
