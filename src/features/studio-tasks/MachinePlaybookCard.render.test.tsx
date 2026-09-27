// @vitest-environment jsdom
/**
 * THE PLAYBOOK ON A MACHINE PAGE (voice review follow-up, Sep 27 2026).
 *
 * A tip's confirmations were a tick and a bare number whose meaning ("N
 * trainers confirmed this") lived only in a hover tooltip, which an iPad
 * never shows. They are said in words now.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { PlaybookEntry } from "./playbook";
import { MachinePlaybookCard, confirmedBy } from "./MachinePlaybookCard";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const entry = (id: string, confirmations: Record<string, { name: string; on: string }>): PlaybookEntry =>
  ({ id, title: `Tip ${id}`, worked: "Lower the seat a notch.", tags: ["shoulder"], confirmations }) as unknown as PlaybookEntry;

const by = (name: string) => ({ name, on: "2026-09-27" });

describe("confirmedBy", () => {
  it("says who confirmed a tip, in words", () => {
    expect(confirmedBy(1, false)).toBe("Confirmed by 1 trainer");
    expect(confirmedBy(4, false)).toBe("Confirmed by 4 trainers");
    expect(confirmedBy(1, true)).toBe("Confirmed by you");
    expect(confirmedBy(3, true)).toBe("Confirmed by you and 2 more");
  });
});

describe("MachinePlaybookCard", () => {
  it("shows the confirmations as words on the card, not in a tooltip, and nothing for none", async () => {
    await act(async () =>
      root.render(
        <MachinePlaybookCard
          currentUserId="t1"
          entries={[entry("a", { t1: by("Sara"), t2: by("Pat") }), entry("b", { t3: by("Lee") }), entry("c", {})]}
        />,
      ),
    );
    const confirms = [...host.querySelectorAll(".pbm__confirms")];
    expect(confirms.map((c) => c.textContent)).toEqual(["Confirmed by you and 1 more", "Confirmed by 1 trainer"]);
    expect(confirms.every((c) => !c.hasAttribute("title"))).toBe(true);
    expect(confirms[0].className).toContain("pbm__confirms--mine");
  });
});
