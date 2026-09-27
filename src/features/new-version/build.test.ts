import { describe, expect, it, vi } from "vitest";
import { APP_BUILD, DEV_BUILD, fetchLiveBuild, isNewBuild, parseVersionFile, VERSION_URL } from "./build";

function answer(body: unknown, ok = true): typeof fetch {
  return vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response) as unknown as typeof fetch;
}

describe("the build's name", () => {
  it("is 'dev' outside a production build", () => {
    expect(APP_BUILD).toBe(DEV_BUILD);
  });
});

describe("parseVersionFile", () => {
  it("reads the name", () => {
    expect(parseVersionFile({ build: "2026-09-26T22:41:07Z-1125b2d" })).toBe("2026-09-26T22:41:07Z-1125b2d");
  });

  it("has no name for anything else", () => {
    expect(parseVersionFile(null)).toBeNull();
    expect(parseVersionFile("<!doctype html>")).toBeNull();
    expect(parseVersionFile({})).toBeNull();
    expect(parseVersionFile({ build: "  " })).toBeNull();
    expect(parseVersionFile({ build: 42 })).toBeNull();
  });
});

describe("fetchLiveBuild", () => {
  it("asks for the version file uncached, with a query the cache has never seen", async () => {
    const fetchFn = answer({ build: "b2" });
    await expect(fetchLiveBuild(fetchFn, 1000, () => 123)).resolves.toBe("b2");
    expect(fetchFn).toHaveBeenCalledWith(`${VERSION_URL}?t=123`, expect.objectContaining({ cache: "no-store" }));
  });

  it("is unknown when the server says no", async () => {
    await expect(fetchLiveBuild(answer({ build: "b2" }, false))).resolves.toBeNull();
  });

  it("is unknown when the body is not the version file (the dev server's page)", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    })) as unknown as typeof fetch;
    await expect(fetchLiveBuild(fetchFn)).resolves.toBeNull();
  });

  it("is unknown when there is no connection", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("Load failed");
    }) as unknown as typeof fetch;
    await expect(fetchLiveBuild(fetchFn)).resolves.toBeNull();
  });

  it("is unknown when the answer is too slow", async () => {
    vi.useFakeTimers();
    try {
      const fetchFn = vi.fn(() => new Promise<Response>(() => {})) as unknown as typeof fetch;
      const asked = fetchLiveBuild(fetchFn, 5000);
      await vi.advanceTimersByTimeAsync(5000);
      await expect(asked).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("isNewBuild", () => {
  it("is a different name, newer or a rollback", () => {
    expect(isNewBuild("b1", "b2")).toBe(true);
    expect(isNewBuild("b2", "b1")).toBe(true);
  });

  it("is never the same name", () => {
    expect(isNewBuild("b1", "b1")).toBe(false);
  });

  it("is never an unknown answer", () => {
    expect(isNewBuild("b1", null)).toBe(false);
  });

  it("is never a dev build, which has no version file to compare", () => {
    expect(isNewBuild(DEV_BUILD, "b2")).toBe(false);
  });
});
