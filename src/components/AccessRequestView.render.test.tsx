// @vitest-environment jsdom
/**
 * The access request, MOUNTED. Oct 2 2026, AJ: an access request with "Not
 * sure yet" for the studio -> "Require a studio". Oct 3 2026 (the front
 * door): the request is kept at the person's own uid and read back, so the
 * next sign-in says where it stands instead of showing the empty form; and
 * clients aren't offered, because they don't use Journey.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = vi.hoisted(() => ({
  existing: null as Record<string, unknown> | null,
  readFails: false,
  setDoc: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: vi.fn(async () => {
    if (store.readFails) throw new Error("offline");
    return { exists: () => store.existing !== null, data: () => store.existing };
  }),
  setDoc: (...args: unknown[]) => store.setDoc(...args),
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
beforeEach(() => {
  store.setDoc.mockClear();
  store.existing = null;
  store.readFails = false;
});
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
      <AccessRequestView
        authenticatedUser={{ uid: "u1", displayName: "Sam Wise", email: "sam@example.com" }}
        studios={studios}
        onLogout={() => {}}
      />,
    );
  });
  return host;
}

const radios = (el: HTMLElement, name: string) =>
  [...el.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${name}"]`)];
const submit = async (el: HTMLElement) => {
  await act(async () => {
    el.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
};

describe("AccessRequestView: a request names its studio", () => {
  it("offers the studios without Demo Mode, and no client role", async () => {
    const el = await mount();
    expect(radios(el, "fd-studio").map((r) => r.value)).toEqual(["solon"]);
    expect(el.textContent).not.toContain("Not sure yet");
    expect(el.textContent).not.toMatch(/client/i);
  });

  it("will not send without a studio, and sends with one, at the person's own uid", async () => {
    const el = await mount();
    await submit(el);
    expect(store.setDoc).not.toHaveBeenCalled();
    expect(el.textContent).toContain("Choose your studio.");

    await act(async () => radios(el, "fd-studio")[0].click());
    expect(el.querySelector('button[type="submit"]')!.textContent).toContain("Send to Solon's leaders");
    await submit(el);
    expect(store.setDoc).toHaveBeenCalledTimes(1);
    const [ref, data] = store.setDoc.mock.calls[0] as [{ path: string }, Record<string, unknown>];
    expect(ref.path).toBe("access_requests/u1");
    expect(data).toMatchObject({ requestedStudioId: "solon", roleRequested: "Trainer", status: "Pending", userId: "u1" });
    expect(el.textContent).toContain("Solon's leaders have it.");
  });

  it("remembers a request already sent, instead of showing the form again", async () => {
    store.existing = { status: "Pending", requestedStudioId: "solon", roleRequested: "Trainer" };
    const el = await mount();
    expect(el.querySelector("form")).toBeNull();
    expect(el.textContent).toContain("Solon's leaders have it.");
    expect(el.textContent).toContain("You asked to join Solon as a trainer");
  });

  it("says it couldn't check, and still lets them ask, when the read fails", async () => {
    store.readFails = true;
    const el = await mount();
    expect(el.querySelector("form")).not.toBeNull();
    expect(el.textContent).toContain("couldn't check whether you've already asked");
  });

  it("says so when the studio list did not load", () => {
    expect(accessRequestStudioProblem("", 0)).toContain("didn't load");
    expect(accessRequestStudioProblem("solon", 3)).toBeNull();
  });
});
