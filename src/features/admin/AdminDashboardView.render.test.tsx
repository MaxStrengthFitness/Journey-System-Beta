// @vitest-environment jsdom
/**
 * THE OPERATIONS SHELL MOUNTS — five destinations for a studio's leader and
 * for an administrator, every page a tap away without a throw over an empty
 * Firestore, a client opened inside Operations with Back to the same page,
 * and the place remembered across a visit to her full profile (the
 * redesign's Operations room, Sep 28 2026). Catches a page whose component
 * needs a provider the shell does not give it (the Floor's editor was written
 * for the My Studio shell), and a menu that lists a page it cannot render.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));
vi.mock("../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({
    activeStudioId: "solon",
    activeStudio: { id: "solon", name: "Solon", timezone: "America/New_York" },
    availableStudios: [{ id: "solon", name: "Solon" }],
    setActiveStudioId: () => {},
    isChangingStudio: false,
  }),
}));
vi.mock("../../lib/authed-fetch", () => ({ authedFetch: async () => ({ ok: true, json: async () => ({}) }) }));
vi.mock("../../contexts/MindbodyHealthContext", () => ({
  useMindbodyHealth: () => ({
    status: "offline",
    lastSuccessfulEventAt: null,
    lastFailureAt: null,
    dlqDepth: 0,
    signatureFailures24h: 0,
    webhookSubscriptionActive: false,
    hydrationP95LatencyMs: 0,
    updatedAt: null,
    isLoading: false,
    hasData: false,
    subscriptionError: null,
  }),
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  const emptySnap = { docs: [], size: 0, empty: true, forEach: () => {}, docChanges: () => [], metadata: { fromCache: false } };
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
    onSnapshot: (target: { path: string }, a: unknown, b?: unknown, c?: unknown) => {
      const next = (typeof a === "function" ? a : b) as (s: unknown) => void;
      void c;
      const isDoc = target.path.split("/").length % 2 === 0;
      const t = setTimeout(() => next(isDoc ? emptyDoc : emptySnap), 0);
      return () => clearTimeout(t);
    },
    getDocs: async () => emptySnap,
    getDoc: async () => emptyDoc,
    getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
    updateDoc: async () => {},
    setDoc: async () => {},
    addDoc: async () => ({ id: "new" }),
    deleteDoc: async () => {},
    writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
    serverTimestamp: () => new Date(),
    Timestamp: { now: () => new Date(), fromDate: (d: Date) => d, fromMillis: (ms: number) => new Date(ms) },
  };
});

import { AdminDashboardView } from "./AdminDashboardView";
import type { Client, Studio, Trainer } from "../../types";
import { DEMO_STUDIO_ID } from "../demo-mode/constants";
import { resetOperationsMemory } from "./shell/place-memory";
import { forgetPersonalMemory } from "../sign-out/memory";

const studios = [{ id: "solon", name: "Solon", timezone: "America/New_York", mindbodySiteId: "5746957", mindbodyMode: "live" }] as unknown as Studio[];
const lead = { id: "lead", fullName: "Lee Leader", initials: "LL", role: "HeadTrainer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const admin = { id: "adm", fullName: "Ada Admin", initials: "AA", role: "Admin", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const trainer = { id: "lt", fullName: "Tia Trainer", initials: "TT", role: "LifeTransformer", primaryHomeStudioId: "solon", accessibleStudioIds: ["solon"] } as unknown as Trainer;
const granted = { ...trainer, id: "lt2", managedStudioIds: ["solon"] } as unknown as Trainer;
const demoStudio = { id: DEMO_STUDIO_ID, name: "Demo Mode", isDemo: true, timezone: "America/New_York" } as unknown as Studio;

const dayKey = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
/** Goldberry, twice a week and not seen for 16 days with nothing booked: At risk, a row on Today's Slipping away. */
const goldberry = {
  id: "c-gold",
  firstName: "Goldberry",
  lastName: "River",
  isActive: true,
  homeStudioId: "solon",
  renewal: {
    version: 1,
    cycleKey: null,
    renewalOnBooks: null,
    situation: "on-track",
    conversationDue: false,
    chargeWarning: false,
    focusDate: "2027-01-05",
    flags: [],
    pacePerWeek: 2,
    lastVisitDate: dayKey(16),
    nextBookingDate: null,
    sessionsLeft: 40,
    proof: { weeksObserved: 12, weeksAttended: 12 },
    coachIds: [],
    dataGaps: [],
    computedAt: new Date(),
  },
} as unknown as Client;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  resetOperationsMemory();
});

async function mount(
  who: Trainer,
  isAdmin: boolean,
  activeStudioId = "solon",
  studioList: Studio[] = studios,
  extra: { onOpenStudioTasks?: () => void; onNavigateProfile?: (id: string) => void; clients?: Client[] } = {},
) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const { clients = [], ...rest } = extra;
  await act(async () => {
    root!.render(
      <StrictMode>
        <AdminDashboardView authTrainer={who} studios={studioList} networks={[]} trainers={[who]} isAdmin={isAdmin} clients={clients} machines={[]} schedules={[]} activeStudioId={activeStudioId} {...rest} />
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

async function unmountAndRemount(fn: () => Promise<HTMLDivElement>) {
  act(() => root?.unmount());
  host?.remove();
  return fn();
}

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
};

const text = (b: Element) => (b.textContent ?? "").trim();
const tabLabels = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>(".ops-tabs .ops-tab")].map(text);
const sideLabels = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>(".ops-side .ops-nav__i, .ops-side .ops-nav__s")].map(text);
const sideButton = (el: HTMLElement, label: string) => [...el.querySelectorAll<HTMLButtonElement>(".ops-side .ops-nav__i, .ops-side .ops-nav__s")].find((b) => text(b) === label);
const clickSide = async (el: HTMLElement, label: string) => {
  const btn = sideButton(el, label);
  expect(btn, `sidebar button "${label}"`).toBeTruthy();
  await act(async () => {
    btn!.click();
  });
  await settle();
};
const clickText = async (el: ParentNode, label: string) => {
  const btn = [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => text(b) === label || text(b).startsWith(label));
  expect(btn, `button "${label}"`).toBeTruthy();
  await act(async () => {
    btn!.click();
  });
  await settle();
};
const openSetupPages = async (el: HTMLElement) => {
  if (!sideButton(el, "Floor")) {
    const tog = el.querySelector<HTMLButtonElement>(".ops-side .ops-nav__tog");
    await act(async () => tog!.click());
  }
};

const FIVE = ["Today", "Week", "Month", "Clients", "Team", "Setup"];

describe("the Operations shell", () => {
  it("offers five destinations for a studio's leader, with the pages inside them, and opens on Today", async () => {
    const el = await mount(lead, false);
    expect(tabLabels(el)).toEqual(FIVE);
    expect(sideLabels(el)).toEqual(["Today", "Week", "Last week", "This week so far", "Week ahead", "Month", "Clients", "Journey", "Renewals", "Moments", "Trends", "Team", "This week", "Hours", "Setup"]);
    expect(el.querySelector(".ops-side [aria-current='page']")?.textContent).toBe("Today");
    expect(el.textContent).toContain("Today · Solon");
    // "Looking at" says where, even with nothing to choose.
    expect(el.querySelector(".ops-side .ops-look")?.textContent).toContain("Looking atSolon");
  });

  it("offers the same five to an administrator — the company tier lives on the Admins dashboard", async () => {
    const el = await mount(admin, true);
    expect(tabLabels(el)).toEqual(FIVE);
    await openSetupPages(el);
    // An administrator's Mindbody page is the whole estate.
    await clickSide(el, "Mindbody");
    expect(el.textContent).toContain("Studios linked");
  });

  it("every page opens for a leader", async () => {
    const el = await mount(lead, false);
    await clickSide(el, "Week");
    expect(el.querySelector(".adm-head__title")?.textContent).toBe("Last week");
    await clickSide(el, "This week so far");
    expect(el.querySelector(".ops-page")?.textContent).toContain("This week so far");
    expect(el.querySelector(".ops-page")?.textContent).toContain("Changes");
    await clickSide(el, "Week ahead");
    expect(el.textContent).toContain("The week ahead");
    await clickSide(el, "Journey");
    expect(el.querySelector("[aria-label='Client states']")).toBeTruthy();
    await clickSide(el, "Renewals");
    await clickSide(el, "Moments");
    expect(el.textContent).toContain("Show what is done");
    await clickSide(el, "Trends");
    expect(el.textContent).toContain("Not enough data yet");
    expect(el.textContent).toContain("What stands out");
    await clickSide(el, "Team");
    expect(el.querySelector(".ops-counts__line")?.textContent).toContain("on today");
    await clickSide(el, "Hours");
    expect(el.textContent).toContain("By trainer, by week");
    await clickSide(el, "Setup");
    expect(el.querySelector("nav[aria-label='Setup']")).toBeTruthy();
    await openSetupPages(el);
    await clickSide(el, "Floor");
    expect(el.textContent).toContain("Solon — Machines");
    expect(el.querySelector('[role="tablist"][aria-label="Floor view"]')).toBeTruthy();
    await clickSide(el, "Mindbody");
    expect(el.textContent).toContain("Solon — Mindbody");
    // The estate — every studio, worst first — is the administrator's, not the leader's.
    expect(el.textContent).not.toContain("Studios linked");
    await clickSide(el, "Announcements");
    expect(el.textContent).toContain("Post an announcement");
    await clickSide(el, "Data");
    await clickSide(el, "Rules");
    expect(el.textContent).toContain("The numbers behind every sentence on Operations.");
    await clickSide(el, "People & access");
    // Setup's pages each say where Back goes.
    await clickText(el, "Setup");
    expect(el.querySelector("nav[aria-label='Setup']")).toBeTruthy();
  });

  it("the tabs across the top reach the same pages, and the pages inside a destination sit under them", async () => {
    const el = await mount(lead, false);
    const tab = (label: string) => [...el.querySelectorAll<HTMLButtonElement>(".ops-tabs .ops-tab")].find((b) => text(b) === label)!;
    await act(async () => tab("Clients").click());
    await settle();
    const seg = el.querySelector("[aria-label='Clients pages']");
    expect([...(seg?.querySelectorAll("button") ?? [])].map(text)).toEqual(["Journey", "Renewals", "Moments", "Trends"]);
    await act(async () => [...seg!.querySelectorAll<HTMLButtonElement>("button")].find((b) => text(b) === "Trends")!.click());
    await settle();
    expect(el.textContent).toContain("What stands out");
    // Setup opens on its own list upright, never a row of segments.
    await act(async () => tab("Setup").click());
    await settle();
    expect(el.querySelector("[aria-label='Setup pages']")).toBeNull();
    expect(el.querySelector("nav[aria-label='Setup']")).toBeTruthy();
  });
});

/*
 * A CLIENT OPENS INSIDE OPERATIONS, and Operations remembers where you were
 * (the pins "It forgets where you were" and "Tapping a client leaves
 * Operations").
 */
describe("a client, opened inside Operations", () => {
  it("opens beside the menu with her facts, and Back returns to the same page", async () => {
    const profiles: string[] = [];
    const el = await mount(lead, false, "solon", studios, { clients: [goldberry], onNavigateProfile: (id) => profiles.push(id) });
    // Today's attendance watch names her; the name is the door.
    const name = [...el.querySelectorAll<HTMLButtonElement>(".adm-ov__row-btn")].find((b) => b.textContent?.includes("Goldberry River"));
    expect(name).toBeTruthy();
    await act(async () => name!.click());
    await settle();
    const page = el.querySelector("section.ops-client");
    expect(page?.textContent).toContain("Goldberry River");
    expect(page?.textContent).toContain("Last in");
    expect(page?.textContent).toContain("Renewal:");
    // Her journey and her case: At risk, past the studio's 14-day line, owned by a leader (no usual trainer on record).
    expect(page?.querySelector(".ops-case")?.textContent).toContain("At risk");
    expect(page?.querySelector(".ops-case")?.textContent).toContain("past the studio's 14-day line");
    expect(page?.querySelector(".ops-case")?.textContent).toContain("Owner: A leader");
    // The page she was opened from is kept, hidden, not unmounted.
    expect(el.querySelector(".ops-page")?.hasAttribute("hidden")).toBe(true);
    expect(el.textContent).toContain("Today · Solon");
    // Her full profile is one tap further, in the app.
    await clickText(page!, "Open full profile");
    expect(profiles).toEqual(["c-gold"]);
    // Back says where it goes, and goes there.
    await clickText(page!, "Today");
    expect(el.querySelector("section.ops-client")).toBeNull();
    expect(el.querySelector(".ops-page")?.hasAttribute("hidden")).toBe(false);
  });

  it("coming back from her full profile lands on her again, and on the page behind her", async () => {
    const el = await mount(lead, false, "solon", studios, { clients: [goldberry], onNavigateProfile: () => {} });
    const name = [...el.querySelectorAll<HTMLButtonElement>(".adm-ov__row-btn")].find((b) => b.textContent?.includes("Goldberry River"));
    await act(async () => name!.click());
    await settle();
    // AppContent swaps Operations for the profile, then back.
    const again = await unmountAndRemount(() => mount(lead, false, "solon", studios, { clients: [goldberry], onNavigateProfile: () => {} }));
    expect(again.querySelector("section.ops-client")?.textContent).toContain("Goldberry River");
    await clickText(again.querySelector("section.ops-client")!, "Today");
    expect(again.textContent).toContain("Today · Solon");
  });

  it("remembers the page for the session, and forgets it at sign-out", async () => {
    let el = await mount(lead, false);
    await clickSide(el, "Moments");
    el = await unmountAndRemount(() => mount(lead, false));
    expect(el.querySelector(".ops-side [aria-current='page']")?.textContent).toBe("Moments");
    expect(el.textContent).toContain("Show what is done");
    // Clients remembers Moments while the leader looks at Team.
    await clickSide(el, "Team");
    const clients = [...el.querySelectorAll<HTMLButtonElement>(".ops-tabs .ops-tab")].find((b) => text(b) === "Clients")!;
    await act(async () => clients.click());
    await settle();
    expect(el.textContent).toContain("Show what is done");
    // The next person on a shared iPad starts on Today.
    forgetPersonalMemory();
    el = await unmountAndRemount(() => mount(lead, false));
    expect(el.querySelector(".ops-side [aria-current='page']")?.textContent).toBe("Today");
  });
});

/*
 * STAFF & ROLES' DOOR TO MY STUDIO → TEAM (voice review follow-up, final
 * review), now on Setup → People & access. The studio tier reads the list
 * and is sent to Team to run the team, but only someone who runs the studio
 * the app is in sees Team there: a head trainer visiting another studio
 * would land on Relay under a button that promised Team.
 */
describe("People & access' door to My Studio → Team", () => {
  const door = (el: HTMLElement) => [...el.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Open My Studio → Team");

  it("is offered to a leader of the studio the app is in, and opens My Studio", async () => {
    const opened: string[] = [];
    const el = await mount(lead, false, "solon", studios, { onOpenStudioTasks: () => opened.push("my-studio") });
    await openSetupPages(el);
    await clickSide(el, "People & access");
    expect(door(el)).toBeTruthy();
    await act(async () => door(el)!.click());
    expect(opened).toEqual(["my-studio"]);
  });

  it("is not offered to a head trainer visiting a studio they don't run", async () => {
    const visitor = { ...lead, id: "visit", primaryHomeStudioId: "westlake", accessibleStudioIds: ["westlake", "solon"] } as unknown as Trainer;
    const el = await mount(visitor, false, "solon", studios, { onOpenStudioTasks: () => {} });
    await openSetupPages(el);
    await clickSide(el, "People & access");
    expect(el.textContent).toContain("Letting people in");
    expect(door(el)).toBeUndefined();
  });
});

/*
 * THE REALM RULE, held by the shell (Oct 1 2026): from inside Demo Mode you
 * see Demo Mode and nothing else. Seen on the live app: an administrator in
 * Demo Mode had every real studio's sync row on Setup → Mindbody, and an
 * announcement composer that started on Everyone and offered every studio.
 */
describe("an administrator inside Demo Mode", () => {
  const westlake = { id: "westlake", name: "Westlake", timezone: "America/New_York", mindbodySiteId: "29068", mindbodyMode: "live" } as unknown as Studio;
  const everyStudio = [...studios, westlake, demoStudio];

  it("Setup → Mindbody shows Demo Mode's row and no real studio's", async () => {
    const el = await mount(admin, true, DEMO_STUDIO_ID, everyStudio);
    await openSetupPages(el);
    await clickSide(el, "Mindbody");
    const page = el.querySelector(".ops-page")?.textContent ?? "";
    expect(page).toContain("Demo Mode");
    expect(page).not.toContain("Solon");
    expect(page).not.toContain("Westlake");
  });

  it("Setup → Announcements addresses Demo Mode alone: no Everyone, no studio picker", async () => {
    const el = await mount(admin, true, DEMO_STUDIO_ID, everyStudio);
    await openSetupPages(el);
    await clickSide(el, "Announcements");
    expect(el.textContent).toContain("Post an announcement");
    expect(el.querySelector("#ann-scope")).toBeNull();
    expect(el.querySelector("#ann-studio")).toBeNull();
    const options = [...el.querySelectorAll("option")].map((o) => o.textContent ?? "");
    expect(options.some((o) => o.includes("Solon") || o.includes("Westlake"))).toBe(false);
  });

  it("outside Demo Mode the same administrator is offered every real studio and never Demo Mode", async () => {
    const el = await mount(admin, true, "solon", everyStudio);
    await openSetupPages(el);
    await clickSide(el, "Announcements");
    const scope = el.querySelector<HTMLSelectElement>("#ann-scope");
    expect(scope).toBeTruthy();
    expect(scope!.value).toBe("universal");
    await clickSide(el, "Mindbody");
    expect(el.querySelector(".ops-page")?.textContent ?? "").not.toContain("Demo Mode");
  });
});

/*
 * THE SHELL'S OWN GATE (sign-out round, Sep 24 2026). AppContent sends anyone
 * who may not open Operations to the Hub before this is drawn; the shell
 * refuses on its own as well, so no other door can open it for them.
 */
describe("the Operations shell's own gate", () => {
  it("refuses a Life Transformer at a real studio: a sentence, and no menu", async () => {
    const el = await mount(trainer, false);
    expect(tabLabels(el)).toEqual([]);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeTruthy();
    expect(el.textContent).toContain("Operations is for a studio's leaders");
    expect(el.textContent).not.toContain("Today · Solon");
  });

  it("refuses a trainer with the grant: it opens My Studio's leader sections, not Operations", async () => {
    const el = await mount(granted, false);
    expect(tabLabels(el)).toEqual([]);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeTruthy();
  });

  it("opens for a Life Transformer inside Demo Mode, where everyone has the run of it", async () => {
    const el = await mount(trainer, false, DEMO_STUDIO_ID, [...studios, demoStudio]);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeNull();
    expect(tabLabels(el)).toEqual(FIVE);
  });

  it("still opens for a studio's leader at a real studio", async () => {
    const el = await mount(lead, false);
    expect(el.querySelector('[data-testid="operations-closed"]')).toBeNull();
    expect(tabLabels(el)).toEqual(FIVE);
  });
});
