// @vitest-environment jsdom
/**
 * The unfinished-session notice, MOUNTED (Sep 24 2026): an abandoned
 * session is said out loud on the profile, with Discard beside it — before
 * this, Discard could not reach one from anywhere.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StaleSessionNotice } from "./StaleSessionNotice";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(ui));
  mounted.push({ root, host });
  return host;
}

afterEach(async () => {
  for (const m of mounted) {
    await act(async () => m.root.unmount());
    m.host.remove();
  }
  mounted = [];
});

const yesterdays = {
  id: "sess-yesterday",
  status: "In-Progress",
  date: "2026-09-23",
  trainerInitials: "JC",
  startTime: new Date("2026-09-23T13:04:00Z"), // 9:04 AM Eastern
};

describe("StaleSessionNotice", () => {
  it("says when and by whom the session started, and that Start will ask", async () => {
    const host = await mount(
      <StaleSessionNotice session={yesterdays} todayKey="2026-09-24" onDiscard={() => {}} />,
    );
    const text = host.textContent ?? "";
    expect(text).toContain("An unfinished session.");
    expect(text).toContain("Started yesterday at 9:04 AM by JC.");
    expect(text).toContain("asks whether to resume it or begin a new one");
  });

  it("Discard hands the choice up — the notice deletes nothing itself", async () => {
    const onDiscard = vi.fn();
    const host = await mount(
      <StaleSessionNotice session={yesterdays} todayKey="2026-09-24" onDiscard={onDiscard} />,
    );
    const button = Array.from(host.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("Discard it"),
    )!;
    // iPad-first: nothing tappable under 40px. h-10 is 40px.
    expect(button.className).toContain("h-10");
    await act(async () => button.click());
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});
