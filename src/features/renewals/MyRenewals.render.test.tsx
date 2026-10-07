// @vitest-environment jsdom
/**
 * MY RENEWALS, mounted (the renewals dashboard, Oct 7 2026): a trainer's own
 * clients drawn with the dashboard's row, the plan picker included, since
 * anyone who works at the studio may set a client's renewal plan. A client
 * whose primary trainer is someone else names them; a failed read of the
 * list says so, never "none".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const reads = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  fail: false,
  settingsError: null as string | null,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u-jen" } } }));
vi.mock("firebase/firestore", () => ({
  collection: () => ({}),
  limit: () => ({}),
  query: () => ({}),
  where: () => ({}),
  onSnapshot: (_q: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
    if (reads.fail) fail(new Error("denied"));
    else next({ docs: reads.clients.map((c) => ({ id: c.id, data: () => c })) });
    return () => {};
  },
}));
vi.mock("../../lib/studio-time", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/studio-time")>()),
  studioTodayKey: () => "2026-10-07",
}));
vi.mock("./usePipeline", () => ({ useCyclesRead: () => ({ cycles: {}, loading: false, failed: false }) }));
vi.mock("./useRenewalCycle", () => ({
  isUsableCycleKey: (k: unknown) => typeof k === "string" && k.length > 0,
  saveRenewalPlan: vi.fn(),
}));
vi.mock("./useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("./settings");
  return {
    useRenewalSettings: () => ({
      settings: DEFAULT_RENEWAL_SETTINGS,
      saved: true,
      ownPackageTable: false,
      forStudioId: "solon",
      loading: false,
      error: reads.settingsError,
    }),
  };
});

import { MyRenewals } from "./MyRenewals";
import { UnsavedChangesProvider, useUnsavedStatus, type UnsavedStatus } from "../unsaved-changes";
import type { Trainer } from "../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const jen = { id: "t-jen", fullName: "Jen Park", role: "Trainer", primaryHomeStudioId: "solon" } as unknown as Trainer;
const sam = { id: "t-sam", fullName: "Sam Cole", role: "Trainer", primaryHomeStudioId: "solon" } as unknown as Trainer;

const renewal = (over: Record<string, unknown>) => ({
  version: 3,
  cycleKey: "8001",
  renewalOnBooks: null,
  packageKey: "trial",
  packageLabel: "The Trial · 6 months",
  paymentMode: "monthly",
  autoRenews: false,
  chargeDate: "2026-11-10",
  chargeDateSource: "mindbody",
  commitmentEnd: "2026-11-10",
  commitmentEndSource: "mindbody",
  sessionsLeft: 6,
  sessionsLeftSource: "mindbody",
  situation: "on-track",
  conversationDue: true,
  chargeWarning: false,
  focusDate: "2026-11-10",
  flags: [],
  proof: {},
  lastVisitDate: "2026-10-06",
  nextBookingDate: "2026-10-09",
  coachIds: ["t-jen"],
  primaryTrainerId: "t-sam",
  ...over,
});

let mounted: { root: Root; host: HTMLElement }[] = [];

let status: UnsavedStatus | null = null;
function Probe() {
  status = useUnsavedStatus();
  return null;
}

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const onSelectClient = vi.fn();
  await act(async () => {
    root.render(
      <StrictMode>
        <UnsavedChangesProvider>
          <Probe />
          <MyRenewals trainer={jen} trainers={[jen, sam]} onSelectClient={onSelectClient} />
        </UnsavedChangesProvider>
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return { host, onSelectClient };
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  reads.clients = [];
  reads.fail = false;
  reads.settingsError = null;
});

describe("My renewals — the dashboard row", () => {
  it("draws the trainer's own clients with the dashboard row and the plan picker", async () => {
    reads.clients = [{ id: "c1", firstName: "Nora", lastName: "Reyes", homeStudioId: "solon", renewal: renewal({}) }];
    const { host, onSelectClient } = await mount();
    const row = host.querySelector<HTMLElement>(".rr")!;
    expect(row.querySelector(".rr__name")?.textContent).toBe("Nora Reyes");
    // Her primary trainer is Sam, named from the staff list.
    expect(row.querySelector(".rr__trainer")?.textContent).toBe("Sam Cole");
    expect(row.textContent).toContain("Ends Nov 10");
    expect(row.textContent).toContain("6 left");
    // Strongsville's way (no auto-renew): the manual choices.
    const sel = row.querySelector<HTMLSelectElement>('select[aria-label="Renewal plan for Nora Reyes"]')!;
    expect(Array.from(sel.options).map((o) => o.value)).toContain("renew-same");
    await act(async () => row.querySelector<HTMLButtonElement>(".rr__open")!.click());
    expect(onSelectClient).toHaveBeenCalledWith("c1");
  });

  it("waits for the studio's own settings before offering the plan", async () => {
    reads.settingsError = "Couldn't load this studio's renewal settings. Showing the defaults.";
    reads.clients = [{ id: "c1", firstName: "Nora", lastName: "Reyes", homeStudioId: "solon", renewal: renewal({}) }];
    const { host } = await mount();
    expect(host.querySelector(".rr select")).toBeNull();
  });

  it("says the list couldn't be loaded when the read fails, never that there are none", async () => {
    reads.fail = true;
    const { host } = await mount();
    expect(host.textContent).toContain("Couldn't load your renewals just now.");
    expect(host.textContent).not.toContain("None of your recent clients");
  });
});

describe("My renewals — a plan being picked is unsaved typing", () => {
  it("joins the leave warning until it is saved or cancelled", async () => {
    reads.clients = [{ id: "c1", firstName: "Nora", lastName: "Reyes", homeStudioId: "solon", renewal: renewal({}) }];
    const { host } = await mount();
    expect(status!.anyDirty()).toBe(false);
    const sel = host.querySelector<HTMLSelectElement>(".rr select")!;
    await act(async () => {
      sel.value = "not-renewing";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(status!.anyDirty()).toBe(true);
    const cancel = Array.from(host.querySelectorAll<HTMLButtonElement>(".rr button")).find((b) => b.textContent === "Cancel")!;
    await act(async () => cancel.click());
    expect(status!.anyDirty()).toBe(false);
  });
});
