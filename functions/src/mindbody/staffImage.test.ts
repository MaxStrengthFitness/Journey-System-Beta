import { describe, it, expect, vi } from "vitest";
import {
  IMAGE_TTL_MS,
  fetchStaffImageUrl,
  imageWriteNeeded,
  parseImageUrlResponse,
  refreshStaffImage,
  shouldRefreshImage,
} from "./staffImage";

const stamp = (ms: number) => ({ toMillis: () => ms });

describe("shouldRefreshImage", () => {
  const now = Date.UTC(2026, 8, 6);

  it("refreshes a trainer who has never been checked", () => {
    expect(shouldRefreshImage(undefined, now)).toBe(true);
    expect(shouldRefreshImage({}, now)).toBe(true);
  });

  it("leaves a recently checked trainer alone", () => {
    // The case that matters: a burst of staff.updated events must not become
    // a burst of billable API calls for a photo that has not changed.
    expect(shouldRefreshImage({ imageFetchedAt: stamp(now - 60_000) }, now)).toBe(false);
  });

  it("refreshes once the cache is older than the TTL", () => {
    expect(shouldRefreshImage({ imageFetchedAt: stamp(now - IMAGE_TTL_MS) }, now)).toBe(true);
  });

  it("still counts as checked when Mindbody had no photo", () => {
    // imageUrl null + a fetch stamp means "asked, no photo" -- not "never asked".
    expect(shouldRefreshImage({ imageUrl: null, imageFetchedAt: stamp(now - 1000) }, now)).toBe(
      false,
    );
  });

  it("refreshes when the stored stamp is unusable", () => {
    expect(shouldRefreshImage({ imageFetchedAt: null }, now)).toBe(true);
    expect(shouldRefreshImage({ imageFetchedAt: stamp(NaN) }, now)).toBe(true);
  });
});

describe("parseImageUrlResponse", () => {
  it("reads the documented shape", () => {
    expect(parseImageUrlResponse({ ImageUrl: "https://cdn/x.jpg" })).toBe("https://cdn/x.jpg");
  });

  it("tolerates the casings and nestings Mindbody varies between", () => {
    expect(parseImageUrlResponse({ imageUrl: "https://cdn/a.jpg" })).toBe("https://cdn/a.jpg");
    expect(parseImageUrlResponse({ Staff: { ImageUrl: "https://cdn/b.jpg" } })).toBe(
      "https://cdn/b.jpg",
    );
    expect(parseImageUrlResponse("https://cdn/c.jpg")).toBe("https://cdn/c.jpg");
  });

  it("treats anything that is not an https URL as no photo", () => {
    // Storing junk here would render a broken avatar until someone noticed.
    expect(parseImageUrlResponse({ ImageUrl: "" })).toBeNull();
    expect(parseImageUrlResponse({ ImageUrl: "http://cdn/x.jpg" })).toBeNull();
    expect(parseImageUrlResponse({ ImageUrl: "no photo on file" })).toBeNull();
    expect(parseImageUrlResponse(null)).toBeNull();
    expect(parseImageUrlResponse({})).toBeNull();
  });
});

describe("fetchStaffImageUrl", () => {
  const base = { apiKey: "key", siteId: "5746957", staffId: "100000012" };

  it("calls the documented endpoint with the site headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ImageUrl: "https://cdn/aj.jpg" }),
      text: async () => "",
    });

    expect(await fetchStaffImageUrl({ ...base, fetchImpl })).toBe("https://cdn/aj.jpg");
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.mindbodyonline.com/public/v6/staff/100000012/imageurl");
    expect((init as any).headers).toMatchObject({ "Api-Key": "key", SiteId: "5746957" });
  });

  it("treats a 404 as no photo, not as a failure", async () => {
    // Most staff have no photo. Throwing here would fill the logs and retry
    // forever for the normal case.
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
      text: async () => "",
    });
    expect(await fetchStaffImageUrl({ ...base, fetchImpl })).toBeNull();
  });

  it("throws on a real API error so the caller can log it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
      text: async () => "Unauthorized",
    });
    await expect(fetchStaffImageUrl({ ...base, fetchImpl })).rejects.toThrow("401");
  });

  it("returns null when the body is not JSON", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
      text: async () => "",
    });
    expect(await fetchStaffImageUrl({ ...base, fetchImpl })).toBeNull();
  });

  it("escapes the staff id into the path", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    });
    await fetchStaffImageUrl({ ...base, staffId: "a b/c", fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toContain("a%20b%2Fc");
  });
});

describe("imageWriteNeeded (R25: write the trainer only when the photo changed)", () => {
  const url = "https://cdn.example.com/a.jpg";
  const checked = { imageUrl: url, imageFetchedAt: stamp(1), staffId: "42" };

  it("writes for a trainer never checked before", () => {
    expect(imageWriteNeeded(undefined, url, "42")).toBe(true);
    expect(imageWriteNeeded({}, null, "42")).toBe(true);
    expect(imageWriteNeeded({ imageUrl: url, staffId: "42" }, url, "42")).toBe(true);
  });

  it("writes nothing when the same photo comes back", () => {
    expect(imageWriteNeeded(checked, url, "42")).toBe(false);
  });

  it("writes nothing when there is still no photo", () => {
    expect(imageWriteNeeded({ imageUrl: null, imageFetchedAt: stamp(1), staffId: "42" }, null, "42")).toBe(false);
  });

  it("writes when the photo changed, appeared or went away", () => {
    expect(imageWriteNeeded(checked, "https://cdn.example.com/b.jpg", "42")).toBe(true);
    expect(imageWriteNeeded({ imageUrl: null, imageFetchedAt: stamp(1), staffId: "42" }, url, "42")).toBe(true);
    expect(imageWriteNeeded(checked, null, "42")).toBe(true);
  });

  it("writes when the photo now comes from another staff id", () => {
    expect(imageWriteNeeded(checked, url, "43")).toBe(true);
  });
});

describe("refreshStaffImage writes only on a change", () => {
  function fakeTrainer(mindbody: Record<string, unknown> | undefined) {
    const set = vi.fn(async () => undefined);
    const ref = {
      get: async () => ({ data: () => (mindbody ? { mindbody } : {}) }),
      set,
    };
    return { ref: ref as never, set };
  }
  const fetchReturning = (body: unknown) =>
    vi.fn(async () => ({ ok: true, status: 200, text: async () => "", json: async () => body }));
  const url = "https://cdn.example.com/a.jpg";

  it("does not write the trainer when the forced check finds the same photo", async () => {
    const { ref, set } = fakeTrainer({ imageUrl: url, imageFetchedAt: stamp(1), staffId: "42" });
    const result = await refreshStaffImage({} as never, ref, {
      apiKey: "k",
      siteId: "1",
      staffId: "42",
      force: true,
      fetchImpl: fetchReturning({ ImageUrl: url }),
    });
    expect(set).not.toHaveBeenCalled();
    expect(result).toEqual({ refreshed: false, url, reason: "unchanged" });
  });

  it("writes the trainer when the photo changed", async () => {
    const { ref, set } = fakeTrainer({ imageUrl: url, imageFetchedAt: stamp(1), staffId: "42" });
    const result = await refreshStaffImage({} as never, ref, {
      apiKey: "k",
      siteId: "1",
      staffId: "42",
      force: true,
      fetchImpl: fetchReturning({ ImageUrl: "https://cdn.example.com/b.jpg" }),
    });
    expect(set).toHaveBeenCalledTimes(1);
    expect(result.refreshed).toBe(true);
  });
});
