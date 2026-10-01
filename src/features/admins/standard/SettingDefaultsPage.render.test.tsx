// @vitest-environment jsdom
/**
 * STUDIO DEFAULTS MOUNTS — Max Strength's defaults in their boxes beside the
 * app's, a save that writes only what changed and then its Activity line, a
 * cleared box going back to the app's value, a box or a pair that can't be
 * saved refusing in words, a failed read drawing no boxes, who sets their own
 * said quietly, and half-typed boxes asked about before they are lost.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  defaults: { quietFloorSessions: 3, lapsedDays: 60 } as Record<string, unknown> | null,
  defaultsFail: false,
  studioValues: {} as Record<string, Record<string, unknown> | "fail">,
  writes: [] as Array<{ op: string; path: string; data: unknown; options?: unknown }>,
}));

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-imrahil" } } }));
vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    return { path: [...base, ...parts.filter((p) => typeof p === "string")].join("/") };
  };
  return {
    collection: ref,
    doc: ref,
    onSnapshot: (target: { path: string }, next: (s: unknown) => void, fail: (e: Error) => void) => {
      const t = setTimeout(() => {
        if (state.defaultsFail) fail(new Error("Missing or insufficient permissions."));
        else next({ exists: () => state.defaults !== null, data: () => ({ values: state.defaults }) });
      }, 0);
      return () => clearTimeout(t);
    },
    getDoc: async (r: { path: string }) => {
      const studioId = r.path.split("/")[1];
      const v = state.studioValues[studioId];
      if (v === "fail") throw new Error("Missing or insufficient permissions.");
      return { exists: () => Boolean(v), data: () => ({ values: v }) };
    },
    setDoc: async (r: { path: string }, data: unknown, options?: unknown) => void state.writes.push({ op: "set", path: r.path, data, options }),
    addDoc: async (r: { path: string }, data: unknown) => {
      state.writes.push({ op: "add", path: r.path, data });
      return { id: "new" };
    },
    deleteField: () => "<delete>",
    serverTimestamp: () => "SERVER_TIME",
  };
});

import { UnsavedChangesProvider, useLeaveGuard } from "../../unsaved-changes";
import { SettingDefaultsPage } from "./SettingDefaultsPage";
import type { Studio, Trainer } from "../../../types";

const studios = [
  { id: "edoras", name: "Edoras", timezone: "America/New_York" },
  { id: "pelargir", name: "Pelargir", timezone: "America/New_York" },
  { id: "demo-studio", name: "Demo Studio", timezone: "America/New_York", isDemo: true },
] as unknown as Studio[];
const imrahil = { id: "t-imrahil", fullName: "Imrahil", role: "Admin" } as unknown as Trainer;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  state.defaults = { quietFloorSessions: 3, lapsedDays: 60 };
  state.defaultsFail = false;
  state.studioValues = { edoras: { quietFloorSessions: 1 }, pelargir: "fail" };
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
    await new Promise((r) => setTimeout(r, 10));
  });
};

function LeaveHarness() {
  const guard = useLeaveGuard();
  const [left, setLeft] = useState(false);
  return left ? (
    <p>Left the page</p>
  ) : (
    <>
      <button type="button" onClick={() => guard(() => setLeft(true))}>
        Go elsewhere
      </button>
      <SettingDefaultsPage studios={studios} authTrainer={imrahil} />
    </>
  );
}

async function mount(withGuard = false) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        {withGuard ? (
          <UnsavedChangesProvider>
            <LeaveHarness />
          </UnsavedChangesProvider>
        ) : (
          <SettingDefaultsPage studios={studios} authTrainer={imrahil} />
        )}
      </StrictMode>,
    );
  });
  await settle();
  return host;
}

async function typeInto(input: HTMLInputElement | null, text: string) {
  expect(input, "input").toBeTruthy();
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, text);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const click = async (el: Element | null | undefined) => {
  expect(el, "element to click").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
};
const button = (el: ParentNode, text: string) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => (b.textContent ?? "").trim() === text);
const box = (el: ParentNode, key: string) => el.querySelector<HTMLInputElement>(`#hq-default-${key}`);
const rowOf = (el: ParentNode, key: string) => box(el, key)?.closest(".hq-setting") ?? el.querySelector(`#hq-default-${key}`)?.closest(".hq-setting");

describe("Studio defaults", () => {
  it("shows Max Strength's defaults beside the app's, by group, with who sets their own", async () => {
    const el = await mount();
    expect([...el.querySelectorAll(".hq-settings__title")].map((h) => h.textContent)).toEqual([
      "Relay",
      "Where a client is (Operations → Clients → Journey)",
      "The machines' care (Relay's Floor Map)",
      // FileMaker parity, Oct 1 2026: when an InBody scan is due.
      "InBody scans (the briefing and the InBody card)",
    ]);
    expect(rowOf(el, "inbodyEverySessions")!.textContent).toContain("The app's default is 50.");
    expect(box(el, "quietFloorSessions")!.value).toBe("3");
    expect(box(el, "lapsedDays")!.value).toBe("60");
    expect(box(el, "driftMinDays")!.value).toBe("");
    expect(rowOf(el, "quietFloorSessions")!.textContent).toContain("The app's default is 2. Studios use 3 unless they set their own.");
    expect(rowOf(el, "driftMinDays")!.textContent).toContain("The app's default is 7. With this box empty, studios use it.");
    // Quietly, from one read of each studio's own settings; the practice studio isn't read.
    expect(rowOf(el, "quietFloorSessions")!.querySelector(".hq-setting__own")?.textContent).toBe("Edoras sets its own.");
    expect(el.textContent).toContain("Couldn't read Pelargir's own settings just now, so it isn't counted above.");
  });

  it("saves only what changed, then records it in the Activity record", async () => {
    const el = await mount();
    await typeInto(box(el, "quietFloorSessions"), "4");
    await click(button(el, "Save changes"));
    expect(state.writes[0]).toEqual({
      op: "set",
      path: "system/studioDefaults",
      data: { values: { quietFloorSessions: 4 }, updatedAt: "SERVER_TIME", updatedBy: "uid-imrahil" },
      options: { merge: true },
    });
    expect(state.writes[1]).toEqual({
      op: "add",
      path: "activity",
      data: {
        by: { uid: "uid-imrahil", name: "Imrahil" },
        studioId: null,
        kind: "setting-default",
        what: "Set Max Strength's default for “A quiet floor” to 4.",
        before: { "A quiet floor": "3" },
        after: { "A quiet floor": "4" },
        at: "SERVER_TIME",
      },
    });
  });

  it("takes an emptied box back to the app's value", async () => {
    const el = await mount();
    await typeInto(box(el, "lapsedDays"), "");
    await click(button(el, "Save changes"));
    expect(state.writes[0].data).toEqual({ values: { lapsedDays: "<delete>" }, updatedAt: "SERVER_TIME", updatedBy: "uid-imrahil" });
    expect((state.writes[1].data as { what: string }).what).toBe("Took Max Strength's default for “Lapsed after” back to the app's 45.");
  });

  it("refuses a value it can't use, and a New that runs past Settling in, in words and without writing", async () => {
    const el = await mount();
    await typeInto(box(el, "lapsedDays"), "7");
    expect(rowOf(el, "lapsedDays")!.textContent).toContain("Enter a number between 14 and 365 (a whole number).");
    expect(el.querySelector('.adm-savebar [role="alert"]')?.textContent).toContain("Lapsed after: Enter a number between 14 and 365");
    // The save bar's button in its error state; a tap still writes nothing.
    await click(button(el, "Try again"));
    expect(state.writes).toEqual([]);
    await typeInto(box(el, "lapsedDays"), "60");
    await typeInto(box(el, "newMax"), "30");
    expect(el.querySelector('.adm-savebar [role="alert"]')?.textContent).toContain("Settling in must end after New");
    await click(button(el, "Try again"));
    expect(state.writes).toEqual([]);
  });

  it("says it couldn't read the defaults, and draws no boxes that would look unset", async () => {
    state.defaultsFail = true;
    const el = await mount();
    expect(el.textContent).toContain("Couldn't read Max Strength's defaults just now");
    expect(box(el, "quietFloorSessions")).toBeNull();
  });

  it("asks before half-typed defaults are lost", async () => {
    const el = await mount(true);
    await typeInto(box(el, "quietFloorSessions"), "5");
    await click(button(el, "Go elsewhere"));
    const question = document.querySelector('[role="alertdialog"]');
    expect(question?.textContent).toContain("Max Strength's studio defaults");
    await click(document.querySelector('[data-action="keep-editing"]'));
    expect(box(el, "quietFloorSessions")!.value).toBe("5");
    expect(el.textContent).not.toContain("Left the page");
  });
});
