// @vitest-environment jsdom
/**
 * Mounts the sign-in screen.
 *
 * It was inline JSX inside AppContent until the beta-prep trim (Sep 17 2026)
 * moved it into its own component. The markup did not change, but the wiring
 * did - the buttons now call an `onLogin` prop instead of AppContent's own
 * handleLogin - and a typecheck cannot tell you a button still calls the
 * right provider. This is the first screen every trainer sees.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LoginScreen } from "./LoginScreen";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

async function mount(ui: React.ReactNode) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<StrictMode>{ui}</StrictMode>);
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
});

const buttonSaying = (host: HTMLElement, text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text)) as
    | HTMLButtonElement
    | undefined;

describe("LoginScreen", () => {
  it("draws both providers and sends each button to its own provider", async () => {
    const onLogin = vi.fn();
    const host = await mount(<LoginScreen isLoggingIn={false} loginError={null} onLogin={onLogin} />);

    expect(host.querySelector("h1")?.textContent).toBe("Journey");
    const google = buttonSaying(host, "Continue with Google");
    const microsoft = buttonSaying(host, "Continue with Microsoft");
    expect(google).toBeDefined();
    expect(microsoft).toBeDefined();

    await act(async () => google!.click());
    expect(onLogin).toHaveBeenLastCalledWith("google");
    await act(async () => microsoft!.click());
    expect(onLogin).toHaveBeenLastCalledWith("microsoft");
    expect(onLogin).toHaveBeenCalledTimes(2);
  });

  it("locks both buttons while a sign-in is in flight, and shows the error when there is one", async () => {
    const onLogin = vi.fn();
    const host = await mount(
      <LoginScreen isLoggingIn loginError="Sign-in was cancelled." onLogin={onLogin} />,
    );

    expect(host.textContent).toContain("Sign-in was cancelled.");
    const google = buttonSaying(host, "Continue with Google")!;
    const microsoft = buttonSaying(host, "Continue with Microsoft")!;
    expect(google.disabled).toBe(true);
    expect(microsoft.disabled).toBe(true);

    await act(async () => google.click());
    expect(onLogin).not.toHaveBeenCalled();
  });

  it("says which studio this iPad opens, before anyone signs in", async () => {
    localStorage.setItem("journey_device_studio", JSON.stringify({ id: "strongsville", name: "Strongsville" }));
    localStorage.setItem("max_strength_default_studio_id", "strongsville");
    const host = await mount(<LoginScreen isLoggingIn={false} loginError={null} onLogin={vi.fn()} />);
    expect(host.textContent).toContain("This iPad opens Strongsville");
    localStorage.clear();
  });

  it("puts the error where it happened, as an alert", async () => {
    const host = await mount(<LoginScreen isLoggingIn={false} loginError="Check the Wi-Fi." onLogin={vi.fn()} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Check the Wi-Fi.");
  });
});

/*
 * THE BUTTONS WAIT FOR THE POPUP HELPER (the speed round, Oct 5 2026, R14).
 * Auth now starts without it on a device that was signed in; on Safari a
 * popup opened after the tap is blocked, so the buttons wait until the
 * helper has loaded (features/front-door/sign-in-ready.ts).
 */
describe("LoginScreen before the popup sign-in is ready", () => {
  it("holds both buttons and, if the wait is noticeable, says why", async () => {
    vi.useFakeTimers();
    try {
      const onLogin = vi.fn();
      const host = await mount(<LoginScreen isLoggingIn={false} loginError={null} onLogin={onLogin} signInReady={false} />);
      expect(buttonSaying(host, "Continue with Google")!.disabled).toBe(true);
      expect(buttonSaying(host, "Continue with Microsoft")!.disabled).toBe(true);
      expect(host.textContent).not.toContain("Getting sign-in ready");
      await act(async () => {
        vi.advanceTimersByTime(500);
      });
      expect(host.textContent).toContain("Getting sign-in ready");
      await act(async () => buttonSaying(host, "Continue with Google")!.click());
      expect(onLogin).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
