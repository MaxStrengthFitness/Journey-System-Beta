// @vitest-environment jsdom
/**
 * THE HEADER NAMES THE STUDIO IT IS GIVEN, AND NEVER ONE IT ISN'T.
 *
 * Until Sep 27 2026 `studioName` defaulted to "SOLON", and the session's own
 * screens (the briefing, the Wrap-up, the never-blank screen) passed no name,
 * so a trainer at Westlake read SOLON in the header before and after every
 * session. The Wrap-up's header was also fixed to its dark look, which on the
 * light theme drew that name white on a white bar.
 *
 * Mounted: the name shown, "Choose a studio" when there is none to show, and
 * never SOLON. Read from source: every screen that draws the header passes a
 * studio name, the tracker hands the three session screens the active
 * studio's, and no header is fixed to one theme.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppHeader } from "./AppHeader";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { root: Root; host: HTMLElement }[] = [];

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  mounted.push({ root, host });
  return host;
}

afterEach(() => {
  for (const { root, host } of mounted) {
    act(() => root.unmount());
    host.remove();
  }
  mounted = [];
});

const studioButton = (host: HTMLElement) => host.querySelector("header button") as HTMLButtonElement;

describe("AppHeader — the studio's name", () => {
  it("shows the studio it is given, in both looks", () => {
    for (const variant of ["light", "dark"] as const) {
      const host = mount(<AppHeader variant={variant} studioName="Westlake" onStudioClick={() => {}} />);
      expect(studioButton(host).textContent).toBe("Westlake");
      expect(studioButton(host).getAttribute("aria-label")).toBe("Studio: Westlake. Change studio.");
    }
  });

  it("never names a studio it wasn't told: 'Choose a studio' when it can change one, nothing when it can't", () => {
    const chooser = mount(<AppHeader variant="light" onStudioClick={() => {}} />);
    expect(studioButton(chooser).textContent).toBe("Choose a studio");
    expect(chooser.textContent).not.toMatch(/solon/i);

    const plain = mount(<AppHeader variant="dark" />);
    expect(studioButton(plain).textContent).toBe("");
    expect(studioButton(plain).getAttribute("aria-label")).toBe("Studio");
    expect(plain.textContent).not.toMatch(/solon/i);
  });

  it("treats a blank name as no name", () => {
    const host = mount(<AppHeader variant="light" studioName="   " onStudioClick={() => {}} />);
    expect(studioButton(host).textContent).toBe("Choose a studio");
  });
});

describe("AppHeader — every screen that draws it passes the studio", () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, "..", rel), "utf8");
  const headers = (text: string) => [...text.matchAll(/<AppHeader\b[\s\S]*?\/>/g)].map((m) => m[0]);

  const HOSTS = [
    "AppContent.tsx",
    "components/WrapUpScreen.tsx",
    "features/briefing/BriefingScreen.tsx",
    "features/session-record/NothingOnScreen.tsx",
  ];

  it("finds every host (a new one must be added here)", () => {
    const hosts = HOSTS.filter((h) => headers(read(h)).length > 0);
    expect(hosts).toEqual(HOSTS);
  });

  for (const host of HOSTS) {
    it(`${host} passes studioName and follows the theme`, () => {
      for (const jsx of headers(read(host))) {
        expect(jsx).toMatch(/studioName=\{/);
        expect(jsx).not.toMatch(/variant="(light|dark)"/);
      }
    });
  }

  it("the tracker hands the briefing, the Wrap-up and the never-blank screen the active studio's name", () => {
    const tracker = read("components/WorkoutTrackerView.tsx");
    for (const screen of ["WrapUpScreen", "BriefingScreen", "NothingOnScreen"]) {
      const jsx = tracker.match(new RegExp(`<${screen}\\b[\\s\\S]*?>`))?.[0] ?? "";
      expect(jsx, screen).toMatch(/studioName=\{activeStudio\?\.name\}/);
    }
  });

  it("no header falls back to a made-up name or made-up initials", () => {
    const header = read("components/AppHeader.tsx");
    expect(header).not.toMatch(/studioName\s*=\s*"/);
    for (const host of HOSTS) {
      expect(read(host), host).not.toMatch(/initials \|\| "AJ"/);
    }
  });
});
