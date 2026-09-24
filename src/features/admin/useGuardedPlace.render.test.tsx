// @vitest-environment jsdom
/**
 * THE ROUTE GATE, MOUNTED — AppContent's screen and app mode held to
 * guardPlace. A pure test of guardPlace cannot see the two things that make
 * this safe: that a shut screen is never DRAWN, not even for the frame before
 * an effect moves the person, and that the refusal is WRITTEN BACK, so walking
 * back into Demo Mode does not reopen Operations by itself.
 */
import { afterEach, describe, expect, it } from "vitest";
import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlaceAccess } from "./operations-access";
import { useGuardedPlace, type GuardedPlace } from "./useGuardedPlace";

const LIFE_TRANSFORMER: PlaceAccess = { operations: false, admins: false };
const LEADER: PlaceAccess = { operations: true, admins: false };

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let api: GuardedPlace | null = null;
/** Every place the harness drew, in order. */
let drawn: string[] = [];

function Harness({ access }: { access: PlaceAccess }) {
  const place = useGuardedPlace(access);
  api = place;
  drawn.push(`${place.currentView}/${place.appMode}`);
  return <p>{`${place.currentView}/${place.appMode}`}</p>;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  api = null;
  drawn = [];
});

function mount(access: PlaceAccess) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <StrictMode>
        <Harness access={access} />
      </StrictMode>,
    );
  });
}

function rerender(access: PlaceAccess) {
  act(() => {
    root!.render(
      <StrictMode>
        <Harness access={access} />
      </StrictMode>,
    );
  });
}

function openOperations() {
  act(() => {
    api!.setAppMode("admin");
    api!.setCurrentView("admin-dashboard");
  });
}

const shown = () => host!.textContent;

describe("the route gate", () => {
  it("starts at the Hub in trainer mode — where every new person starts after a sign-out", () => {
    mount(LEADER);
    expect(shown()).toBe("clients/trainer");
  });

  it("opens Operations for a studio's leader, and keeps it open", () => {
    mount(LEADER);
    openOperations();
    expect(shown()).toBe("admin-dashboard/admin");
    rerender(LEADER);
    expect(shown()).toBe("admin-dashboard/admin");
  });

  it("never draws Operations for a Life Transformer, not even for one frame", () => {
    mount(LIFE_TRANSFORMER);
    openOperations();
    expect(shown()).toBe("clients/trainer");
    expect(drawn.some((p) => p.startsWith("admin-dashboard"))).toBe(false);
    expect(drawn.some((p) => p.endsWith("/admin"))).toBe(false);
  });

  it("never draws the Admins dashboard for a leader who is not an administrator", () => {
    mount(LEADER);
    act(() => {
      api!.setAppMode("admin");
      api!.setCurrentView("admins-dashboard");
    });
    expect(shown()).toBe("clients/trainer");
    expect(drawn.some((p) => p.startsWith("admins-dashboard"))).toBe(false);
  });

  it("the Demo Mode door: open in Demo Mode, a real studio sends them to the Hub, and going back does not reopen it", () => {
    // Inside Demo Mode everyone may open Operations.
    mount(LEADER);
    openOperations();
    expect(shown()).toBe("admin-dashboard/admin");

    // A Life Transformer chooses a real studio: shut, at once.
    drawn = [];
    rerender(LIFE_TRANSFORMER);
    expect(shown()).toBe("clients/trainer");
    expect(drawn.some((p) => p.startsWith("admin-dashboard"))).toBe(false);

    // Back into Demo Mode: they are on the Hub, and stay there until they choose Operations again.
    rerender(LEADER);
    expect(shown()).toBe("clients/trainer");
  });

  it("keeps the screen and drops only the Operations bar elsewhere", () => {
    mount(LEADER);
    act(() => {
      api!.setAppMode("admin");
      api!.setCurrentView("trainer-hub");
    });
    expect(shown()).toBe("trainer-hub/admin");
    rerender(LIFE_TRANSFORMER);
    expect(shown()).toBe("trainer-hub/trainer");
  });
});
