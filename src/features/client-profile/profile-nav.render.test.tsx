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
});
