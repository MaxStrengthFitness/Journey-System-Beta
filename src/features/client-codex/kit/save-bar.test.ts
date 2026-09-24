import { describe, expect, it } from "vitest";
import { placeLabel, saveBarSentence } from "./save-bar";

describe("saveBarSentence", () => {
  it("names the page and the card of a single change", () => {
    expect(saveBarSentence(1, [{ page: "ford", label: "Occupation", anchor: "ford-occupation" }])).toBe(
      "1 unsaved change · FORD · Occupation",
    );
  });

  it("lists each place once, in the order given", () => {
    expect(
      saveBarSentence(3, [
        { page: "ford", label: "Occupation", anchor: "ford-occupation" },
        { page: "ford", label: "Occupation", anchor: "ford-occupation" },
        { page: "body", label: "Build", anchor: "body-build" },
      ]),
    ).toBe("3 unsaved changes · FORD · Occupation, Body & Pulse · Build");
  });

  it("counts the places past three instead of listing them", () => {
    expect(
      saveBarSentence(5, [
        { page: "ford", label: "Occupation" },
        { page: "ford", label: "Recreation" },
        { page: "body", label: "Build" },
        { page: "goals", label: "Her why" },
        { page: "account", label: "Contact" },
      ]),
    ).toBe(
      "5 unsaved changes · FORD · Occupation, FORD · Recreation, Body & Pulse · Build, and 2 more places",
    );
    expect(
      saveBarSentence(4, [
        { page: "ford", label: "Occupation" },
        { page: "ford", label: "Recreation" },
        { page: "body", label: "Build" },
        { page: "account", label: "Contact" },
      ]),
    ).toMatch(/, and 1 more place$/);
  });

  it("says only the count when it has no place for a change", () => {
    expect(saveBarSentence(2, [])).toBe("2 unsaved changes");
  });

  it("is empty when nothing is unsaved", () => {
    expect(saveBarSentence(0, [{ page: "ford", label: "Occupation" }])).toBe("");
  });

  it("does not repeat a page's name when the card is the page", () => {
    expect(placeLabel({ page: "story", label: "Story" })).toBe("Story");
    expect(placeLabel({ page: "account", label: "" })).toBe("Account");
  });
});
