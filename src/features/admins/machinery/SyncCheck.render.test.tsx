// @vitest-environment jsdom
/**
 * THE SYNC CHECK MOUNTS — every studio worst first, couldn't check kept apart
 * from failing, Mindbody's webhook in one line, and a row opening its studio.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let webhookAnswer: "active" | "fails" = "active";
vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } } }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  getDoc: async () => {
    if (webhookAnswer === "fails") throw new Error("offline");
    return {
      exists: () => true,
      data: () => ({
        checkedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        active: true,
        subscriptions: [{ id: "s1", status: "Active", eventIds: ["a", "b"], ours: true, statusChangedAt: null, statusChangeMessage: null }],
      }),
    };
  },
}));

import { SyncCheck } from "./SyncCheck";
import type { LeaseRead } from "./sync-check";
import type { Studio } from "../../../types";

const tz = "America/New_York";
const studios = [
  { id: "westlake", name: "Westlake", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "3" },
  { id: "strongsville", name: "Strongsville", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "5" },
  { id: "willoughby", name: "Willoughby", timezone: tz, mindbodySiteId: "29068", mindbodyLocationId: "4" },
  { id: "avon", name: "Avon", timezone: tz, mindbodyMode: "offline" },
] as unknown as Studio[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  webhookAnswer = "active";
});

async function mount(props: Partial<Parameters<typeof SyncCheck>[0]> = {}) {
  const now = Date.now();
  const leases: Record<string, LeaseRead> = {
    westlake: { state: "ok", lease: { lastScheduleSyncAt: now - 6 * 60_000, scheduleSyncFailures: 0 } },
    strongsville: { state: "ok", lease: { lastScheduleSyncAt: now - 26 * 60 * 60_000, scheduleSyncFailures: 2 } },
    willoughby: { state: "failed" },
  };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<SyncCheck studios={studios} leases={leases} checkedAt={now} onCheckAgain={() => {}} onOpenStudio={() => {}} {...props} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

describe("the Mindbody sync check", () => {
  it("lists every studio worst first, in words", async () => {
    const el = await mount();
    const names = [...el.querySelectorAll(".hq-row__name")].map((n) => n.firstChild?.textContent);
    expect(names).toEqual(["Strongsville", "Willoughby", "Westlake", "Avon"]);
    const words = [...el.querySelectorAll(".hq-status")].map((s) => s.textContent);
    expect(words).toEqual(["The last 2 pulls failed", "Couldn't check", "Last pull 6 min ago", "Runs offline, on purpose"]);
    expect(el.querySelectorAll(".hq-status--unknown")).toHaveLength(1);
    expect(el.textContent).toContain("Strongsville is failing to pull; couldn't check Willoughby.");
    expect(el.textContent).toContain("Mindbody's webhook subscription is active");
  });

  it("says it couldn't read the webhook record rather than guessing", async () => {
    webhookAnswer = "fails";
    const el = await mount();
    expect(el.textContent).toContain("Couldn't read whether Mindbody's webhook is on just now.");
  });

  it("opens a studio from its row, and checks again on request", async () => {
    const opened: string[] = [];
    const again = vi.fn();
    const el = await mount({ onOpenStudio: (id) => opened.push(id), onCheckAgain: again });
    await act(async () => {
      el.querySelector<HTMLButtonElement>('.hq-row__open[aria-label="Open Strongsville\'s Mindbody"]')!.click();
    });
    expect(opened).toEqual(["strongsville"]);
    await act(async () => {
      [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Check again"))!.click();
    });
    expect(again).toHaveBeenCalledTimes(1);
  });
});
