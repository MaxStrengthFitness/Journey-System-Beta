// @vitest-environment jsdom
/**
 * The boundary MOUNTED around a real lazy screen whose file cannot be loaded
 * (new-version round, Sep 26 2026). It works in getDerivedStateFromError and
 * in an effect, so only a mounted test shows it: the missing file replaces
 * only that screen, any other error still reaches the boundary above, the
 * Active Session's own screen is said to be one, and Pulse inside a session
 * says its sentence and never reloads anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, Component, lazy, Suspense, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LoadBoundary, ScreenRecoveryProvider, type ScreenRecovery } from "./LoadBoundary";
import { versionStore } from "./version-store";
import type { BrokenScreenState } from "./words";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

class Outer extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    return this.state.error ? <p data-testid="outer">Something went wrong</p> : this.props.children;
  }
}

const missingFile = () => lazy(() => Promise.reject(new TypeError("Importing a module script failed.")));

function Throws(): ReactNode {
  throw new TypeError("Cannot read properties of undefined (reading 'id')");
}

function recovery(overrides: Partial<ScreenRecovery> = {}): ScreenRecovery {
  return {
    recover: vi.fn(async () => ({ phase: "checking" }) as BrokenScreenState),
    tap: vi.fn(async () => ({ phase: "checking" }) as BrokenScreenState),
    ownSessionClientName: null,
    ...overrides,
  };
}

async function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(node);
  });
  await act(async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
  return host;
}

async function rerender(node: ReactNode) {
  await act(async () => {
    root!.render(node);
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, json: async () => ({}) })),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a screen whose file is gone", () => {
  it("replaces only that screen, and asks the app to recover", async () => {
    const Screen = missingFile();
    const r = recovery({
      recover: vi.fn(async () => ({ phase: "wait", cause: "new-version", reason: "own-session" }) as BrokenScreenState),
      ownSessionClientName: "Sam",
    });
    await render(
      <Outer>
        <header>Header stays</header>
        <ScreenRecoveryProvider value={r}>
          <LoadBoundary kind="screen" resetKey="profile">
            <Suspense fallback={<p>Loading…</p>}>
              <Screen />
            </Suspense>
          </LoadBoundary>
        </ScreenRecoveryProvider>
      </Outer>,
    );
    expect(document.querySelector('[data-testid="outer"]')).toBeNull();
    expect(document.body.textContent).toContain("Header stays");
    expect(r.recover).toHaveBeenCalledWith(false);
    expect(document.querySelector('[data-testid="broken-screen"]')?.textContent).toBe(
      "This screen is part of a newer version of Journey, which will load after your session with Sam.",
    );
    expect(document.querySelector("button")).toBeNull();
  });

  it("asks again when the session it waited for closes, rather than keep a sentence no longer true", async () => {
    const Screen = missingFile();
    const recover = vi
      .fn<(sessionScreen: boolean) => Promise<BrokenScreenState>>()
      .mockResolvedValueOnce({ phase: "wait", cause: "new-version", reason: "own-session" })
      .mockResolvedValueOnce({ phase: "loading", cause: "new-version" });
    const tree = (name: string | null) => (
      <ScreenRecoveryProvider value={recovery({ recover, ownSessionClientName: name })}>
        <LoadBoundary kind="screen" resetKey="profile">
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </LoadBoundary>
      </ScreenRecoveryProvider>
    );
    await render(tree("Sam"));
    expect(document.body.textContent).toContain("after your session with Sam");
    await rerender(tree(null));
    await act(async () => {
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    expect(recover).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("Loading the new version of Journey…");
  });

  it("tells the app when it is the Active Session's own screen", async () => {
    const Screen = missingFile();
    const r = recovery({ recover: vi.fn(async () => ({ phase: "loading", cause: "new-version" }) as BrokenScreenState) });
    await render(
      <ScreenRecoveryProvider value={r}>
        <LoadBoundary kind="screen" resetKey="workouts" sessionScreen>
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </LoadBoundary>
      </ScreenRecoveryProvider>,
    );
    expect(r.recover).toHaveBeenCalledWith(true);
    expect(document.body.textContent).toContain("Loading the new version of Journey…");
  });

  it("offers the new version when only typing held it, and taps through to the app", async () => {
    const Screen = missingFile();
    const r = recovery({
      recover: vi.fn(async () => ({ phase: "wait", cause: "new-version", reason: "typing" }) as BrokenScreenState),
      tap: vi.fn(async () => ({ phase: "loading", cause: "new-version" }) as BrokenScreenState),
    });
    await render(
      <ScreenRecoveryProvider value={r}>
        <LoadBoundary kind="screen" resetKey="profile">
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </LoadBoundary>
      </ScreenRecoveryProvider>,
    );
    const button = document.querySelector("button")!;
    expect(button.textContent).toBe("Load the new version");
    await act(async () => {
      button.click();
    });
    expect(r.tap).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Loading the new version of Journey…");
  });

  it("offers Try again when it was the connection", async () => {
    const Screen = missingFile();
    const r = recovery({
      recover: vi.fn(async () => ({ phase: "wait", cause: "not-loaded", reason: "offline" }) as BrokenScreenState),
    });
    await render(
      <ScreenRecoveryProvider value={r}>
        <LoadBoundary kind="screen" resetKey="profile">
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </LoadBoundary>
      </ScreenRecoveryProvider>,
    );
    expect(document.body.textContent).toContain("This screen couldn't be loaded. The iPad may be offline.");
    expect(document.querySelector("button")?.textContent).toBe("Try again");
  });

  it("clears when the trainer goes to another screen", async () => {
    const Screen = missingFile();
    const r = recovery();
    const tree = (view: string) => (
      <ScreenRecoveryProvider value={r}>
        <LoadBoundary kind="screen" resetKey={view}>
          <Suspense fallback={null}>{view === "profile" ? <Screen /> : <p>The Hub</p>}</Suspense>
        </LoadBoundary>
      </ScreenRecoveryProvider>
    );
    await render(tree("profile"));
    expect(document.querySelector('[data-testid="broken-screen"]')).not.toBeNull();
    await rerender(tree("clients"));
    expect(document.querySelector('[data-testid="broken-screen"]')).toBeNull();
    expect(document.body.textContent).toContain("The Hub");
  });

  it("sends any other error on up, as before", async () => {
    const r = recovery();
    await render(
      <Outer>
        <ScreenRecoveryProvider value={r}>
          <LoadBoundary kind="screen" resetKey="profile">
            <Throws />
          </LoadBoundary>
        </ScreenRecoveryProvider>
      </Outer>,
    );
    expect(document.querySelector('[data-testid="outer"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="broken-screen"]')).toBeNull();
    expect(r.recover).not.toHaveBeenCalled();
  });
});

describe("Pulse inside a session", () => {
  it("says so in the panel, never reloads, and marks this page as wanting a reload", async () => {
    const Panel = missingFile();
    await render(
      <div>
        <p>The session keeps running</p>
        <LoadBoundary kind="panel" panel="Pulse">
          <Suspense fallback={null}>
            <Panel />
          </Suspense>
        </LoadBoundary>
      </div>,
    );
    expect(document.body.textContent).toContain("The session keeps running");
    expect(document.querySelector('[data-testid="broken-panel"]')?.textContent).toBe(
      "Pulse couldn't be loaded on this iPad just now. It will open after this session.",
    );
    expect(document.querySelector("button")).toBeNull();
    expect(versionStore.get().broken).toBe(true);
  });

  it("sends any other error on up", async () => {
    await render(
      <Outer>
        <LoadBoundary kind="panel" panel="Pulse">
          <Throws />
        </LoadBoundary>
      </Outer>,
    );
    expect(document.querySelector('[data-testid="outer"]')).not.toBeNull();
  });
});
