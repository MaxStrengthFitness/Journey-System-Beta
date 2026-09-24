// @vitest-environment jsdom
/**
 * The session's "What to know" sheet, MOUNTED (Sep 24 2026). The marker on
 * the session bar counted every clinical flag while this sheet showed only
 * the conditions that name no machine, so a client whose one condition was
 * osteoporosis read "1" and opened to an empty sheet. The count and the
 * sheet are only seen to agree in the rendered output.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: null } }));

import { SessionFlagsSheet } from "./SessionFlagsSheet";
import { sessionFlags } from "./session-flags";
import type { Machine } from "../../types";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const floor: Machine[] = [
  { id: "m-leg-press", name: "LEG PRESS" },
  { id: "m-lumbar", name: "LUMBAR" },
  { id: "m-abs", name: "SEATED ABDOMINALS" },
  { id: "m-chest-press", name: "CHEST PRESS" },
];

let root: Root | null = null;
let host: HTMLElement | null = null;

function mount(flagIds: string[]): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const flags = sessionFlags({ clinicalFlags: flagIds, floor });
  act(() => {
    root!.render(<SessionFlagsSheet clientFirstName="Pat" flags={flags} machines={floor} onClose={() => {}} />);
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("SessionFlagsSheet", () => {
  it("shows a condition that names only machines, with this floor's machines — never an empty sheet", () => {
    const el = mount(["bone-osteoporosis"]);
    const section = el.querySelector('[aria-label="Conditions on certain machines"]');
    expect(section).not.toBeNull();
    expect(section!.textContent).toContain("Osteoporosis / Severe Osteopenia");
    expect(section!.textContent).toContain("LEG PRESS · LUMBAR · SEATED ABDOMINALS");
    expect(section!.textContent).not.toContain("lumbar_extension");
    expect(section!.querySelector(".jg-flagcard")?.getAttribute("data-tone")).toBe("caution");
    expect(el.textContent).not.toContain("Nothing flagged");
  });

  it("keeps the every-machine conditions in their own section, crimson only when absolute", () => {
    const el = mount(["cv-hypertension", "bone-osteoporosis"]);
    const every = el.querySelector('[aria-label="Conditions on every machine"]');
    expect(every!.textContent).toContain("Uncontrolled Hypertension");
    expect(every!.querySelector(".jg-flagcard")?.getAttribute("data-tone")).toBe("alert");
    expect(el.querySelectorAll(".jg-flagcard")).toHaveLength(2);
  });
});
