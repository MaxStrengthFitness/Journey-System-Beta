import { describe, expect, it } from "vitest";
import { reactionSummary } from "./requests";
import { reactedLine } from "./reacted-line";

describe("reactedLine: who replied to an ask, in view", () => {
  it("says nothing until someone has replied", () => {
    expect(reactedLine(reactionSummary({}))).toBeNull();
    expect(reactedLine(reactionSummary({ reactions: { "on-it": {} } }))).toBeNull();
  });

  it("names each reply's people, in the order the replies are offered", () => {
    const line = reactedLine(
      reactionSummary({
        reactions: {
          cant: { u2: { name: "Ann Park" }, u3: { name: "Jo Diaz" } },
          "on-it": { u1: { name: "Sam Lee" } },
        },
      }),
    );
    expect(line).toBe("On it: Sam Lee · Can't: Ann Park, Jo Diaz");
  });

  it("never claims fewer people than tapped: a reply with no stored name is 'someone'", () => {
    expect(reactedLine(reactionSummary({ reactions: { thanks: { u1: { name: "" } } } }))).toBe("Thanks: someone");
    expect(
      reactedLine(reactionSummary({ reactions: { "got-it": { u1: { name: "Sam Lee" }, u2: { name: "" }, u3: { name: " " } } } })),
    ).toBe("Got it: Sam Lee, 2 others");
  });
});
