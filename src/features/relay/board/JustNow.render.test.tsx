// @vitest-environment jsdom
/**
 * JUST NOW, MOUNTED (Relay room, Sep 28 2026): the teammates' lines as a
 * still list, each with its heart, which was the Now Bar's six-second ticker.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const writes = vi.hoisted(() => ({ updates: [] as unknown[] }));
vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "t-ioreth" } }, functions: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  updateDoc: async (_ref: unknown, data: unknown) => {
    writes.updates.push(data);
  },
  addDoc: async () => ({ id: "n1" }),
  setDoc: async () => {},
  deleteField: () => "__delete__",
  serverTimestamp: () => new Date(),
  Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
  increment: (n: number) => n,
  FieldPath: class {},
  writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
}));

import { JustNow } from "./JustNow";
import { publishPulse, resetPulseStore, type PulseEvent } from "./pulse";
import { RelayProvider, type RelayContextValue } from "./RelayContext";
import { nowContext } from "./now-context";

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
  resetPulseStore();
  writes.updates = [];
});

const relay: RelayContextValue = {
  studioId: "s1",
  studioName: "Westlake",
  authTrainer: { id: "t-ioreth", fullName: "Ioreth Healer" } as never,
  uid: "t-ioreth",
  trainers: [],
  clients: [],
  schedules: [],
  sessions: [],
  machines: [],
  now: nowContext([], 14 * 60, "2026-09-28"),
  canLead: false,
  panel: null,
  openCapture: () => {},
  openPanel: () => {},
  closePanel: () => {},
};

const at = (hhmm: string) => new Date(`2026-09-28T${hhmm}:00-04:00`).getTime();
const ev = (id: string, who: string, whoId: string, what: string, hhmm: string, kudos?: Record<string, true>): PulseEvent => ({
  id,
  at: at(hhmm),
  whoId,
  who,
  what,
  target: { kind: "instance", id: `i-${id}` },
  kudos,
});

async function render(max?: number) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <RelayProvider value={relay}>
        <JustNow studioId="s1" max={max} />
      </RelayProvider>,
    );
  });
  return host;
}

describe("Just now", () => {
  it("says the floor is quiet when nobody has done anything yet today", async () => {
    const h = await render();
    expect(h.textContent).toContain("Just now");
    expect(h.textContent).toContain("Quiet so far today.");
  });

  it("lists what teammates did, whole and still, each with a heart to send", async () => {
    publishPulse("s1", [
      ev("a", "Beregond", "t-beregond", "wiped down 19 machines", "14:09"),
      ev("b", "Mablung", "t-mablung", 'closed "Spare seat pin for the Hip Adductor"', "13:52"),
    ]);
    const h = await render();
    const lines = [...h.querySelectorAll(".rjn__item")];
    expect(lines).toHaveLength(2);
    expect(lines[0].textContent).toContain("Beregond wiped down 19 machines · 2:09 PM");
    const heart = lines[0].querySelector<HTMLButtonElement>(".rjn__kudos");
    expect(heart?.getAttribute("aria-label")).toBe("Send kudos to Beregond");
    await act(async () => heart!.click());
    expect(writes.updates).toContainEqual({ "kudos.t-ioreth": true });
    // Nothing moves on its own: no ticker, no timer swapping the line.
    expect(h.querySelector(".pt")).toBeNull();
  });

  it("shows your own hearts on your line, and offers you no heart to send yourself", async () => {
    publishPulse("s1", [ev("c", "Ioreth", "t-ioreth", "restocked the towels", "12:30", { "t-beregond": true, "t-mablung": true })]);
    const h = await render();
    expect(h.querySelector("button.rjn__kudos")).toBeNull();
    expect(h.querySelector(".rjn__kudos--mine")?.getAttribute("aria-label")).toBe("2 kudos for you");
  });

  it("keeps to a few lines and says how many more there were", async () => {
    publishPulse("s1", [
      ev("a", "Beregond", "t-beregond", "one", "14:09"),
      ev("b", "Mablung", "t-mablung", "two", "14:00"),
      ev("c", "Damrod", "t-damrod", "three", "13:00"),
    ]);
    const h = await render(2);
    expect(h.querySelectorAll(".rjn__item")).toHaveLength(2);
    expect(h.textContent).toContain("1 more earlier today.");
  });
});
