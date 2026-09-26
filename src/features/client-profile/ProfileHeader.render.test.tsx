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

describe("ProfileHeader — the door to Sessions before Journey", () => {
  const doorOf = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('button[aria-label^="Sessions before Journey"]');

  it("opens the editor from the Completed sessions tile", () => {
    const onOpen = vi.fn();
    const el = mount(
      props({
        completedCount: 461,
        priorLabel: "412 before Journey · FileMaker",
        priorHistoryDoor: { text: "412 before Journey · FileMaker", canEdit: true, onOpen },
      }),
    );
    const door = doorOf(el)!;
    expect(door).toBeTruthy();
    expect(door.textContent).toBe("412 before Journey · FileMaker");
    expect(door.getAttribute("aria-label")).toContain("Open to edit.");
    // Nothing tappable under 40px.
    expect(door.className).toContain("min-h-10");
    // The door replaces the plain label rather than repeating it.
    expect(el.textContent!.split("412 before Journey").length - 1).toBe(1);
    act(() => door.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the tile's renewal tap beside the door, never a button inside a button", () => {
    const onOpen = vi.fn();
    const onRenewal = vi.fn();
    const el = mount(
      props({
        priorHistoryDoor: { text: "412 before Journey · FileMaker", canEdit: true, onOpen },
        renewal: { text: "9 left · auto-renews Nov 14", tone: "ok", attention: false, onOpen: onRenewal },
      }),
    );
    expect(el.querySelectorAll("button button")).toHaveLength(0);
    const renewal = el.querySelector<HTMLButtonElement>('button[aria-label^="Renewal:"]')!;
    const door = doorOf(el)!;
    expect(renewal.contains(door)).toBe(false);
    // Same tile.
    expect(renewal.parentElement!.contains(door)).toBe(true);
    act(() => door.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onRenewal).not.toHaveBeenCalled();
    act(() => renewal.click());
    expect(onRenewal).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("offers it to read, for someone who cannot change it", () => {
    const onOpen = vi.fn();
    const el = mount(props({ priorHistoryDoor: { text: "412 before Journey · FileMaker", canEdit: false, onOpen } }));
    const door = doorOf(el)!;
    expect(door.getAttribute("aria-label")).toContain("Open to read.");
    act(() => door.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("says Add when there is nothing recorded yet", () => {
    const el = mount(props({ priorHistoryDoor: { text: "Add sessions before Journey", canEdit: true, onOpen: () => {} } }));
    expect(doorOf(el)!.textContent).toBe("Add sessions before Journey");
  });

  it("leaves the label as plain text when no door is passed", () => {
    const el = mount(props({ priorLabel: "412 before Journey · FileMaker" }));
    expect(el.textContent).toContain("412 before Journey · FileMaker");
    expect(doorOf(el)).toBeNull();
  });
});

/*
 * The completed-session tile (Sep 24 2026). A migrating client's count is
 * only what Journey has seen, and a count that has not landed is unknown -
 * the tile used to print "Completed sessions 0" for both.
 */
describe("ProfileHeader's session count", () => {
  const tile = (el: HTMLElement, label: string) =>
    [...el.querySelectorAll("*")].find((n) => n.children.length === 0 && n.textContent === label)?.closest("div, button");

  it("calls the count her completed sessions when it may be quoted as her total", () => {
    const el = mount(props({ completedCount: 413, sessionsQuotable: true, priorLabel: "412 before Journey · FileMaker" }));
    expect(el.textContent).toContain("Completed sessions");
    expect(el.textContent).toContain("413");
    expect(el.textContent).toContain("412 before Journey · FileMaker");
  });

  it("calls it Journey's count when nobody has recorded what came before", () => {
    const el = mount(props({ completedCount: 3 }));
    expect(el.textContent).toContain("Sessions in Journey");
    expect(el.textContent).not.toContain("Completed sessions");
    expect(tile(el, "Sessions in Journey")?.textContent).toContain("3");
  });

  it("shows a dash, never a zero, while the count is not known", () => {
    const el = mount(props({ completedCount: null, sessionsQuotable: true }));
    const t = tile(el, "Completed sessions");
    expect(t?.textContent).toContain("—");
    expect(t?.textContent).not.toMatch(/\b0\b/);
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

/*
 * With no renewal snapshot and no count, the package pill used to read
 * "Auto-renews" whenever autopay was active. Auto-renew is on at some studios
 * and not at others (AJ, Sep 24 2026), so only Mindbody's own flag may say it;
 * otherwise the pill is the package name alone.
 */
describe("ProfileHeader's package pill", () => {
  const monthly = (autoRenews: boolean | null) =>
    ({
      label: "12-Month Autopay",
      remaining: null,
      total: null,
      source: "mindbody-contract",
      asOf: null,
      fromMindbody: true,
      autoRenews,
    }) as ProfileHeaderProps["pkg"];
  const pill = (el: HTMLElement) => el.querySelector('[title="Synced from Mindbody"]')?.textContent;

  it("says Auto-renews when Mindbody's flag says so", () => {
    expect(pill(mount(props({ pkg: monthly(true) })))).toBe("Auto-renews · 12-Month Autopay");
  });

  it("names the package and claims nothing when Mindbody hasn't said, or says it won't", () => {
    for (const autoRenews of [null, false]) {
      const el = mount(props({ pkg: monthly(autoRenews) }));
      expect(pill(el)).toBe("12-Month Autopay");
      expect(el.textContent).not.toContain("Auto-renews");
      act(() => root?.unmount());
      host?.remove();
    }
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
