// @vitest-environment jsdom
/**
 * The new-version hook MOUNTED, with the line it feeds and the real
 * unsaved-changes provider (new-version round, Sep 26 2026). The hook does its
 * work in effects and in listeners on the document, so only a mounted test
 * shows the moments that matter: coming back to Journey on the Hub, arriving
 * at the Hub, a profile, the Active Session, the trainer's own open session,
 * typing, saves still sending, no connection, and the way back to where the
 * trainer was.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UnsavedChangesProvider, useUnsavedChanges } from "../unsaved-changes";
import { NewVersionLine } from "./NewVersionLine";
import { PLACE_KEY, RELOAD_KEY, rememberPlace, noteReload, type ReturnPlace } from "./reload-once";
import { useNewVersion, type NewVersionOptions } from "./useNewVersion";
import { createVersionStore, type VersionStore } from "./version-store";
import { sessionDraftKey } from "../client-notes/session-draft";
import { LIVE_SESSION_KEY } from "../../lib/live-session";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;

let live: string | null = "b1";
let clock = 1_000_000;
let store: VersionStore;
let reload: Mock<() => void>;
let restorePlace: Mock<(place: ReturnPlace) => void>;
let pendingWrites: () => Promise<void>;
let setView: (v: string) => void = () => {};

function Typing() {
  useUnsavedChanges(true, "the progress report");
  return null;
}

function Harness(props: Partial<NewVersionOptions> & { typing?: boolean; startView?: string }) {
  const { typing, startView, ...rest } = props;
  const [view, setViewState] = useState(startView ?? "clients");
  setView = setViewState;
  const handle = useNewVersion({
    view,
    hubView: "clients",
    sessionView: "workouts",
    shellReady: true,
    uid: "uid-a",
    clientId: view === "profile" ? "c1" : null,
    ownSessionClientName: null,
    waitForPendingWrites: () => pendingWrites(),
    isKnownView: (v) => ["clients", "profile", "workouts"].includes(v),
    restorePlace,
    reload,
    storage: window.sessionStorage,
    store,
    running: "b1",
    ...rest,
  });
  return (
    <>
      {typing && <Typing />}
      <NewVersionLine line={handle.line} busy={handle.busy} onLoad={handle.loadNow} />
    </>
  );
}

function mount(props: Parameters<typeof Harness>[0] = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <UnsavedChangesProvider>
        <Harness {...props} />
      </UnsavedChangesProvider>,
    ),
  );
  return host;
}

/** Let the asks, the waits and the renders that follow them all finish. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

/** A deploy happened, and enough time passed that the last answer is stale. */
function deploy(build = "b2") {
  live = build;
  clock += 5 * 60_000;
}

function comeBack() {
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function line() {
  return document.querySelector('[data-testid="new-version-line"]');
}

function loadNowButton() {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "Load now") ?? null;
}

beforeEach(() => {
  live = "b1";
  clock = 1_000_000;
  store = createVersionStore({ fetchLive: async () => live, now: () => clock });
  reload = vi.fn<() => void>();
  restorePlace = vi.fn<(place: ReturnPlace) => void>();
  pendingWrites = () => Promise.resolve();
  window.sessionStorage.clear();
  window.localStorage.clear();
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("on the Hub", () => {
  it("loads a new version by itself when Journey comes back on screen", async () => {
    mount();
    await settle();
    expect(reload).not.toHaveBeenCalled();

    deploy();
    comeBack();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(RELOAD_KEY)!)).toMatchObject({ target: "b2" });
    // The Hub is where a reload lands anyway: nothing to come back to.
    expect(window.sessionStorage.getItem(PLACE_KEY)).toBeNull();
  });

  it("loads on arriving at the Hub from another screen", async () => {
    mount({ startView: "profile" });
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(line()?.textContent).toContain("It loads by itself next time you're on the Hub.");

    act(() => setView("clients"));
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing while the server has this version", async () => {
    mount();
    await settle();
    clock += 5 * 60_000;
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(line()).toBeNull();
  });

  it("never reloads without an answer from the server", async () => {
    mount();
    await settle();
    live = null;
    clock += 5 * 60_000;
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("never reloads while the iPad says it is offline", async () => {
    mount();
    await settle();
    deploy();
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits for the trainer's own open session, and says so by name", async () => {
    mount({ ownSessionClientName: "Sam Rivera" });
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(line()?.textContent).toContain("It will load after your session with Sam Rivera.");
    expect(loadNowButton()).toBeNull();
  });

  it("waits for typing", async () => {
    mount({ typing: true });
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits for a note draft on the session this iPad has open", async () => {
    window.localStorage.setItem(LIVE_SESSION_KEY, "s1");
    window.sessionStorage.setItem(sessionDraftKey("s1"), JSON.stringify({ body: "Knee sore on leg press" }));
    mount();
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not loop: a reload already tried for this version waits ten minutes", async () => {
    noteReload(window.sessionStorage, "b2", Date.now());
    mount();
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits for saves still sending, says so, and offers Load now once they land", async () => {
    let land: () => void = () => {};
    pendingWrites = () => new Promise<void>((resolve) => (land = resolve));
    vi.useFakeTimers();
    try {
      mount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      deploy();
      comeBack();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });
      expect(reload).not.toHaveBeenCalled();
      expect(line()?.textContent).toContain("It will load once this iPad's saves reach the studio's records.");
      expect(loadNowButton()).toBeNull();

      await act(async () => {
        land();
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(line()?.textContent).toContain("It loads by itself next time you're on the Hub.");
      expect(loadNowButton()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the Active Session", () => {
  it("never reloads, and draws no line", async () => {
    mount({ startView: "workouts", ownSessionClientName: "Sam" });
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(line()).toBeNull();
  });
});

describe("Load now", () => {
  it("loads from a profile and remembers where the trainer was", async () => {
    mount({ startView: "profile" });
    await settle();
    deploy();
    comeBack();
    await settle();
    expect(reload).not.toHaveBeenCalled();

    act(() => loadNowButton()!.click());
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.sessionStorage.getItem(PLACE_KEY)!)).toMatchObject({
      view: "profile",
      clientId: "c1",
      uid: "uid-a",
    });
  });

  it("asks before throwing typing away, and loads only on Leave", async () => {
    mount({ startView: "profile", typing: true });
    await settle();
    deploy();
    comeBack();
    await settle();

    act(() => loadNowButton()!.click());
    await settle();
    expect(reload).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("You have unsaved changes to the progress report");

    const leave = Array.from(document.querySelectorAll("button")).find((b) => /^Leave/.test(b.textContent ?? ""));
    act(() => leave!.click());
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("where you were", () => {
  it("goes back to the screen and client remembered before the reload", async () => {
    rememberPlace(window.sessionStorage, { view: "profile", clientId: "c1" }, "uid-a", Date.now());
    mount();
    await settle();
    expect(restorePlace).toHaveBeenCalledWith({ view: "profile", clientId: "c1" });
    expect(window.sessionStorage.getItem(PLACE_KEY)).toBeNull();
  });

  it("is never another person's place", async () => {
    rememberPlace(window.sessionStorage, { view: "profile", clientId: "c1" }, "uid-b", Date.now());
    mount();
    await settle();
    expect(restorePlace).not.toHaveBeenCalled();
  });

  it("waits for the shell: nothing is restored before sign-in and a studio", async () => {
    rememberPlace(window.sessionStorage, { view: "profile", clientId: "c1" }, "uid-a", Date.now());
    mount({ shellReady: false });
    await settle();
    expect(restorePlace).not.toHaveBeenCalled();
  });
});
