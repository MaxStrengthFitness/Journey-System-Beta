// @vitest-environment jsdom
/**
 * THE RENEWAL BRIEF, mounted (Sep 25 2026): "Where they stand" names where
 * the auto-renew answer came from beside the charge date — "Nov 14 · the
 * studio's answer" — so a leader preparing the conversation knows whether it
 * is Mindbody's word on her contract, a trainer's mark, or a studio default.
 * The live renewal, the cycle, the clinical report and the InBody variation
 * are stand-ins: each has its own tests.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Trainer } from "../../../types";
import type { RenewalSnapshot } from "../../renewals/types";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-lead" } } }));
// The machine totals document (features/machine-totals): answered, with nothing in it.
vi.mock("../../machine-totals/useMachineTotals", () => ({ useMachineTotals: () => ({ state: "missing", data: null }) }));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: () => {}, error: () => {}, info: () => {}, warning: () => {}, toast: () => {} }),
}));

const live = vi.hoisted(() => ({ snapshot: null as RenewalSnapshot | null }));
vi.mock("../../renewals/useLiveRenewal", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../../renewals/settings");
  return {
    useLiveRenewal: () => ({
      live: live.snapshot,
      stored: null,
      snapshot: live.snapshot,
      settings: DEFAULT_RENEWAL_SETTINGS,
      loading: false,
      error: null,
    }),
  };
});
vi.mock("../../renewals/useRenewalCycle", () => ({
  useRenewalCycle: () => ({ cycle: null, loading: false }),
  useRenewalTouches: () => ({ touches: [], loading: false }),
  updateCycleAsLeader: async () => {},
}));
vi.mock("../../renewals/LogConversationDialog", () => ({ LogConversationDialog: () => null }));
vi.mock("../../clinical-review", () => ({
  useClinicalReport: () => ({ status: "idle", data: null, generate: () => {} }),
  buildReport: () => ({ allInsights: [] }),
  rangeForPreset: () => null,
}));
vi.mock("../../inbody/useInBodyVariation", async () => {
  const { DEFAULT_INBODY_VARIATION } = await import("../../inbody/variation");
  return { useInBodyVariation: () => DEFAULT_INBODY_VARIATION };
});

import { RenewalBrief } from "./RenewalBrief";

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
  live.snapshot = null;
  document.body.innerHTML = "";
});

const snapshot = (over: Partial<RenewalSnapshot> = {}): RenewalSnapshot =>
  ({
    version: 2,
    cycleKey: "9001",
    clientContractId: "9001",
    packageKey: "committed",
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
    runOutDate: null,
    bankedAtCharge: null,
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
const lead = { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer" } as unknown as Trainer;

async function mount(s: RenewalSnapshot) {
  live.snapshot = s;
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <RenewalBrief
          client={client}
          studioTrainers={[lead]}
          machines={[]}
          trainers={[lead]}
          authTrainer={lead}
          canManage={false}
          onClose={() => {}}
        />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return document.querySelector<HTMLElement>('[role="dialog"]')!;
}

describe("the Renewal Brief names where the auto-renew answer came from", () => {
  it("beside the charge date: the studio's answer", async () => {
    const brief = await mount(snapshot());
    expect(brief.textContent).toContain("Auto-renews");
    expect(brief.textContent).toContain("Nov 14, 2099 · the studio's answer");
  });

  it("a trainer's mark, and an estimate", async () => {
    const brief = await mount(snapshot({ autoRenews: false, autoRenewsFrom: "client", chargeDateSource: "estimate" }));
    expect(brief.textContent).toContain("Billing ends");
    expect(brief.textContent).toContain("Nov 14, 2099 (estimated) · marked on the profile");
  });

  it("the standard, never passed off as the studio's own answer", async () => {
    const brief = await mount(snapshot({ autoRenewsFrom: "default" }));
    expect(brief.textContent).toContain("Nov 14, 2099 · the standard answer (the studio hasn't set one)");
    expect(brief.textContent).not.toContain("the studio's answer");
  });
});
