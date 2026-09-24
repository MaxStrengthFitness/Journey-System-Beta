// @vitest-environment jsdom
/**
 * THE FIRST RENDER TESTS IN THIS REPO, and the reason they exist.
 *
 * The four-tab profile shipped a crash that a clean typecheck, 2,069 passing
 * tests and a production build all missed, because every one of those looks at
 * code that is never mounted. The profile threw
 *
 *     ReferenceError: Cannot access 'ctxRef' before initialization
 *
 * the first time a trainer changed tabs, and the whole screen fell through to
 * the error boundary.
 *
 * WHY IT ONLY SHOWED UP ON NAVIGATION. React does not call a reducer on mount.
 * It calls it while processing a QUEUED action, and it does that during the
 * next render, at the point of the `useReducer` call. The reducer was a wrapper
 * arrow that read `ctxRef.current`, and `const ctxRef` was declared a few lines
 * BELOW `useReducer` — so at the moment React ran it, that const was still in
 * its temporal dead zone. No action queued, no crash; hence a profile that
 * opened perfectly and died on the first tap.
 *
 * The fix was structural, not a moved line: `profileNavReducer` now takes two
 * arguments, lives at module scope, closes over nothing, and gets everything it
 * needs from the action. See the note on `ProfileNavAction`.
 *
 * These tests MOUNT things. That is the whole point — they are cheap, they need
 * only jsdom, and they are the only check in the suite that would have caught
 * this. Add one for any hook or component that does work during render or in a
 * layout effect.
 */
import { describe, expect, it } from "vitest";
import { StrictMode, act, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProfileSubnav, type SubnavItem } from "./ProfileSubnav";
import { useProfileNav } from "./useProfileNav";
import { RECORD_PAGES } from "./profile-nav";
import type { ProfileTab, ProgrammingView, RecordPage } from "./profile-nav";
import type { DossierSection } from "../../types/journal";

/** Mount into a detached host and always unmount, so one failure cannot cascade. */
async function mount(ui: React.ReactNode): Promise<{ host: HTMLElement; root: Root }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
  });
  return { host, root };
}

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("useProfileNav mounts and navigates", () => {
  function Probe({ clientId, go }: { clientId: string; go?: ProfileTab }) {
    const nav = useProfileNav(clientId, { programmingDefault: "routine-b" });
    useEffect(() => {
      if (go) nav.setTab(go);
    }, [go, nav]);
    return (
      <span data-testid="where">
        {nav.tab}:{nav.tab === "programming" ? nav.programmingView : "-"}
      </span>
    );
  }

  it("opens on Journey", async () => {
    const { host, root } = await mount(<Probe clientId="judy" />);
    expect(host.textContent).toBe("journey:-");
    await act(async () => root.unmount());
  });

  it("survives a tab change — the crash that shipped", async () => {
    // A dispatch from an effect is what queues an action, which is what makes
    // React run the reducer DURING the next render. This is the exact shape
    // that threw "Cannot access 'ctxRef' before initialization".
    const { host, root } = await mount(<Probe clientId="judy" go="programming" />);
    await tick();
    expect(host.textContent).toBe("programming:routine-b");
    await act(async () => root.unmount());
  });

  it("survives the client changing under it", async () => {
    function Swapper() {
      const [id, setId] = useState("judy");
      useEffect(() => {
        const t = setTimeout(() => setId("marcus"), 0);
        return () => clearTimeout(t);
      }, []);
      return <Probe clientId={id} />;
    }
    const { host, root } = await mount(<Swapper />);
    await tick();
    // A different client is a different screen: never the last one's segment.
    expect(host.textContent).toBe("journey:-");
    await act(async () => root.unmount());
  });
});

describe("useProfileNav opens Notes & Profile at a page", () => {
  /**
   * Every step is dispatched from an EFFECT, one per tick — a queued action,
   * which is what makes React run the reducer during the next render (the
   * shape of the crash that shipped). The probe prints the record's page,
   * card and the long scroll's section (the temporary shim).
   */
  type Step =
    | { openRecord: [RecordPage, string?] }
    | { openSection: DossierSection }
    | { setTab: ProfileTab }
    | { legacy: string };

  function RecordProbe({ clientId, steps }: { clientId: string; steps: Step[] }) {
    const nav = useProfileNav(clientId);
    const [at, setAt] = useState(0);
    // StrictMode runs a mount effect twice; each step must still run once.
    const ran = useRef(-1);
    useEffect(() => {
      const step = steps[at];
      if (!step || ran.current >= at) return;
      ran.current = at;
      if ("openRecord" in step) nav.openRecord(...step.openRecord);
      else if ("openSection" in step) nav.openSection(step.openSection);
      else if ("setTab" in step) nav.setTab(step.setTab);
      else nav.goLegacy(step.legacy);
      setAt((n) => n + 1);
    }, [at, steps, nav]);
    return (
      <span data-testid="where">
        {nav.tab}|{nav.recordPage}|{nav.recordAnchor ?? "-"}|{nav.recordSection ?? "-"}
      </span>
    );
  }

  async function run(steps: Step[]): Promise<string> {
    const { host, root } = await mount(<RecordProbe clientId="judy" steps={steps} />);
    for (let i = 0; i <= steps.length; i++) await tick();
    const text = host.textContent ?? "";
    await act(async () => root.unmount());
    return text;
  }

  it("reports the Overview while the record is not showing", async () => {
    expect(await run([])).toBe("journey|overview|-|-");
  });

  it("opens a page and a card from an effect without crashing", async () => {
    expect(await run([{ openRecord: ["ford", "ford-occupation"] }])).toBe(
      "record|ford|ford-occupation|life",
    );
  });

  it("lands QuickNoteDialog's FORD door on FORD — the long scroll on Life", async () => {
    expect(await run([{ openRecord: ["ford"] }])).toBe("record|ford|-|life");
  });

  it("lands the Activity Archive's edit-medical door on Body's watch-outs", async () => {
    expect(await run([{ openRecord: ["body", "body-watchouts"] }])).toBe(
      "record|body|body-watchouts|medical",
    );
  });

  it("still takes a dossier section", async () => {
    expect(await run([{ openSection: "life" }])).toBe("record|ford|-|life");
    expect(await run([{ openSection: "focus" }])).toBe("record|goals|goals-focus|focus");
    expect(await run([{ openSection: "reports" }])).toBe("record|body|body-pulse|reports");
  });

  it("opens the Overview on every entry to the tab, even after a deep link", async () => {
    expect(await run([{ setTab: "record" }])).toBe("record|overview|-|-");
    expect(
      await run([
        { openRecord: ["goals", "goals-focus"] },
        { setTab: "journey" },
        { setTab: "record" },
      ]),
    ).toBe("record|overview|-|-");
  });

  it("forgets the record's page when the tab is left", async () => {
    expect(await run([{ openRecord: ["account", "account-membership"] }, { setTab: "clinical" }])).toBe(
      "clinical|overview|-|-",
    );
  });

  it("takes a legacy id onto its page", async () => {
    expect(await run([{ legacy: "admin" }])).toBe("record|account|account-membership|admin");
  });

  it("goes back to Journey when the client changes, whatever page the record was on", async () => {
    const swap: { to?: (id: string) => void } = {};
    const steps: Step[] = [{ openRecord: ["story"] }];
    function Swapper() {
      const [id, setId] = useState("judy");
      swap.to = setId;
      return <RecordProbe clientId={id} steps={steps} />;
    }
    const { host, root } = await mount(<Swapper />);
    await tick();
    await tick();
    expect(host.textContent).toBe("record|story|-|-");
    await act(async () => swap.to?.("marcus"));
    await tick();
    expect(host.textContent).toBe("journey|overview|-|-");
    await act(async () => root.unmount());
  });
});

describe("ProfileSubnav mounts", () => {
  const items: SubnavItem<ProgrammingView>[] = [
    { id: "routine-a", label: "Routine A", meta: "8 machines", flag: true },
    { id: "routine-b", label: "Routine B", meta: "off" },
    { id: "machines", label: "All Machines", meta: "21 on roster" },
  ];

  function Bar({ onChange }: { onChange?: (v: ProgrammingView) => void }) {
    const [v, setV] = useState<ProgrammingView>("routine-a");
    return (
      <div className="ptab">
        <ProfileSubnav
          label="Programming views"
          items={items}
          value={v}
          onChange={(next) => {
            setV(next);
            onChange?.(next);
          }}
          context={<span>21 machines prescribed</span>}
        />
      </div>
    );
  }

  it("renders every segment, and never hides one", async () => {
    const { host, root } = await mount(<Bar />);
    const btns = host.querySelectorAll(".psub__btn");
    expect(btns).toHaveLength(3);
    // Routine B is switched off in this fixture and must still be on screen.
    expect(host.textContent).toContain("Routine B");
    expect(host.textContent).toContain("off");
    await act(async () => root.unmount());
  });

  it("marks exactly one segment selected, for the screen reader too", async () => {
    const { host, root } = await mount(<Bar />);
    const on = host.querySelectorAll('[aria-selected="true"]');
    expect(on).toHaveLength(1);
    expect(on[0].textContent).toContain("Routine A");
    await act(async () => root.unmount());
  });

  it("runs its layout effect without throwing when there is no scroll parent", async () => {
    // jsdom reports no scrolling ancestor and zero heights. The measurement
    // must degrade to 0 rather than blow up — a detached or not-yet-laid-out
    // tree is a real case (the first frame, and the thumbnail capture).
    const { host, root } = await mount(<Bar />);
    const shell = host.querySelector(".psub-shell") as HTMLElement;
    expect(shell.style.getPropertyValue("--psub-stick-top")).toBe("0px");
    await act(async () => root.unmount());
  });

  it("changes segment on a tap", async () => {
    const seen: ProgrammingView[] = [];
    const { host, root } = await mount(<Bar onChange={(v) => seen.push(v)} />);
    const machines = host.querySelectorAll<HTMLButtonElement>(".psub__btn")[2];
    await act(async () => {
      machines.click();
    });
    expect(seen).toEqual(["machines"]);
    expect(machines.getAttribute("aria-selected")).toBe("true");
    await act(async () => root.unmount());
  });

  it("adds none of the codex's attributes to a bar that does not ask for them", async () => {
    // Programming and the Activity Archive pass no wrap, no idPrefix and no
    // flagTone, and every wrap rule in profile-nav.css hangs off one of these
    // attributes — so their absence is what keeps those two bars as they were.
    const { host, root } = await mount(<Bar />);
    expect(host.querySelector(".psub-shell")?.hasAttribute("data-wrap")).toBe(false);
    for (const btn of host.querySelectorAll(".psub__btn")) {
      expect(btn.hasAttribute("id")).toBe(false);
      expect(btn.hasAttribute("aria-controls")).toBe(false);
    }
    const dot = host.querySelector(".psub__dot");
    expect(dot).not.toBeNull();
    expect(dot?.hasAttribute("data-tone")).toBe(false);
    await act(async () => root.unmount());
  });
});

describe("ProfileSubnav wraps the codex's seven pages", () => {
  /** What each segment says underneath — the mockup's lines, for a full client. */
  const META: Record<RecordPage, string> = {
    overview: "everything",
    notes: "3 open · 1 critical",
    ford: "Birthday in 17 days",
    body: "3 watch-outs",
    goals: "2 focuses running",
    story: "since 2019",
    account: "95 sessions left",
  };

  /** The real seven, in AJ's order; Notes has a critical note, Body watch-outs. */
  const pages: SubnavItem<RecordPage>[] = RECORD_PAGES.map((p) => ({
    id: p.id,
    label: p.label,
    meta: META[p.id],
    flag: p.id === "notes" || p.id === "body",
    flagTone: p.id === "body" ? "warn" : undefined,
  }));

  function Codex({ onChange }: { onChange?: (p: RecordPage) => void }) {
    const [page, setPage] = useState<RecordPage>("overview");
    return (
      <div className="cx">
        <ProfileSubnav
          label="Notes and profile pages"
          items={pages}
          value={page}
          onChange={(next) => {
            setPage(next);
            onChange?.(next);
          }}
          wrap
          idPrefix="cx"
          context={<span>Read only here · Westlake keeps this record.</span>}
        />
      </div>
    );
  }

  const selected = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('[aria-selected="true"]')).map((b) => b.id);

  it("draws all seven in AJ's order, hides none, and marks itself as wrapping", async () => {
    const { host, root } = await mount(<Codex />);
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>(".psub__btn"));
    expect(btns).toHaveLength(7);
    expect(btns.every((b) => !b.hidden)).toBe(true);
    expect(Array.from(host.querySelectorAll(".psub__label")).map((l) => l.textContent)).toEqual(
      RECORD_PAGES.map((p) => p.label),
    );
    // Every meta line is drawn — the codex's say whether a page could be read.
    expect(Array.from(host.querySelectorAll(".psub__meta")).map((m) => m.textContent)).toEqual(
      RECORD_PAGES.map((p) => META[p.id]),
    );
    expect(host.querySelector(".psub-shell")?.getAttribute("data-wrap")).toBe("true");
    // Seven equal tracks, not content width.
    const list = host.querySelector(".psub") as HTMLElement;
    expect(list.style.getPropertyValue("--psub-n")).toBe("7");
    expect(list.getAttribute("aria-label")).toBe("Notes and profile pages");
    expect(selected(host)).toEqual(["cx-tab-overview"]);
    await act(async () => root.unmount());
  });

  it("names every segment and points it at its page's panel", async () => {
    const { host, root } = await mount(<Codex />);
    const ids = Array.from(host.querySelectorAll(".psub__btn")).map((b) => b.id);
    expect(ids).toEqual(RECORD_PAGES.map((p) => `cx-tab-${p.id}`));
    expect(new Set(ids).size).toBe(7);
    for (const p of RECORD_PAGES) {
      const btn = host.querySelector(`#cx-tab-${p.id}`);
      expect(btn?.getAttribute("role")).toBe("tab");
      expect(btn?.getAttribute("aria-controls")).toBe(`cx-panel-${p.id}`);
    }
    await act(async () => root.unmount());
  });

  it("draws Body & Pulse's dot plum and Notes' in the default crimson", async () => {
    const { host, root } = await mount(<Codex />);
    expect(host.querySelector("#cx-tab-body .psub__dot")?.getAttribute("data-tone")).toBe("warn");
    const notesDot = host.querySelector("#cx-tab-notes .psub__dot");
    expect(notesDot).not.toBeNull();
    expect(notesDot?.hasAttribute("data-tone")).toBe(false);
    expect(host.querySelector("#cx-tab-overview .psub__dot")).toBeNull();
    // The dot is decoration; the meta line is what a screen reader hears.
    expect(host.querySelector("#cx-tab-body .psub__dot")?.getAttribute("aria-hidden")).toBe("true");
    await act(async () => root.unmount());
  });

  it("changes page on a tap", async () => {
    const seen: RecordPage[] = [];
    const { host, root } = await mount(<Codex onChange={(p) => seen.push(p)} />);
    await act(async () => {
      (host.querySelector("#cx-tab-goals") as HTMLButtonElement).click();
    });
    expect(seen).toEqual(["goals"]);
    expect(selected(host)).toEqual(["cx-tab-goals"]);
    await act(async () => root.unmount());
  });

  it("walks all seven with the arrow keys, round the ends, and moves focus with it", async () => {
    const { host, root } = await mount(<Codex />);
    const press = (key: string) =>
      act(async () => {
        const on = host.querySelector('[aria-selected="true"]') as HTMLElement;
        on.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    await press("ArrowLeft");
    expect(selected(host)).toEqual(["cx-tab-account"]);
    expect(document.activeElement?.id).toBe("cx-tab-account");
    await press("ArrowRight");
    expect(selected(host)).toEqual(["cx-tab-overview"]);
    await press("End");
    expect(selected(host)).toEqual(["cx-tab-account"]);
    await press("Home");
    expect(selected(host)).toEqual(["cx-tab-overview"]);
    await act(async () => root.unmount());
  });

  it("runs its layout effect with no ResizeObserver at all", async () => {
    // The codex's bar is the one whose height changes most (a label taking a
    // second line), so it leans on the observer most — and must still mount
    // without one. Anything that throws in a layout effect takes the whole
    // profile to the error boundary.
    const g = globalThis as { ResizeObserver?: unknown };
    const had = "ResizeObserver" in g;
    const saved = g.ResizeObserver;
    delete g.ResizeObserver;
    try {
      const { host, root } = await mount(<Codex />);
      const shell = host.querySelector(".psub-shell") as HTMLElement;
      const cx = host.querySelector(".cx") as HTMLElement;
      expect(shell.style.getPropertyValue("--psub-stick-top")).toBe("0px");
      // jsdom lays nothing out, so the published height is 0 — but published.
      expect(cx.style.getPropertyValue("--psub-stuck-h")).toBe("0px");
      await act(async () => root.unmount());
      expect(cx.style.getPropertyValue("--psub-stuck-h")).toBe("");
    } finally {
      if (had) g.ResizeObserver = saved;
    }
  });

  it("observes its own height when it can, and lets go on unmount", async () => {
    const g = globalThis as { ResizeObserver?: unknown };
    const had = "ResizeObserver" in g;
    const saved = g.ResizeObserver;
    const observed: Element[] = [];
    let disconnected = 0;
    g.ResizeObserver = class {
      observe(el: Element) {
        observed.push(el);
      }
      unobserve() {}
      disconnect() {
        disconnected += 1;
      }
    };
    try {
      const { host, root } = await mount(<Codex />);
      const shell = host.querySelector(".psub-shell");
      expect(observed.length).toBeGreaterThan(0);
      expect(observed.every((el) => el === shell)).toBe(true);
      await act(async () => root.unmount());
      // StrictMode mounts the effect twice; every observer it made is released.
      expect(disconnected).toBe(observed.length);
    } finally {
      if (had) g.ResizeObserver = saved;
      else delete g.ResizeObserver;
    }
  });
});
