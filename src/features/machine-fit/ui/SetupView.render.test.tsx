// @vitest-environment jsdom
/**
 * The Setup screen, MOUNTED. The rules it exists to keep are only visible in
 * rendered inputs: a suggestion is a placeholder until it is tapped, an
 * accepted value is saved as "suggested", the check is a sentence and never a
 * wall, and nothing is read until the segment has been opened.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client, ClientMachineSetting, Machine, Routine } from "../../../types";
import { compoundRowStudio } from "../fixtures";

const spy = vi.hoisted(() => ({
  enabled: [] as boolean[],
  commits: [] as any[],
  acks: [] as any[],
  toasts: [] as string[],
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-1" } } }));
vi.mock("../../../hooks/useMachineCatalog", () => ({ useMachineCatalog: () => ({ catalog: [], byId: {}, loading: false }) }));
vi.mock("../../../ActiveStudioContext", () => ({ useActiveStudio: () => ({ activeStudio: { id: "solon" }, activeStudioId: "solon" }) }));
vi.mock("../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => spy.toasts.push(m), error: (m: string) => spy.toasts.push(`! ${m}`) }),
}));
vi.mock("../setup-save", () => ({
  commitSetupSave: async (args: any) => {
    spy.commits.push(args);
    return { machines: args.plan.entries.length, indexed: true };
  },
  acknowledgeFlag: async (args: any) => {
    spy.acks.push(args);
  },
}));
vi.mock("../fit-store", async () => {
  const { compoundRowStudio: studio } = await import("../fixtures");
  return {
    useFitData: (_studio: string, ids: string[], _clients: unknown, enabled: boolean) => {
      spy.enabled.push(enabled);
      if (!enabled) return { status: "idle", sources: {}, studioCounts: {} };
      const sources: Record<string, unknown> = {};
      for (const id of ids) sources[id] = { studio: id === "m-compound-row" ? studio() : [], company: [] };
      return { status: "ready", sources, studioCounts: {} };
    },
  };
});

import { SetupView } from "./SetupView";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MACHINES: Machine[] = [
  { id: "m-leg-press", name: "Leg Press", order: 6, settingOptions: ["Seat"] },
  { id: "m-compound-row", name: "Compound Row", order: 9, settingOptions: ["Gap", "Seat", "Chest"] },
];
const JUDY = { id: "judy", firstName: "Judy", lastName: "Daus", height: "5'7\"", gender: "Female", homeStudioId: "solon", isActive: true } as Client;
const ROUTINES = [{ id: "r1", clientId: "judy", name: "Routine A", machineIds: ["m-compound-row"] }] as Routine[];
const TRAINER = { id: "t1", fullName: "Alex Smith", initials: "AS", role: "LifeTransformer" } as any;

const saved = (settings: Record<string, string>): Record<string, ClientMachineSetting> => ({
  "m-compound-row": { clientId: "judy", machineId: "m-compound-row", settings, updatedBy: "t1", updatedAt: null },
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const reviews: (number | null)[] = [];

function mount(clientSettings: Record<string, ClientMachineSetting> = {}, active = true) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <SetupView
        client={JUDY}
        clientId="judy"
        machines={MACHINES}
        clientSettings={clientSettings}
        routines={ROUTINES}
        isBActive={false}
        studioClients={[JUDY]}
        authTrainer={TRAINER}
        activeStudioId="solon"
        active={active}
        onReviewCount={(n) => reviews.push(n)}
      />,
    ),
  );
  return host;
}

const button = (el: HTMLElement, text: string | RegExp) =>
  [...el.querySelectorAll("button")].find((b) => (typeof text === "string" ? b.textContent?.trim() === text : text.test(b.textContent ?? "")))!;
const cell = (el: HTMLElement, label: string) => el.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;
const click = (b: Element) => act(() => (b as HTMLElement).click());
async function clickAsync(b: Element) {
  await act(async () => {
    (b as HTMLElement).click();
  });
}
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

beforeEach(() => {
  spy.enabled.length = 0;
  spy.commits.length = 0;
  spy.acks.length = 0;
  spy.toasts.length = 0;
  reviews.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete (window as any).matchMedia;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("the Setup screen", () => {
  it("opens a client with nothing saved in Set up, in the floor's own order, with the offer as a placeholder", () => {
    const el = mount();
    expect(el.querySelector(".fit")?.getAttribute("data-mode")).toBe("setup");
    expect([...el.querySelectorAll(".fit-row__name")].map((n) => n.textContent)).toEqual(["Leg Press", "Compound Row"]);
    // Never a value until it is tapped.
    expect(cell(el, "Compound Row Seat").value).toBe("");
    expect(cell(el, "Compound Row Seat").placeholder).toBe("4");
    expect(el.textContent).toContain("5 of 6 clients use exactly this — clients 5'6\"–5'8\" at this studio.");
    // A machine nobody is set up on says so, in words.
    expect(el.textContent).toContain("Nobody is set up on this machine yet");
  });

  it("accepts strong suggestions into DRAFTS, undoes them in one tap, and saves them as 'suggested'", async () => {
    const el = mount();
    click(button(el, /^Accept strong suggestions \(1\)$/));
    expect(cell(el, "Compound Row Gap").value).toBe("0");
    expect(cell(el, "Compound Row Seat").value).toBe("4");
    expect(cell(el, "Compound Row Chest").value).toBe("3");
    expect(el.textContent).toContain("3 unsaved changes on 1 machine");
    expect(el.textContent).toContain("3 accepted from suggestions");
    expect(spy.commits).toHaveLength(0); // nothing written yet

    click(button(el, "Undo accept"));
    expect(cell(el, "Compound Row Seat").value).toBe("");
    expect(el.querySelector(".fit-save")).toBeNull();

    click(button(el, /^Accept strong suggestions/));
    type(cell(el, "Compound Row Chest"), "2"); // the trainer corrects one by hand
    await clickAsync(button(el, "Save set-up"));
    expect(spy.commits).toHaveLength(1);
    const { plan, legacy, homeStudioId, author } = spy.commits[0];
    expect(plan.entries[0]).toMatchObject({
      machineId: "m-compound-row",
      isInitialSetup: true,
      settings: { Gap: "0", Seat: "4", Chest: "2" },
      sources: { Gap: "suggested", Seat: "suggested" }, // Chest was typed
    });
    expect(legacy).toBe(false);
    expect(homeStudioId).toBe("solon");
    expect(author.id).toBe("uid-1"); // the Auth uid, not the trainer document's id
    expect(el.querySelector(".fit-save")).toBeNull();
  });

  it("re-suggests the rest from a value the trainer sets by hand", () => {
    const el = mount();
    expect(cell(el, "Compound Row Chest").placeholder).toBe("3");
    type(cell(el, "Compound Row Seat"), "3");
    // Clients at Seat 3 use Chest 4 — read across every height, because only one 5'6"–5'8" client sits there.
    expect(cell(el, "Compound Row Chest").placeholder).toBe("4");
    expect(el.textContent).toContain("Read across every height, from clients who share what you set.");
  });

  it("opens a set-up client in Check, states what is worth a look as a sentence, and reports it quietly", async () => {
    const el = mount(saved({ Gap: "0", Seat: "9", Chest: "3" }));
    expect(el.querySelector(".fit")?.getAttribute("data-mode")).toBe("check");
    expect(el.querySelectorAll("input.fit-cell__input")).toHaveLength(0); // read-only
    expect(el.textContent).toContain("1 of 2 machines set up. 1 setting is worth a look.");
    expect(el.textContent).toContain("Seat 9 — none of the 6 clients 5'6\"–5'8\" at this studio use it. Most use 4 (5) or 3 (1).");
    expect(el.textContent).not.toMatch(/wrong|incorrect/i);
    expect(reviews[reviews.length - 1]).toBe(1);

    await clickAsync(button(el, "Right for this client"));
    expect(spy.acks[0]).toMatchObject({ clientId: "judy", machineId: "m-compound-row", ackKey: "seat", value: "9" });
  });

  it("stays quiet about a value a trainer has already reviewed", () => {
    const settings = saved({ Gap: "0", Seat: "9", Chest: "3" });
    settings["m-compound-row"].fitAcks = { seat: { value: "9", by: "uid-1", byName: "Alex Smith", at: "2026-09-17T14:00:00.000Z" } };
    const el = mount(settings);
    expect(el.textContent).toContain("Nothing looks unusual for this build.");
    expect(el.querySelector(".fit-flag")).toBeNull();
    expect(reviews[reviews.length - 1]).toBe(0);
  });

  it("asks for a reason only when saved values are changed", () => {
    const el = mount(saved({ Gap: "0", Seat: "4" }));
    click(button(el, /^Set up/));
    type(cell(el, "Compound Row Chest"), "3"); // filling an empty field: still set-up
    expect(el.querySelector(".fit-save__reason")).toBeNull();
    type(cell(el, "Compound Row Seat"), "5"); // changing a saved one: an override
    expect(el.querySelector(".fit-save__reason")).not.toBeNull();
    expect((button(el, "Save set-up") as HTMLButtonElement).disabled).toBe(true);
    type(el.querySelector(".fit-save__reason") as HTMLInputElement, "Longer femurs than the seat suggests");
    expect((button(el, "Save set-up") as HTMLButtonElement).disabled).toBe(false);
  });

  it("reads a line of FileMaker shorthand in Quick entry, keeps what it cannot place, and needs no reason", async () => {
    const el = mount(saved({ Seat: "5" }));
    click(button(el, /^Quick entry/));
    expect(el.textContent).not.toContain("Suggested"); // quick entry copies a chart; it does not suggest
    click(el.querySelector('button[aria-label="Type Compound Row as a line of chart shorthand"]')!);
    const line = el.querySelector('input[aria-label="Compound Row shorthand"]') as HTMLInputElement;
    type(line, "G:4, S:3 C:2 PILLOW WT:112");
    act(() => (line.form as HTMLFormElement).dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(cell(el, "Compound Row Gap").value).toBe("4");
    expect(cell(el, "Compound Row Seat").value).toBe("3");
    expect(cell(el, "Compound Row load in pounds").value).toBe("112");
    expect(el.textContent).toContain("Kept as a note on this machine: PILLOW");
    // Seat 5 → 3 changes a saved value, but a chart copy carries its own reason.
    expect(el.querySelector(".fit-save__reason")).toBeNull();

    await clickAsync(button(el, "Save set-up"));
    expect(spy.commits[0].legacy).toBe(true);
    expect(spy.commits[0].plan.entries[0]).toMatchObject({
      settings: { Gap: "4", Seat: "3", Chest: "2" },
      sources: { Gap: "legacy", Seat: "legacy", Chest: "legacy" },
      weight: { current: 112, stampStart: true },
      note: "PILLOW",
    });
  });

  it("filters to the machines in the client's routines", () => {
    const el = mount();
    click(button(el, "In routines"));
    expect([...el.querySelectorAll(".fit-row__name")].map((n) => n.textContent)).toEqual(["Compound Row"]);
  });

  it("types into the active cell from the docked keypad on a touch device, and moves on with Next", () => {
    (window as any).matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    const el = mount();
    expect(el.querySelector(".fit-pad")).toBeNull(); // no cell is active yet
    act(() => cell(el, "Leg Press Seat").focus());
    expect(el.querySelector(".fit-pad")?.getAttribute("aria-label")).toBe("Keypad for Leg Press, Seat");
    expect(cell(el, "Leg Press Seat").getAttribute("inputmode")).toBe("none"); // the system keyboard stays down

    const key = (label: string) => [...el.querySelectorAll(".fit-pad__key")].find((k) => k.textContent?.trim() === label)!;
    click(key("1"));
    click(key("2"));
    expect(cell(el, "Leg Press Seat").value).toBe("12");
    click(button(el, /^Next/));
    expect(el.querySelector(".fit-pad")?.getAttribute("aria-label")).toBe("Keypad for Leg Press, Load (lb)");
    // Arriving on a cell, the first key replaces what was there.
    click(key("8"));
    click(key("0"));
    expect(cell(el, "Leg Press load in pounds").value).toBe("80");
  });

  it("opens on Check when the Machine fit report sent the leader here, once", () => {
    // Nothing prescribed is set up, so on its own this client would open in Set up.
    window.sessionStorage.setItem("msf_fit_open_mode:judy", "check");
    const el = mount();
    expect(el.querySelector(".fit")?.getAttribute("data-mode")).toBe("check");
    // Read once and removed: the next visit opens the ordinary way.
    expect(window.sessionStorage.getItem("msf_fit_open_mode:judy")).toBeNull();
  });

  it("reads nothing until the segment has been opened", () => {
    const el = mount({}, false);
    expect(spy.enabled.every((e) => e === false)).toBe(true);
    expect(el.textContent).not.toContain("Loading what similar clients use");
  });
});
