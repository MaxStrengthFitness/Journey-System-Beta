// @vitest-environment jsdom
/**
 * THE ADMINS KIT MOUNTS — the status word says itself in words with a mark of
 * its own shape, a row keeps its one action out of its open button, and the
 * machine host says loading, couldn't read and gone apart.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("../../firebase", () => ({ db: {}, auth: { currentUser: { uid: "adm" } }, functions: {} }));
vi.mock("../../contexts/ToastContext", () => ({ useToast: () => ({ success: () => {}, error: () => {}, info: () => {} }) }));

import { HqGroupHead, HqRow, HqRows, HqStatus } from "./kit";
import { CatalogMachineHost } from "./CatalogMachineHost";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe("HqStatus", () => {
  it("says the status in words, with a mark whose class carries its shape", () => {
    const el = render(
      <>
        <HqStatus tone="ok">Syncing</HqStatus>
        <HqStatus tone="unknown">Couldn&apos;t check</HqStatus>
      </>,
    );
    const marks = [...el.querySelectorAll(".hq-status")];
    expect(marks.map((m) => m.textContent)).toEqual(["Syncing", "Couldn't check"]);
    expect(marks[1].className).toContain("hq-status--unknown");
    expect(marks[1].querySelector(".hq-status__mark")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("HqRow", () => {
  it("opens from its name and sentence, with its one action beside, never inside", () => {
    const opened = vi.fn();
    const acted = vi.fn();
    const el = render(
      <HqRows label="Studios">
        <HqRow name="Hirluin's Hall of Unreasonably Long Studio Names" context="MSF corporate" say="Linked to Mindbody." onOpen={opened} action={<button type="button" onClick={acted}>Open</button>} />
        <HqRow name="Angbor" say="No cutover date yet." />
      </HqRows>,
    );
    const open = el.querySelector<HTMLButtonElement>(".hq-row__open")!;
    expect(open.textContent).toContain("Hirluin's Hall of Unreasonably Long Studio Names");
    expect(open.querySelector("button")).toBeNull();
    act(() => open.click());
    expect(opened).toHaveBeenCalledTimes(1);
    act(() => el.querySelector<HTMLButtonElement>(".hq-row__act button")!.click());
    expect(acted).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledTimes(1);
    // A row with nothing to open is not a button.
    const rows = el.querySelectorAll(".hq-row");
    expect(rows[1].querySelector("button")).toBeNull();
    expect(el.querySelector('[role="list"]')?.getAttribute("aria-label")).toBe("Studios");
  });

  it("puts a group's rule beside its name", () => {
    const el = render(<HqGroupHead title="No cutover date yet" note="Journey doesn't refresh its packages from Mindbody each night." />);
    expect(el.querySelector("h3")?.textContent).toBe("No cutover date yet");
    expect(el.textContent).toContain("Journey doesn't refresh its packages from Mindbody each night.");
  });
});

describe("CatalogMachineHost", () => {
  it("says loading, couldn't read, and gone, each in its own words", () => {
    const back = vi.fn();
    const el = render(<CatalogMachineHost machineId="m-x" catalog={[]} loading failed={false} onBack={back} />);
    expect(el.textContent).toContain("Opening the machine");
    act(() => root!.render(<CatalogMachineHost machineId="m-x" catalog={[]} loading={false} failed onBack={back} />));
    expect(el.textContent).toContain("couldn't be read just now");
    act(() => root!.render(<CatalogMachineHost machineId="m-x" catalog={[]} loading={false} failed={false} onBack={back} />));
    expect(el.textContent).toContain("isn't in the catalog any more");
    act(() => [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Back to the catalog"))!.click());
    expect(back).toHaveBeenCalledTimes(1);
  });
});
