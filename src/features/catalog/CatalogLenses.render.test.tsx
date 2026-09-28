// @vitest-environment jsdom
/**
 * THE CATALOG'S THREE WAYS IN, MOUNTED (Machine Catalog round, Catalog R3).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { CatalogLenses } from "./CatalogLenses";

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

describe("the three ways in", () => {
  it("names the floor, the body and All MSF, and marks the one showing", async () => {
    await act(async () => root.render(<CatalogLenses lens="body" studioName="Solon" onChange={() => {}} />));
    const buttons = [...host.querySelectorAll(".mcat-lens__btn")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Solon's floor", "The body", "All MSF machines"]);
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
  });

  it("switches on a tap", async () => {
    const onChange = vi.fn();
    await act(async () => root.render(<CatalogLenses lens="floor" studioName="Solon" onChange={onChange} />));
    await act(async () => (host.querySelectorAll(".mcat-lens__btn")[2] as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith("msf");
  });
});
