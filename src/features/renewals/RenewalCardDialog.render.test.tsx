// @vitest-environment jsdom
/**
 * THE RENEWAL CARD, mounted (Sep 25 2026): the charge date names where the
 * auto-renew answer came from — Mindbody's contract, a trainer's mark, the
 * package's answer, the studio's, or the standard — so nobody takes a
 * studio's default for a fact about her contract. The live renewal, the
 * conversation history and the InBody variation are stand-ins: each has its
 * own tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import type { RenewalSnapshot } from "./types";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-aj" } } }));

const live = vi.hoisted(() => ({ snapshot: null as RenewalSnapshot | null }));
vi.mock("./useLiveRenewal", () => ({
  useLiveRenewal: () => ({ live: live.snapshot, stored: null, snapshot: live.snapshot, settings: {}, loading: false, error: null }),
}));
vi.mock("./useRenewalCycle", () => ({ useRenewalCycle: () => ({ cycle: null, loading: false }) }));
vi.mock("./TouchHistory", () => ({ TouchHistory: () => null }));
vi.mock("./LogConversationDialog", () => ({ LogConversationDialog: () => null }));
vi.mock("../inbody/useInBodyVariation", async () => {
  const { DEFAULT_INBODY_VARIATION } = await import("../inbody/variation");
  return { useInBodyVariation: () => DEFAULT_INBODY_VARIATION };
});

import { RenewalCardDialog } from "./RenewalCardDialog";

/* jsdom has neither; the dialog wants them. */
const g = globalThis as unknown as Record<string, unknown>;
const hadRO = "ResizeObserver" in g;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!hadRO) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});
afterAll(() => {
  if (!hadRO) delete g.ResizeObserver;
});

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  live.snapshot = null;
  document.body.innerHTML = "";
});

const snapshot = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    version: 2,
    cycleKey: "9001",
    clientContractId: "9001",
    packageLabel: "Committed · 12 months",
    situation: "on-track",
    paymentMode: "monthly",
    chargeDate: "2099-11-14",
    chargeDateSource: "mindbody",
    autoRenews: true,
    autoRenewsFrom: "studio",
    autoRenewsInherited: { renews: true, from: "studio" },
    sessionsLeft: 40,
    sessionsLeftSource: "mindbody",
    sessionsOnHand: 8,
    paymentsLeft: 4,
    pacePerWeek: 2,
    lastVisitDate: null,
    conversationDue: false,
    chargeWarning: false,
    renewalOnBooks: null,
    flags: [],
    dataGaps: [],
    proof: { weeksAttended: null, weeksObserved: null, machinesImproved: null, machinesTracked: null, bestGain: null, inbody: null },
    ...over,
  }) as RenewalSnapshot;

const client = { id: "c1", homeStudioId: "s1", firstName: "Judy", lastName: "Daus" } as Client;

async function mount(s: RenewalSnapshot) {
  live.snapshot = s;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <RenewalCardDialog open onClose={() => {}} client={client} trainer={{ fullName: "AJ" }} />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}

/** The small line under a Fact, found by the Fact's label: "date from Mindbody · the studio's answer". */
function factSub(dialog: HTMLElement, label: string): string | null {
  const heading = [...dialog.querySelectorAll("p")].find((p) => p.textContent === label);
  const lines = heading?.parentElement?.querySelectorAll("p");
  return lines && lines.length === 3 ? lines[2].textContent : null;
}

describe("the Renewal card names where the auto-renew answer came from", () => {
  it("says the studio's answer, beside where the date came from", async () => {
    const dialog = await mount(snapshot());
    expect(factSub(dialog, "Auto-renews")).toBe("date from Mindbody · the studio's answer");
  });

  it("says a trainer marked it on the profile", async () => {
    const dialog = await mount(snapshot({ autoRenews: false, autoRenewsFrom: "client", chargeDateSource: "estimate" }));
    expect(factSub(dialog, "Billing ends")).toBe("estimated date · marked on the profile");
  });

  it("never puts a bare 'from Mindbody' under 'Auto-renews' beside an answer that isn't Mindbody's", async () => {
    for (const from of ["studio", "default", "package", "client"] as const) {
      const dialog = await mount(snapshot({ autoRenewsFrom: from }));
      const parts = (factSub(dialog, "Auto-renews") ?? "").split(" · ");
      expect(parts[0], from).toBe("date from Mindbody");
      expect(parts, from).not.toContain("from Mindbody");
      expect(parts, from).toHaveLength(2);
      for (const m of mounted) {
        await act(async () => m.root.unmount());
        m.host.remove();
      }
      mounted = [];
      document.body.innerHTML = "";
    }
    // Where Mindbody said both, it is named twice, each for what it said.
    const dialog = await mount(snapshot({ autoRenewsFrom: "mindbody" }));
    expect(factSub(dialog, "Auto-renews")).toBe("date from Mindbody · Mindbody's contract");
  });

  it("still says where the date came from when nothing has said whether it renews", async () => {
    const dialog = await mount(snapshot({ autoRenews: null, autoRenewsFrom: null }));
    expect(factSub(dialog, "Payments finish")).toBe("date from Mindbody");
  });

  it("never credits the studio with an answer it hasn't given", async () => {
    const dialog = await mount(snapshot({ autoRenewsFrom: "default" }));
    expect(dialog.textContent).toContain("the standard answer (the studio hasn't set one)");
    expect(dialog.textContent).not.toContain("the studio's answer");
  });
});
