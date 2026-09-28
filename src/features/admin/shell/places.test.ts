import { afterEach, describe, expect, it } from "vitest";
import { HOME_PLACE, LEGACY_TAB_PLACE, OPS_PAGES, defaultSub, placeChanges, placeKey, placeLabel, resolvePlace } from "./places";
import {
  rememberClient,
  rememberPlace,
  rememberScroll,
  rememberSetupOpen,
  rememberedClient,
  rememberedPlace,
  rememberedScroll,
  rememberedSetupOpen,
  rememberedSub,
  resetOperationsMemory,
} from "./place-memory";
import { forgetPersonalMemory } from "../../sign-out/memory";

afterEach(() => resetOperationsMemory());

describe("the five destinations", () => {
  it("are Today, Week, Clients, Team and Setup, in that order (AJ's question 1: Setup, never Studio)", () => {
    expect(OPS_PAGES.map((p) => p.label)).toEqual(["Today", "Week", "Clients", "Team", "Setup"]);
  });

  it("put Renewals and Moments under Clients, Hours under Team, and the setting-up screens under Setup", () => {
    const subs = Object.fromEntries(OPS_PAGES.map((p) => [p.id, p.subs.map((s) => s.label)]));
    expect(subs.clients).toEqual(["Renewals", "Moments", "Trends"]);
    expect(subs.team).toEqual(["Hours"]);
    expect(subs.week).toEqual(["This week"]);
    expect(subs.setup).toEqual(["Floor", "People & access", "Announcements", "Mindbody", "Data"]);
    expect(subs.today).toEqual([]);
  });

  it("every old tab id opens the page its screen moved to", () => {
    expect(LEGACY_TAB_PLACE.renewals).toEqual({ page: "clients", sub: "renewals" });
    expect(LEGACY_TAB_PLACE.delight).toEqual({ page: "clients", sub: "moments" });
    expect(LEGACY_TAB_PLACE.insights).toEqual({ page: "clients", sub: "trends" });
    expect(LEGACY_TAB_PLACE.floor).toEqual({ page: "setup", sub: "floor" });
    expect(LEGACY_TAB_PLACE.users).toEqual({ page: "setup", sub: "people" });
    expect(LEGACY_TAB_PLACE.overview).toEqual(HOME_PLACE);
    for (const place of Object.values(LEGACY_TAB_PLACE)) expect(resolvePlace(place)).toEqual(place);
  });
});

describe("resolvePlace", () => {
  it("opens a destination on its first page, and Setup on its own list", () => {
    expect(resolvePlace({ page: "clients" })).toEqual({ page: "clients", sub: "renewals" });
    expect(resolvePlace({ page: "team" })).toEqual({ page: "team", sub: "hours" });
    expect(resolvePlace({ page: "setup" })).toEqual({ page: "setup", sub: null });
    expect(defaultSub("setup")).toBeNull();
  });

  it("never opens nothing: an unknown destination is Today, an unknown page is the default", () => {
    expect(resolvePlace(null)).toEqual(HOME_PLACE);
    expect(resolvePlace({ page: "insights" as never })).toEqual(HOME_PLACE);
    expect(resolvePlace({ page: "clients", sub: "delight" })).toEqual({ page: "clients", sub: "renewals" });
    expect(resolvePlace({ page: "today", sub: "anything" })).toEqual(HOME_PLACE);
  });

  it("names a place the way its Back button says it", () => {
    expect(placeLabel({ page: "clients", sub: "renewals" })).toBe("Clients · Renewals");
    expect(placeLabel(HOME_PLACE)).toBe("Today");
    expect(placeLabel({ page: "setup", sub: null })).toBe("Setup");
    expect(placeKey({ page: "clients", sub: "renewals" })).toBe("clients:renewals");
    expect(placeKey(HOME_PLACE)).toBe("today");
  });

  it("asks the leave question only for a real move", () => {
    expect(placeChanges(HOME_PLACE, HOME_PLACE)).toBe(false);
    expect(placeChanges({ page: "clients", sub: "renewals" }, { page: "clients", sub: "moments" })).toBe(true);
  });
});

describe("where a leader was", () => {
  it("remembers the place, each destination's page, the client, the scroll and the Setup group", () => {
    rememberPlace({ page: "clients", sub: "moments" });
    rememberPlace({ page: "team", sub: "hours" });
    rememberClient("c1");
    rememberScroll("team:hours", 420);
    rememberSetupOpen(true);
    expect(rememberedPlace()).toEqual({ page: "team", sub: "hours" });
    expect(rememberedSub("clients")).toBe("moments");
    expect(rememberedClient()).toBe("c1");
    expect(rememberedScroll("team:hours")).toBe(420);
    expect(rememberedScroll("today")).toBe(0);
    expect(rememberedSetupOpen()).toBe(true);
  });

  it("is forgotten at sign-out: the next person starts on Today with no client open", () => {
    rememberPlace({ page: "setup", sub: "people" });
    rememberClient("c9");
    rememberScroll("setup:people", 300);
    forgetPersonalMemory();
    expect(rememberedPlace()).toEqual(HOME_PLACE);
    expect(rememberedClient()).toBeNull();
    expect(rememberedScroll("setup:people")).toBe(0);
    expect(rememberedSetupOpen()).toBe(false);
  });
});
