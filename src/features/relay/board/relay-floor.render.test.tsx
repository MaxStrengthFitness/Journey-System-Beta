// @vitest-environment jsdom
/**
 * RELAY ON AN IPAD — what used to be hover-only or hidden (voice review
 * follow-up, Sep 27 2026).
 *
 *   - The opened day strip lists the day's sessions with each client's whole
 *     name and time; the ribbon's blocks have room for a first name, and the
 *     rest was a hover tooltip.
 *   - The Context Panel opens beside the Floor with its foot in view, and
 *     nothing floats over it: since the Relay room (Sep 28 2026) the
 *     floating Capture button is gone, and Ask and + are in the one header.
 *   - Capture says what the chosen kind of ask means, in view.
 *
 * The rename of the teammates line ("Just now", was "Pulse") is asserted in
 * relay/planner.render.test.tsx, which mounts the whole shell.
 *
 * And one sentence on My Studio → Studio, which needs the same shell: when
 * the Mindbody sync needs attention, a studio leader is sent to Operations →
 * Mindbody (it used to say that was an administrator's screen), and a
 * trainer with the grant, who runs My Studio but not Operations, is told to
 * ask their studio leader.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "t-lead" } },
  functions: {},
}));

vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "s1",
    activeStudio: { id: "s1", name: "Solon" },
    availableStudios: [{ id: "s1", name: "Solon" }],
    network: null,
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/"), id: "id" });
  const emptySnap = {
    docs: [],
    size: 0,
    empty: true,
    forEach: () => {},
    metadata: { fromCache: false, hasPendingWrites: false },
    docChanges: () => [],
  };
  const emptyDoc = { exists: () => false, data: () => undefined, id: "id", metadata: { fromCache: false } };
  return {
    collection: ref,
    collectionGroup: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    orderBy: () => ({}),
    limit: () => ({}),
    startAfter: () => ({}),
    documentId: () => "__name__",
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? emptyDoc : emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    getDoc: async () => emptyDoc,
    setDoc: async () => {},
    updateDoc: async () => {},
    addDoc: async () => ({ id: "new" }),
    deleteDoc: async () => {},
    writeBatch: () => ({ set() {}, update() {}, delete() {}, commit: async () => {} }),
    serverTimestamp: () => new Date(),
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
    increment: (n: number) => n,
    deleteField: () => null,
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d },
  };
});

import { ToastProvider } from "../../../contexts/ToastContext";
import { DayStrip } from "./NowBar";
import { nowContext, type NowSession } from "./now-context";
import { RelayProvider, type PanelContent, type RelayContextValue } from "./RelayContext";
import { PlannerView } from "../PlannerView";
import { MyStudioView } from "../../my-studio/MyStudioView";

let mounted: Root | null = null;
let host: HTMLElement | null = null;

async function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  mounted = createRoot(host);
  await act(async () => {
    mounted!.render(<ToastProvider>{node}</ToastProvider>);
  });
  await settle();
  return host;
}

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function click(el: Element | undefined | null) {
  expect(el).toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

afterEach(() => {
  act(() => mounted?.unmount());
  host?.remove();
  mounted = null;
  host = null;
  document.body.innerHTML = "";
});

const session = (id: string, clientName: string, startMin: number, endMin: number): NowSession => ({
  id,
  clientId: id,
  clientName,
  startMin,
  endMin,
  status: "Scheduled",
});

describe("the opened day strip", () => {
  it("lists each session with the client's whole name and times, in view rather than on hover", async () => {
    const sessions = [
      session("a", "Margaret Ellsworth-Van Buren", 7 * 60, 7 * 60 + 30),
      session("b", "Sam Lee", 9 * 60, 9 * 60 + 30),
    ];
    // 9:10: the first session is past, the second is under way.
    const h = await render(<DayStrip now={nowContext(sessions, 9 * 60 + 10, "2026-09-27")} />);
    const items = [...h.querySelectorAll(".ds__item")];
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Margaret Ellsworth-Van Buren");
    expect(items[0].textContent).toContain("7:00 AM to 7:30 AM");
    expect(items[0].classList.contains("ds__item--past")).toBe(true);
    // A past session is dimmed, never called done (a booking is done when Journey logged it).
    expect(items[0].textContent).not.toMatch(/done/i);
    expect(items[1].textContent).toContain("Sam Lee");
    expect(items[1].textContent).toContain("Now");
    // Nothing is left only in a tooltip.
    expect(h.querySelectorAll("[title]")).toHaveLength(0);
    expect(h.querySelector(".ds__list")?.getAttribute("aria-label")).toBe("Your sessions today, 2");
  });

  it("says the day is a gap and lists nothing when there are no sessions", async () => {
    const h = await render(<DayStrip now={nowContext([], 9 * 60, "2026-09-27")} />);
    expect(h.textContent).toContain("The whole day is a gap");
    expect(h.querySelector(".ds__list")).toBeNull();
  });
});

describe("the Context Panel, and nothing floating over it", () => {
  const relay = (panel: PanelContent | null): RelayContextValue => ({
    studioId: "s1",
    studioName: "Solon",
    authTrainer: { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "s1" } as never,
    uid: "t-lead",
    trainers: [],
    clients: [],
    schedules: [],
    sessions: [],
    machines: [],
    now: nowContext([], 9 * 60, "2026-09-27"),
    canLead: true,
    panel,
    openCapture: () => {},
    openPanel: () => {},
    closePanel: () => {},
  });

  it("opens the panel beside the Floor with its Done in view", async () => {
    const panel: PanelContent = { title: "An ask", body: <p>Body</p>, foot: <button type="button">Done</button> };
    const h = await render(
      <RelayProvider value={relay(panel)}>
        <div className="pl">
          <PlannerView authTrainer={relay(panel).authTrainer} clients={[]} trainers={[]} tab="floor" />
        </div>
      </RelayProvider>,
    );
    expect(h.querySelector(".cp")).not.toBeNull();
    expect(h.querySelector(".cp__foot")?.textContent).toContain("Done");
  });

  it("has no floating Capture button any more: Ask and + are in the header (Relay room, Sep 28 2026)", async () => {
    // The button floated over the board's last card and the panel's foot; the
    // one header carries Ask (the team) and + (just for you) instead.
    const lead = { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "s1" } as never;
    const h = await render(<MyStudioView authTrainer={lead} clients={[]} trainers={[lead]} />);
    expect(h.querySelector(".cf")).toBeNull();
    expect(h.querySelector(".msh__ask")).not.toBeNull();
    expect(h.querySelector(".msh__plus")).not.toBeNull();
  });
});

/** My Studio's section menu (the one header): open it and choose `name`. */
async function openSection(name: string) {
  await click(document.querySelector(".msh__sect"));
  await click([...document.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')].find((b) => b.textContent?.trim().startsWith(name)));
}

describe("Capture's kinds of ask", () => {
  it("says what the chosen kind means, in view, and follows the choice", async () => {
    const lead = { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "s1" } as never;
    const h = await render(<MyStudioView authTrainer={lead} clients={[]} trainers={[lead]} />);
    if (h.querySelector(".msh__sect-name")?.textContent !== "Relay") await openSection("Relay");
    // The header's + → "A to-do for me" opens the composer; the Floor is one tap in it.
    await click(h.querySelector(".msh__plus"));
    await click([...document.querySelectorAll('[role="menuitem"]')].find((b) => b.textContent?.includes("A to-do for me")));
    const sheet = document.body;
    await click([...sheet.querySelectorAll("button")].find((b) => b.textContent === "The Board"));
    // The default kind is a to-do.
    expect(sheet.querySelector("#cs-kind-hint")?.textContent).toBe("Something anyone can pick up and finish");
    const headsUp = [...sheet.querySelectorAll<HTMLButtonElement>(".rk-chip")].find((b) => b.textContent === "Heads-up");
    await click(headsUp);
    expect(sheet.querySelector("#cs-kind-hint")?.textContent).toBe("Something the studio should know");
    expect(headsUp?.getAttribute("aria-describedby")).toBe("cs-kind-hint");
    // No kind chip carries its meaning only in a tooltip.
    expect([...sheet.querySelectorAll(".rk-chip[title]")]).toHaveLength(0);
  });
});

describe("My Studio → Studio, when the Mindbody sync needs attention", () => {
  const lead = { id: "t-lead", fullName: "Lee Leader", role: "HeadTrainer", primaryHomeStudioId: "s1" } as never;
  const granted = { id: "t-lead", fullName: "Gia Granted", role: "LifeTransformer", primaryHomeStudioId: "s1", managedStudioIds: ["s1"] } as never;

  async function openStudio(person: unknown) {
    const h = await render(<MyStudioView authTrainer={person as never} clients={[]} trainers={[person as never]} />);
    await openSection("Studio");
    return h;
  }

  it("sends a studio leader to Operations → Mindbody, which they can open", async () => {
    // The test studio has no Mindbody Site ID, so the panel names a problem.
    const h = await openStudio(lead);
    expect(h.textContent).toContain("No Mindbody Site ID.");
    expect(h.textContent).toContain("To pull the schedule by hand, or read the event log, open Operations → Mindbody.");
    expect(h.textContent).not.toContain("an administrator's screen");
  });

  it("tells a trainer with the grant, who cannot open Operations, to ask their studio leader", async () => {
    const h = await openStudio(granted);
    expect(h.textContent).toContain("which your studio leader can open. Ask them.");
    expect(h.textContent).not.toContain("open Operations → Mindbody.");
  });

  it("names Operations → Insights → Hours for the session length", async () => {
    const h = await openStudio(lead);
    expect(h.textContent).toContain("the slot Operations → Insights → Hours counts");
    expect(h.textContent).not.toMatch(/Operations → Hours/);
  });
});
