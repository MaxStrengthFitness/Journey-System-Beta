// @vitest-environment jsdom
/**
 * The models page and its editor mount, list a movement's models, and write
 * a model whole — exactly its shape, signed with the Auth uid (Codex R2).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "admin-galadriel" } },
}));

const writes: { path: string; data: Record<string, unknown>; options?: unknown }[] = [];
const feed = vi.hoisted(() => ({
  docs: [] as { id: string; data: () => Record<string, unknown> }[],
  fail: false,
}));

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  collection: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  onSnapshot: (_q: unknown, next: (s: { docs: typeof feed.docs }) => void, err: (e: Error) => void) => {
    if (feed.fail) err(new Error("offline"));
    else next({ docs: feed.docs });
    return () => {};
  },
  getDocs: async () => ({ docs: feed.docs }),
  serverTimestamp: () => "now",
  setDoc: async (t: { path: string }, data: Record<string, unknown>, options?: unknown) => {
    writes.push({ path: t.path, data, options });
  },
}));

const toasts: string[] = [];
vi.mock("../../../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

const { MACHINE_DEFINITION_LIST } = await import("../../../../data/machine-definitions");
const { ModelsPage } = await import("./ModelsPage");

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(props: Partial<Parameters<typeof ModelsPage>[0]> = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <ModelsPage catalog={MACHINE_DEFINITION_LIST} isAdmin backLabel="Catalog" onBack={() => {}} {...props} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
  return host!;
}

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click(el: Element) {
  await act(async () => (el as HTMLElement).click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
}

const button = (el: Element, text: RegExp) => [...el.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""))!;

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  writes.length = 0;
  toasts.length = 0;
  feed.docs = [];
  feed.fail = false;
});

describe("the models page", () => {
  it("lists a movement's models by name, with their dials in a line", async () => {
    feed.docs = [
      {
        id: "mm-hoist-roc-it-leg-press",
        data: () => ({
          brand: "Hoist",
          model: "ROC-IT Leg Press",
          movementId: "m-leg-press",
          dials: [{ key: "gap", label: "Gap", letter: "G" }],
          updatedBy: "admin-galadriel",
        }),
      },
    ];
    const el = await mount({ movementId: "m-leg-press" });
    expect(el.textContent).toContain("Hoist ROC-IT Leg Press");
    expect(el.textContent).toContain("1 dial: G");
  });

  it("says it could not read the models rather than that there are none", async () => {
    feed.fail = true;
    const el = await mount();
    expect(el.textContent).toContain("couldn't be read");
    expect(el.textContent).not.toContain("No models recorded yet");
  });

  it("records a new model whole, with the movement's dials, signed by the administrator", async () => {
    const el = await mount({ movementId: "m-leg-press" });
    await click(button(el, /New model/));
    await type(el.querySelector("#model-brand") as HTMLInputElement, "Hoist");
    await type(el.querySelector("#model-name") as HTMLInputElement, "ROC-IT Leg Press");
    await click(button(el, /Start from the/));
    await click(button(el, /Record this model/));

    expect(writes).toHaveLength(1);
    const w = writes[0];
    expect(w.path).toBe("machineModels/mm-hoist-roc-it-leg-press");
    // Whole: no merge, so a removed dial or note leaves the record.
    expect(w.options).toBeUndefined();
    expect(Object.keys(w.data).sort()).toEqual(["brand", "dials", "model", "movementId", "updatedAt", "updatedBy"]);
    expect(w.data.updatedBy).toBe("admin-galadriel");
    expect((w.data.dials as { key: string }[]).map((d) => d.key)).toEqual(["gap", "seat-angle", "shoulder-pads", "seat-distance"]);
    expect(toasts[0]).toContain("Hoist ROC-IT Leg Press recorded");
  });

  it("names what is missing in the save bar and writes nothing", async () => {
    const el = await mount();
    await click(button(el, /New model/));
    await type(el.querySelector("#model-brand") as HTMLInputElement, "Nautilus");
    await click(button(el, /Record this model/));
    expect(writes).toHaveLength(0);
    expect(el.textContent).toContain("Give it a model name");
  });
});
