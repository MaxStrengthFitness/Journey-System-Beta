// @vitest-environment jsdom
/**
 * SETUP → RULES MOUNTS — the studio's own numbers read from its renewal
 * settings (and said to be Max Strength's defaults when it hasn't set them),
 * Max Strength's lines named as such, and the door to My Studio → Studio
 * where the studio's numbers are set (the redesign's Operations room,
 * phase 3). Operations looks; it never edits them.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "lead" } }, functions: {} }));

const saved = vi.hoisted(() => ({ settings: null as Record<string, unknown> | null }));

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
    onSnapshot: (target: { path: string }, next: (s: unknown) => void) => {
      const t = setTimeout(() => {
        const data = target.path === "studios/solon/config/renewals" ? saved.settings : null;
        next({ exists: () => Boolean(data), data: () => data ?? undefined, id: "renewals", metadata: { fromCache: false } });
      }, 0);
      return () => clearTimeout(t);
    },
    setDoc: async () => {},
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

describe("Setup → Rules", () => {
  it("reads the studio's own numbers, and names Max Strength's lines as its own", async () => {
    saved.settings = { breakDays: 21, conversationAtSessionsLeft: 8 };
    let opened = 0;
    const el = await mount(() => (opened += 1));
    const text = el.textContent ?? "";
    expect(text).toContain("Warn me when a client has not visited for 21 days, with nothing booked.");
    expect(text).toContain("Start the conversation at 8 sessions left");
    expect(text).toContain("Solon's own number, set on My Studio → Studio.");
    expect(text).toContain("Twice her usual gap, at least 7 days, with nothing booked.");
    expect(text).toContain("45 days since her last visit, with nothing booked.");
    expect(text).toContain("a client whose history is before Journey is never called new");
    expect(text).toContain("It becomes a studio setting once storing it is approved.");
    // Operations looks; the door goes to where the numbers are set.
    const door = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Open My Studio → Studio"));
    await act(async () => door!.click());
    expect(opened).toBe(1);
  });

  it("says a studio that never set its own is on Max Strength's defaults", async () => {
    const el = await mount();
    expect(el.textContent).toContain("Warn me when a client has not visited for 14 days");
    expect(el.textContent).toContain("Max Strength's default: the studio hasn't set its own");
  });
});
