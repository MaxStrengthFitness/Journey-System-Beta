import { describe, expect, it } from "vitest";
import type { Trainer } from "../types";
import {
  MAX_IN_VALUES,
  capStudioIds,
  dedupeById,
  queryStudioIds,
  readableStudioIds,
} from "./tenancy";

function trainer(over: Partial<Trainer> = {}): Trainer {
  return {
    id: "t1",
    fullName: "Sam Reed",
    initials: "SR",
    role: "Trainer",
    primaryHomeStudioId: "s1",
    accessibleStudioIds: [],
    activeGuestStudioIds: [],
    ...over,
  } as Trainer;
}

describe("readableStudioIds", () => {
  it("gathers home, granted, guest and owned", () => {
    expect(
      readableStudioIds(
        trainer({
          primaryHomeStudioId: "home",
          accessibleStudioIds: ["granted"],
          activeGuestStudioIds: ["guest"],
          ownedStudioIds: ["owned"],
        }),
      ),
    ).toEqual(["home", "granted", "guest", "owned"]);
  });

  it("removes duplicates, so the same id is not sent twice in one `in`", () => {
    expect(
      readableStudioIds(
        trainer({
          primaryHomeStudioId: "s1",
          accessibleStudioIds: ["s1", "s2"],
          ownedStudioIds: ["s2"],
        }),
      ),
    ).toEqual(["s1", "s2"]);
  });

  it("drops blanks rather than querying for an empty studio id", () => {
    expect(
      readableStudioIds(
        trainer({ primaryHomeStudioId: "", accessibleStudioIds: ["s2"] }),
      ),
    ).toEqual(["s2"]);
  });

  it("is empty for no trainer, never a wildcard", () => {
    expect(readableStudioIds(null)).toEqual([]);
    expect(readableStudioIds(undefined)).toEqual([]);
  });

  it("is stable across calls, so a memoised query does not thrash", () => {
    const t = trainer({ accessibleStudioIds: ["a", "b"] });
    expect(readableStudioIds(t)).toEqual(readableStudioIds(t));
  });
});

describe("capStudioIds", () => {
  it("passes a list that fits straight through", () => {
    expect(capStudioIds(["a", "b"])).toEqual(["a", "b"]);
  });

  it("trims to Firestore's `in` limit rather than letting the query throw", () => {
    const many = Array.from({ length: MAX_IN_VALUES + 5 }, (_, i) => `s${i}`);
    expect(capStudioIds(many)).toHaveLength(MAX_IN_VALUES);
  });
});

describe("queryStudioIds", () => {
  const multi = trainer({
    primaryHomeStudioId: "home",
    accessibleStudioIds: ["other"],
  });

  it("narrows to the studio the trainer is standing in", () => {
    expect(queryStudioIds(multi, "other")).toEqual(["other"]);
  });

  it("widens to everything when there is no active studio", () => {
    expect(queryStudioIds(multi, null)).toEqual(["home", "other"]);
  });

  it("widens when explicitly asked, for admin screens", () => {
    expect(queryStudioIds(multi, "other", { includeAll: true })).toEqual([
      "home",
      "other",
    ]);
  });

  it("ignores an active studio the trainer has no access to", () => {
    // Standing somewhere they cannot read is not a reason to query it.
    expect(queryStudioIds(multi, "somewhere-else")).toEqual(["home", "other"]);
  });

  it("trusts the active studio when no trainer profile has loaded yet", () => {
    // The alternative is an empty list on the first render, which reads as
    // "this studio has no clients" before the profile arrives.
    expect(queryStudioIds(null, "home")).toEqual(["home"]);
  });

  it("REGRESSION: returns nothing rather than everything when it knows nothing", () => {
    // The old code fell through to an unconstrained query in exactly this
    // case, which is how a trainer could read the whole platform.
    expect(queryStudioIds(null, null)).toEqual([]);
    expect(queryStudioIds(trainer({ primaryHomeStudioId: "" }), null)).toEqual(
      [],
    );
  });
});

describe("dedupeById", () => {
  it("merges parallel result sets", () => {
    expect(
      dedupeById([
        [{ id: "a" }, { id: "b" }],
        [{ id: "b" }, { id: "c" }],
      ]),
    ).toEqual([{ id: "a" }, { id: "b" }, { id: "c" }]);
  });

  it("is empty for no groups", () => {
    expect(dedupeById([])).toEqual([]);
  });
});
