import { describe, expect, it } from "vitest";
import { nameBook } from "../present";
import { MARKS_UNKNOWN_OFFERS, noOffersWithSentence, nothingOpenedWithSentence } from "./words";

/**
 * The screens' own words (ui/words.ts): quoted here, so a change to one is
 * a change someone chose.
 */
const names = nameBook([
  { id: "t-sam", name: "Sam Lee" },
  { id: "t-pat", name: "Pat Moss" },
]);
const SAM = { trainerId: "t-sam", uid: "uid-sam" };

describe("a chip that narrows a list to nothing", () => {
  it("names the chip, never the whole studio", () => {
    expect(nothingOpenedWithSentence("t-sam", names, SAM)).toBe("Nothing has opened up with you in the next 7 days. Anyone shows the rest of the studio.");
    expect(nothingOpenedWithSentence("t-pat", names, SAM)).toBe("Nothing has opened up with Pat in the next 7 days. Anyone shows the rest of the studio.");
  });

  it("says whose times have nothing to offer", () => {
    expect(noOffersWithSentence("t-sam", names, SAM)).toBe("You have no usual times with room to offer right now. Anyone shows the rest of the studio.");
    expect(noOffersWithSentence("t-pat", names, SAM)).toBe("Pat has no usual times with room to offer right now. Anyone shows the rest of the studio.");
    // An id nobody can name still starts a sentence.
    expect(noOffersWithSentence("t-gone", names, SAM)).toBe("A trainer has no usual times with room to offer right now. Anyone shows the rest of the studio.");
  });
});

describe("the marks, unread", () => {
  it("offers nothing for good, and says why", () => {
    expect(MARKS_UNKNOWN_OFFERS).toBe("Can't tell just now whether anyone has marked a time Always full, so no time is offered for good yet.");
  });
});
