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
