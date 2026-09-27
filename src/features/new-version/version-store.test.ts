import { describe, expect, it, vi } from "vitest";
import { CHECK_REUSE_MS, createVersionStore, reloadTarget, reloadWanted, type VersionState } from "./version-store";

function store(answers: Array<string | null | Error>, start = 1_000) {
  let t = start;
  const fetchLive = vi.fn(async () => {
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next ?? null;
  });
  const s = createVersionStore({ fetchLive, now: () => t });
  return { s, fetchLive, advance: (ms: number) => void (t += ms) };
}

describe("createVersionStore", () => {
  it("asks the server and remembers the answer", async () => {
    const { s } = store(["b2"]);
    await expect(s.check()).resolves.toBe("b2");
    expect(s.get()).toMatchObject({ live: "b2", answeredAt: 1_000, unreachable: false });
  });

  it("reuses an answer younger than a minute, so coming back to the app over and over asks once", async () => {
    const { s, fetchLive, advance } = store(["b2", "b3"]);
    await s.check();
    advance(CHECK_REUSE_MS - 1);
    await expect(s.check()).resolves.toBe("b2");
    expect(fetchLive).toHaveBeenCalledTimes(1);
    advance(1);
    await expect(s.check()).resolves.toBe("b3");
    expect(fetchLive).toHaveBeenCalledTimes(2);
  });

  it("asks again at once when told to", async () => {
    const { s, fetchLive } = store(["b2", "b3"]);
    await s.check();
    await expect(s.check({ maxAgeMs: 0 })).resolves.toBe("b3");
    expect(fetchLive).toHaveBeenCalledTimes(2);
  });

  it("shares one request between asks in flight", async () => {
    const { s, fetchLive } = store(["b2"]);
    const [a, b] = await Promise.all([s.check(), s.check({ maxAgeMs: 0 })]);
    expect(a).toBe("b2");
    expect(b).toBe("b2");
    expect(fetchLive).toHaveBeenCalledTimes(1);
  });

  it("says unknown when there is no answer, keeps the last answer, and asks again next time", async () => {
    const { s, fetchLive } = store(["b2", null, new Error("Load failed"), "b3"]);
    await s.check();
    await expect(s.check({ maxAgeMs: 0 })).resolves.toBeNull();
    expect(s.get()).toMatchObject({ live: "b2", unreachable: true });
    await expect(s.check()).resolves.toBeNull();
    await expect(s.check()).resolves.toBe("b3");
    expect(fetchLive).toHaveBeenCalledTimes(4);
  });

  it("tells its readers when anything changes, and only then", async () => {
    const { s } = store(["b2", "b2"]);
    const heard = vi.fn();
    s.subscribe(heard);
    await s.check();
    expect(heard).toHaveBeenCalledTimes(1);
    s.markBroken();
    s.markBroken();
    expect(heard).toHaveBeenCalledTimes(2);
  });

  it("stops telling a reader that left", async () => {
    const { s } = store(["b2"]);
    const heard = vi.fn();
    const leave = s.subscribe(heard);
    leave();
    await s.check();
    expect(heard).not.toHaveBeenCalled();
  });
});

describe("reloadWanted and reloadTarget", () => {
  const base: VersionState = { live: null, answeredAt: null, unreachable: false, broken: false };

  it("wants nothing before the server has said anything", () => {
    expect(reloadWanted(base, "b1")).toBe(false);
    expect(reloadTarget(base, "b1")).toBeNull();
  });

  it("wants nothing while the server has this build", () => {
    expect(reloadWanted({ ...base, live: "b1" }, "b1")).toBe(false);
  });

  it("wants the new build", () => {
    expect(reloadWanted({ ...base, live: "b2" }, "b1")).toBe(true);
    expect(reloadTarget({ ...base, live: "b2" }, "b1")).toBe("b2");
  });

  it("wants this build again when a screen of this page is broken", () => {
    expect(reloadWanted({ ...base, live: "b1", broken: true }, "b1")).toBe(true);
    expect(reloadTarget({ ...base, live: "b1", broken: true }, "b1")).toBe("again:b1");
    expect(reloadTarget({ ...base, broken: true }, "b1")).toBe("again:b1");
  });

  it("a new build wins over a broken screen", () => {
    expect(reloadTarget({ ...base, live: "b2", broken: true }, "b1")).toBe("b2");
  });

  it("a dev build never wants a new build", () => {
    expect(reloadWanted({ ...base, live: "b2" }, "dev")).toBe(false);
  });
});
