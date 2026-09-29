// @vitest-environment jsdom
/**
 * ONE OF MY CASES, EDITED, MOUNTED (Relay's third wave, Sep 29 2026): the
 * sheet offers the four fields the owner may change, sends only the diff
 * stamped with the Auth uid, and says so; an outcome other than Open takes
 * it off the list. The order and sentences are my-cases.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  updates: [] as { path: string; data: Record<string, unknown> }[],
  fail: false,
}));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "u-ioreth" } }, functions: {} }));
vi.mock("firebase/firestore", () => {
  const hasUndefined = (v: unknown): boolean =>
    v === undefined || (Array.isArray(v) ? v.some(hasUndefined) : v !== null && typeof v === "object" && Object.values(v).some(hasUndefined));
  const ref = (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") });
  return {
    doc: ref,
    collection: ref,
    updateDoc: async (r: { path: string }, data: Record<string, unknown>) => {
      if (hasUndefined(data)) throw new Error("Unsupported field value: undefined");
      if (state.fail) throw Object.assign(new Error("denied"), { code: "permission-denied" });
      state.updates.push({ path: r.path, data });
    },
    setDoc: async () => {},
    onSnapshot: () => () => {},
    deleteField: () => "__delete__",
    serverTimestamp: () => "__now__",
  };
});

import { ToastProvider } from "../../contexts/ToastContext";
import { UnsavedChangesProvider } from "../unsaved-changes";
import { MyCaseEditor } from "./MyCaseEditor";
import type { StoredCase } from "../admin/journey/case-store";

const TODAY = "2026-09-28";
const hugo: StoredCase = {
  clientId: "c-hugo",
  clientName: "Hugo Bracegirdle",
  owner: { id: "u-ioreth", name: "Ioreth Healer" },
  nextStep: "Ask about his knee",
  dueOn: "2026-09-27",
  outcome: "open",
  reason: null,
  openedAt: null,
  updatedAt: null,
  updatedBy: null,
};

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  state.updates = [];
  state.fail = false;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  document.body.innerHTML = "";
});

async function render(theCase: StoredCase | null = hugo) {
  const onOpenChange = vi.fn();
  const onOpenClient = vi.fn();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ToastProvider>
        <UnsavedChangesProvider>
          <MyCaseEditor studioId="s1" theCase={theCase} open onOpenChange={onOpenChange} todayKey={TODAY} onOpenClient={onOpenClient} />
        </UnsavedChangesProvider>
      </ToastProvider>,
    );
  });
  return { onOpenChange, onOpenClient };
}

const button = (words: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === words);
const click = async (el: Element | null | undefined) => {
  expect(el, "the thing to tap").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await act(async () => {});
};
async function type(selector: string, text: string) {
  const el = document.querySelector<HTMLTextAreaElement | HTMLInputElement>(selector);
  expect(el, selector).toBeTruthy();
  await act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, text);
    el!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("one of my cases, edited", () => {
  it("shows the case as it stands, and Save waits for a change", async () => {
    await render();
    expect(document.querySelector(".rk-title")?.textContent).toBe("Hugo Bracegirdle's case");
    expect(document.querySelector(".rk-lede")?.textContent).toContain("Overdue — was due yesterday");
    expect(document.querySelector<HTMLTextAreaElement>("#mc-step")?.value).toBe("Ask about his knee");
    expect(document.querySelector<HTMLInputElement>("#mc-due")?.value).toBe("2026-09-27");
    expect(button("Open")?.getAttribute("aria-pressed")).toBe("true");
    expect(button("Save")?.disabled).toBe(true);
    // No owner field, no name field: those are the leader's.
    expect(document.querySelector("#mc-owner")).toBeNull();
  });

  it("sends only what changed, stamped with the signed-in uid and the server's time", async () => {
    const { onOpenChange } = await render();
    await type("#mc-step", "Call him after Thursday's session");
    await type("#mc-due", "2026-10-01");
    expect(button("Save")?.disabled).toBe(false);
    await click(button("Save"));
    expect(state.updates).toEqual([
      {
        path: "studios/s1/cases/c-hugo",
        data: { nextStep: "Call him after Thursday's session", dueOn: "2026-10-01", updatedAt: "__now__", updatedBy: "u-ioreth" },
      },
    ]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("asks why when the outcome isn't Open, and says it's off the list", async () => {
    await render();
    await click(button("Paused"));
    expect(document.querySelector("#mc-reason")).toBeTruthy();
    await type("#mc-reason", "Away until November");
    await click(button("Save"));
    expect(state.updates[0].data).toEqual({ outcome: "paused", reason: "Away until November", updatedAt: "__now__", updatedBy: "u-ioreth" });
    expect(document.body.textContent).toContain("Hugo's case is paused. It's off your list.");
  });

  it("keeps the sheet open and says so when the write is refused", async () => {
    state.fail = true;
    const { onOpenChange } = await render();
    await type("#mc-step", "Try again");
    await click(button("Save"));
    expect(document.querySelector('[role="alert"]')?.textContent).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("opens the client from the sheet, and says when the case is gone", async () => {
    const { onOpenClient } = await render();
    await click(button("Open Hugo"));
    expect(onOpenClient).toHaveBeenCalledWith("c-hugo");
    await render(null);
    expect(document.body.textContent).toContain("This case is no longer on your list.");
  });
});
