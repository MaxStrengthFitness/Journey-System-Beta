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

const studioButton = (host: HTMLElement) =>
  (host.querySelector('header button[aria-label^="Studio"], header button[aria-label="Choose a studio"]') ?? host.querySelector("header button")) as HTMLButtonElement;

describe("AppHeader — the studio's name", () => {
  it("shows the studio it is given", () => {
    const host = mount(<AppHeader studioName="Westlake" onStudioClick={() => {}} />);
    expect(studioButton(host).textContent).toBe("Westlake");
    expect(studioButton(host).getAttribute("aria-label")).toBe("Studio: Westlake. Change studio.");
  });

  it("never names a studio it wasn't told: 'Choose a studio' when it can change one, nothing when it can't", () => {
    const chooser = mount(<AppHeader onStudioClick={() => {}} />);
    expect(studioButton(chooser).textContent).toBe("Choose a studio");
    expect(chooser.textContent).not.toMatch(/solon/i);

    const plain = mount(<AppHeader />);
    expect(studioButton(plain).textContent).toBe("");
    expect(studioButton(plain).getAttribute("aria-label")).toBe("Studio");
    expect(plain.textContent).not.toMatch(/solon/i);
  });

  it("inside Operations, the name and the logo go back to the Hub (Oct 2 2026)", () => {
    let went = 0;
    const host = mount(<AppHeader studioName="Westlake" onStudioClick={() => (went += 1)} studioClickGoesHome />);
    expect(studioButton(host).getAttribute("aria-label")).toBe("Studio: Westlake. Back to the Hub.");
    const logo = host.querySelector<HTMLButtonElement>('button[aria-label="Back to the Hub"]')!;
    expect(logo).not.toBeNull();
    act(() => logo.click());
    act(() => studioButton(host).click());
    expect(went).toBe(2);
  });

  it("treats a blank name as no name", () => {
    const host = mount(<AppHeader studioName="   " onStudioClick={() => {}} />);
    expect(studioButton(host).textContent).toBe("Choose a studio");
  });
});

/**
 * THE HEADER IS THE FRAME (the Navy Frame, Oct 4 2026; AJ's answer 1A): the
 * logo's navy in both themes, drawn only in the frame's own tokens, so no
 * theme can make it white on white again and the status bar (which copies
 * --chrome) always matches it.
 */
describe("AppHeader — one look in both themes", () => {
  it("paints the frame and the frame's inks, whatever the theme", () => {
    for (const dark of [false, true]) {
      document.documentElement.classList.toggle("dark", dark);
      const host = mount(<AppHeader studioName="Westlake" onStudioClick={() => {}} trainerInitials="AJ" />);
      const header = host.querySelector("header")!;
      expect(header.className).toMatch(/(^|\s)bg-chrome(\s|$)/);
      expect(header.className).toMatch(/(^|\s)border-chrome-line(\s|$)/);
      expect(studioButton(host).className).toMatch(/(^|\s)text-chrome-ink(\s|$)/);
      const avatar = [...host.querySelectorAll("header button")].find((b) => b.textContent === "AJ")!;
      expect(avatar.className).toMatch(/(^|\s)bg-chrome-here(\s|$)/);
      expect(avatar.className).toMatch(/(^|\s)text-chrome(\s|$)/);
    }
    document.documentElement.classList.remove("dark");
  });

  it("has no light or dark look to choose, and no theme ink or palette colour", () => {
    const header = readFileSync(resolve(__dirname, "AppHeader.tsx"), "utf8");
    // No `variant` prop, in the props or the destructuring.
    expect(header).not.toMatch(/^\s*variant\s*[?:,]/m);
    expect(header).not.toMatch(/isLight|dark:/);
    expect(header).not.toMatch(/\b(?:bg|text|border)-(?:white|black|primary|foreground|muted-foreground|bg-dark(?:-\d)?|ink-[ld]\d|div-[ld])\b/);
    expect(header).not.toMatch(/-(?:slate|sky|orange|gray)-\d{2,3}\b|#[0-9a-fA-F]{3,6}\b/);
  });
});

/**
 * The header search sits on the frame too. shadcn's <Input> carries
 * `dark:bg-input/30`, which would bring a pale wash back into the navy in the
 * dark theme (the default) unless the field restates its background for
 * dark: as well; and its `border-input` would draw a grey box unless the
 * border stays transparent. Mounted with AppContent's own class string, so
 * the merge that decides it is the real one.
 */
describe("AppHeader — the search field in the frame", () => {
  it("carries the frame's well in both themes and no dark:bg-input", async () => {
    const { Input } = await import("./ui/input");
    const source = readFileSync(resolve(__dirname, "..", "AppContent.tsx"), "utf8");
    const field = source.match(/aria-label="Search clients"[\s\S]*?className="([^"]*)"/)?.[1];
    expect(field, "the header search's className in AppContent.tsx").toBeTruthy();
    const host = mount(<Input aria-label="Search clients" className={field} />);
    const input = host.querySelector("input")!;
    const classes = input.className.split(/\s+/);
    expect(classes).toContain("bg-chrome-field");
    expect(classes).toContain("dark:bg-chrome-field");
    expect(classes).toContain("border-transparent");
    expect(classes).toContain("text-chrome-ink");
    expect(classes).toContain("placeholder:text-chrome-ink-2");
    expect(classes).toContain("focus-visible:ring-chrome-here");
    expect(classes.filter((c) => /^dark:bg-input|^border-input$|^focus-visible:ring-ring|cyan/.test(c))).toEqual([]);
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
    it(`${host} passes studioName and no look`, () => {
      for (const jsx of headers(read(host))) {
        expect(jsx).toMatch(/studioName=\{/);
        // The header is the frame in both themes (Oct 4 2026): no host
        // chooses a look for it, fixed or computed from the theme.
        expect(jsx).not.toMatch(/\bvariant=/);
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
