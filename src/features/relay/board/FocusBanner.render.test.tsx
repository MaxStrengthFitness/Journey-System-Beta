// @vitest-environment jsdom
/**
 * THE FOCUS BANNER ON THE FLOOR (voice review follow-up, Sep 27 2026).
 *
 * The network's focus this quarter, as a quiet line on every studio's Floor.
 * It proves the banner draws nothing without a focus, names the series and
 * the machine, and, when only "A line for the floor" is set, says plain
 * "This quarter" rather than "This quarter · " with nothing after it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";

const active = vi.hoisted(() => ({ network: null as unknown }));

vi.mock("../../../contexts/ActiveStudioContext", () => ({
  useActiveStudio: () => ({ network: active.network }),
}));

import { FocusBanner } from "./FocusBanner";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function render(network: unknown) {
  active.network = network;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <StrictMode>
        <FocusBanner />
      </StrictMode>,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  active.network = null;
});

describe("FocusBanner", () => {
  it("draws nothing when the network has no focus", async () => {
    const el = await render({ id: "n-ohio", name: "Ohio", studioIds: [] });
    expect(el.textContent).toBe("");
  });

  it("names the mastery series and the machine to try, and the line for the floor", async () => {
    const el = await render({ relayFocus: { mastery: "Hip hinge", machine: "Leg Curl", note: "Five clients by October." } });
    expect(el.querySelector(".fb__what")?.textContent).toBe("This quarter · Mastery: Hip hinge · Try the Leg Curl");
    expect(el.querySelector(".fb__note")?.textContent).toBe("Five clients by October.");
  });

  it("says plain 'This quarter' when only the line for the floor is set", async () => {
    const el = await render({ relayFocus: { mastery: "", machine: "", note: "Five clients by October." } });
    expect(el.querySelector(".fb__what")?.textContent).toBe("This quarter");
    expect(el.textContent).not.toContain("·");
    expect(el.querySelector(".fb__note")?.textContent).toBe("Five clients by October.");
  });
});
