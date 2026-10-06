// @vitest-environment jsdom
/**
 * What the Directory draws again, and when (the iPad round, Oct 2026).
 *
 * The perf lab measured one client's write at 378 / 606 ms of frozen
 * Directory (iPad 10 / older iPad) and every minute's tick at 240 / 434 ms,
 * because both rebuilt and redrew all 300 rows. These mounts count each
 * row's renders through a memoised stand-in with the real row's props, so a
 * prop that stopped being stable (a new gridVars, a new callback, a rebuilt
 * row) fails here:
 *   - a write to one client redraws that client's row and no other, even
 *     when the host hands in new callbacks;
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, memo } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", availableStudios: [] }),
}));
vi.mock("../renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../renewals/settings");
  const state: RenewalSettingsState = {
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: true,
    ownPackageTable: false,
    forStudioId: "westlake",
    loading: false,
    error: null,
  };
  return { useRenewalSettings: () => state };
});
vi.mock("../admin/journey/inactive-store", () => {
  const marks = new Map();
  return { useInactiveMarks: () => ({ marks, loading: false, failed: false }) };
});
vi.mock("../studio-settings/useStudioSettings", async () => {
  const { resolveAll } = await import("../studio-settings/resolve");
  const all = resolveAll({ studio: null, company: null });
  const state = { all, loading: false, failed: false, value: (k: keyof typeof all) => all[k].value, source: () => "app", studioValues: null, companyValues: null };
  return { useStudioSettings: () => state };
});

// Every row's renders, by client id, through a memoised stand-in with the real row's props.
const renders = vi.hoisted(() => new Map<string, number>());
vi.mock("./DirectoryRowView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./DirectoryRowView")>();
  const Counted = memo((props: React.ComponentProps<typeof actual.DirectoryRowView>) => {
    renders.set(props.row.id, (renders.get(props.row.id) ?? 0) + 1);
    return <actual.DirectoryRowView {...props} />;
  });
  return { ...actual, DirectoryRowView: Counted };
});

import { ClientDirectory, type ClientDirectoryProps } from "./ClientDirectory";
import { NOW, STUDIOS, TODAY, eastern, makeBooking, makeClient } from "./fixtures";
import type { Client, Trainer } from "../../types";

const ME = { id: "t-me", fullName: "Sam Rivera", primaryHomeStudioId: "westlake" } as unknown as Trainer;
const roster: Client[] = [
  makeClient({ id: "nk", firstName: "Nancy", lastName: "Kowalski", lastSessionDate: "2026-09-22" }),
  makeClient({ id: "nr", firstName: "Nancy", lastName: "Ruiz", lastSessionDate: "2026-09-08" }),
  makeClient({ id: "zp", firstName: "Zelda", lastName: "Price", lastSessionDate: "2026-09-26" }),
];
// 4:00 PM Eastern for 30 minutes: ends 4:30 PM, two and a half hours after NOW (2:00 PM).
const booked = [makeBooking({ clientId: "zp", start: eastern(TODAY, "16:00"), trainerId: "t-me", trainerName: "Sam Rivera" })];
const trainers = [ME];
const sessions: never[] = [];

let root: Root | null = null;
let host: HTMLElement;

function element(over: Partial<ClientDirectoryProps>) {
  // New callbacks every time, as AppContent hands them in.
  return (
    <ClientDirectory
      clients={roster}
      onSelectClient={() => {}}
      onStartSession={() => {}}
      authTrainer={ME}
      uid="uid-me"
      rosterStatus="ready"
      schedules={booked}
      schedulesFetchedAt={NOW.getTime() - 10 * 60_000}
      sessions={sessions}
      sessionsKnown
      trainers={trainers}
      studios={STUDIOS as never}
      {...over}
    />
  );
}

async function render(over: Partial<ClientDirectoryProps> = {}) {
  await act(async () => {
    root!.render(element(over));
  });
}

const total = () => [...renders.values()].reduce((a, b) => a + b, 0);

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(() => {
  document.body.innerHTML = "";
});
beforeEach(() => {
  renders.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("ClientDirectory: what one write and the clock redraw", () => {
  it("a write to one client redraws that row only, with new callbacks from the host", async () => {
    await render({ now: NOW });
    expect([...renders.keys()].sort()).toEqual(["nk", "nr", "zp"]);
    renders.clear();

    // useStudioRoster's answer to one write: a new list, the other clients the same objects.
    const changed = roster.map((c) => (c.id === "nr" ? { ...c, lastSessionDate: "2026-09-26" } : c));
    await render({ now: NOW, clients: changed });
    expect(Object.fromEntries(renders)).toEqual({ nr: 1 });
    expect(host.querySelector('.cd-row[data-client-id="nr"]')?.textContent).toContain("Yesterday");

    // The same list again (a parent render with nothing changed): nothing redrawn.
    renders.clear();
    await render({ now: NOW, clients: changed });
    expect(total()).toBe(0);
  });
});
