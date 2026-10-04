// @vitest-environment jsdom
/**
 * MY STUDIO → STUDIO → THIS STUDIO'S SETTINGS (Sep 28 2026, AJ: "let the
 * admins assign the default within the app").
 *
 * Mounted for real over a fake Firestore that serves the two layers and
 * records the writes, because what matters is silent when wrong: a leader's
 * save sends only what changed, a cleared box goes back to the default, the
 * deep clean's old field goes with it, everyone else reads, and a layer that
 * couldn't be read offers no save at all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-faramir" } } }));

const fake = vi.hoisted(() => ({
  docs: {} as Record<string, Record<string, unknown> | null>,
  failing: new Set<string>(),
  writes: [] as Array<{ path: string; data: Record<string, unknown>; kind: string }>,
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
  onSnapshot: (ref: { path: string }, next: (s: unknown) => void, fail: (e: unknown) => void) => {
    const t = setTimeout(() => {
      if (fake.failing.has(ref.path)) fail(new Error("offline"));
      else {
        const data = fake.docs[ref.path] ?? null;
        next({ exists: () => data !== null, data: () => data });
      }
    }, 0);
    return () => clearTimeout(t);
  },
  setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    fake.writes.push({ path: ref.path, data, kind: "set" });
  },
  updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
    fake.writes.push({ path: ref.path, data, kind: "update" });
  },
  serverTimestamp: () => "NOW",
  deleteField: () => "DELETE",
}));

const toasts: string[] = [];
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

const { StudioSettingsPanel } = await import("./StudioSettingsPanel");

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });

async function mount(canEdit: boolean, studio: Record<string, unknown> = { id: "westlake", name: "Westlake" }) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <StudioSettingsPanel studioId="westlake" studio={studio as never} canEdit={canEdit} />
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

async function type(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  await act(async () => {
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

const input = (el: HTMLElement, key: string) => el.querySelector<HTMLInputElement>(`#ms-setting-${key}`)!;
const button = (el: HTMLElement, text: RegExp) => [...el.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""));

async function click(b: HTMLButtonElement | undefined) {
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await settle();
}

beforeEach(() => {
  fake.docs = {
    "system/studioDefaults": { values: { quietFloorSessions: 3 } },
    "studios/westlake/config/settings": { values: { lapsedDays: 60 } },
  };
  fake.failing.clear();
  fake.writes.length = 0;
  toasts.length = 0;
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("This studio's settings", () => {
  it("shows each value with where it came from", async () => {
    const el = await mount(true);
    expect(el.textContent).toContain("This studio's settings");
    // Head office's default, the studio's own, and the app's.
    expect(el.textContent).toContain("Now 3 sessions running or starting soon, or fewer: Max Strength's default.");
    expect(el.textContent).toContain("Now 60 days since the last visit, with nothing booked: this studio's own.");
    expect(el.textContent).toContain("Now 7 days: the app's default.");
    expect(input(el, "lapsedDays").value).toBe("60");
    expect(input(el, "quietFloorSessions").value).toBe("");
    expect(input(el, "quietFloorSessions").placeholder).toBe("3 (the default)");
  });

  it("saves only what a leader changed, and a cleared box goes back to the default", async () => {
    const el = await mount(true);
    await type(input(el, "quietFloorSessions"), "1");
    await type(input(el, "lapsedDays"), "");
    await click(button(el, /Save changes/));
    expect(fake.writes).toEqual([
      {
        path: "studios/westlake/config/settings",
        data: { values: { quietFloorSessions: 1, lapsedDays: "DELETE" }, updatedAt: "NOW", updatedBy: "uid-faramir" },
        kind: "set",
      },
    ]);
    expect(toasts[0]).toContain("Westlake's screens follow the new numbers.");
  });

  it("refuses a number out of range, and Settling in before New, with a sentence", async () => {
    const el = await mount(true);
    await type(input(el, "quietFloorSessions"), "40");
    await click(button(el, /Save changes/));
    expect(el.textContent).toContain("A quiet floor: Enter a number between 0 and 12 (a whole number).");
    expect(fake.writes).toHaveLength(0);
    await type(input(el, "quietFloorSessions"), "");
    await type(input(el, "newMax"), "30");
    await click(button(el, /Save changes|Try again/));
    expect(el.textContent).toContain("Settling in has to end after New.");
    expect(fake.writes).toHaveLength(0);
  });

  it("shows the deep clean the studio set on its day as its own, and clearing it clears both", async () => {
    const el = await mount(true, { id: "westlake", name: "Westlake", deepCleanIntervalDays: 7 });
    expect(input(el, "deepCleanDays").value).toBe("7");
    await type(input(el, "deepCleanDays"), "");
    await click(button(el, /Save changes/));
    expect(fake.writes.map((w) => [w.path, w.data])).toEqual([
      ["studios/westlake/config/settings", { values: { deepCleanDays: "DELETE" }, updatedAt: "NOW", updatedBy: "uid-faramir" }],
      ["studios/westlake", { deepCleanIntervalDays: "DELETE" }],
    ]);
  });

  it("lets everyone else read, locked, with who changes them", async () => {
    const el = await mount(false);
    expect(el.textContent).toContain("Only this studio's leaders change them.");
    expect(button(el, /Save changes/)).toBeUndefined();
    expect(input(el, "lapsedDays").closest("fieldset")?.disabled).toBe(true);
  });

  it("offers no save while a layer couldn't be read", async () => {
    fake.failing.add("studios/westlake/config/settings");
    const el = await mount(true);
    expect(el.textContent).toContain("Nothing can be saved until they can be read.");
    await type(input(el, "quietFloorSessions"), "1");
    expect(button(el, /Save changes/)).toBeUndefined();
  });
});
