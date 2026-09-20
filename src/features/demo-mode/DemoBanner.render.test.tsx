// @vitest-environment jsdom
/**
 * The strip mounts, says what it is, and can be left.
 *
 * Worth a mount rather than a snapshot because of where it sits: it is the
 * only thing on the Active Session that tells a trainer the client in front
 * of them is not a person, and AppContent renders it OUTSIDE the condition
 * that hides the header on that screen. If it ever stops rendering there,
 * nothing else in the app says "demo".
 */
import { describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { DemoBanner } from "./DemoBanner";
import { DEMO_STUDIO_NAME } from "./constants";

async function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{node}</StrictMode>);
  });
  return { host, root };
}

describe("the demo strip", () => {
  it("names Demo Mode and says nobody is real", async () => {
    const { host, root } = await mount(<DemoBanner />);
    expect(host.textContent).toContain(DEMO_STUDIO_NAME);
    expect(host.textContent).toContain("nobody here is real");
    await act(async () => root.unmount());
  });

  it("offers a way out, and calls it", async () => {
    let left = 0;
    const { host, root } = await mount(<DemoBanner onLeave={() => (left += 1)} />);
    const button = host.querySelector("button");
    expect(button).not.toBeNull();
    await act(async () => button!.click());
    expect(left).toBe(1);
    await act(async () => root.unmount());
  });

  it("has no way out when there is nowhere to send them", async () => {
    // The Operations and Admins dashboards mount inside the same shell; a
    // "Leave" that did nothing would be worse than no button.
    const { host, root } = await mount(<DemoBanner />);
    expect(host.querySelector("button")).toBeNull();
    await act(async () => root.unmount());
  });

  it("cannot be dismissed — there is no close control", async () => {
    const { host, root } = await mount(<DemoBanner onLeave={() => {}} />);
    const labels = Array.from(host.querySelectorAll("button")).map((b) =>
      (b.textContent || "").toLowerCase(),
    );
    expect(labels).toEqual(["leave"]);
    await act(async () => root.unmount());
  });

  it("is one line tall, because the floor has none to spare", async () => {
    const { host, root } = await mount(<DemoBanner />);
    const strip = host.firstElementChild as HTMLElement;
    expect(strip.className).toContain("h-[26px]");
    expect(strip.className).toContain("flex-none");
    await act(async () => root.unmount());
  });
});
