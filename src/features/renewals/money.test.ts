import { describe, expect, it } from "vitest";
import { formatMoney, signedMoney } from "./money";

describe("formatMoney", () => {
  it("writes whole dollars without cents and groups thousands", () => {
    expect(formatMoney(480)).toBe("$480");
    expect(formatMoney(5760)).toBe("$5,760");
    expect(formatMoney(25920)).toBe("$25,920");
  });

  it("keeps cents only when there are some", () => {
    expect(formatMoney(67.5)).toBe("$67.50");
    expect(formatMoney(108.125)).toBe("$108.13");
  });

  it("rounds before deciding whether the amount is whole", () => {
    expect(formatMoney(119.999)).toBe("$120");
    expect(formatMoney(0.1 + 0.2)).toBe("$0.30");
  });
});

describe("signedMoney", () => {
  it("signs a difference with a true minus sign", () => {
    expect(signedMoney(10)).toBe("+$10");
    expect(signedMoney(-80)).toBe("−$80");
    expect(signedMoney(-6.5)).toBe("−$6.50");
  });

  it("says nothing for no difference, or a difference too small to print", () => {
    expect(signedMoney(null)).toBe("—");
    expect(signedMoney(0)).toBe("—");
    expect(signedMoney(0.001)).toBe("—");
  });
});
