// @vitest-environment jsdom
/**
 * New-client intake, MOUNTED (Sep 24 2026).
 *
 * Two things AJ asked for: the home studio was "optional", and a blank one
 * made the rules refuse the save for everyone below super admin; and the form
 * wrote a height of 5'10" and a session count nobody had sold.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Studio } from "../types";

const addDoc = vi.fn(async (..._args: unknown[]) => ({ id: "new-client" }));

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  addDoc: (...args: unknown[]) => addDoc(...args),
  collection: vi.fn(),
  serverTimestamp: () => "ts",
}));

import { CreateClientModal } from "./CreateClientModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const studios = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
] as Studio[];

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
beforeEach(() => addDoc.mockClear());
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const saveButton = (el: HTMLElement) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Create Contact"))! as HTMLButtonElement;

describe("CreateClientModal", () => {
  it("starts the home studio on this iPad's studio and saves only what was answered", async () => {
    const onClientCreated = vi.fn();
    const el = mount(
      <CreateClientModal
        clients={[]}
        studios={studios}
        activeStudioId="westlake"
        initialName="Grace Ahn"
        onClose={() => {}}
        onClientCreated={onClientCreated}
      />,
    );

    const studioSelect = [...el.querySelectorAll("select")].find((s) =>
      [...s.options].some((o) => o.value === "westlake"),
    )!;
    expect(studioSelect.value).toBe("westlake");
    expect(el.textContent).toContain("Home Studio");
    expect(el.textContent).not.toContain("Home Studio (Optional)");

    const save = saveButton(el);
    expect(save.disabled).toBe(false);
    await act(async () => save.click());

    expect(addDoc).toHaveBeenCalledTimes(1);
    const written = addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written).toMatchObject({
      firstName: "Grace",
      lastName: "Ahn",
      homeStudioId: "westlake",
      remainingSessions: 0,
      requiresConsultation: true,
    });
    for (const invented of ["height", "gender", "age", "phone", "email", "discoveryNotes"]) {
      expect(invented in written).toBe(false);
    }
    expect(Object.values(written)).not.toContain(undefined);
    expect(onClientCreated).toHaveBeenCalledWith("new-client", false);
  });

  it("will not save with no studio, and says why", async () => {
    const el = mount(
      <CreateClientModal
        clients={[]}
        studios={studios}
        activeStudioId={null}
        initialName="Grace Ahn"
        onClose={() => {}}
        onClientCreated={() => {}}
      />,
    );
    const save = saveButton(el);
    expect(save.disabled).toBe(true);
    expect(el.textContent).toContain("Pick the studio they train at to save.");
    await act(async () => save.click());
    expect(addDoc).not.toHaveBeenCalled();
  });
});
