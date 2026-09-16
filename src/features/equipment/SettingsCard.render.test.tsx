// @vitest-environment jsdom
/**
 * The Settings card's suggestions and the watch-out card, MOUNTED. The
 * suggestion reads a trends document in an effect, and the rule it exists to
 * keep — "never prefill" — is only visible in the rendered inputs.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { EquipmentMachine } from "./types";

const trendCalls = vi.hoisted(() => ({ enabled: [] as boolean[] }));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("./mutations", () => ({ saveSettings: async () => null }));
vi.mock("./useMachineTrend", () => ({
  useMachineTrend: (_id: string, enabled: boolean) => {
    trendCalls.enabled.push(enabled);
    if (!enabled) return null;
    const byHeight = { "66": 3, "67": 2, "68": 1 };
    return {
      settings: { seat: { "6": { clients: 6, sets: 20, medianBest: null, byHeight } } },
    };
  },
}));

import { SettingsCard } from "./SettingsCard";
import { WatchOutCard } from "./WatchOutCard";
import { machineWatchOuts } from "../../lib/clinical-watchouts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const machine = (settings: Record<string, string> = {}): EquipmentMachine =>
  ({
    id: "lumbar_extension",
    name: "Lumbar Extension",
    order: 1,
    kinematic: null,
    category: null,
    region: "core",
    fields: [{ key: "Seat", label: "Seat", type: "number", ghost: "4", absolute: false }],
    guide: null,
    bodyType: {
      shorterStature: { seatAdjustment: "Raise seat one notch" },
      tallerStature: {},
      limitedMobility: {},
    },
    baselineLoad: { male: 50, female: 40 },
    startingWeight: null,
    currentWeight: null,
    settings,
    notes: [],
    hasMaintenanceFlag: false,
    loggedSetCount: 0,
    usage: {
      firstPerformed: null,
      lastPerformed: null,
      timesPerformed: 0,
      firstWeight: null,
      lastWeight: null,
      progressionPct: null,
      averageTutSeconds: null,
      tutSamples: 0,
      partial: false,
    },
    inUse: false,
    isConfigured: Object.keys(settings).length > 0,
  }) as unknown as EquipmentMachine;

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
  root = null;
  host = null;
  trendCalls.enabled.length = 0;
});

describe("SettingsCard suggestions", () => {
  it("offers a starting point for an empty field, and fills only on tap", () => {
    const el = mount(
      <SettingsCard
        machine={machine()}
        clientId="c1"
        author={null}
        startEditing
        clientHeight={"5'0\""}
        clientGender="Female"
      />,
    );
    // 5'0" = 60": no clients in ±2" → no suggestion, but the shorter-stature tip shows.
    expect(el.textContent).not.toContain("the most common setting");
    expect(el.textContent).toContain("Raise seat one notch");
    expect((el.querySelector("input") as HTMLInputElement).value).toBe("");
  });

  it("suggests when the band has enough clients, and Use fills the draft", () => {
    const el = mount(
      <SettingsCard machine={machine()} clientId="c1" author={null} startEditing clientHeight={"5'7\""} />,
    );
    expect(el.textContent).toContain("Around 5'7\" here, the most common setting is 6 (6 of 6 clients)");
    const input = el.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("");
    const use = [...el.querySelectorAll("button")].find((b) => b.textContent === "Use 6")!;
    act(() => use.click());
    expect((el.querySelector("input") as HTMLInputElement).value).toBe("6");
    expect(el.textContent).not.toContain("the most common setting");
  });

  it("never reads trends for a configured machine or a client with no height", () => {
    mount(<SettingsCard machine={machine({ Seat: "5" })} clientId="c1" author={null} startEditing clientHeight={"5'7\""} />);
    expect(trendCalls.enabled.every((e) => e === false)).toBe(true);
    act(() => root?.unmount());
    host?.remove();
    trendCalls.enabled.length = 0;
    mount(<SettingsCard machine={machine()} clientId="c1" author={null} startEditing />);
    expect(trendCalls.enabled.every((e) => e === false)).toBe(true);
  });
});

describe("WatchOutCard", () => {
  it("renders nothing without a watch-out", () => {
    const el = mount(<WatchOutCard watchOuts={[]} />);
    expect(el.innerHTML).toBe("");
  });

  it("quotes the matrix for this machine, setup first", () => {
    const el = mount(<WatchOutCard watchOuts={machineWatchOuts(["spine-ddd"], { id: "lumbar_extension" })} />);
    expect(el.textContent).toContain("Degenerative Disc Disease");
    expect(el.textContent).toContain("Gap 4-6");
  });
});
