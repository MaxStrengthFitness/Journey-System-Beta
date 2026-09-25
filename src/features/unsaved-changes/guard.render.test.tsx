// @vitest-environment jsdom
/**
 * The unsaved-changes guard, MOUNTED (Sep 24 2026).
 *
 * The pure gate is registry.test.ts. What only a mounted test can show is
 * the wiring: a screen registers in a layout effect, the REAL bottom bar
 * (components/AppBottomBar, exactly as AppContent mounts it) sets the view
 * through useGuardedState, the question is an in-app dialog in <body>, and
 * "Keep editing" really leaves the screen and its typing where they were.
 * Then the two other doors: the profile's tab bar (a leave SCOPE through the
 * real useProfileNav) and a Base UI dialog closed by Escape, which is how
 * the Edit Routine drawer is guarded.
 */
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { View } from "../../types";
import { AppBottomBar } from "../../components/AppBottomBar";
import { useProfileNav } from "../client-profile/useProfileNav";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  ExemptFromLeaveScope,
  UnsavedChangesProvider,
  UnsavedChangesScope,
  useLeaveGuard,
  useLeaveScope,
  useUnsavedChanges,
} from "./UnsavedChanges";
import { useGuardedSetter, useGuardedState } from "./useGuardedState";
import { useGuardedPlace } from "../admin/useGuardedPlace";
import type { PlaceAccess } from "../admin/operations-access";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <StrictMode>
        <UnsavedChangesProvider>{ui}</UnsavedChangesProvider>
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
  sessionStorage.clear();
});

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function click(el: Element | null | undefined) {
  if (!el) throw new Error("element not found");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

async function type(el: Element | null | undefined, value: string) {
  if (!el) throw new Error("field not found");
  const field = el as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(el: Element | null | undefined, k: string) {
  if (!el) throw new Error("element not found");
  await act(async () => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
  await settle();
}

const navButton = (root: ParentNode, label: string) =>
  Array.from(root.querySelectorAll("nav button")).find((b) => b.textContent?.trim() === label);

// The dialog is portalled into <body>, not into the host.
const question = () => document.querySelector('[role="alertdialog"]');
const answer = (action: "keep-editing" | "leave") =>
  document.querySelector(`[data-testid="leave-confirm"] [data-action="${action}"]`);

/** A screen holding typing, registered the way every real screen is. */
function Editor({ label, field }: { label: string; field: string }) {
  const [text, setText] = useState("");
  useUnsavedChanges(text !== "", label);
  return <textarea aria-label={field} value={text} onChange={(e) => setText(e.target.value)} />;
}

/* ------------------------------------------------------------------ *
 * The bottom bar
 * ------------------------------------------------------------------ */

function App({ start = "progress-report" }: { start?: View }) {
  const [view, setView] = useGuardedState<View>(start);
  return (
    <div data-testid="app" data-view={view}>
      {view === "progress-report" && <Editor label="this progress report" field="Report notes" />}
      <AppBottomBar
        appMode="trainer"
        currentView={view}
        isAdmin={false}
        hasClient
        liveSession={undefined}
        lastLearningView="learning"
        onNavigate={setView}
        onResumeSession={() => setView("workouts")}
      />
    </div>
  );
}

const viewOf = (host: HTMLElement) => host.querySelector('[data-testid="app"]')!.getAttribute("data-view");
const reportField = (host: HTMLElement) =>
  host.querySelector('textarea[aria-label="Report notes"]') as HTMLTextAreaElement | null;

describe("the bottom bar asks before it tears down unsaved typing", () => {
  it("goes straight there when nothing is typed", async () => {
    const host = await mount(<App />);
    await click(navButton(host, "Hub"));
    expect(viewOf(host)).toBe("clients");
    expect(question()).toBeNull();
  });

  it("asks in words, and Keep editing keeps the screen and every character", async () => {
    const host = await mount(<App />);
    await type(reportField(host), "Squat depth improved");
    await click(navButton(host, "Hub"));

    expect(question()!.textContent).toContain(
      "You have unsaved changes to this progress report. Leave without saving?",
    );
    expect(viewOf(host)).toBe("progress-report");
    // The safe answer is the default: it has the focus.
    expect(document.activeElement).toBe(answer("keep-editing"));
    const buttons = Array.from(question()!.querySelectorAll("button")).map((b) => b.textContent);
    expect(buttons).toEqual(["Leave", "Keep editing"]);

    await click(answer("keep-editing"));
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("progress-report");
    expect(reportField(host)!.value).toBe("Squat depth improved");
  });

  it("Leave goes wherever the tap was going", async () => {
    const host = await mount(<App />);
    await type(reportField(host), "Draft");
    await click(navButton(host, "Calendar"));
    await click(answer("leave"));
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("calendar");
    expect(reportField(host)).toBeNull();
  });

  it("asks from the tab that LOOKS current too — Client leaves the report for the profile", async () => {
    const host = await mount(<App />);
    await type(reportField(host), "Draft");
    await click(navButton(host, "Client"));
    expect(question()).not.toBeNull();
    await click(answer("leave"));
    expect(viewOf(host)).toBe("profile");
  });

  it("reads Escape and a tap on the scrim as Keep editing", async () => {
    const host = await mount(<App />);
    await type(reportField(host), "Draft");

    await click(navButton(host, "My Studio"));
    await key(answer("keep-editing"), "Escape");
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("progress-report");

    await click(navButton(host, "My Studio"));
    await click(document.querySelector('[data-testid="leave-confirm"]'));
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("progress-report");
    expect(reportField(host)!.value).toBe("Draft");
  });

  it("holds the browser's own prompt for a reload only while something is typed", async () => {
    const host = await mount(<App />);
    const reload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(reload()).toBe(false);
    await type(reportField(host), "Draft");
    expect(reload()).toBe(true);
    await click(navButton(host, "Hub"));
    await click(answer("leave"));
    expect(reload()).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * The profile's tab bar — a leave scope
 * ------------------------------------------------------------------ */

function Profile() {
  const tabs = useLeaveScope();
  const nav = useProfileNav("client-sam", { guard: tabs.guard });
  return (
    <div
      data-testid="profile"
      data-tab={nav.tab}
      data-view={nav.tab === "programming" ? nav.programmingView : "-"}
      data-page={nav.recordPage}
    >
      <button type="button" data-action="record" onClick={() => nav.setTab("record")}>Notes & Profile</button>
      <button type="button" data-action="journey" onClick={() => nav.setTab("journey")}>Journey</button>
      <button type="button" data-action="programming" onClick={() => nav.setTab("programming")}>Programming</button>
      <button type="button" data-action="setup" onClick={() => nav.setProgrammingView("setup")}>Setup</button>
      {/* Notes & Profile at a page: the codex's own switch, and the jump into it from another tab. */}
      <button type="button" data-action="open-ford" onClick={() => nav.openRecord("ford")}>FORD</button>
      <button type="button" data-action="open-account" onClick={() => nav.openRecord("account")}>Account</button>
      {/* Outside the tabs, like the header: a tab change does not touch it. */}
      <Editor label="the quick note" field="Quick note" />
      <UnsavedChangesScope scope={tabs}>
        {nav.tab === "record" && <Editor label="Sam's profile" field="Record" />}
        {nav.tab === "programming" && <Editor label="Sam's machine set-up" field="Setup draft" />}
      </UnsavedChangesScope>
    </div>
  );
}

const tabOf = (host: HTMLElement) => host.querySelector('[data-testid="profile"]')!.getAttribute("data-tab");
const act_ = (host: HTMLElement, action: string) => host.querySelector(`[data-action="${action}"]`);

describe("the profile's tabs ask about what is inside them, and only that", () => {
  it("asks before a tab change unmounts the record's typing", async () => {
    const host = await mount(<Profile />);
    await click(act_(host, "record"));
    await type(host.querySelector('textarea[aria-label="Record"]'), "Retired in May");
    await click(act_(host, "journey"));
    expect(question()!.textContent).toContain("You have unsaved changes to Sam's profile.");
    await click(answer("keep-editing"));
    expect(tabOf(host)).toBe("record");
    expect((host.querySelector('textarea[aria-label="Record"]') as HTMLTextAreaElement).value).toBe("Retired in May");

    await click(act_(host, "journey"));
    await click(answer("leave"));
    expect(tabOf(host)).toBe("journey");
  });

  it("does not ask about typing OUTSIDE the tabs, which a tab change leaves alone", async () => {
    const host = await mount(<Profile />);
    await type(host.querySelector('textarea[aria-label="Quick note"]'), "Call back Tuesday");
    await click(act_(host, "record"));
    expect(question()).toBeNull();
    expect(tabOf(host)).toBe("record");
  });

  it("never asks for a move within a tab", async () => {
    const host = await mount(<Profile />);
    await click(act_(host, "programming"));
    await type(host.querySelector('textarea[aria-label="Setup draft"]'), "seat 4");
    await click(act_(host, "setup"));
    expect(question()).toBeNull();
    expect(host.querySelector('[data-testid="profile"]')!.getAttribute("data-view")).toBe("setup");
  });

  /*
   * openRecord is the client codex's page switch and the jump into Notes &
   * Profile from another tab (the quick note's FORD door, the Deep Dive's
   * Edit medical). It dispatched straight through, so a jump from
   * Programming dropped Setup's drafts without a word (landing, Sep 24).
   */
  it("asks before a jump into Notes & Profile unmounts another tab's typing", async () => {
    const host = await mount(<Profile />);
    await click(act_(host, "programming"));
    await type(host.querySelector('textarea[aria-label="Setup draft"]'), "seat 4");
    await click(act_(host, "open-ford"));
    expect(question()!.textContent).toContain("You have unsaved changes to Sam's machine set-up.");
    await click(answer("keep-editing"));
    expect(tabOf(host)).toBe("programming");
    expect((host.querySelector('textarea[aria-label="Setup draft"]') as HTMLTextAreaElement).value).toBe("seat 4");

    await click(act_(host, "open-ford"));
    await click(answer("leave"));
    expect(tabOf(host)).toBe("record");
    expect(host.querySelector('[data-testid="profile"]')!.getAttribute("data-page")).toBe("ford");
  });

  it("never asks for a page switch inside Notes & Profile", async () => {
    const host = await mount(<Profile />);
    await click(act_(host, "record"));
    await type(host.querySelector('textarea[aria-label="Record"]'), "Retired in May");
    await click(act_(host, "open-ford"));
    await click(act_(host, "open-account"));
    expect(question()).toBeNull();
    expect(host.querySelector('[data-testid="profile"]')!.getAttribute("data-page")).toBe("account");
    expect((host.querySelector('textarea[aria-label="Record"]') as HTMLTextAreaElement).value).toBe("Retired in May");
  });
});

/* ------------------------------------------------------------------ *
 * A child the tab bar keeps mounted — the client codex (landing, Sep 24)
 * ------------------------------------------------------------------ */

/**
 * The profile keeps Notes & Profile (the client codex) mounted after its
 * first visit, so a tab change never loses the codex's Save bar edits. The
 * profile exempts it from the tabs' scope; the app's own navigation, which
 * DOES unmount it, still asks.
 */
function KeptProfile() {
  const tabs = useLeaveScope();
  const nav = useProfileNav("client-sam", { guard: tabs.guard });
  const leaveApp = useLeaveGuard();
  const [left, setLeft] = useState(false);
  const [seen, setSeen] = useState(false);
  if (nav.tab === "record" && !seen) setSeen(true);
  return (
    <div data-testid="profile" data-tab={nav.tab} data-left={left ? "1" : "0"}>
      <button type="button" data-action="record" onClick={() => nav.setTab("record")}>Notes & Profile</button>
      <button type="button" data-action="journey" onClick={() => nav.setTab("journey")}>Journey</button>
      <button type="button" data-action="hub" onClick={() => leaveApp(() => setLeft(true))}>Hub</button>
      <UnsavedChangesScope scope={tabs}>
        {(seen || nav.tab === "record") && (
          <ExemptFromLeaveScope scope={tabs}>
            <Editor label="Sam's profile" field="Record" />
          </ExemptFromLeaveScope>
        )}
      </UnsavedChangesScope>
    </div>
  );
}

describe("the client codex, kept mounted, is exempt from the tab bar's question", () => {
  it("changes tab without asking, and the typing is still there on the way back", async () => {
    const host = await mount(<KeptProfile />);
    await click(act_(host, "record"));
    await type(host.querySelector('textarea[aria-label="Record"]'), "Retired in May");
    await click(act_(host, "journey"));
    expect(question()).toBeNull();
    expect(tabOf(host)).toBe("journey");
    await click(act_(host, "record"));
    expect((host.querySelector('textarea[aria-label="Record"]') as HTMLTextAreaElement).value).toBe("Retired in May");
  });

  it("still asks when the app itself would leave the profile", async () => {
    const host = await mount(<KeptProfile />);
    await click(act_(host, "record"));
    await type(host.querySelector('textarea[aria-label="Record"]'), "Retired in May");
    await click(act_(host, "journey"));
    await click(act_(host, "hub"));
    expect(question()!.textContent).toContain("You have unsaved changes to Sam's profile.");
    await click(answer("keep-editing"));
    expect(host.querySelector('[data-testid="profile"]')!.getAttribute("data-left")).toBe("0");
  });
});

/* ------------------------------------------------------------------ *
 * AppContent's screen: held to who may open it, AND guarded (landing)
 * ------------------------------------------------------------------ */

/**
 * AppContent's screen lives in useGuardedPlace (the sign-out round: nobody
 * is ever on a screen they may not open) and every button sets it through
 * useGuardedSetter (this round). A move asks; the route gate's own refusal
 * — sending someone to the Hub when they lose Operations — never does.
 */
function PlaceApp({ access }: { access: PlaceAccess }) {
  const place = useGuardedPlace(access);
  const setView = useGuardedSetter<View>(place.currentView, place.setCurrentView);
  return (
    <div data-testid="app" data-view={place.currentView}>
      <button type="button" data-action="ops" onClick={() => { place.setAppMode("admin"); place.setCurrentView("admin-dashboard"); }}>Operations</button>
      {place.currentView === "clients" && <Editor label="the search" field="Hub typing" />}
      {place.currentView === "admin-dashboard" && <Editor label="the studio's day" field="Ops typing" />}
      <button type="button" data-action="progress" onClick={() => setView("progress-report")}>Report</button>
    </div>
  );
}

describe("AppContent's screen is both route-gated and guarded", () => {
  it("asks before a guarded move tears down typing", async () => {
    const host = await mount(<PlaceApp access={{ operations: true, admins: false }} />);
    await type(host.querySelector('textarea[aria-label="Hub typing"]'), "Sam");
    await click(act_(host, "progress"));
    expect(question()!.textContent).toContain("You have unsaved changes to the search.");
    await click(answer("leave"));
    expect(viewOf(host)).toBe("progress-report");
  });

  it("never asks when the route gate itself sends someone who lost Operations to the Hub", async () => {
    const host = await mount(<PlaceApp access={{ operations: true, admins: false }} />);
    await click(act_(host, "ops"));
    expect(viewOf(host)).toBe("admin-dashboard");
    await type(host.querySelector('textarea[aria-label="Ops typing"]'), "Open at 6");
    const { root } = mounted[mounted.length - 1];
    await act(async () => {
      root.render(
        <StrictMode>
          <UnsavedChangesProvider>
            <PlaceApp access={{ operations: false, admins: false }} />
          </UnsavedChangesProvider>
        </StrictMode>,
      );
    });
    await settle();
    expect(question()).toBeNull();
    expect(viewOf(host)).toBe("clients");
  });
});

/* ------------------------------------------------------------------ *
 * A drawer asking about itself (the Edit Routine drawer's shape)
 * ------------------------------------------------------------------ */

function Drawer() {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const unsaved = useUnsavedChanges(open && text !== "", "Routine A");
  return (
    <>
      <span data-testid="drawer-state" data-open={open ? "1" : "0"} />
      <Dialog open={open} onOpenChange={(next) => !next && unsaved.guard(() => setOpen(false))}>
        <DialogContent>
          <DialogTitle>Edit Routine</DialogTitle>
          <textarea aria-label="Sequence" value={text} onChange={(e) => setText(e.target.value)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

const drawerOpen = () => document.querySelector('[data-testid="drawer-state"]')!.getAttribute("data-open");

describe("a drawer asks before it closes over unsaved typing", () => {
  it("closes at once when nothing is typed", async () => {
    await mount(<Drawer />);
    await key(document.querySelector('textarea[aria-label="Sequence"]'), "Escape");
    expect(question()).toBeNull();
    expect(drawerOpen()).toBe("0");
  });

  it("asks on Escape; Escape again keeps editing and does NOT reach the drawer", async () => {
    await mount(<Drawer />);
    const field = () => document.querySelector('textarea[aria-label="Sequence"]');
    await type(field(), "Leg Press, Chest Press");

    await key(field(), "Escape");
    expect(question()!.textContent).toContain("You have unsaved changes to Routine A.");
    expect(drawerOpen()).toBe("1");

    // Stopped inside the question, so the drawer does not read it as its own.
    await key(answer("keep-editing"), "Escape");
    expect(question()).toBeNull();
    expect(drawerOpen()).toBe("1");
    expect((field() as HTMLTextAreaElement).value).toBe("Leg Press, Chest Press");

    await key(field(), "Escape");
    await click(answer("leave"));
    expect(question()).toBeNull();
    expect(drawerOpen()).toBe("0");
  });
});
