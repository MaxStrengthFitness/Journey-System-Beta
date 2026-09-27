// @vitest-environment jsdom
/**
 * OPERATIONS → STAFF & ROLES (voice review follow-up, Sep 27 2026).
 *
 *   · the studio tier reads the list and is sent to My Studio → Team, the
 *     one editor for a studio's own team; owners and administrators edit;
 *   · "All my studios" lists the reader's studios, never the company;
 *   · the Mindbody match is said to be per studio there — no "No Mindbody
 *     Site ID on this studio yet", no company-wide "No Mindbody match".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u-lead" } }, functions: {} }));

const fake = vi.hoisted(() => ({
  requests: [] as { id: string; data: Record<string, unknown> }[],
  fetches: 0,
  scope: null as null | { studioId: string | null; studios: { id?: string; name: string }[] },
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    collection: ref,
    doc: ref,
    query: (q: unknown) => q,
    where: () => ({}),
    onSnapshot: (_target: unknown, next: (s: unknown) => void) => {
      const docs = fake.requests.map((r) => ({ id: r.id, data: () => r.data }));
      const t = setTimeout(() => next({ docs }), 0);
      return () => clearTimeout(t);
    },
    setDoc: async () => {},
    updateDoc: async () => {},
    arrayUnion: (...v: unknown[]) => v,
    arrayRemove: (...v: unknown[]) => v,
  };
});

vi.mock("../../../lib/authed-fetch", () => ({
  authedFetch: async () => {
    fake.fetches += 1;
    return { ok: true, json: async () => ({ staff: [] }) };
  },
}));

vi.mock("../../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

vi.mock("../scope-context", () => ({
  useOperationsScope: () => ({
    readable: fake.scope?.studios ?? [],
    switchable: [],
    scope: fake.scope?.studioId === null ? { kind: "all" } : { kind: "studio", studioId: fake.scope?.studioId ?? "" },
    studioId: fake.scope?.studioId ?? null,
    studio: null,
    studios: fake.scope?.studios ?? [],
    canSpan: (fake.scope?.studios.length ?? 0) > 1,
    pickStudio: () => {},
    pickAll: () => {},
  }),
}));

import type { Studio, Trainer } from "../../../types";
import { AdminStaffTab } from "./AdminStaffTab";

const studios = [
  { id: "solon", name: "Solon", mindbodySiteId: "5746957" },
  { id: "westlake", name: "Westlake", mindbodySiteId: "29068" },
  { id: "strongsville", name: "Strongsville", mindbodySiteId: "29068" },
] as Studio[];

const person = (id: string, fullName: string, home: string): Trainer =>
  ({ id, fullName, initials: "XX", role: "LifeTransformer", primaryHomeStudioId: home, accessibleStudioIds: [home], activeGuestStudioIds: [] }) as Trainer;

const trainers = [person("t-sam", "Sam Solon", "solon"), person("t-wes", "Wes West", "westlake"), person("t-far", "Far Away", "strongsville")];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(props: { activeStudioId: string | null; canEdit: boolean; isAdmin?: boolean; onOpenTeam?: () => void }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <AdminStaffTab trainers={trainers} studios={studios} isAdmin={props.isAdmin ?? false} {...props} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host;
}

const buttons = () => [...document.querySelectorAll("button")];

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  fake.requests = [];
  fake.fetches = 0;
  fake.scope = null;
});

describe("Staff & Roles for the studio tier", () => {
  it("is read-only, with a door to My Studio → Team", async () => {
    fake.requests = [{ id: "r1", data: { status: "Pending", fullName: "Nia New", email: "nia@x.com", userId: "u-nia", requestedStudioId: "solon" } }];
    const onOpenTeam = vi.fn();
    const el = await mount({ activeStudioId: "solon", canEdit: false, onOpenTeam });
    expect(el.textContent).toContain("Sam Solon");
    expect(el.textContent).toContain("Nia New");
    // The people are listed, not tappable into an editor.
    expect(el.querySelectorAll("button.adm-row")).toHaveLength(0);
    expect(el.querySelectorAll('[data-testid="staff-row"]').length).toBeGreaterThan(0);
    expect(el.textContent).toContain("happen on My Studio → Team");
    expect(el.textContent).toContain("One person is waiting.");
    expect(el.textContent).not.toContain("Approve and create the account");
    const door = buttons().find((b) => b.textContent?.includes("Open My Studio → Team"));
    expect(door).toBeDefined();
    await act(async () => door!.click());
    expect(onOpenTeam).toHaveBeenCalledTimes(1);
  });
});

describe("Staff & Roles for owners and administrators", () => {
  it("keeps the editor, with the owner tier's roles", async () => {
    const el = await mount({ activeStudioId: "solon", canEdit: true });
    expect(el.textContent).not.toContain("Open My Studio → Team");
    const row = [...el.querySelectorAll<HTMLButtonElement>("button.adm-row")].find((b) => b.textContent?.includes("Sam Solon"));
    expect(row).toBeDefined();
    await act(async () => row!.click());
    const options = [...el.querySelectorAll("option")].map((o) => o.textContent);
    expect(options).toContain("Franchise Owner");
    expect(options).not.toContain("System Administrator");
  });
});

describe("Staff & Roles under All my studios", () => {
  it("lists the reader's studios only, and says the Mindbody match is per studio", async () => {
    fake.scope = { studioId: null, studios: [studios[0], studios[1]] };
    fake.requests = [
      { id: "r-far", data: { status: "Pending", fullName: "Olu Far", email: "olu@x.com", userId: "u-olu", requestedStudioId: "strongsville" } },
    ];
    const el = await mount({ activeStudioId: null, canEdit: true });
    expect(el.textContent).toContain("Sam Solon");
    expect(el.textContent).toContain("Wes West");
    expect(el.textContent).not.toContain("Far Away");
    expect(el.textContent).not.toContain("Olu Far");
    expect(el.textContent).toContain("The Mindbody match is per studio");
    expect(el.textContent).not.toContain("No Mindbody Site ID");
    expect(el.textContent).not.toContain("No Mindbody match");
    expect(el.textContent).toContain("Has an account");
    // Nothing asked of Mindbody for studios nobody chose.
    expect(fake.fetches).toBe(0);
  });

  it("reads one studio's Mindbody list and says 'No Mindbody match' only after it has", async () => {
    const el = await mount({ activeStudioId: "solon", canEdit: true });
    expect(fake.fetches).toBeGreaterThan(0);
    expect(el.textContent).toContain("No Mindbody match");
    expect(el.textContent).not.toContain("The Mindbody match is per studio");
  });
});
