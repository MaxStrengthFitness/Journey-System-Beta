// @vitest-environment jsdom
/**
 * MY STUDIO → STUDIO → RENEWALS: the studio's auto-renewal answer (Sep 25
 * 2026). AJ, word for word: "i got confirmation, the corporate studios do not
 * have auto renewal on but franchise studio do. i believe studios will have
 * the ability to turn auto renewals off if they want but its auto default on"
 *
 * The write is the point and it is silent when wrong: a studio that never
 * answered must read as ON and SAY it hasn't answered, choosing No must send
 * exactly the one key (only the diff, never undefined), and a package left
 * "same as the studio" must follow the studio's answer. Mounted for real, in
 * StrictMode, because useDirtyForm's save is exactly the kind of thing a pure
 * test cannot see.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "uid-lead" } } }));

const saves: Array<{ studioId: string; patch: Record<string, unknown> }> = [];
vi.mock("../../renewals/useRenewalSettings", () => ({
  saveRenewalSettings: async (studioId: string, patch: Record<string, unknown>) => {
    saves.push({ studioId, patch });
  },
}));

import { RenewalSettingsPanel } from "./RenewalSettingsPanel";
import { DEFAULT_RENEWAL_SETTINGS } from "../../renewals/settings";
import type { RenewalNamesSeen, RenewalSettings } from "../../renewals/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(settings: RenewalSettings, canEdit = true, namesSeen: RenewalNamesSeen | null = null, ownPackageTable = true) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <RenewalSettingsPanel
          studioId="solon"
          studioName="Solon"
          settings={settings}
          saved
          ownPackageTable={ownPackageTable}
          namesSeen={namesSeen}
          canEdit={canEdit}
        />
      </StrictMode>,
    );
  });
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
  saves.length = 0;
});

const select = (host: HTMLElement, id: string) => host.querySelector<HTMLSelectElement>(`#${id}`)!;
const options = (el: HTMLSelectElement) => Array.from(el.options).map((o) => [o.value, o.textContent]);
const committed = (host: HTMLElement) => select(host, "pkg-committed-renews");

async function choose(el: HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not found");
  await act(async () => (el as HTMLElement).click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}

const button = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === text);

describe("RenewalSettingsPanel — the studio's auto-renewal answer", () => {
  it("says a studio that never answered reads as renewing, and offers the standard only while unanswered", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS);
    const text = host.textContent ?? "";
    expect(text).toContain("Solon hasn't answered yet, so its packages read as renewing automatically.");
    expect(text).toContain("if Solon is one of them, choose No and save.");
    const el = select(host, "renewals-autorenew");
    expect(el.value).toBe("");
    expect(options(el)).toEqual([
      ["", "Yes — the standard, not confirmed yet"],
      ["yes", "Yes, they renew automatically"],
      ["no", "No, billing ends when the payments finish"],
    ]);
    const label = host.querySelector('label[for="renewals-autorenew"]');
    expect(label?.textContent).toContain("Packages at Solon renew automatically");
    // The panel leads: before "When to talk".
    const titles = Array.from(host.querySelectorAll(".adm-panel")).map((p) => p.textContent ?? "");
    expect(titles[0]).toContain("Auto-renewal");
    // A package left alone follows the studio.
    expect(committed(host).value).toBe("");
    expect(options(committed(host))[0]).toEqual(["", "Same as the studio (renews)"]);
  });

  it("choosing No warns what it does, is a change, and saves exactly that one key", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS);
    await choose(select(host, "renewals-autorenew"), "no");
    expect(host.textContent).toContain(
      "Clients on a package set to “Same as the studio”, with no answer from Mindbody and no mark of their own, will read as not renewing, and their before-the-charge warnings stop. A package set to “It renews automatically” still renews.",
    );
    // The package rows now follow the studio's No.
    expect(options(committed(host))[0]).toEqual(["", "Same as the studio (doesn't renew)"]);
    await click(button(host, "Save settings"));
    expect(saves).toEqual([{ studioId: "solon", patch: { packagesRenewAutomatically: false } }]);
  });

  it("offers no way back to 'not answered' once a studio has answered", async () => {
    const host = await mount({ ...DEFAULT_RENEWAL_SETTINGS, packagesRenewAutomatically: false });
    const el = select(host, "renewals-autorenew");
    expect(el.value).toBe("no");
    expect(options(el).map(([v]) => v)).toEqual(["yes", "no"]);
    expect(host.textContent).not.toContain("hasn't answered yet");
    // No "turning off" warning for a studio that is already off.
    expect(host.textContent).not.toContain("will read as not renewing");
    expect(options(committed(host))[0]).toEqual(["", "Same as the studio (doesn't renew)"]);
  });

  it("locks every select for someone who may not change the settings", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, false);
    expect(select(host, "renewals-autorenew").disabled).toBe(true);
    expect(committed(host).disabled).toBe(true);
    expect(button(host, "Save settings")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * The names waiting, with suggestions (the renewals dashboard, Oct 7 2026):
 * Strongsville had 44 Mindbody names no package claimed. A leader confirms
 * each suggestion, or all of them, and the save bar writes them.
 * ------------------------------------------------------------------ */

const seen: RenewalNamesSeen = {
  names: {
    a: { name: "SV 6 Months/48 Sessions PIF", kind: "pricing-option", clients: 12 },
    b: { name: "144 Sessions w/ Roll Over", kind: "pricing-option", clients: 8 },
    c: { name: "SV Free Session Won", kind: "pricing-option", clients: 3 },
    d: { name: "Intro Offer", kind: "pricing-option", clients: 2 },
  },
};

const nameRow = (host: HTMLElement, name: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(".adm-row")).find((r) => r.querySelector(".adm-row__name")?.textContent === name);

describe("RenewalSettingsPanel — suggestions for the names waiting", () => {
  it("suggests a package or extra sessions for each name it can read, and says when it can't", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, true, seen);
    expect(nameRow(host, "SV 6 Months/48 Sessions PIF")?.textContent).toMatch(/Suggested: .+ · paid in full/);
    expect(nameRow(host, "144 Sessions w/ Roll Over")?.textContent).toMatch(/Suggested: .+ · sessions roll over/);
    expect(nameRow(host, "SV Free Session Won")?.textContent).toContain("Suggested: Extra sessions (complimentary or won)");
    expect(nameRow(host, "Intro Offer")?.textContent).toContain("No suggestion: match it by hand");
    expect(nameRow(host, "Intro Offer")?.querySelector("button")).toBeFalsy();
  });

  it("confirms one, and the save writes it into its package's names", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, true, seen);
    await click(nameRow(host, "SV 6 Months/48 Sessions PIF")?.querySelector("button"));
    // Matched in the form at once: it leaves the waiting list.
    expect(nameRow(host, "SV 6 Months/48 Sessions PIF")).toBeUndefined();
    expect(saves).toEqual([]);
    await click(button(host, "Save settings"));
    expect(saves).toHaveLength(1);
    const trial = (saves[0].patch.packages as Array<{ key: string; mindbodyNames: string[] }>).find((p) => p.key === "trial")!;
    expect(trial.mindbodyNames).toContain("SV 6 Months/48 Sessions PIF");
  });

  it("confirms all at once, leaving only the name it couldn't read", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, true, seen);
    await click(button(host, "Confirm all 3"));
    expect(nameRow(host, "SV 6 Months/48 Sessions PIF")).toBeUndefined();
    expect(nameRow(host, "144 Sessions w/ Roll Over")).toBeUndefined();
    expect(nameRow(host, "SV Free Session Won")).toBeUndefined();
    expect(nameRow(host, "Intro Offer")).toBeDefined();
    await click(button(host, "Save settings"));
    const patch = saves[0].patch as { packages: Array<{ key: string; mindbodyNames: string[] }>; extraSessionNames: string[] };
    expect(patch.extraSessionNames).toContain("SV Free Session Won");
    expect(patch.packages.find((p) => p.key === "transformed")!.mindbodyNames).toContain("144 Sessions w/ Roll Over");
  });

  // AJ, Oct 7 2026 ("yes"): warn before names adopt Max Strength's table as the studio's own.
  const WARNING = "Solon has no package table of its own yet: saving these names saves Max Strength's standard prices as Solon's. Check the prices in Packages above first.";

  it("warns, once, a studio with no package table of its own that saving names saves the standard prices, and still saves", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, true, seen, false);
    expect(host.textContent).toContain(WARNING);
    expect(host.textContent!.split(WARNING).length - 1).toBe(1);
    await click(button(host, "Confirm all 3"));
    // Still said while the confirmed names wait for the save.
    expect(host.textContent).toContain(WARNING);
    await click(button(host, "Save settings"));
    expect(saves).toHaveLength(1);
    expect(saves[0].patch.packages).toBeDefined();
  });

  it("stays quiet at a studio with its own package table, and to someone who can't change the settings", async () => {
    const own = await mount(DEFAULT_RENEWAL_SETTINGS, true, seen, true);
    expect(own.textContent).not.toContain("no package table of its own");
    const reader = await mount(DEFAULT_RENEWAL_SETTINGS, false, seen, false);
    expect(reader.textContent).not.toContain("no package table of its own");
  });

  it("stays quiet with nothing to match and nothing changed", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, true, null, false);
    expect(host.textContent).not.toContain("no package table of its own");
  });

  it("shows the suggestions without Confirm to someone who can't change the settings", async () => {
    const host = await mount(DEFAULT_RENEWAL_SETTINGS, false, seen);
    expect(nameRow(host, "SV Free Session Won")?.textContent).toContain("Suggested:");
    expect(button(host, "Confirm")).toBeUndefined();
    expect(button(host, "Confirm all 3")).toBeUndefined();
  });
});
