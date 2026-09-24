// @vitest-environment jsdom
/**
 * MY STUDIO → STUDIO → InBody: what the panel writes (client codex, Sep 2026).
 *
 * The write shape is the whole point and it is silent when wrong: a map
 * missing a number makes that measure fall back to the default on every
 * screen, an `updatedBy` from the trainer document instead of the Auth uid
 * names the wrong person, and "back to the defaults" must REMOVE the field so
 * the studio follows Max Strength's numbers from then on. Mounted for real,
 * in StrictMode, because useDirtyForm's save is exactly the kind of thing a
 * pure test cannot see (KNOWN-TRAPS: the setState updater).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "uid-lead" } },
}));

const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => ({
  doc: (...parts: unknown[]) => ({ path: parts.filter((p) => typeof p === "string").join("/") }),
  serverTimestamp: () => "NOW",
  deleteField: () => "DELETE",
  updateDoc: async (t: { path: string }, data: Record<string, unknown>) => {
    writes.push({ path: t.path, data });
  },
}));

const toasts: string[] = [];
vi.mock("../../contexts/ToastContext", () => ({
  useToast: () => ({ success: (m: string) => toasts.push(m), error: (m: string) => toasts.push(m), info: () => {} }),
}));

const { InBodyVariationPanel } = await import("./InBodyVariationPanel");
import type { Studio, Trainer } from "../../types";

const lead = { id: "t-lead-doc", authUid: "uid-lead", fullName: "Lee Leader", role: "HeadTrainer" } as unknown as Trainer;

const studio = (over: Partial<Studio> = {}): Studio =>
  ({ id: "solon", name: "Solon", ownerId: "o", timezone: "America/New_York", ...over }) as Studio;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(s: Studio) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <InBodyVariationPanel studioId="solon" studio={s} trainers={[lead]} />
      </StrictMode>,
    );
  });
  return host;
}

async function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const input = (el: HTMLElement, key: string) => el.querySelector<HTMLInputElement>(`#ms-inbody-${key}`)!;
const button = (el: HTMLElement, text: RegExp) => [...el.querySelectorAll("button")].find((b) => text.test(b.textContent ?? ""));

async function click(b: HTMLButtonElement | undefined) {
  expect(b).toBeTruthy();
  await act(async () => b!.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  writes.length = 0;
  toasts.length = 0;
});

describe("the InBody variation panel", () => {
  it("shows Max Strength's defaults to a studio that never set any, and no save bar", async () => {
    const el = await mount(studio());
    expect(el.textContent).toContain("InBody: the scanner's normal variation");
    expect(el.textContent).toContain("Max Strength's defaults. Change a number and save to make it this studio's own.");
    expect(input(el, "skeletalMuscleMassLb").value).toBe("3.5");
    expect(input(el, "bodyFatMassLb").value).toBe("5.3");
    expect(input(el, "percentBodyFat").value).toBe("2.7");
    expect(el.textContent).toContain("McLester");
    expect(button(el, /Save changes/)).toBeUndefined();
    // Already on the defaults: nothing for the reset to do.
    expect(button(el, /Use Max Strength's defaults/)?.disabled).toBe(true);
  });

  it("writes the whole map once, signed with the Auth uid, not the trainer document id", async () => {
    const el = await mount(studio());
    await type(input(el, "skeletalMuscleMassLb"), "2");
    expect(el.textContent).toContain("Unsaved changes");
    await click(button(el, /Save changes/));
    expect(writes).toEqual([
      {
        path: "studios/solon",
        data: {
          inbodyVariation: {
            skeletalMuscleMassLb: 2,
            bodyFatMassLb: 5.3,
            percentBodyFat: 2.7,
            updatedBy: "uid-lead",
            updatedAt: "NOW",
          },
        },
      },
    ]);
  });

  it("names who set the studio's own numbers, and 'Use defaults' removes the field on save", async () => {
    const el = await mount(
      studio({
        inbodyVariation: {
          skeletalMuscleMassLb: 2,
          bodyFatMassLb: 4,
          percentBodyFat: 2,
          updatedBy: "uid-lead",
          // Noon on Sep 20 THIS year, so the label carries no year.
          updatedAt: new Date(new Date().getFullYear(), 8, 20, 12),
        },
      }),
    );
    expect(el.textContent).toContain("This studio's own numbers, set by Lee Leader on Sep 20.");
    expect(input(el, "skeletalMuscleMassLb").value).toBe("2");

    await click(button(el, /Use Max Strength's defaults/));
    // Staged, not written: the save bar still asks.
    expect(writes).toHaveLength(0);
    expect(input(el, "percentBodyFat").value).toBe("2.7");
    await click(button(el, /Save changes/));
    expect(writes).toEqual([{ path: "studios/solon", data: { inbodyVariation: "DELETE" } }]);
    expect(toasts[0]).toContain("back on Max Strength's defaults");
  });

  it("refuses a number out of range with a sentence, and writes nothing", async () => {
    const el = await mount(studio());
    await type(input(el, "skeletalMuscleMassLb"), "12");
    expect(el.textContent).toContain("Between 0.5 and 10 lb");
    // The save bar is in its error state (the house pattern, as on the
    // studio's day), and its button does nothing while a number is wrong.
    await click(button(el, /Save changes|Try again/));
    expect(writes).toHaveLength(0);
    await type(input(el, "percentBodyFat"), "abc");
    expect(el.textContent).toContain("Enter a number");
  });
});
