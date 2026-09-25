import { describe, expect, it } from "vitest";
import { DEFAULT_RENEWAL_SETTINGS } from "../renewals/settings";
import { pricesState } from "./prices-state";

const ready = {
  settings: DEFAULT_RENEWAL_SETTINGS,
  ownPackageTable: true,
  forStudioId: "westlake",
  loading: false,
  error: null,
};

describe("pricesState", () => {
  it("has nothing to show without a studio", () => {
    expect(pricesState(null, ready)).toEqual({ status: "no-studio" });
    expect(pricesState("", ready)).toEqual({ status: "no-studio" });
  });

  it("never shows the defaults a failed read left behind", () => {
    expect(pricesState("westlake", { ...ready, error: "Couldn't load" })).toEqual({ status: "failed" });
  });

  it("waits while loading", () => {
    expect(pricesState("westlake", { ...ready, loading: true })).toEqual({ status: "loading" });
  });

  it("waits rather than show the previous studio's table after a switch", () => {
    expect(pricesState("solon", ready)).toEqual({ status: "loading" });
    // An error that belongs to the previous studio is not this studio's failure.
    expect(pricesState("solon", { ...ready, error: "Couldn't load" })).toEqual({ status: "loading" });
  });

  it("is ready with whose prices they are", () => {
    expect(pricesState("westlake", ready)).toEqual({ status: "ready", settings: DEFAULT_RENEWAL_SETTINGS, ownTable: true });
    expect(pricesState("westlake", { ...ready, ownPackageTable: false })).toMatchObject({ status: "ready", ownTable: false });
  });
});
