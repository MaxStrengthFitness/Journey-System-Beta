// @vitest-environment jsdom
/**
 * The Hub's day, mounted: one client's write rebuilds that client's directory
 * row only (the iPad round, Oct 2026). useStudioRoster keeps every other
 * client the same object; the rows are cached per client object while their
 * context is the same, so the other booked clients' rows stay the same objects.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../renewals/settings");
  const state: RenewalSettingsState = { settings: DEFAULT_RENEWAL_SETTINGS, saved: true, ownPackageTable: false, forStudioId: "westlake", loading: false, error: null };
  return { useRenewalSettings: () => state };
});

import { useDayMoments, type DayMoments, type DayMomentsProps } from "./use-day-moments";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient } from "../client-directory/fixtures";

let latest: DayMoments | null = null;
function Probe(props: DayMomentsProps) {
  latest = useDayMoments(props);
  return null;
}

const clients = [
  makeClient({ id: "a", firstName: "Ann", lastName: "Able", lastSessionDate: "2026-09-20" }),
  makeClient({ id: "b", firstName: "Bea", lastName: "Best", lastSessionDate: "2026-09-21" }),
  makeClient({ id: "c", firstName: "Cy", lastName: "Cole", lastSessionDate: "2026-09-22" }),
];
const schedules = clients.map((c, i) => makeBooking({ clientId: c.id as string, start: eastern(TODAY, `1${5 + i}:00`) }));
const none: never[] = [];
const noCritical = () => null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("useDayMoments: one client's write", () => {
  it("rebuilds that client's row and keeps every other row the same object", async () => {
    const root = createRoot(document.createElement("div"));
    const props: DayMomentsProps = { day: TODAY, now: NOW, schedules, clients, sessions: none, sessionsKnown: true, studios: STUDIOS, activeStudioId: "westlake", authTrainer: null, trainers: none, criticalFor: noCritical };
    await act(async () => root.render(<Probe {...props} />));
    const before = latest!.input.rowsById;
    expect(before.size).toBe(3);

    const changed = clients.map((c) => (c.id === "b" ? { ...c, lastSessionDate: "2026-09-26" } : c));
    await act(async () => root.render(<Probe {...props} clients={changed} />));
    const after = latest!.input.rowsById;
    expect(after.get("a")).toBe(before.get("a"));
    expect(after.get("c")).toBe(before.get("c"));
    expect(after.get("b")).not.toBe(before.get("b"));
    expect(after.get("b")?.lastIn.day).toBe("2026-09-26");
    await act(async () => root.unmount());
  });
});
