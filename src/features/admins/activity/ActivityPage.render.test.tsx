// @vitest-environment jsdom
/**
 * MACHINERY → ACTIVITY MOUNTS — the administrators by name with Change role
 * (never on your own row), the record newest first in quiet rows, a filter
 * that is one `in` query of kinds, a read that failed saying so, and a role
 * change that writes the role and then its admin-grant line.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  answer: "entries" as "entries" | "fails" | "empty",
  queries: [] as Array<{ path: string; wheres: unknown[][] }>,
  writes: [] as Array<{ op: string; path: string; data: unknown }>,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-faramir" } } }));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    return { path: [...base, ...parts.filter((p) => typeof p === "string")].join("/") };
  };
  const at = (iso: string) => ({ toMillis: () => Date.parse(iso) });
  const entries = [
    { id: "a1", at: at("2026-09-28T13:14:00Z"), by: { uid: "uid-faramir", name: "Faramir" }, studioId: null, kind: "admin-grant", what: "Made Beregond a System Administrator (was Head Trainer).", before: { Role: "Head Trainer" }, after: { Role: "System Administrator" } },
    { id: "a2", at: at("2026-09-27T15:05:00Z"), by: { uid: "uid-ioreth", name: "Ioreth" }, studioId: "minas-tirith", kind: "assisted-change", what: "Changed Minas Tirith's phone.", before: { Phone: null }, after: { Phone: "440-555-0101" } },
  ];
  return {
    collection: ref,
    doc: ref,
    where: (...args: unknown[]) => ({ where: args }),
    orderBy: () => ({}),
    limit: () => ({}),
    query: (base: { path: string }, ...parts: Array<{ where?: unknown[] }>) => ({ path: base.path, wheres: parts.filter((p) => p.where).map((p) => p.where!) }),
    getDocs: async (q: { path: string; wheres: unknown[][] }) => {
      state.queries.push(q);
      if (state.answer === "fails") throw new Error("Missing or insufficient permissions.");
      const docs = state.answer === "empty" ? [] : entries;
      return { docs: docs.map((d) => ({ id: d.id, data: () => d })) };
    },
    updateDoc: async (r: { path: string }, data: unknown) => void state.writes.push({ op: "update", path: r.path, data }),
    addDoc: async (r: { path: string }, data: unknown) => {
      state.writes.push({ op: "add", path: r.path, data });
      return { id: "new" };
    },
    serverTimestamp: () => "SERVER_TIME",
  };
});

import { ActivityPage, administratorsOf } from "./ActivityPage";
import type { Studio, Trainer } from "../../../types";

const studios = [
  { id: "minas-tirith", name: "Minas Tirith", timezone: "America/New_York" },
  { id: "demo-studio", name: "Demo Studio", timezone: "America/New_York", isDemo: true },
] as unknown as Studio[];
const person = (id: string, fullName: string, role: string, extra: Record<string, unknown> = {}) =>
  ({ id, fullName, initials: "XX", role, primaryHomeStudioId: "minas-tirith", accessibleStudioIds: [], activeGuestStudioIds: [], ...extra }) as unknown as Trainer;
const faramir = person("t-faramir", "Faramir", "Admin");
const trainers = [
  faramir,
  person("t-imrahil", "Imrahil", "Founder"),
  person("t-beregond", "Beregond", "Admin"),
  person("t-ioreth", "Ioreth", "HeadTrainer"),
  person("t-old", "Old Account", "Admin", { supersededByUid: "t-new" }),
  person("demo-trainer-1", "Demo Leader", "Admin", { isDemo: true, primaryHomeStudioId: "demo-studio" }),
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  state.answer = "entries";
  state.queries.length = 0;
  state.writes.length = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
};

async function mount(onRolesChanged = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <ActivityPage studios={studios} trainers={trainers} authTrainer={faramir} onRolesChanged={onRolesChanged} />
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

const click = async (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};
const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);

describe("Machinery → Activity", () => {
  it("lists the administrators by name, with Change role on everyone's row but your own", async () => {
    const el = await mount();
    const panel = el.querySelector('[aria-label="Administrators"]')!;
    expect([...panel.querySelectorAll(".hq-row__name")].map((n) => n.textContent)).toEqual([
      "BeregondSystem Administrator",
      "FaramirSystem Administrator · you",
      "ImrahilFounder / Overseer",
    ]);
    expect(panel.querySelector('[aria-label="Change role: Faramir"]')).toBeNull();
    expect(panel.querySelector('[aria-label="Change role: Beregond"]')).not.toBeNull();
    // A replaced account and Demo Mode's people are not administrators here.
    expect(administratorsOf(trainers, studios).map((t) => t.fullName)).toEqual(["Beregond", "Faramir", "Imrahil"]);
  });

  it("reads the record newest first, in quiet rows of when, who, the sentence and what changed", async () => {
    const el = await mount();
    const rows = [...el.querySelectorAll(".hq-log__row")];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector(".hq-log__what")?.textContent).toBe("Faramir made Beregond a System Administrator (was Head Trainer).");
    expect(rows[0].querySelector(".hq-log__change")?.textContent).toBe("Role: Head Trainer → System Administrator");
    expect(rows[0].querySelector(".hq-log__ctx")?.textContent).toBe("Admin grant");
    expect(rows[0].querySelector(".hq-log__when")?.textContent).toBe("Mon, Sep 28, 2026 · 9:14 AM");
    expect(rows[1].querySelector(".hq-log__ctx")?.textContent).toBe("Changed at a studio · Minas Tirith");
    // One `in` query of every kind.
    expect(state.queries[state.queries.length - 1].wheres[0][0]).toBe("kind");
    expect(state.queries[state.queries.length - 1].wheres[0][1]).toBe("in");
  });

  it("asks for only the kinds a filter names", async () => {
    const el = await mount();
    await click(button(el, "Admin grants"));
    const last = state.queries[state.queries.length - 1];
    expect(last.wheres[0]).toEqual(["kind", "in", ["admin-grant"]]);
    expect(el.querySelector('.hq-chip[aria-pressed="true"]')?.textContent).toBe("Admin grants");
  });

  it("says a read that failed, and never 'nothing recorded'", async () => {
    state.answer = "fails";
    const el = await mount();
    expect(el.textContent).toContain("Couldn't read the Activity record just now");
    expect(el.textContent).not.toContain("Nothing recorded yet");
    state.answer = "empty";
    await click(button(el, "Try again"));
    expect(el.textContent).toContain("Nothing recorded yet");
  });

  it("changes a role from the administrators, then records it as an admin grant", async () => {
    const onRolesChanged = vi.fn();
    const el = await mount(onRolesChanged);
    await click(el.querySelector('[aria-label="Change role: Beregond"]'));
    const dialog = document.querySelector<HTMLElement>('[role="alertdialog"][aria-label="Change Beregond\'s role"]')!;
    expect(dialog).toBeTruthy();
    const save = button(dialog, "Save the role")!;
    expect(save.disabled).toBe(true);
    const select = dialog.querySelector<HTMLSelectElement>("#hq-role-choice")!;
    await act(async () => {
      select.value = "HeadTrainer";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(dialog.textContent).toContain("Beregond loses the Admins dashboard.");
    await click(button(dialog, "Save the role"));
    expect(state.writes[0]).toEqual({ op: "update", path: "trainers/t-beregond", data: { role: "HeadTrainer" } });
    expect(state.writes[1]).toEqual({
      op: "add",
      path: "activity",
      data: {
        by: { uid: "uid-faramir", name: "Faramir" },
        studioId: null,
        kind: "admin-grant",
        what: "Changed Beregond from System Administrator to Head Trainer: no longer an administrator.",
        before: { Role: "System Administrator" },
        after: { Role: "Head Trainer" },
        at: "SERVER_TIME",
      },
    });
    expect(onRolesChanged).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
});
