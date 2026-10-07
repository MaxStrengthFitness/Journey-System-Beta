// @vitest-environment jsdom
/**
 * useLiveRenewal, MOUNTED (auto-renew, Sep 25 2026). Two of its rules only a
 * mount proves, because every screen that reads it mocks it:
 *
 *   - a studio's settings read that FAILED is unknown, never the defaults:
 *     no live snapshot is worked out, so a studio switched OFF is never
 *     worked out as the standard ON;
 *   - with no live snapshot, the fallback is `renewalOf(client)` — last
 *     night's snapshot with her saved mark applied — never the raw stored
 *     one. It is what a cross-train visitor sees, whom the rules refuse the
 *     studio's settings.
 *
 * The four reads are stand-ins that answer at once with nothing; the engine
 * and renewalOf have their own tests.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import type { RenewalSettingsState } from "./useRenewalSettings";
import type { RenewalSnapshot } from "./types";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false, get: () => undefined }),
  getDocs: async () => ({ docs: [], empty: true }),
  limit: () => ({}),
  orderBy: () => ({}),
  query: () => ({}),
  where: () => ({}),
  Timestamp: { fromMillis: (ms: number) => ({ toMillis: () => ms }) },
}));

const settings = vi.hoisted(() => ({ state: null as RenewalSettingsState | null }));
vi.mock("./useRenewalSettings", () => ({ useRenewalSettings: () => settings.state }));

import { useLiveRenewal, type LiveRenewalState } from "./useLiveRenewal";
import { DEFAULT_RENEWAL_SETTINGS } from "./settings";
import { renewalOf } from "./auto-renew";

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  settings.state = null;
});

const seen: { state: LiveRenewalState | null } = { state: null };
function Probe({ client }: { client: Client }) {
  seen.state = useLiveRenewal(client);
  return null;
}

async function mount(client: Client, error: string | null) {
  settings.state = {
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: false,
    ownPackageTable: false,
    forStudioId: "solon",
    loading: false,
    error,
  };
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <Probe client={client} />
      </StrictMode>,
    );
  });
  // Let the four reads land.
  await act(async () => {});
  mounted.push({ root, host });
  return seen.state!;
}

/** Last night's snapshot said "renews, the studio's answer" and warned; she was marked "not on it" since. */
const client = {
  id: "c1",
  homeStudioId: "solon",
  firstName: "Judy",
  lastName: "Daus",
  height: "",
  isActive: true,
  remainingSessions: 0,
  renewal: {
    version: 2,
    paymentMode: "monthly",
    clientContractId: "c1",
    chargeDate: "2026-11-14",
    situation: "will-bank",
    chargeWarning: true,
    bankedAtCharge: 12,
    autoRenews: true,
    autoRenewsFrom: "studio",
    autoRenewsInherited: { renews: true, from: "studio" },
  } as RenewalSnapshot,
  autoRenewMark: { renews: false, contractId: "c1", setAt: "2026-09-25T14:00:00.000Z", setById: "uid-aj", setByName: "AJ" },
} as Client;

describe("useLiveRenewal", () => {
  it("works one out once the reads and the studio's settings are in", async () => {
    const s = await mount(client, null);
    expect(s.live).not.toBeNull();
    expect(s.snapshot).toBe(s.live);
    // The same engine as the nightly job: version 3, with its signals.
    expect(s.live).toMatchObject({ version: 3, signals: expect.any(Object) });
  });

  it("works none out when the settings read failed, and falls back to last night's with her saved mark applied", async () => {
    const s = await mount(client, "Couldn't load this studio's renewal settings. Showing the defaults.");
    // Never worked out against the defaults (the standard ON).
    expect(s.live).toBeNull();
    // renewalOf(client), not the raw stored snapshot.
    expect(s.snapshot).toEqual(renewalOf(client));
    expect(s.snapshot).not.toBe(s.stored);
    expect(s.stored).toBe(client.renewal);
    expect(s.snapshot!.autoRenews).toBe(false);
    expect(s.snapshot!.autoRenewsFrom).toBe("client");
    expect(s.snapshot!.chargeWarning).toBe(false);
  });
});
