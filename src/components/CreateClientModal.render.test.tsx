// @vitest-environment jsdom
/**
 * New-client intake, MOUNTED (Sep 24 2026).
 *
 * Two things AJ asked for: the home studio was "optional", and a blank one
 * made the rules refuse the save for everyone below super admin; and the form
 * wrote a height of 5'10" and a session count nobody had sold.
 *
 * Since the open session round's review (Oct 9 2026) Save never waits on the
 * network: the id is made on the iPad and the write issued (`setDoc`, never
 * awaited), so the client is handed on in the same tap, offline too. It used
 * to await `addDoc`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Studio } from "../types";

/** The write: `answer` is what the database says (never, offline). */
const net = vi.hoisted(() => ({ answer: "ok" as "ok" | "never" | "refuse" }));
const setDoc = vi.fn((..._args: unknown[]) =>
  net.answer === "ok"
    ? Promise.resolve()
    : net.answer === "never"
      ? new Promise<void>(() => {})
      : Promise.reject(Object.assign(new Error("refused"), { code: "permission-denied" })),
);
const toasts = vi.hoisted(() => [] as string[]);

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("firebase/firestore", () => ({
  setDoc: (...args: unknown[]) => setDoc(...args),
  collection: () => ({ __path: "clients" }),
  // doc(collectionRef) makes the id on the iPad, as Firestore does.
  doc: () => ({ id: "new-client" }),
  serverTimestamp: () => "ts",
}));
vi.mock("../features/machine-menu/late-refusal", () => ({ sayAfterClose: (text: string) => toasts.push(text) }));

import { CreateClientModal } from "./CreateClientModal";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const studios = [
  { id: "solon", name: "Solon" },
  { id: "westlake", name: "Westlake" },
  { id: "demo-studio", name: "Demo Mode", isDemo: true },
] as Studio[];

const studioOptions = (el: HTMLElement) => {
  const select = [...el.querySelectorAll("select")].find((s) =>
    [...s.options].some((o) => o.textContent?.includes("Select Studio")),
  )!;
  return [...select.options].map((o) => o.value).filter(Boolean);
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}
beforeEach(() => {
  setDoc.mockClear();
  net.answer = "ok";
  toasts.length = 0;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const saveButton = (el: HTMLElement) =>
  [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Create temporary profile"))! as HTMLButtonElement;

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
    expect(el.textContent).toContain("Home studio");
    expect(el.textContent).not.toContain("Home studio (optional)");

    const save = saveButton(el);
    expect(save.disabled).toBe(false);
    await act(async () => save.click());

    expect(setDoc).toHaveBeenCalledTimes(1);
    expect((setDoc.mock.calls[0][0] as { id: string }).id).toBe("new-client");
    const written = setDoc.mock.calls[0][1] as Record<string, unknown>;
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
    // With the client as written (the open session round, Oct 9 2026): an
    // open session gives itself to the new client before the studio's client
    // list has them, so the id alone was not enough.
    expect(onClientCreated).toHaveBeenCalledWith(
      "new-client",
      expect.objectContaining({ id: "new-client", firstName: "Grace", lastName: "Ahn", homeStudioId: "westlake", sessionCount: 0 }),
      // Someone this form just added (the whole-branch review, Oct 9 2026): nothing is on file for them anywhere.
      true,
    );
  });

  it("makes a temporary profile any trainer can start, with no Existing tab and no chart importer (Oct 2 2026)", async () => {
    const el = mount(
      <CreateClientModal
        clients={[]}
        studios={studios}
        activeStudioId="westlake"
        initialName="Walk In"
        authorId="trainer-7"
        onClose={() => {}}
        onClientCreated={() => {}}
      />,
    );
    expect(el.textContent).not.toContain("Existing Client");
    expect(el.textContent).not.toContain("Chart Importer");
    expect(el.textContent).toContain("temporary profile");
    await act(async () => saveButton(el).click());
    const written = setDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written).toMatchObject({
      provisional: true,
      provisionalBy: "trainer-7",
      provisionalReason: "New client, not in Mindbody yet",
    });
    expect(typeof written.provisionalSince).toBe("string");
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
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("offline, hands the new client on in the same tap and closes: Save never waits on the network (Oct 9 2026)", () => {
    net.answer = "never";
    const onClientCreated = vi.fn();
    const onClose = vi.fn();
    const el = mount(
      <CreateClientModal clients={[]} studios={studios} activeStudioId="westlake" initialName="Ana Walkin" onClose={onClose} onClientCreated={onClientCreated} />,
    );
    // No act(async): nothing is awaited between the tap and the hand-on.
    act(() => saveButton(el).click());
    expect(onClientCreated).toHaveBeenCalledWith("new-client", expect.objectContaining({ id: "new-client", firstName: "Ana" }), true);
    expect(onClose).toHaveBeenCalled();
  });

  it("adds one client when Save is tapped twice at once", () => {
    const onClientCreated = vi.fn();
    const el = mount(
      <CreateClientModal clients={[]} studios={studios} activeStudioId="westlake" initialName="Ana Walkin" onClose={() => {}} onClientCreated={onClientCreated} />,
    );
    act(() => {
      saveButton(el).click();
      saveButton(el).click();
    });
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(onClientCreated).toHaveBeenCalledTimes(1);
  });

  it("a refusal is said in a toast, by name", async () => {
    net.answer = "refuse";
    const el = mount(
      <CreateClientModal clients={[]} studios={studios} activeStudioId="westlake" initialName="Ana Walkin" onClose={() => {}} onClientCreated={() => {}} />,
    );
    await act(async () => saveButton(el).click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(toasts).toEqual(["Ana Walkin wasn't added to the studio's clients. Add them again."]);
  });

  it("inside Demo Mode offers only Demo Mode as the home studio (the realm rule)", () => {
    const el = mount(
      <CreateClientModal
        clients={[]}
        studios={studios}
        activeStudioId="demo-studio"
        initialName="Bilbo Baggins"
        onClose={() => {}}
        onClientCreated={() => {}}
      />,
    );
    expect(studioOptions(el)).toEqual(["demo-studio"]);
  });

  it("outside Demo Mode never offers Demo Mode", () => {
    const el = mount(
      <CreateClientModal
        clients={[]}
        studios={studios}
        activeStudioId="westlake"
        initialName="Grace Ahn"
        onClose={() => {}}
        onClientCreated={() => {}}
      />,
    );
    expect(studioOptions(el)).toEqual(["solon", "westlake"]);
  });

  it("a duplicate's Cancel and view existing hands on the one already on file, not as someone new; the warning is in the caution plum (the whole-branch review, Oct 9 2026)", async () => {
    const onClientCreated = vi.fn();
    const existing = { id: "c-grace", firstName: "Grace", lastName: "Ahn", homeStudioId: "westlake" };
    const el = mount(
      <CreateClientModal
        clients={[existing] as never}
        studios={studios}
        activeStudioId="westlake"
        initialName="Grace Ahn"
        onClose={() => {}}
        onClientCreated={onClientCreated}
      />,
    );
    await act(async () => saveButton(el).click());
    expect(el.textContent).toContain("Duplicate found");
    expect(el.innerHTML).not.toMatch(/amber-d/);
    expect(el.innerHTML).toContain("border-(--eq-warn)");
    const view = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Cancel and view existing"))!;
    await act(async () => view.click());
    expect(setDoc).not.toHaveBeenCalled();
    expect(onClientCreated).toHaveBeenCalledWith("c-grace", existing, false);
  });
});
