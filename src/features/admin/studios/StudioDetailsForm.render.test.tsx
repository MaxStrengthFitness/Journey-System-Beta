// @vitest-environment jsdom
/**
 * THE STUDIO DETAILS FORM, READ ONLY, NEVER ASKS MINDBODY (the voice review
 * notes, Sep 28 2026).
 *
 * My Studio → Studio opened read only to everyone who works at the studio
 * (AJ: "Leaders edit it; trainers can view it read-only"). The form looks up
 * the locations behind the saved Mindbody Site ID each time it opens, and
 * that lookup is a Mindbody call through our server: a leader needs it to
 * verify a changed id, a reader never does. Left alone, every trainer's visit
 * would have cost a call. Mounted for real, because the lookup is an effect
 * behind a debounce that no pure test can see.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const calls: string[] = [];
vi.mock("../../../lib/authed-fetch", () => ({
  authedFetch: async (url: string) => {
    calls.push(url);
    return { ok: true, json: async () => ({ locations: [{ id: "3", name: "Westlake" }] }) };
  },
}));

const { StudioDetailsForm } = await import("./StudioDetailsForm");
import type { Studio } from "../../../types";

const westlake = {
  id: "westlake",
  name: "Westlake",
  ownerId: "o",
  timezone: "America/New_York",
  mindbodySiteId: "29068",
  mindbodyLocationId: "3",
} as unknown as Studio;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(canEdit: boolean, studio: Studio = westlake) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<StudioDetailsForm studio={studio} studios={[studio]} onSave={async () => {}} canEdit={canEdit} />);
  });
  // Past the lookup's 600ms debounce, and the reply after it.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 750));
  });
  return host;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
  calls.length = 0;
});

describe("StudioDetailsForm", () => {
  it("never asks Mindbody for someone who can only read it, and still shows the saved ids", async () => {
    const h = await mount(false);
    expect(calls).toEqual([]);
    expect(h.textContent).toContain("Only this studio's leaders and administrators can change these details.");
    expect(h.textContent).toContain("The Mindbody site this studio's bookings come from.");
    const values = [...h.querySelectorAll("input")].map((i) => i.value);
    expect(values).toContain("29068");
    expect(values).toContain("3");
    // Locked: every field sits inside the disabled fieldset.
    expect(h.querySelector("fieldset")?.disabled).toBe(true);
  });

  it("asks Mindbody for a leader, who may change the Site ID (the lookup still works where it is needed)", async () => {
    await mount(true);
    expect(calls).toEqual(["/api/mindbody/locations"]);
  });

  /*
   * The cutover hint says what the date turns on (Oct 10 2026). It used to say
   * every client read as unknown until it was set, which stopped being true on
   * Sep 26 2026, when coverage came from Mindbody's visit count.
   */
  it("says what the cutover date turns on: every session logged in Journey, packages refreshed each night", async () => {
    const unset = await mount(false);
    expect(unset.textContent).toContain(
      "The day this studio moves onto Journey. From then on every session must be logged in Journey, and each night Journey refreshes the studio's packages from Mindbody.",
    );
    expect(unset.textContent).not.toContain("reads as unknown");
    await act(async () => root!.unmount());
    host?.remove();
    root = null;

    const set = await mount(false, { ...westlake, journeyCutoverDate: "2026-10-20" } as Studio);
    expect(set.textContent).toContain(
      "From this day every session here must be logged in Journey, and each night Journey refreshes this studio's packages from Mindbody. A booking nobody logged no longer counts as a visit.",
    );
  });
});
