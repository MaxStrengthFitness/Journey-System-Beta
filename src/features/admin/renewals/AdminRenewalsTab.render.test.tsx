// @vitest-environment jsdom
/**
 * OPERATIONS → RENEWALS, mounted: a door to the studio's auto-renewal answer,
 * never a second editor of it (Sep 25 2026). A studio that hasn't answered
 * reads as renewing (AJ: "it's default on"), and the corporate studios must
 * be switched off — so the one notice this screen already had says so, and
 * its button opens My Studio, where the answer is set. A read that is still
 * loading or failed is unknown, never "unanswered".
 *
 * The pipeline, the outcomes and the Brief are stubs: each has its own tests.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-admin" } } }));
vi.mock("./RenewalsPipeline", () => ({ RenewalsPipeline: () => <div data-testid="pipeline" /> }));
vi.mock("./RenewalOutcomesPanel", () => ({ RenewalOutcomesPanel: () => <div data-testid="outcomes" /> }));
vi.mock("./RenewalBrief", () => ({ RenewalBrief: () => null }));
vi.mock("../scope-context", () => ({
  useOperationsScope: () => ({ scope: { kind: "studio", studioId: "solon" } }),
  PickOneStudio: () => null,
}));

const hook = vi.hoisted(() => ({ state: null as any }));
vi.mock("../../renewals/useRenewalSettings", async () => {
  const { DEFAULT_RENEWAL_SETTINGS } = await import("../../renewals/settings");
  return {
    useRenewalSettings: (studioId: string | null) =>
      hook.state ?? {
        settings: DEFAULT_RENEWAL_SETTINGS,
        saved: false,
        ownPackageTable: false,
        forStudioId: studioId,
        loading: false,
        error: null,
      },
    useRenewalNamesSeen: () => null,
  };
});

import { AdminRenewalsTab } from "./AdminRenewalsTab";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { Studio, Trainer } from "../../../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const admin = { id: "t-admin", fullName: "Ada Admin", role: "Admin" } as unknown as Trainer;
const studios = [{ id: "solon", name: "Solon" }] as Studio[];

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(onOpenMyStudio = vi.fn()) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <AdminRenewalsTab
          authTrainer={admin}
          studios={studios}
          activeStudioId="solon"
          trainers={[]}
          machines={[]}
          onOpenMyStudio={onOpenMyStudio}
        />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return { host, onOpenMyStudio };
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  hook.state = null;
});

const notice = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-notice")).find((n) => (n.textContent ?? "").includes("My Studio → Studio"));

describe("AdminRenewalsTab — the door to the studio's auto-renewal answer", () => {
  it("flags a studio that hasn't answered, as a warning, and opens My Studio to answer it", async () => {
    const { host, onOpenMyStudio } = await mount();
    const n = notice(host)!;
    expect(n.classList.contains("adm-notice--warn")).toBe(true);
    expect(n.textContent).toContain("Solon hasn't said whether its packages renew automatically, so they read as renewing.");
    expect(n.textContent).toContain(
      "Auto-renewal, when to talk, the package table and name matching are set on My Studio → Studio, not here.",
    );
    // A door, not an editor: nothing on this screen changes the answer.
    expect(host.querySelector("#renewals-autorenew")).toBeNull();
    const open = Array.from(n.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Open My Studio")!;
    await act(async () => open.click());
    expect(onOpenMyStudio).toHaveBeenCalledTimes(1);
  });

  it("stays a plain pointer once the studio has answered", async () => {
    hook.state = {
      settings: { ...DEFAULT_RENEWAL_SETTINGS, packagesRenewAutomatically: false },
      saved: true,
      ownPackageTable: false,
      forStudioId: "solon",
      loading: false,
      error: null,
    };
    const { host } = await mount();
    const n = notice(host)!;
    expect(n.classList.contains("adm-notice--info")).toBe(true);
    expect(n.textContent).not.toContain("hasn't said");
  });

  it("never calls a read that failed 'unanswered'", async () => {
    hook.state = {
      settings: DEFAULT_RENEWAL_SETTINGS,
      saved: false,
      ownPackageTable: false,
      forStudioId: "solon",
      loading: false,
      error: "Couldn't load this studio's renewal settings. Showing the defaults.",
    };
    const { host } = await mount();
    expect(notice(host)!.textContent).not.toContain("hasn't said");
  });
});
