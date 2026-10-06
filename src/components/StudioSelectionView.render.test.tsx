// @vitest-environment jsdom
/**
 * The greeting and the studio picker, MOUNTED (the front door, Oct 3 2026).
 *
 * After a sign-in the iPad's studio (else home) greets the person instead of
 * opening by itself; the greeting says whose iPad it is with the way out; one
 * button goes in; and someone with no studio to greet them with gets the
 * picker. Today's lines come from useTodayGlance, mocked here: its sentences
 * are today-glance.test.ts's.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: { uid: "aj" } } }));
vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(async () => ({ id: "r" })),
  collection: vi.fn(),
  getDocs: vi.fn(async () => ({ forEach: () => {} })),
  query: vi.fn(),
  serverTimestamp: () => "ts",
  where: vi.fn(),
}));
vi.mock("../contexts/ToastContext", () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));
vi.mock("../lib/studio-roster-count", () => ({ getStudioClientCount: vi.fn(async () => 139) }));
vi.mock("../features/demo-mode/SetUpDemoCard", () => ({ SetUpDemoCard: () => null }));
vi.mock("../features/front-door/useTodayGlance", () => ({
  useTodayGlance: (studio: { id?: string } | null) => ({
    loading: false,
    glance: studio ? { booked: 22, mine: 5, next: { at: new Date("2026-10-03T13:40:00Z"), clientName: "Jane Doe" }, allStarted: false } : null,
    openJobs: 3,
  }),
}));

import { StudioSelectionView } from "./StudioSelectionView";
import type { Studio, Trainer } from "../types";

const studios = [
  { id: "strongsville", name: "Strongsville", timezone: "America/New_York" },
  { id: "westlake", name: "Westlake", timezone: "America/New_York" },
  { id: "solon", name: "Solon", timezone: "America/New_York" },
] as Studio[];
const aj = {
  id: "aj",
  fullName: "Austin Jurgens",
  role: "LifeTransformer",
  primaryHomeStudioId: "strongsville",
  accessibleStudioIds: ["strongsville", "westlake"],
  activeGuestStudioIds: [],
} as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => {
  localStorage.clear();
  // Instant doors: the door's timing is the CSS's, not this test's.
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as any;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount(props: Partial<Parameters<typeof StudioSelectionView>[0]> = {}) {
  const calls = { select: vi.fn(), back: vi.fn(), signOut: vi.fn(), ops: vi.fn() };
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StudioSelectionView
        studios={studios}
        trainers={[aj]}
        authTrainer={aj}
        onSelectTrainer={calls.select}
        onBack={calls.back}
        onSignOut={calls.signOut}
        onGoToAdmin={calls.ops}
        greet
        {...props}
      />,
    );
  });
  return { el: host, calls };
}

const button = (el: HTMLElement, text: string) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement | undefined;

describe("the greeting", () => {
  it("greets the person by name with their home studio and today there", async () => {
    const { el } = await mount();
    expect(el.querySelector("h1")?.textContent).toMatch(/Good (morning|afternoon|evening),Austin\./);
    expect(el.textContent).toContain("Your home studio");
    expect(el.textContent).toContain("Your next client, Jane Doe · 5 yours today");
    expect(el.textContent).toContain("22");
    expect(el.textContent).toContain("team jobs open on the Board");
  });

  it("says whose iPad it is, and 'Not you?' signs out", async () => {
    const { el, calls } = await mount();
    const who = el.querySelector<HTMLButtonElement>('button[aria-label^="Signed in as Austin Jurgens"]')!;
    expect(who).toBeTruthy();
    await act(async () => who.click());
    expect(calls.signOut).toHaveBeenCalled();
  });

  it("goes in with one tap, and remembers the studio on the iPad", async () => {
    const { el, calls } = await mount();
    await act(async () => button(el, "Start at Strongsville")!.click());
    expect(calls.select).toHaveBeenCalledWith(aj, "strongsville");
    expect(JSON.parse(localStorage.getItem("journey_device_studio")!)).toEqual({ id: "strongsville", name: "Strongsville" });
  });

  it("greets with the iPad's studio over home, and offers the other as a button", async () => {
    localStorage.setItem("max_strength_default_studio_id", "westlake");
    const { el, calls } = await mount();
    expect(el.textContent).toContain("This iPad's studio");
    expect(button(el, "Start at Westlake")).toBeTruthy();
    await act(async () => button(el, "Strongsville")!.click());
    expect(calls.select).toHaveBeenCalledWith(aj, "strongsville");
  });

  it("has no door to Operations, even for a leader: leaders switch from the Hub", async () => {
    const leader = { ...aj, role: "StudioLeader" } as Trainer;
    const { el } = await mount({ authTrainer: leader, trainers: [leader] });
    expect(button(el, "Operations")).toBeUndefined();
  });
});

describe("the picker", () => {
  it("is what someone with no studio to greet them with sees", async () => {
    const guest = { ...aj, primaryHomeStudioId: "" } as unknown as Trainer;
    const { el } = await mount({ authTrainer: guest, trainers: [guest] });
    expect(el.querySelector("h1")?.textContent).toBe("Where are you today?");
    expect(button(el, "Start at Strongsville")).toBeTruthy();
    expect(button(el, "Westlake")).toBeTruthy();
    expect(el.textContent).toContain("you don't work at");
  });

  it("is Change studio from inside the app, with the way back", async () => {
    const { el, calls } = await mount({ greet: false, currentStudioId: "westlake" });
    expect(el.querySelector("h1")?.textContent).toBe("Where are you today?");
    await act(async () => button(el, "Back to Westlake")!.click());
    expect(calls.back).toHaveBeenCalled();
  });
});

/*
 * WHILE THE LISTS ARE BEING READ (the speed round, Oct 5 2026, R4). The app
 * now opens on the trainer record, and the studios, networks and trainers
 * arrive beside it. Until a list has answered the picker waits ("Checking
 * you in", with the way out), and never says a thing it would have to guess.
 */
describe("while the lists are being read", () => {
  it("waits for the studios instead of saying there are none", async () => {
    const { el, calls } = await mount({ studios: [], studiosKnown: false });
    expect(el.textContent).toContain("Checking you in");
    expect(el.textContent).not.toContain("No studios yet");
    await act(async () => button(el, "Not you? Sign out")!.click());
    expect(calls.signOut).toHaveBeenCalled();
  });

  it("says there are none only once the studios have answered", async () => {
    const { el } = await mount({ studios: [], studiosKnown: true });
    expect(el.textContent).toContain("No studios yet");
  });

  it("waits for the networks before saying you're on no team", async () => {
    const stranger = { ...aj, primaryHomeStudioId: "", accessibleStudioIds: [] } as unknown as Trainer;
    const waiting = await mount({ authTrainer: stranger, trainers: [stranger], networksKnown: false });
    expect(waiting.el.textContent).toContain("Checking you in");
    expect(waiting.el.textContent).not.toContain("Not on a studio's team yet");
    act(() => root?.unmount());
    host?.remove();
    const answered = await mount({ authTrainer: stranger, trainers: [stranger], networksKnown: true });
    expect(answered.el.textContent).toContain("Not on a studio's team yet");
  });

  it("goes in on your own studios while the networks are still being read", async () => {
    const { el } = await mount({ networksKnown: false });
    expect(button(el, "Start at Strongsville")).toBeTruthy();
  });

  it("gives no team size off a trainers list that hasn't answered", async () => {
    const guest = { ...aj, primaryHomeStudioId: "" } as unknown as Trainer;
    const unknown = await mount({ authTrainer: guest, trainers: [], trainersKnown: false });
    expect(unknown.el.textContent).not.toContain("on the team");
    act(() => root?.unmount());
    host?.remove();
    const known = await mount({ authTrainer: guest, trainers: [guest], trainersKnown: true });
    expect(known.el.textContent).toContain("on the team");
  });
});
