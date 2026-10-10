// @vitest-environment jsdom
/**
 * THE PC BUILD'S MARK (Oct 10 2026): one plum line, nothing to tap, words
 * that follow the project the build talks to. Vitest runs as a development
 * build (import.meta.env.DEV is true), which is the build that draws it; the
 * production build's absence is checked on the built bundle, not here.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { EnvironmentMark, LIVE_PROJECT_ID, environmentWords } from "./EnvironmentMark";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(projectId: string | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<EnvironmentMark projectId={projectId} />));
  return host;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("EnvironmentMark", () => {
  it("says the PC build is on live data, in one line with nothing to tap", async () => {
    const h = await mount(LIVE_PROJECT_ID);
    const mark = h.querySelector("[data-environment-mark]");
    expect(mark?.textContent).toBe("PC build · live data");
    expect(mark?.getAttribute("role")).toBe("note");
    expect(h.querySelector("button, a, input")).toBeNull();
    // Plum, from the tokens: no raw colour, no Tailwind palette.
    expect(mark?.className).toContain("text-(--eq-warn)");
    expect(mark?.className).toContain("bg-(--eq-warn-fill)");
    expect(mark?.className).not.toMatch(/#[0-9a-f]{3,8}|\b(?:bg|text|border)-(?:white|black|red|orange|amber|purple|pink|sky)-?/i);
  });

  it("says test data for any other project", async () => {
    const h = await mount("demo-test-project");
    expect(h.textContent).toBe("PC build · test data");
  });

  it("draws nothing for the perf lab's build", () => {
    expect(environmentWords({ perfLab: true, projectId: LIVE_PROJECT_ID })).toBeNull();
  });
});
