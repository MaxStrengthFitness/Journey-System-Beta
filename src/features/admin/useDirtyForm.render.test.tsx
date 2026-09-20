// @vitest-environment jsdom
/**
 * save() actually writes.
 *
 * The hook used to read its live state from inside a setState updater and
 * check a flag the updater set. React does not promise that updater runs
 * synchronously, and StrictMode's double render (main.tsx) defeats the eager
 * path that made it look fine: the bar went to "Saving…", onSave was never
 * called, and nothing was written or reported. Mounted rather than unit-tested
 * because the bug only exists once React owns the scheduling.
 */
import { describe, expect, it } from "vitest";
import { StrictMode, act, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useDirtyForm } from "./useDirtyForm";

const EXTERNAL = { name: "a" };

describe("useDirtyForm save()", () => {
  it("actually calls onSave when the form is dirty", async () => {
    const calls: any[] = [];
    let api: any = null;
    function Probe() {
      const external = useMemo(() => EXTERNAL, []);
      const f = useDirtyForm(external, async (patch) => {
        calls.push(patch);
      });
      api = f;
      return <button onClick={() => void f.save()}>save</button>;
    }
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<StrictMode><Probe /></StrictMode>);
    });
    await act(async () => { api.setField("name", "b"); });
    expect(api.dirty).toBe(true);

    const btn = host.querySelector("button")!;
    await act(async () => { btn.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(calls).toEqual([{ name: "b" }]);
    await act(async () => root.unmount());
    host.remove();
  });
});
