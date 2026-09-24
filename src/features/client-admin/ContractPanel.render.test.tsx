// @vitest-environment jsdom
/**
 * The Admin section's contract panel, MOUNTED: the three answers render from
 * a client document, and the tier lock goes through the record's Save bar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, Studio } from "../../types";

vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ activeStudioId: "westlake", activeStudio: null }),
}));

import { ContractPanel } from "./ContractPanel";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ts = (iso: string) => ({ toDate: () => new Date(iso) });
const studios = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
] as Studio[];

const client = {
  id: "100",
  mindbodyClientId: "100",
  firstName: "Judith",
  lastName: "Daus",
  homeStudioId: "solon",
  height: "",
  isActive: true,
  remainingSessions: 0,
  mindbodyContracts: {
    k: {
      clientContractId: "k",
      status: "Active",
      contractName: "96 Sessions - 2X Week",
      startDate: ts("2026-01-05T00:00:00Z"),
      endDate: ts("2027-01-01T00:00:00Z"),
      autopayStatus: "Active",
    },
  },
  mindbodyServices: { s: { serviceId: "s", name: "Session Comp", remaining: 2, count: 2 } },
} as unknown as Client;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("ContractPanel", () => {
  it("answers what they are on, what is left and what they have had", () => {
    const el = mount(<ContractPanel client={client} formData={{}} updateField={() => {}} studios={studios} />);
    const text = el.textContent || "";
    expect(text).toContain("Committed · 12 months · paying every 4 weeks");
    expect(text).toContain("Read from Mindbody names");
    expect(text).toContain("96 Sessions - 2X Week");
    expect(text).toContain("Session Comp: 2 of 2");
    // visiting Westlake without approval
    expect(text).toContain("NOT yet cleared to train at Westlake");
    // no renewal snapshot yet → says so rather than inventing
    expect(text).toContain("Renewal not worked out yet");
  });

  it("locks the tier through updateField, naming who", () => {
    const updateField = vi.fn();
    const el = mount(
      <ContractPanel client={client} formData={{}} updateField={updateField} studios={studios} author={{ id: "u1", name: "AJ" }} />,
    );
    act(() => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Lock the tier"))!.click());
    act(() => [...el.querySelectorAll("button")].find((b) => b.textContent === "18 mo · paid in full")!.click());
    expect(updateField).toHaveBeenCalledWith(
      "contractTierOverride",
      expect.objectContaining({ term: 18, payment: "pif", setByName: "AJ", setById: "u1" }),
    );
  });

  it("shows a pending lock and the Mindbody reading beside it", () => {
    const el = mount(
      <ContractPanel
        client={client}
        formData={{ contractTierOverride: { term: 18, payment: "pif", setAt: "2026-09-15T00:00:00Z", setByName: "AJ" } } as never}
        updateField={() => {}}
        studios={studios}
      />,
    );
    const text = el.textContent || "";
    expect(text).toContain("Life Transformed · 18 months · paid in full");
    expect(text).toContain("Mindbody reads as: Committed · 12 months · paying every 4 weeks");
    expect(text).toContain("Use Mindbody's");
  });

  it("offers a Demo Mode client no real studio to cross-train at, and a real client no demo studio", () => {
    const withDemo = [...studios, { id: "demo-studio", name: "Demo Mode", isDemo: true }] as Studio[];
    const updateField = vi.fn();
    const demoClient = { ...client, homeStudioId: "demo-studio" } as Client;
    let el = mount(<ContractPanel client={demoClient} formData={{}} updateField={updateField} studios={withDemo} />);
    const names = (e: HTMLElement) => [...e.querySelectorAll(".cadm-choice")].map((b) => b.textContent);
    expect(names(el)).toEqual([]);
    expect(el.textContent).toContain("No other studios to approve.");
    expect(updateField).not.toHaveBeenCalled();
    act(() => root?.unmount());
    host?.remove();

    el = mount(<ContractPanel client={client} formData={{}} updateField={updateField} studios={withDemo} />);
    expect(names(el)).toEqual(["Westlake"]);
  });
});
