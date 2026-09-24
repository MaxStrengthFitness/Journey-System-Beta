// @vitest-environment jsdom
/**
 * The profile header, MOUNTED: the nickname replaces the legal first name,
 * and the Master Sync button is the one sync trigger on the profile.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Client } from "../../types";
import { ProfileHeader, type ProfileHeaderProps } from "./ProfileHeader";

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
    pkg: { label: null, remaining: null, total: null, source: "none", asOf: null, fromMindbody: false, autoRenews: false } as never,
    onBack: () => {},
    onStartSession: () => {},
    onTakeOverSession: () => {},
    onViewCurrentSession: () => {},
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
