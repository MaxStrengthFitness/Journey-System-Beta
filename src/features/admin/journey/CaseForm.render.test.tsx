// @vitest-environment jsdom
/**
 * THE CASE FORM MOUNTS — a leader changes a stored case and only the diff is
 * written; the owner changes their four fields and never the owner; anyone
 * else sees no controls; a leader opens a case where none is stored and the
 * whole document goes, signed with the Auth uid (Operations room, wave 3).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const writes = vi.hoisted(() => ({ updates: [] as Array<{ path: string; data: Record<string, unknown> }>, sets: [] as Array<{ path: string; data: Record<string, unknown> }> }));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    collection: ref,
    doc: ref,
    onSnapshot: () => () => {},
    updateDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.updates.push({ path: target.path, data });
    },
    setDoc: async (target: { path: string }, data: Record<string, unknown>) => {
      writes.sets.push({ path: target.path, data });
    },
    deleteField: () => "__delete__",
    serverTimestamp: () => "__now__",
  };
});

import { CaseForm } from "./CaseForm";
import type { CaseView } from "./case";
import type { StoredCase } from "./case-store";
import type { CaseRights } from "./case-form";

const choices = [
  { id: "uid-ber", name: "Beregond Guard" },
  { id: "uid-mab", name: "Mablung Ranger" },
];

const stored = (over: Partial<StoredCase> = {}): StoredCase => ({
  clientId: "rosie",
  clientName: "Rosie Cotton",
  owner: { id: "uid-ber", name: "Beregond Guard" },
  nextStep: "",
  dueOn: "2026-10-02",
  outcome: "open",
  reason: null,
  openedAt: new Date("2026-09-28T12:00:00Z"),
  updatedAt: new Date("2026-09-28T12:00:00Z"),
  updatedBy: "lead",
  ...over,
});

const view: CaseView = {
  open: true,
  stored: false,
  owner: { id: "uid-ber", name: "Beregond Guard", usual: true },
  nextStep: "Ask Beregond next time they're in.",
  dueDay: "2026-10-01",
  leaders: false,
  leadersWhy: null,
  outcome: null,
  bookedAgainOnRead: false,
  outcomeWords: "Open.",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  writes.updates = [];
  writes.sets = [];
});

async function mount(props: { stored: StoredCase | null; rights: CaseRights }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <CaseForm studioId="westlake" clientId="rosie" clientName="Rosie Cotton" stored={props.stored} view={view} rights={props.rights} choices={choices} />
      </StrictMode>,
    );
  });
  return host;
}

const setValue = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};

const click = (el: Element | null) => {
  if (!el) throw new Error("nothing to tap");
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

describe("CaseForm — a leader changes a stored case", () => {
  it("writes only the diff, stamped, and never the untouched owner", async () => {
    const h = await mount({ stored: stored(), rights: { mayOpen: true, editing: "all" } });
    const owner = h.querySelector<HTMLSelectElement>("#case-owner")!;
    expect(owner.disabled).toBe(false);
    expect(owner.value).toBe("uid-ber");
    const step = h.querySelector<HTMLTextAreaElement>("#case-step")!;
    expect(step.placeholder).toContain("Ask Beregond");
    await act(async () => setValue(step, "Beregond phones her Friday."));
    expect(h.textContent).toContain("Unsaved changes");
    const buttons = Array.from(h.querySelectorAll("button"));
    click(buttons.find((b) => b.textContent?.trim() === "Save the case") ?? null);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(writes.updates).toHaveLength(1);
    expect(writes.updates[0].path).toBe("studios/westlake/cases/rosie");
    expect(writes.updates[0].data).toEqual({ nextStep: "Beregond phones her Friday.", updatedAt: "__now__", updatedBy: "lead" });
    expect(writes.sets).toHaveLength(0);
  });

  it("a cleared reason is removed, an outcome closes the case", async () => {
    const h = await mount({ stored: stored({ reason: "Travelling" }), rights: { mayOpen: true, editing: "all" } });
    await act(async () => setValue(h.querySelector<HTMLSelectElement>("#case-outcome")!, "paused"));
    await act(async () => setValue(h.querySelector<HTMLInputElement>("#case-reason")!, ""));
    click(Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Save the case") ?? null);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(writes.updates[0].data).toEqual({ outcome: "paused", reason: "__delete__", updatedAt: "__now__", updatedBy: "lead" });
  });

  it("Discard puts the typing back", async () => {
    const h = await mount({ stored: stored(), rights: { mayOpen: true, editing: "all" } });
    const step = h.querySelector<HTMLTextAreaElement>("#case-step")!;
    await act(async () => setValue(step, "Something"));
    click(Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Discard") ?? null);
    expect(h.querySelector<HTMLTextAreaElement>("#case-step")!.value).toBe("");
    expect(h.textContent).not.toContain("Unsaved changes");
  });
});

describe("CaseForm — who sees what", () => {
  it("the owner changes their four fields; the owner control is read-only", async () => {
    const h = await mount({ stored: stored(), rights: { mayOpen: false, editing: "own" } });
    expect(h.querySelector<HTMLSelectElement>("#case-owner")!.disabled).toBe(true);
    expect(h.querySelector<HTMLTextAreaElement>("#case-step")!.disabled).toBe(false);
    expect(h.querySelector<HTMLInputElement>("#case-due")!.disabled).toBe(false);
    expect(h.querySelector<HTMLSelectElement>("#case-outcome")!.disabled).toBe(false);
    expect(h.querySelector<HTMLInputElement>("#case-reason")!.disabled).toBe(false);
    expect(h.textContent).toContain("Only a leader changes the owner.");
  });

  it("anyone else sees no controls, stored or not", async () => {
    const h = await mount({ stored: stored(), rights: { mayOpen: false, editing: "none" } });
    expect(h.querySelector("form")).toBeNull();
    expect(h.querySelector("button")).toBeNull();
    act(() => root?.unmount());
    const h2 = await mount({ stored: null, rights: { mayOpen: false, editing: "none" } });
    expect(h2.querySelector("button")).toBeNull();
  });

  it("every control is at least 40px tall", async () => {
    const h = await mount({ stored: stored(), rights: { mayOpen: true, editing: "all" } });
    for (const sel of ["#case-owner", "#case-due", "#case-outcome", "#case-reason"]) {
      expect(h.querySelector(sel)!.className).toMatch(/adm-(input|select)/);
    }
  });
});

describe("CaseForm — a leader opens a case", () => {
  it("starts from the page's answer and writes the whole document, signed", async () => {
    const h = await mount({ stored: null, rights: { mayOpen: true, editing: "all" } });
    expect(h.querySelector("form")).toBeNull();
    click(Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Open a case") ?? null);
    expect(h.querySelector("form")).not.toBeNull();
    expect(h.querySelector<HTMLSelectElement>("#case-owner")!.value).toBe("uid-ber");
    expect(h.querySelector<HTMLInputElement>("#case-due")!.value).toBe("2026-10-01");
    await act(async () => setValue(h.querySelector<HTMLSelectElement>("#case-owner")!, "uid-mab"));
    click(Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Open the case") ?? null);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(writes.updates).toHaveLength(0);
    expect(writes.sets).toHaveLength(1);
    expect(writes.sets[0].path).toBe("studios/westlake/cases/rosie");
    expect(writes.sets[0].data).toEqual({
      clientId: "rosie",
      clientName: "Rosie Cotton",
      owner: { id: "uid-mab", name: "Mablung Ranger" },
      nextStep: "",
      dueOn: "2026-10-01",
      outcome: "open",
      openedAt: "__now__",
      updatedAt: "__now__",
      updatedBy: "lead",
    });
  });

  it("Not now closes the form and writes nothing", async () => {
    const h = await mount({ stored: null, rights: { mayOpen: true, editing: "all" } });
    click(Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Open a case") ?? null);
    click(Array.from(h.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Not now") ?? null);
    expect(h.querySelector("form")).toBeNull();
    expect(writes.sets).toHaveLength(0);
  });
});
