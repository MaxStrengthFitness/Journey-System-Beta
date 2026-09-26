// @vitest-environment jsdom
/**
 * The packages sheet, MOUNTED. It builds its lineup during render, holds a
 * reducer through StrictMode, portals a base-ui dialog and swaps two views,
 * none of which a unit test runs (CLAUDE.md: a green typecheck and suite do
 * not mean a screen mounts).
 *
 * The studio's table comes from a stand-in for useRenewalSettings so each
 * test can set exactly the hook state it is about: loading, a refused read,
 * a studio switch, the standard prices, a studio's own table.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RenewalSettingsState } from "../renewals/useRenewalSettings";
import type { PackageTier } from "../renewals/types";

const hook = vi.hoisted(() => ({ state: null as unknown as RenewalSettingsState, calls: [] as Array<string | null | undefined> }));

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));
vi.mock("../renewals/useRenewalSettings", () => ({
  useRenewalSettings: (studioId: string | null | undefined) => {
    hook.calls.push(studioId);
    return hook.state;
  },
}));

import { DEFAULT_PACKAGES, DEFAULT_RENEWAL_SETTINGS } from "../renewals/settings";
import { PackagesSheet, type PackagesSheetProps } from "./PackagesSheet";

/* jsdom has neither; the dialog wants them. */
const g = globalThis as unknown as Record<string, unknown>;
const hadRO = "ResizeObserver" in g;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!hadRO) {
    g.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});
afterAll(() => {
  if (!hadRO) delete g.ResizeObserver;
});

function state(over: Partial<RenewalSettingsState> = {}): RenewalSettingsState {
  return {
    settings: DEFAULT_RENEWAL_SETTINGS,
    saved: true,
    ownPackageTable: true,
    forStudioId: "westlake",
    loading: false,
    error: null,
    ...over,
  };
}

function withPackages(packages: PackageTier[], over: Partial<RenewalSettingsState> = {}): RenewalSettingsState {
  return state({ settings: { ...DEFAULT_RENEWAL_SETTINGS, packages }, ...over });
}

beforeEach(() => {
  hook.state = state();
  hook.calls = [];
  document.body.innerHTML = "";
});

interface Mounted {
  host: HTMLElement;
  root: Root;
  closed: number;
  rerender: (over?: Partial<PackagesSheetProps>) => Promise<void>;
}

function baseProps(m: { closed: number }, over: Partial<PackagesSheetProps> = {}): PackagesSheetProps {
  return {
    open: true,
    onClose: () => {
      m.closed += 1;
    },
    studioId: "westlake",
    studioName: "Westlake",
    clientFirstName: "Judy",
    trainerFullName: "Sam Rivera",
    bookedWeekdays: [2],
    ...over,
  };
}

async function mount(over: Partial<PackagesSheetProps> = {}): Promise<Mounted> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const m: Mounted = { host, root, closed: 0, rerender: async () => {} };
  let current = over;
  m.rerender = async (next = {}) => {
    current = { ...current, ...next };
    await act(async () => {
      root.render(
        <StrictMode>
          <PackagesSheet {...baseProps(m, current)} />
        </StrictMode>,
      );
    });
    await settle();
  };
  await m.rerender();
  return m;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function unmount(m: Mounted) {
  await act(async () => m.root.unmount());
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;
const text = () => dialog()?.textContent ?? "";
const buttons = () => [...(dialog()?.querySelectorAll("button") ?? [])] as HTMLButtonElement[];
const button = (label: string | RegExp) =>
  buttons().find((b) =>
    typeof label === "string"
      ? b.textContent?.trim() === label || b.getAttribute("aria-label") === label
      : label.test(b.textContent ?? "") || label.test(b.getAttribute("aria-label") ?? ""),
  );

async function click(el: Element | undefined | null) {
  if (!el) throw new Error("nothing to click");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

/** The length columns, in order. */
const lengths = () => [...(dialog()?.querySelectorAll(".pk-length") ?? [])] as HTMLButtonElement[];
const bigPrice = () => dialog()?.querySelector('[data-testid="pk-big-price"]')?.textContent ?? "";

describe("the sheet opens", () => {
  it("as a dialog named for the studio, reading that studio's table", async () => {
    const m = await mount();
    expect(dialog()).not.toBeNull();
    expect(dialog()!.querySelector(".pk-title")?.textContent).toBe("Packages at Westlake");
    expect(hook.calls).toContain("westlake");
    expect(text()).toContain("Westlake’s prices");
    await unmount(m);
  });

  it("with no studio name, as just Packages", async () => {
    const m = await mount({ studioName: null });
    expect(dialog()!.querySelector(".pk-title")?.textContent).toBe("Packages");
    await unmount(m);
  });

  it("on the 12-month package, marked as the trainer's recommendation", async () => {
    const m = await mount();
    const [trial, committed, transformed] = lengths();
    expect(lengths()).toHaveLength(3);
    expect(committed.getAttribute("aria-pressed")).toBe("true");
    expect(trial.getAttribute("aria-pressed")).toBe("false");
    expect(transformed.getAttribute("aria-pressed")).toBe("false");
    expect(committed.textContent).toContain("Sam’s recommendation");
    expect(bigPrice()).toContain("$60");
    expect(text()).not.toMatch(/most popular/i);
    await unmount(m);
  });

  it("does nothing on a closed sheet", async () => {
    const m = await mount({ open: false });
    expect(dialog()).toBeNull();
    await unmount(m);
  });
});

describe("never a wrong price", () => {
  it("shows no price while loading", async () => {
    hook.state = state({ loading: true });
    const m = await mount();
    expect(text()).not.toContain("$");
    expect(dialog()!.querySelector('[role="status"]')).not.toBeNull();
    await unmount(m);
  });

  it("shows no price after a refused read, and says so", async () => {
    hook.state = state({ error: "Couldn't load this studio's renewal settings. Showing the defaults." });
    const m = await mount();
    expect(text()).not.toContain("$");
    expect(text()).toContain("Couldn’t load Westlake’s prices, so none are shown.");
    await unmount(m);
  });

  it("waits rather than show the previous studio's table after a switch", async () => {
    hook.state = state({ forStudioId: "solon" });
    const m = await mount();
    expect(text()).not.toContain("$");
    await unmount(m);
  });

  it("says there is nothing to show without a studio", async () => {
    const m = await mount({ studioId: null });
    expect(text()).toContain("No studio is set for Judy, so there are no prices to show.");
    expect(text()).not.toContain("$");
    await unmount(m);
  });

  it("says whose prices they are when the studio has no table of its own", async () => {
    hook.state = state({ ownPackageTable: false });
    const m = await mount();
    expect(text()).toContain("Max Strength’s standard prices");
    await unmount(m);
  });

  it("shows a studio's own prices, and 'Price not set yet' for a package with none, never $0", async () => {
    hook.state = withPackages([
      { ...DEFAULT_PACKAGES[0], ratePerSession: 75, paymentAmount: 600, prepayRatePerSession: 72 },
      { ...DEFAULT_PACKAGES[1], ratePerSession: 0, paymentAmount: 0, prepayRatePerSession: 0 },
      DEFAULT_PACKAGES[2],
    ]);
    const m = await mount();
    expect(lengths()[0].textContent).toContain("$75 a session");
    expect(lengths()[1].textContent).toContain("Price not set yet");
    expect(text()).not.toContain("$0");
    await unmount(m);
  });
});

describe("the trainer's controls", () => {
  it("switches every price between a session, a week and each payment", async () => {
    const m = await mount();
    await click(button("A week"));
    expect(lengths()[1].textContent).toContain("$120 a week");
    expect(bigPrice()).toContain("$120");
    await click(button("Each payment"));
    expect(lengths()[0].textContent).toContain("$560 every 4 weeks");
    expect(bigPrice()).toContain("$480");
    await unmount(m);
  });

  it("paid in full, shows the one payment and what it saves, and nothing billed every 4 weeks", async () => {
    const m = await mount();
    await click(button("In full"));
    expect(bigPrice()).toContain("$57");
    expect(text()).toContain("$5,472 once, for 96 sessions.");
    expect(text()).toContain("$288 less overall");
    // The third pick turns into the one payment.
    expect(button("Each payment")).toBeUndefined();
    await click(button("Paid once"));
    expect(bigPrice()).toContain("$5,472");
    expect(bigPrice()).toContain("once, in full");
    // The every-4-weeks steps are about monthly payments; paid in full has none.
    expect(dialog()!.querySelector(".pk-steps")).toBeNull();
    await unmount(m);
  });

  it("selects one length at a time, and the recommendation stays where it was", async () => {
    const m = await mount();
    await click(lengths()[0]);
    expect(lengths().map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(lengths()[1].textContent).toContain("Sam’s recommendation");
    expect(lengths()[0].textContent).not.toContain("recommendation");
    expect(bigPrice()).toContain("$70");
    await unmount(m);
  });

  it("says a longer commitment lowers every payment only when it does", async () => {
    const m = await mount();
    expect(text()).toContain("A longer commitment lowers every payment.");
    await unmount(m);
    hook.state = withPackages([DEFAULT_PACKAGES[0], { ...DEFAULT_PACKAGES[1], ratePerSession: 75, paymentAmount: 600 }]);
    const m2 = await mount();
    expect(text()).not.toContain("lowers every payment");
    await unmount(m2);
  });

  it("moves the weeks away one a tap under StrictMode, stops at 0 and 16, and says what it means", async () => {
    const m = await mount();
    const minus = () => button("One week fewer away")!;
    const plus = () => button("One more week away")!;
    expect(minus().disabled).toBe(true);
    await click(plus());
    expect(dialog()!.querySelector(".pk-stepper__value")?.textContent).toBe("1 week");
    await click(plus());
    await click(plus());
    await click(plus());
    expect(dialog()!.querySelector(".pk-stepper__value")?.textContent).toBe("4 weeks");
    expect(dialog()!.querySelector('[data-testid="pk-life-sentence"]')?.textContent).toBe(
      "With 4 weeks away, the 96 sessions take about 52 weeks. This package’s 12 payments finish at week 48, and sessions you haven’t used never expire.",
    );
    for (let i = 0; i < 20; i++) if (!plus().disabled) await click(plus());
    expect(dialog()!.querySelector(".pk-stepper__value")?.textContent).toBe("16 weeks");
    expect(plus().disabled).toBe(true);
    await unmount(m);
  });

  it("lights a booked day, which isn't a toggle, and lets the trainer pick two more", async () => {
    const m = await mount();
    const day = (short: string) => [...dialog()!.querySelectorAll(".pk-week .cx-pick")].find((b) => b.textContent?.startsWith(short)) as HTMLButtonElement;
    expect(day("Tue").getAttribute("aria-pressed")).toBe("true");
    expect(day("Tue").textContent).toContain("Booked");
    expect(day("Tue").disabled).toBe(true);
    await click(day("Mon"));
    await click(day("Thu"));
    await click(day("Sat"));
    expect(day("Mon").getAttribute("aria-pressed")).toBe("false");
    expect(day("Thu").getAttribute("aria-pressed")).toBe("true");
    expect(day("Sat").getAttribute("aria-pressed")).toBe("true");
    await unmount(m);
  });

  it("closes from the close button, Done, and Escape", async () => {
    const m = await mount();
    await click(button("Close the packages"));
    expect(m.closed).toBe(1);
    await click(button("Done"));
    expect(m.closed).toBe(2);
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await settle();
    expect(m.closed).toBe(3);
    await unmount(m);
  });
});

describe("the trainer notes", () => {
  it("are nowhere on the client's view until opened, and the two views never show together", async () => {
    const m = await mount();
    expect(dialog()!.querySelector('[data-testid="pk-trainer-notes"]')).toBeNull();
    expect(text()).not.toMatch(/If money is the worry|speak first|Session Comp|\$2,592/);
    await click(button("Trainer notes"));
    expect(dialog()!.querySelector('[data-testid="pk-trainer-notes"]')).not.toBeNull();
    expect(lengths()).toHaveLength(0);
    expect(text()).toContain("If money is the worry");
    expect(text()).toContain("$54 a session, Life Transformed’s rate, on The Trial: 6 payments of $432, $2,592 in all.");
    await click(button("Back to the packages"));
    expect(dialog()!.querySelector('[data-testid="pk-trainer-notes"]')).toBeNull();
    await unmount(m);
  });

  it("move or clear the recommendation, and the client's view follows", async () => {
    const m = await mount();
    await click(button("Trainer notes"));
    await click(button("Life Transformed, 18 months"));
    await click(button("Back to the packages"));
    expect(lengths()[2].textContent).toContain("Sam’s recommendation");
    expect(lengths()[1].textContent).not.toContain("recommendation");
    await click(button("Trainer notes"));
    await click(button("No recommendation"));
    await click(button("Back to the packages"));
    expect(text()).not.toContain("recommendation");
    await unmount(m);
  });

  it("keep a once-a-week package off the client's screen until the trainer puts it there", async () => {
    hook.state = withPackages([
      ...DEFAULT_PACKAGES,
      { ...DEFAULT_PACKAGES[0], key: "once", label: "Once a week", sessions: 24, ratePerSession: 75, paymentAmount: 300, prepayRatePerSession: 72, mindbodyNames: [] },
    ]);
    const m = await mount();
    expect(lengths()).toHaveLength(3);
    expect(text()).not.toContain("Once a week");
    await click(button("Trainer notes"));
    await click(button("Show once a week on their screen"));
    await click(button("Back to the packages"));
    expect(lengths()).toHaveLength(4);
    expect(text()).toContain("Also at Westlake");
    await unmount(m);
  });

  it("say when the table has no once-a-week package, without telling anyone to add one", async () => {
    const m = await mount();
    await click(button("Trainer notes"));
    expect(text()).toContain("Westlake’s table has no once-a-week package, so there’s no price to quote.");
    await unmount(m);
  });

  it("warn about a package whose prices don't add up, and leave its total off the client's view", async () => {
    hook.state = withPackages([DEFAULT_PACKAGES[0], { ...DEFAULT_PACKAGES[1], paymentAmount: 500 }, DEFAULT_PACKAGES[2]]);
    const m = await mount();
    expect(text()).not.toContain("The whole package is $5,760");
    await click(button("Trainer notes"));
    expect(text()).toMatch(/Committed: 12 payments of \$500 don’t match 96 sessions at \$60/);
    await unmount(m);
  });
});

describe("the review's cases (Sep 24)", () => {
  const once = { ...DEFAULT_PACKAGES[0], key: "once", label: "Once a week", sessions: 24, ratePerSession: 75, paymentAmount: 300, prepayRatePerSession: 72, mindbodyNames: [] };

  it("keeps the pressed column and the card on the same package when a shown row is hidden again", async () => {
    hook.state = withPackages([...DEFAULT_PACKAGES, once]);
    const m = await mount();
    await click(button("Trainer notes"));
    await click(button("Show once a week on their screen"));
    await click(button("Back to the packages"));
    await click(lengths()[3]);
    expect(dialog()!.querySelector(".pk-selected .cx-eyebrow")?.textContent).toMatch(/^Once a week/);
    // With once a week on screen, nothing claims every package is twice a week.
    expect(dialog()!.querySelector(".pk-lede")?.textContent).not.toMatch(/twice a week/);
    expect(dialog()!.querySelector(".pk-week")).toBeNull();
    await click(button("Trainer notes"));
    await click(button("On their screen"));
    await click(button("Back to the packages"));
    const pressed = lengths().filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Committed");
    expect(dialog()!.querySelector(".pk-selected .cx-eyebrow")?.textContent).toMatch(/^Committed/);
    await unmount(m);
  });

  it("says 'Total not shown', never a total, for a package whose prices don't add up, paid in full too", async () => {
    hook.state = withPackages([DEFAULT_PACKAGES[0], { ...DEFAULT_PACKAGES[1], paymentAmount: 500, prepayRatePerSession: 60 }, DEFAULT_PACKAGES[2]]);
    const m = await mount();
    await click(button("In full"));
    await click(button("Paid once"));
    expect(lengths()[1].textContent).toContain("Total not shown");
    expect(bigPrice()).toContain("Total not shown");
    expect(text()).not.toContain("$5,760");
    await unmount(m);
  });

  it("says a package renews where the studio said it does, on the timeline too", async () => {
    hook.state = withPackages([DEFAULT_PACKAGES[0], { ...DEFAULT_PACKAGES[1], renewsAutomatically: true }, DEFAULT_PACKAGES[2]]);
    const m = await mount();
    await click(button("One more week away"));
    expect(dialog()!.querySelector(".pk-timeline__label")?.textContent).toBe("Renews · week 48");
    expect(dialog()!.querySelector('[data-testid="pk-life-sentence"]')?.textContent).toMatch(/Committed renews at week 48/);
    await unmount(m);
  });
});

describe("the method's words", () => {
  it("says sessions never expire, and says auto-renew only where the studio said so", async () => {
    const m = await mount();
    expect(text()).toContain("Sessions you haven’t used never expire.");
    expect(text()).toContain("Westlake will explain what happens when your payments finish.");
    expect(text()).not.toContain("renews automatically");
    await unmount(m);
    hook.state = withPackages([DEFAULT_PACKAGES[0], { ...DEFAULT_PACKAGES[1], renewsAutomatically: true }, DEFAULT_PACKAGES[2]]);
    const m2 = await mount();
    expect(text()).toContain("When the payments finish, Committed renews automatically.");
    await unmount(m2);
  });

  it("draws the dots as a picture with its words", async () => {
    const m = await mount();
    const img = dialog()!.querySelector('.pk-dots[role="img"]');
    expect(img?.getAttribute("aria-label")).toBe("96 sessions: 12 payments of 8. Each group is four weeks of training.");
    expect(dialog()!.querySelectorAll(".pk-dot")).toHaveLength(96);
    await unmount(m);
  });

  it("says nothing about twice a week for a table with no twice-a-week package", async () => {
    hook.state = withPackages([
      { ...DEFAULT_PACKAGES[0], key: "once", label: "Once a week", sessions: 24, ratePerSession: 75, paymentAmount: 300, prepayRatePerSession: 72 },
    ]);
    const m = await mount();
    // The guarantee's own condition ("show up twice a week") is Max
    // Strength's words and stays; the screen's own claims go.
    expect(dialog()!.querySelector(".pk-lede")?.textContent).not.toMatch(/twice a week/);
    expect(text()).not.toContain("twenty minutes twice a week");
    expect(dialog()!.querySelector(".pk-week")).toBeNull();
    expect(dialog()!.querySelector('[data-testid="pk-life-sentence"]')?.textContent).toMatch(/^At once a week/);
    await unmount(m);
  });
});

/* ------------------------------------------------------------------ */
/* Nothing tappable under 40px                                         */
/* ------------------------------------------------------------------ */

const HERE = dirname(fileURLToPath(import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const rulesOf = (file: string) =>
  [...strip(readFileSync(file, "utf8")).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((m) => !m[1].trim().startsWith("@"))
    .map((m) => ({ selectors: m[1].split(",").map((s) => s.trim()), body: m[2] }));
const RULES = [
  ...rulesOf(join(HERE, "..", "client-codex", "kit", "kit.css")),
  ...rulesOf(join(HERE, "packages.css")),
];
const TOKENS = Object.fromEntries(
  [...strip(readFileSync(join(HERE, "..", "client-codex", "codex.tokens.css"), "utf8")).matchAll(/(--cx-[\w-]+)\s*:\s*([^;]+);/g)].map(
    (m) => [m[1], m[2].trim()],
  ),
);
function px(value: string): number {
  const v = value.trim();
  const token = /^var\((--cx-[\w-]+)\)$/.exec(v);
  if (token) return px(TOKENS[token[1]] ?? "0");
  const n = /^(\d+(?:\.\d+)?)px$/.exec(v);
  return n ? Number(n[1]) : 0;
}
function minHeight(el: Element): number {
  let best = 0;
  for (const rule of RULES) {
    const m = /(?:^|;|\s)min-height\s*:\s*([^;]+)/.exec(rule.body);
    if (!m) continue;
    if (rule.selectors.some((s) => { try { return el.matches(s); } catch { return false; } })) best = Math.max(best, px(m[1]));
  }
  return best;
}

describe("nothing tappable under 40px", () => {
  for (const notes of [false, true]) {
    it(`on the ${notes ? "trainer notes" : "client's view"}, and every button has a type`, async () => {
      hook.state = withPackages([
        ...DEFAULT_PACKAGES,
        { ...DEFAULT_PACKAGES[0], key: "once", label: "Once a week", sessions: 24, ratePerSession: 75, paymentAmount: 300, prepayRatePerSession: 72 },
      ]);
      const m = await mount();
      if (notes) await click(button("Trainer notes"));
      const controls = buttons();
      expect(controls.length).toBeGreaterThan(8);
      for (const el of controls) {
        expect(minHeight(el), `button.${el.className} "${el.textContent?.trim() || el.getAttribute("aria-label")}"`).toBeGreaterThanOrEqual(40);
        expect(el.getAttribute("type")).toBe("button");
      }
      await unmount(m);
    });
  }
});
