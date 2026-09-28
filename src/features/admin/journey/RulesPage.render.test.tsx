// @vitest-environment jsdom
/**
 * SETUP → RULES MOUNTS — the studio's renewal numbers read from its renewal
 * settings (and said to be Max Strength's defaults when it hasn't set them),
 * the Journey's five lines from the studio settings, each saying where it
 * came from (the studio's own, Max Strength's default set by head office, or
 * the app's), and the door to My Studio → Studio where they are set (the
 * redesign's Operations room, phase 3; wave 2). Operations looks; it never
 * edits them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const saved = vi.hoisted(() => ({
  settings: null as Record<string, unknown> | null,
  studioValues: null as Record<string, unknown> | null,
  companyValues: null as Record<string, unknown> | null,
  failStudio: false,
}));

vi.mock("firebase/firestore", () => {
  const ref = (...parts: unknown[]) => {
    const first = parts[0] as { path?: string } | undefined;
    const base = first && typeof first === "object" && typeof first.path === "string" ? [first.path] : [];
    const path = [...base, ...parts.filter((p) => typeof p === "string")].join("/");
    return { path, id: path.split("/").pop() ?? "id" };
  };
  return {
    collection: ref,
    doc: ref,
    onSnapshot: (target: { path: string }, next: (s: unknown) => void, fail?: (e: unknown) => void) => {
      const t = setTimeout(() => {
        if (target.path === "studios/solon/config/settings" && saved.failStudio) {
          fail?.(new Error("permission-denied"));
          return;
        }
        const data =
          target.path === "studios/solon/config/renewals"
            ? saved.settings
            : target.path === "studios/solon/config/settings"
              ? saved.studioValues && { values: saved.studioValues }
              : target.path === "system/studioDefaults"
                ? saved.companyValues && { values: saved.companyValues }
                : null;
        next({ exists: () => Boolean(data), data: () => data ?? undefined, id: target.path.split("/").pop(), metadata: { fromCache: false } });
      }, 0);
      return () => clearTimeout(t);
    },
    setDoc: async () => {},
    deleteField: () => ({ deleted: true }),
    serverTimestamp: () => new Date(),
  };
});

import { RulesPage } from "./RulesPage";
import type { Studio } from "../../../types";

const studio = { id: "solon", name: "Solon", timezone: "America/New_York" } as unknown as Studio;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  saved.settings = null;
  saved.studioValues = null;
  saved.companyValues = null;
  saved.failStudio = false;
});

async function mount(onOpenMyStudio?: () => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <RulesPage studio={studio} onOpenMyStudio={onOpenMyStudio} />
      </StrictMode>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  return host;
}

const rule = (el: HTMLElement, name: string) => [...el.querySelectorAll<HTMLElement>(".ops-rule")].find((r) => r.querySelector("dt")?.textContent === name);

describe("Setup → Rules", () => {
  it("reads the studio's renewal numbers, and each of the Journey's lines with where it came from", async () => {
    saved.settings = { breakDays: 21, conversationAtSessionsLeft: 8 };
    saved.studioValues = { lapsedDays: 60 };
    saved.companyValues = { driftMultiple: 2.5, lapsedDays: 30 };
    let opened = 0;
    const el = await mount(() => (opened += 1));
    const text = el.textContent ?? "";
    expect(text).toContain("Warn me when a client has not visited for 21 days, with nothing booked.");
    expect(text).toContain("Start the conversation at 8 sessions left");
    expect(text).toContain("Solon's own number, set on My Studio → Studio.");

    // The studio's own beats head office's; head office's beats the app's.
    expect(rule(el, "Lapsed")?.textContent).toContain("Lapsed: 60 days since her last visit, with nothing booked.");
    expect(rule(el, "Lapsed")?.dataset.source).toBe("studio");
    expect(rule(el, "Lapsed")?.textContent).toContain("This studio's own: Solon's leaders set it on My Studio → Studio.");
    expect(rule(el, "Drifting")?.textContent).toContain("Drifting: 2.5 times her usual gap between visits");
    expect(rule(el, "Drifting")?.dataset.source).toBe("company");
    expect(rule(el, "Drifting")?.textContent).toContain("Max Strength's default, set by head office.");
    expect(rule(el, "Drifting's least")?.textContent).toContain("waits at least 7 days");
    expect(rule(el, "Drifting's least")?.dataset.source).toBe("app");
    expect(rule(el, "Drifting's least")?.textContent).toContain("The app's default: neither Solon nor head office has set one.");
    expect(rule(el, "New")?.textContent).toContain("sessions 1 to 10");
    expect(text).toContain("a client whose history is before Journey is never called new");
    expect(rule(el, "Settling in")?.textContent).toContain("sessions 11 to 24");

    // Operations looks; both doors go to where the numbers are set, and nothing here edits.
    expect(el.querySelector("input, select, textarea")).toBeNull();
    const doors = [...el.querySelectorAll("button")].filter((b) => /My Studio/.test(b.textContent ?? ""));
    expect(doors.map((d) => d.textContent?.trim())).toEqual(["Open My Studio → Studio", "Change them on My Studio"]);
    await act(async () => doors[1].click());
    expect(opened).toBe(1);
  });

  it("says a studio that never set its own is on the defaults", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Warn me when a client has not visited for 14 days");
    expect(el.textContent).toContain("Max Strength's default: the studio hasn't set its own");
    expect(rule(el, "Lapsed")?.textContent).toContain("Lapsed: 45 days since her last visit");
    expect(rule(el, "Lapsed")?.dataset.source).toBe("app");
  });

  it("says so when the studio's own settings couldn't be read", async () => {
    saved.failStudio = true;
    saved.companyValues = { lapsedDays: 30 };
    const el = await mount();
    expect(rule(el, "Lapsed")?.textContent).toContain("Lapsed: 30 days");
    expect(rule(el, "Lapsed")?.textContent).toContain("Part of the settings couldn't be read just now");
  });
});
