// @vitest-environment jsdom
/**
 * THE SHARE SWITCH HAS FOUR STATES (AJ, Sep 28 2026: sharing with all MSF
 * studios "should submit to admins first for review").
 *
 * The switch reads its state from the document and says it; a tap offers or
 * takes back. What matters most is the tap: on an offer that's waiting, a
 * tap must WITHDRAW it, never offer it twice, and after a "not shared" it
 * must offer again.
 */
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ShareToggle, shareStateOf, tapOffers, type Shareable } from "./ShareToggle";

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(item: Shareable) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<ShareToggle item={item} onToggle={() => {}} />);
  });
  return host;
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe("the share switch", () => {
  it("offers something not yet offered", async () => {
    const el = await mount({});
    const button = el.querySelector("button")!;
    expect(button.textContent).toContain("Offer to all MSF studios");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(tapOffers({})).toBe(true);
    expect(el.textContent).not.toContain("administrator");
  });

  it("says an offer is waiting for an administrator, and a tap withdraws it", async () => {
    const item: Shareable = { shareStatus: "pending" };
    const el = await mount(item);
    expect(el.querySelector("button")!.textContent).toContain("Offered · waiting for review");
    expect(el.querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    expect(el.textContent).toContain("An administrator reads it before other studios see it. Tap to withdraw it.");
    expect(shareStateOf(item)).toBe("pending");
    expect(tapOffers(item)).toBe(false);
  });

  it("says something shared is shared, and a tap stops sharing it", async () => {
    const item: Shareable = { shared: true, shareStatus: "approved" };
    const el = await mount(item);
    expect(el.querySelector("button")!.textContent).toContain("Shared with all MSF studios");
    expect(tapOffers(item)).toBe(false);
    expect(el.querySelector(".mdb-share-note")).toBeNull();
  });

  it("shows the administrator's note after a no, and offers again", async () => {
    const item: Shareable = { shareStatus: "declined", shareReviewNote: "Say which seat notch, and we'll share it." };
    const el = await mount(item);
    expect(el.querySelector("button")!.textContent).toContain("Offer again");
    expect(el.textContent).toContain("Not shared: Say which seat notch, and we'll share it.");
    expect(tapOffers(item)).toBe(true);
  });

  it("says so plainly when a no came without a note", async () => {
    const el = await mount({ shareStatus: "declined" });
    expect(el.textContent).toContain("Not shared. An administrator decided against it.");
  });

  it("calls a document shared only when `shared` is true, whatever its status says", () => {
    expect(shareStateOf({ shareStatus: "approved" })).toBe("none");
    expect(shareStateOf({ shared: true, shareStatus: "pending" })).toBe("shared");
  });
});
