// @vitest-environment jsdom
/**
 * The profile header, MOUNTED: the nickname replaces the legal first name,
 * and the Master Sync button is the one sync trigger on the profile.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import { ProfileHeader, type ProfileHeaderProps } from "./ProfileHeader";

/* Base UI's menu does not open in jsdom (its positioning never settles), so
   the running-session menu is drawn open, with plain elements: what is
   tested is the header's own items, words and handlers. */
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div data-testid="menu">{children}</div>,
  DropdownMenuTrigger: ({ children, className }: { children: ReactNode; className?: string }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div role="menu">{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <div role="menuitem" tabIndex={0} onClick={onClick}>
      {children}
    </div>
  ),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const client = {
  id: "100",
  firstName: "Judith",
  lastName: "Daus",
  nickname: "Judy",
  homeStudioId: "solon",
  height: "5'4\"",
  isActive: true,
  remainingSessions: 0,
  clinicalFlags: [],
  medicalHistory: "Knee replacement 2019",
} as unknown as Client;

function props(over: Partial<ProfileHeaderProps> = {}): ProfileHeaderProps {
  return {
    client,
    studioName: "Solon",
    sessions: [],
    scheduledSessions: [],
    completedCount: 12,
    topTrainer: { top: null, source: "tally", backfilling: false },
    pkg: { label: null, remaining: null, total: null, source: "none", asOf: null, fromMindbody: false, autoRenews: null } as never,
    onBack: () => {},
    onStartSession: () => {},
    onContinueSession: () => {},
    onWatchSession: () => {},
    onDiscardSession: () => {},
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
function mount(p: ProfileHeaderProps) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<ProfileHeader {...p} />));
  return host;
}
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("ProfileHeader", () => {
  it("names the client by what they go by, keeping the legal name in the title", () => {
    const el = mount(props());
    const h1 = el.querySelector("h1")!;
    expect(h1.textContent).toBe("Judy Daus");
    expect(h1.getAttribute("title")).toContain("Judith Daus");
    // medical history alone raises the clinical badge
    expect(el.textContent).toContain("Clinical notes");
  });

  it("offers Master Sync, and only when there is something to sync from", () => {
    const onSync = vi.fn();
    const el = mount(props({ sync: { busy: false, onSync, label: "Synced 3 days ago", available: true } }));
    const btn = [...el.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Sync with Mindbody"))!;
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("Synced 3 days ago");
    act(() => btn.click());
    expect(onSync).toHaveBeenCalledTimes(1);
    act(() => root?.unmount());
    host?.remove();

    const el2 = mount(props({ sync: { busy: false, onSync, label: "Never synced", available: false } }));
    const off = [...el2.querySelectorAll("button")].find((b) => b.getAttribute("aria-label")?.startsWith("Sync with Mindbody"))!;
    expect(off.disabled).toBe(true);
  });

  it("draws no sync button when none is passed", () => {
    const el = mount(props());
    expect(el.querySelector('[aria-label^="Sync with Mindbody"]')).toBeNull();
  });
});

/*
 * The sessions box (AJ, Oct 2 2026: "this box just needs to show Sessions
 * Completed, Sessions Remaining ... make sure its condensed"). Sessions
 * before Journey and the package's name are on Notes & Profile -> Account.
 */
/*
 * The membership card (Oct 2 2026): each date beside the number it goes
 * with, "completed" and "remaining".
 */
describe("ProfileHeader's sessions box", () => {
  const box = (el: HTMLElement) => el.querySelector<HTMLElement>('[data-testid="sessions-tile"]')!;
  const text = (el: HTMLElement, id: string) => el.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;
  const pif = {
    label: "PIF",
    remaining: 36,
    total: null,
    source: "mindbody-membership",
    asOf: null,
    fromMindbody: true,
    autoRenews: null,
  } as ProfileHeaderProps["pkg"];

  it("says Completed and Remaining, and nothing about before Journey or the package's name", () => {
    const el = mount(props({ completedCount: 413, sessionsQuotable: true, pkg: pif }));
    expect(box(el).textContent).toContain("413 completed");
    expect(box(el).textContent).toContain("36 remaining");
    expect(text(el, "sessions-completed")).toBe("413");
    expect(text(el, "sessions-remaining")).toBe("36");
    expect(el.textContent).not.toContain("before Journey");
    expect(el.textContent).not.toContain("PIF");
  });

  it("calls the count Journey's when nobody has recorded what came before", () => {
    const el = mount(props({ completedCount: 3 }));
    expect(box(el).textContent).toContain("3 in Journey");
    expect(box(el).textContent).not.toContain("completed");
  });

  it("takes Left from the contract, and does not show the extras (Oct 2 2026)", () => {
    const el = mount(props({ pkg: pif, sessionsSplit: { contract: 36, hasContract: true, perPayment: false, extra: 12, other: 0 } }));
    expect(text(el, "sessions-remaining")).toBe("36");
    expect(el.querySelector('[data-testid="sessions-extra"]')).toBeNull();
    const none = mount(props({ pkg: pif, sessionsSplit: { contract: 5, hasContract: true, perPayment: true, extra: 0, other: 0 } }));
    expect(text(none, "sessions-remaining")).toBe("5");
    expect(none.querySelector('[data-testid="sessions-extra"]')).toBeNull();
  });

  it("shows a dash, never a zero, while a count is not known", () => {
    const el = mount(props({ completedCount: null, sessionsQuotable: true }));
    expect(text(el, "sessions-completed")).toBe("—");
    expect(text(el, "sessions-remaining")).toBe("—");
  });

  it("tallies late cancels beside the count, never inside it, and says nothing while unknown (Oct 2 2026)", () => {
    const el = mount(props({ completedCount: 40, sessionsQuotable: true, lateCancels: 2 }));
    expect(text(el, "sessions-completed")).toBe("40");
    expect(text(el, "late-cancels")).toBe("· 2 late cancels");
    const none = mount(props({ completedCount: 40, sessionsQuotable: true, lateCancels: null }));
    expect(none.querySelector('[data-testid="late-cancels"]')).toBeNull();
  });

  it("keeps the renewal tap one button", () => {
    const onRenewal = vi.fn();
    const el = mount(props({ renewal: { text: "9 left · auto-renews Nov 14", tone: "ok", attention: false, onOpen: onRenewal } }));
    expect(el.querySelectorAll("button button")).toHaveLength(0);
    const renewal = el.querySelector<HTMLButtonElement>('button[aria-label^="Renewal:"]')!;
    act(() => renewal.click());
    expect(onRenewal).toHaveBeenCalledTimes(1);
  });

  /*
   * The header and the codex Story sit on one screen, so they must say the
   * same thing about when she started. Journey's first session is proof of
   * that only when Journey holds her whole story.
   */
  it("reads 'In Journey since' for a FileMaker client whose only date is Journey's", () => {
    const filemaker = { ...client, firstSessionDate: "2026-09-02T15:00:00" } as unknown as Client;
    const el = mount(props({ client: filemaker, coverage: "partial" }));
    expect(el.textContent).toContain("In Journey since Sep 2026");
    expect(el.textContent).not.toContain("Client since");
    act(() => root?.unmount());
    host?.remove();

    const unknown = mount(props({ client: filemaker }));
    expect(unknown.textContent).toContain("In Journey since Sep 2026");
    act(() => root?.unmount());
    host?.remove();

    const brandNew = mount(props({ client: filemaker, coverage: "complete" }));
    expect(brandNew.textContent).toContain("Client since Sep 2026");
  });
});

/* The In-progress menu (session record, Sep 26 2026): Continue for this
   trainer's own session, Watch for anyone else's, and who started it. */
describe("ProfileHeader's running-session menu", () => {
  const trainers = [
    { id: "t-jc", initials: "JC", fullName: "Jane Coach" },
    { id: "t-aj", initials: "AJ", fullName: "AJ Jurgens" },
  ] as never;
  const running = (over: Record<string, unknown> = {}) => ({
    id: "s1",
    trainerId: "t-jc",
    trainerInitials: "JC",
    startedByTrainerId: "t-jc",
    startTime: { toMillis: () => Date.UTC(2026, 8, 26, 13, 4) },
    ...over,
  });
  async function openMenu(el: HTMLElement) {
    // Drawn open by the stand-in above; the trigger is still the header's.
    expect([...el.querySelectorAll("button")].some((b) => b.textContent?.includes("In progress"))).toBe(true);
  }
  const item = (label: string) =>
    [...document.body.querySelectorAll('[role="menuitem"]')].find((n) => n.textContent?.trim() === label) as
      | HTMLElement
      | undefined;

  it("offers Continue for this trainer's own session, and never Take over from here", async () => {
    const onContinueSession = vi.fn();
    const el = mount(props({ activeInProgressSession: running(), sessionIsMine: true, onContinueSession, trainers }));
    await openMenu(el);
    expect(item("Continue session")).toBeTruthy();
    expect(item("Watch session")).toBeUndefined();
    expect(document.body.textContent).not.toContain("Take over session");
    await act(async () => item("Continue session")!.click());
    expect(onContinueSession).toHaveBeenCalledTimes(1);
  });

  it("speaks in its own capitalisation, nothing under 12px (type and depth, phase 7)", async () => {
    const el = mount(props({ activeInProgressSession: running(), sessionIsMine: true, trainers }));
    await openMenu(el);
    const menu = document.body.querySelector('[role="menu"]')!;
    for (const node of [menu, ...Array.from(menu.querySelectorAll("*"))]) {
      const c = (node.getAttribute("class") ?? "").split(/\s+/);
      expect(c, node.textContent ?? "").not.toContain("uppercase");
      expect(c.some((k) => /^text-\[(?:9|10|11)(?:\.\d+)?px\]$/.test(k)), node.textContent ?? "").toBe(false);
    }
    // In progress is Go's other state: Go's words, the slanted capitals at 800,
    // and Go's depth (type and depth, phase 8): the short glow and top light,
    // a press, the fill restated on hover, and no raw amber blur or animated
    // shadow.
    const trigger = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("In progress"))!;
    const tc = trigger.className.split(/\s+/);
    expect(tc).toEqual(expect.arrayContaining(["font-display", "italic", "uppercase", "font-extrabold"]));
    expect(tc).toEqual(expect.arrayContaining(["shadow-(--go-lift)", "active:translate-y-px", "active:shadow-(--press)", "hover:bg-amber-500"]));
    expect(tc.some((k) => /^shadow-\[/.test(k)), "no raw shadow").toBe(false);
    expect(tc.some((k) => k === "transition-all" || k === "transition-shadow" || k === "transition-colors"), "only the fill and the move transition").toBe(false);
  });

  it("offers Watch for another trainer's session", async () => {
    const onWatchSession = vi.fn();
    const el = mount(props({ activeInProgressSession: running(), sessionIsMine: false, onWatchSession, trainers }));
    await openMenu(el);
    expect(item("Watch session")).toBeTruthy();
    expect(item("Continue session")).toBeUndefined();
    await act(async () => item("Watch session")!.click());
    expect(onWatchSession).toHaveBeenCalledTimes(1);
  });

  it("names who started it, and who took it over, at the studio's time", async () => {
    const el = mount(
      props({
        activeInProgressSession: running({ trainerId: "t-aj", trainerInitials: "AJ" }),
        sessionIsMine: false,
        trainers,
      }),
    );
    await openMenu(el);
    const line = document.body.querySelector('[data-testid="session-started-line"]')?.textContent;
    expect(line).toBe("Started by JC at 9:04 AM · AJ took it over");
  });
});

describe("ProfileHeader's checks (Oct 2 2026)", () => {
  it("marks a guessed first day with a grey check, not words", () => {
    const host = mount(props({ client: { ...client, firstAppointmentDate: "2020-01-15T15:00:00Z" } as unknown as Client }));
    expect(host.textContent).not.toContain("(from Mindbody)");
    expect(host.querySelector('[data-testid="since-check"]')?.getAttribute("data-confirmed")).toBe("no");
  });

  it("turns the first day's check green once a person has set it", () => {
    const host = mount(props({ client: { ...client, firstStudioDay: "2014-09-08" } as unknown as Client }));
    expect(host.querySelector('[data-testid="since-check"]')?.getAttribute("data-confirmed")).toBe("yes");
  });
});

describe("ProfileHeader's row of facts (Oct 2 2026)", () => {
  it("reads left to right: Sessions under the dates it goes with, then Last, Next and Top trainer", () => {
    const el = mount(props({ completedCount: 413, sessionsQuotable: true }));
    const strip = el.querySelector<HTMLElement>(".cp-head__strip")!;
    const labels = Array.from(strip.children).map((c) => (c.firstElementChild?.textContent ?? "").trim());
    expect(labels).toEqual(["Sessions", "Last session", "Next session", "Top trainer"]);
  });
});

/*
 * Type and depth, phase 7 (Oct 4 2026; AJ's answers 1A and 2A): the header is
 * a card, the name a title in the display face, upright, the facts one well,
 * the quiet tools one raised control on the 3:1 edge, and Start session Go.
 * jsdom loads no Tailwind, so these read the class lists the header renders.
 */
describe("ProfileHeader's look (type and depth, phase 7)", () => {
  const classes = (node: Element | null) => (node?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  const sync = { busy: false, onSync: () => {}, label: "Synced 3 days ago", available: true };

  it("is a card: an edge seen from outside, the panel's lift, no line under a band", () => {
    const c = classes(mount(props()).querySelector("header"));
    expect(c).toEqual(expect.arrayContaining(["cp-head", "bg-card", "border", "border-(--edge)", "bg-clip-padding", "rounded-xl", "shadow-(--panel-lift)"]));
    expect(c).not.toContain("border-b");
    // Tailwind writes "inset" in front of an inset-shadow-(--x) value, and
    // the dark --panel-highlight already starts with it: "inset inset" would
    // drop the card's whole shadow in dark.
    expect(c.some((k) => k.startsWith("inset-shadow-"))).toBe(false);
    expect(c.some((k) => /^(?:dark:)?border-slate-/.test(k))).toBe(false);
  });

  it("names the client in the display face, upright, at 30, wrapping and never cut", () => {
    const c = classes(mount(props()).querySelector("h1"));
    expect(c).toEqual(expect.arrayContaining(["cp-head__name", "font-display", "font-extrabold", "not-italic", "normal-case", "text-[30px]"]));
    expect(c).not.toContain("italic");
    expect(c).not.toContain("uppercase");
    expect(c).not.toContain("font-black");
    expect(c).not.toContain("truncate");
    expect(c).toContain("[overflow-wrap:anywhere]");
  });

  it("sinks the four facts into one well: --well, never bg-muted, and no fill or capitals on a cell", () => {
    const el = mount(props({ completedCount: 413, sessionsQuotable: true, scheduledSessions: [] }));
    const strip = el.querySelector(".cp-head__strip");
    const c = classes(strip);
    expect(c).toEqual(expect.arrayContaining(["bg-(--well)", "shadow-(--elev-0)"]));
    expect(c.some((k) => /(?:^|:)bg-muted\b/.test(k))).toBe(false);
    expect(c).not.toContain("border");
    expect(c.some((k) => /^(?:dark:)?bg-slate-/.test(k))).toBe(false);
    for (const cell of Array.from(strip!.children)) {
      const cc = classes(cell);
      expect(cc, cell.textContent ?? "").not.toContain("bg-card");
      // The stat label: 12/600 in its own capitalisation.
      const label = classes(cell.firstElementChild);
      expect(label).toEqual(expect.arrayContaining(["text-[12px]", "font-semibold"]));
      expect(label).not.toContain("uppercase");
    }
    // The headline figure: Saira 22/800, upright, tabular.
    const figure = classes(el.querySelector('[data-testid="sessions-completed"]'));
    expect(figure).toEqual(expect.arrayContaining(["font-display", "text-[22px]", "font-extrabold", "tabular-nums"]));
    expect(figure).not.toContain("italic");
  });

  it("keeps the late cancels whole, on a line of their own when the cell is narrow", () => {
    const el = mount(props({ completedCount: 40, lateCancels: 2, sessionsQuotable: true }));
    const late = el.querySelector('[data-testid="late-cancels"]')!;
    expect(classes(late)).toContain("whitespace-nowrap");
    expect(classes(late.parentElement)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    expect(classes(late.parentElement)).not.toContain("whitespace-nowrap");
  });

  it("raises the quiet tools as one control on the 3:1 edge, pressing in, never animating a shadow", () => {
    const el = mount(props({ sync, onQuickNote: () => {}, kaizen: { isOn: false, onToggle: () => {} } }));
    const group = classes(el.querySelector(".cp-head__tools"));
    expect(group).toEqual(expect.arrayContaining(["border", "border-input", "bg-(--raised)", "shadow-(--raised-lift)", "divide-(--divider)"]));
    expect(group.some((k) => /^(?:dark:)?(?:border|divide)-slate-/.test(k))).toBe(false);
    const tools = Array.from(el.querySelectorAll(".cp-head__tools > button"));
    expect(tools).toHaveLength(3);
    for (const t of tools) {
      const tc = classes(t);
      expect(tc).toEqual(expect.arrayContaining(["h-10", "text-[14px]", "font-semibold", "text-ink-d2", "active:shadow-(--press)"]));
      expect(tc).not.toContain("transition-all");
    }
  });

  it("draws Start session as Go: slanted capitals at 800 and 17, the orange lift, a press, no animated shadow", () => {
    const el = mount(props());
    const start = el.querySelector(".cp-head__start");
    const sc = classes(start);
    expect(sc).toEqual(expect.arrayContaining(["bg-(--eq-go)", "shadow-(--go-lift)", "active:translate-y-px", "active:shadow-(--press)"]));
    expect(sc).not.toContain("transition-all");
    expect(sc.some((k) => k.startsWith("hover:shadow-"))).toBe(false);
    const label = Array.from(start!.querySelectorAll("span")).find((s) => s.textContent === "Start session" && s.children.length === 0)!;
    expect(classes(label)).toEqual(expect.arrayContaining(["font-display", "italic", "uppercase", "font-extrabold", "text-[17px]", "tracking-[0.04em]"]));
  });

  it("draws the avatar's initials in the display face, upright, in a well", () => {
    const el = mount(props());
    const fallback = el.querySelector('[data-slot="avatar-fallback"]');
    expect(fallback, "no photo: the initials are drawn").not.toBeNull();
    expect(fallback!.textContent).toBe("JD");
    const fc = classes(fallback);
    expect(fc).toEqual(expect.arrayContaining(["font-display", "font-extrabold", "not-italic", "bg-(--well)", "shadow-(--elev-0)", "text-[22px]"]));
    expect(fc).not.toContain("italic");
    const avatar = classes(el.querySelector('[data-slot="avatar"]'));
    expect(avatar).toContain("bg-(--well)");
    expect(avatar.some((k) => k.startsWith("ring-"))).toBe(false);
  });
});
