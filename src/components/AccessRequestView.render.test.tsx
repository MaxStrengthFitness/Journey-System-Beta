// @vitest-environment jsdom
/**
 * The access request, MOUNTED (Oct 2 2026). AJ: an access request with "Not
 * sure yet" for the studio -> "Require a studio". The request lands with that
 * studio's leaders, so one with no studio landed with nobody.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const addDoc = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ id: "req1" })));
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: () => "ts",
}));

import AccessRequestView, { accessRequestStudioProblem } from "./AccessRequestView";
import type { Studio } from "../types";

const studios = [
  { id: "solon", name: "Solon" },
  { id: "demo-studio", name: "Demo Mode", isDemo: true },
] as Studio[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
beforeEach(() => addDoc.mockClear());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <AccessRequestView authenticatedUser={{ uid: "u1", displayName: "Sam Wise", email: "sam@example.com" }} studios={studios} />,
    );
  });
  return host;
}

const studioSelect = (el: HTMLElement) =>
  [...el.querySelectorAll("select")].find((s) => [...s.options].some((o) => o.value === "solon")) as HTMLSelectElement;

describe("AccessRequestView: a request names its studio", () => {
  it("offers no 'Not sure yet' and no Demo Mode", async () => {
    const el = await mount();
    const options = [...studioSelect(el).options].map((o) => o.textContent);
    expect(options).not.toContain("Not sure yet");
    expect(options).not.toContain("Demo Mode");
  });

  it("will not send without a studio, and sends with one", async () => {
    const el = await mount();
    const form = el.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(addDoc).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Choose your studio.");

    const select = studioSelect(el);
    await act(async () => {
      select.value = "solon";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(addDoc).toHaveBeenCalledTimes(1);
    expect((addDoc.mock.calls[0][1] as Record<string, unknown>).requestedStudioId).toBe("solon");
  });

  it("says so when the studio list did not load", () => {
    expect(accessRequestStudioProblem("", 0)).toContain("didn't load");
    expect(accessRequestStudioProblem("solon", 3)).toBeNull();
  });
});
