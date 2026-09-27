// @vitest-environment jsdom
/**
 * The report screen with no report, MOUNTED (voice review follow-up, Sep 27
 * 2026): its one button says where it goes. AppContent's handler hands off
 * to the Activity Archive's Reports before switching to the profile, so the
 * button says "Back to Reports" (it said "Back to the record" and landed on
 * Journey).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ReportNotOpened } from "./ReportNotOpened";

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

describe("ReportNotOpened", () => {
  it("says what happened and offers one way back, named for where it lands", async () => {
    const onBack = vi.fn();
    const host = await mount(
      <ReportNotOpened message="This client's record could not be read, so no report was opened." onBack={onBack} />,
    );
    expect(host.textContent).toContain("could not be read");
    const buttons = Array.from(host.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent?.trim()).toBe("Back to Reports");
    expect(host.textContent).not.toContain("Back to the record");
    await act(async () => buttons[0].click());
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
