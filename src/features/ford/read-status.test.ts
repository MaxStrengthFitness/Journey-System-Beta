/**
 * A FORD read that did not come back is unknown, never empty (client codex,
 * phase 1). These pin the two answers a screen needs: which kind of "not
 * read" it was, and that only `ready` may be taken as "nothing on file".
 */
import { describe, expect, it } from "vitest";
import {
  FORD_READ_NOTICE,
  fordCanAdd,
  fordReadIsReady,
  fordReadNotice,
  fordReadStatusOfError,
} from "./read-status";

describe("fordReadStatusOfError", () => {
  it("reads the rules saying no as denied, in either spelling", () => {
    expect(fordReadStatusOfError({ code: "permission-denied" })).toBe("denied");
    expect(fordReadStatusOfError({ code: "PERMISSION_DENIED" })).toBe("denied");
  });

  it("reads everything else as failed, including a missing index and no error at all", () => {
    expect(fordReadStatusOfError({ code: "unavailable" })).toBe("failed");
    expect(fordReadStatusOfError({ code: "failed-precondition" })).toBe("failed");
    expect(fordReadStatusOfError(new Error("offline"))).toBe("failed");
    expect(fordReadStatusOfError(null)).toBe("failed");
    expect(fordReadStatusOfError(undefined)).toBe("failed");
  });
});

describe("fordReadIsReady", () => {
  it("lets only an answered read stand for nothing on file", () => {
    expect(fordReadIsReady("ready")).toBe(true);
    expect(fordReadIsReady("loading")).toBe(false);
    expect(fordReadIsReady("failed")).toBe(false);
    expect(fordReadIsReady("denied")).toBe(false);
  });
});

describe("FORD_READ_NOTICE", () => {
  it("never claims there is nothing on file, and names no client", () => {
    for (const sentence of Object.values(FORD_READ_NOTICE)) {
      expect(sentence).not.toMatch(/nothing (here|on file) yet/i);
      expect(sentence).not.toMatch(/\{|\}/);
    }
    expect(FORD_READ_NOTICE.failed).toContain("isn't the same as nothing on file");
    expect(FORD_READ_NOTICE.denied).toContain("home studio");
    // A client with no studio cannot be fixed by a retry, so it never offers one.
    expect(FORD_READ_NOTICE.noStudio).toContain("no home studio on file");
    expect(FORD_READ_NOTICE.noStudio).not.toMatch(/retry|again/i);
  });
});

describe("fordReadNotice", () => {
  it("says nothing while loading or once the read answered", () => {
    expect(fordReadNotice("loading", "s1")).toBeNull();
    expect(fordReadNotice("ready", "s1")).toBeNull();
    expect(fordReadNotice("loading", "")).toBeNull();
  });

  it("offers a retry only when a retry could help", () => {
    expect(fordReadNotice("failed", "s1")).toBe(FORD_READ_NOTICE.failed);
    expect(fordReadNotice("failed", "")).toBe(FORD_READ_NOTICE.noStudio);
    expect(fordReadNotice("denied", "s1")).toBe(FORD_READ_NOTICE.denied);
  });
});

describe("fordCanAdd", () => {
  it("offers Add on a failed read — a failed READ is no reason to refuse a WRITE", () => {
    expect(fordCanAdd("ready", "s1")).toBe(true);
    expect(fordCanAdd("loading", "s1")).toBe(true);
    expect(fordCanAdd("failed", "s1")).toBe(true);
  });

  it("does not offer a write the rules would refuse: a visitor's, or one stamped with no studio", () => {
    expect(fordCanAdd("denied", "s1")).toBe(false);
    expect(fordCanAdd("failed", "")).toBe(false);
    expect(fordCanAdd("loading", "")).toBe(false);
  });
});
