// @vitest-environment jsdom
/**
 * LIMBO MOUNTS — grouped by where the events came from with the registry's
 * studio chosen to start with, Dismiss done at once with Undo, and a read
 * that failed saying so instead of "Nothing in Limbo".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LimboEntry, Studio } from "../../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
let answer: "entries" | "fails" = "entries";
const entries = (): LimboEntry[] =>
  [
    { id: "e1", eventId: "e1", eventType: "x", kind: "booking", siteId: "29068", locationId: "5", clientId: "1", reason: "No studio claimed location 5", summary: { clientName: "Hamfast Gamgee", rawStartDateTime: "2026-09-29T09:00:00" } },
    { id: "e2", eventId: "e2", eventType: "x", kind: "booking", siteId: "29068", locationId: "5", clientId: "2", reason: "No studio claimed location 5", summary: { clientName: "Rosie Cotton", rawStartDateTime: "2026-09-29T09:30:00" } },
    { id: "e3", eventId: "e3", eventType: "x", kind: "client", siteId: "29068", locationId: "9", clientId: "3", reason: "Unknown location", summary: { clientName: "Farmer Maggot" } },
  ] as LimboEntry[];

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } } }));
vi.mock("../../../lib/mindbody-limbo", () => ({
  LIMBO_QUEUE: "mindbodyLimbo",
  fetchOpenLimboEntries: async () => {
    if (answer === "fails") throw new Error("Missing or insufficient permissions.");
    return entries();
  },
  dismissLimboEntry: async (e: LimboEntry) => void calls.push(`dismiss:${e.id}`),
  releaseLimboBooking: async (e: LimboEntry, s: Studio) => {
    calls.push(`release:${e.id}:${s.id}`);
    return { startTimeIso: "2026-09-29T13:00:00.000Z" };
  },
  releaseLimboClient: async (e: LimboEntry, s: Studio) => void calls.push(`home:${e.id}:${s.id}`),
}));
vi.mock("./limbo-undo", () => ({ reopenLimboEntry: async (id: string) => void calls.push(`reopen:${id}`) }));

import { AdminLimboQueue } from "./AdminLimboQueue";

const studios = [
  { id: "westlake", name: "Westlake", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyLocationId: "3" },
  { id: "strongsville", name: "Strongsville", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyLocationId: "5" },
] as unknown as Studio[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  calls.length = 0;
  answer = "entries";
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(onChanged?: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<AdminLimboQueue studios={studios} onChanged={onChanged} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const click = async (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
};
const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim().startsWith(text));

describe("Limbo", () => {
  it("groups the events by site and location, and starts each picker on the registry's studio", async () => {
    const el = await mount();
    const titles = [...el.querySelectorAll(".adm-panel__title")].map((t) => t.textContent);
    expect(titles).toEqual(["Site 29068 · location 5", "Site 29068 · location 9"]);
    expect(el.textContent).toContain("2 bookings. The registry says this is Strongsville.");
    expect(el.textContent).toContain("1 client record. No studio claims it yet");
    const picker = el.querySelector<HTMLSelectElement>("#limbo-studio-e1")!;
    expect(picker.value).toBe("strongsville");
    expect(el.textContent).toContain("Lands at");
    expect(button(el, "Release to Strongsville")).toBeTruthy();
    // No suggestion: the picker waits for a person.
    expect(el.querySelector<HTMLSelectElement>("#limbo-studio-e3")!.value).toBe("");
  });

  it("releases on the tap, to the studio in the picker", async () => {
    const changed = vi.fn();
    const el = await mount(changed);
    await click(button(el, "Release to Strongsville"));
    expect(calls).toEqual(["release:e1:strongsville"]);
    expect(el.textContent).toContain("Released to Strongsville");
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("dismisses at once, and Undo puts the event back", async () => {
    const el = await mount();
    await click(el.querySelector('button[aria-label="Dismiss Rosie Cotton\'s booking without releasing it"]'));
    expect(calls).toEqual(["dismiss:e2"]);
    expect(el.querySelector("#limbo-studio-e2")).toBeNull();
    expect(el.textContent).toContain("Dismissed Rosie Cotton's booking. Mindbody still has it.");
    await click(button(el, "Undo"));
    expect(calls).toEqual(["dismiss:e2", "reopen:e2"]);
    expect(el.querySelector("#limbo-studio-e2")).not.toBeNull();
    expect(el.textContent).not.toContain("Dismissed Rosie Cotton's booking.");
  });

  it("says a read that failed failed, never Nothing in Limbo", async () => {
    answer = "fails";
    const el = await mount();
    expect(el.textContent).toContain("Couldn't read Limbo just now, so it may not be empty.");
    expect(el.textContent).not.toContain("Nothing in Limbo");
    answer = "entries";
    await click(button(el, "Try again"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(el.querySelector("#limbo-studio-e1")).not.toBeNull();
  });
});
