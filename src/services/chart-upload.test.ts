import { describe, expect, it } from "vitest";
import {
  chartPagesProblem,
  fitWithin,
  MAX_CHART_EDGE_PX,
  MAX_CHART_PAGES,
  readChartImages,
} from "./chart-upload";

describe("fitWithin", () => {
  it("shrinks an iPad photo to the long-edge limit, keeping its shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_CHART_EDGE_PX, height: 1536 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: MAX_CHART_EDGE_PX });
  });
  it("leaves a photo that already fits alone, and never scales up", () => {
    expect(fitWithin(2048, 1000)).toBeNull();
    expect(fitWithin(800, 600)).toBeNull();
  });
  it("leaves an unusable size alone rather than drawing a 0px page", () => {
    expect(fitWithin(0, 3000)).toBeNull();
    expect(fitWithin(NaN, 3000)).toBeNull();
    expect(fitWithin(5000, 1, 2048)).toEqual({ width: 2048, height: 1 });
  });
});

describe("chartPagesProblem", () => {
  it("allows one page up to the limit", () => {
    expect(chartPagesProblem(1)).toBeNull();
    expect(chartPagesProblem(MAX_CHART_PAGES)).toBeNull();
  });
  it("says how many pages a scan may have, in a sentence", () => {
    expect(chartPagesProblem(MAX_CHART_PAGES + 1)).toContain(`up to ${MAX_CHART_PAGES} chart pages`);
    expect(chartPagesProblem(0)).toMatch(/at least one/);
  });
});

describe("readChartImages", () => {
  const page = { base64: "aGVsbG8=", mimeType: "image/jpeg" };

  it("takes photos and PDFs", () => {
    const r = readChartImages([page, { base64: "JVBERi0=", mimeType: "application/pdf" }]);
    expect(r.ok).toBe(true);
    expect(r.images).toHaveLength(2);
    expect(r.error).toBe("");
  });
  it("keeps only the two fields the model is sent", () => {
    const r = readChartImages([{ ...page, extra: "x".repeat(10) }]);
    expect(r.images).toEqual([page]);
  });
  it("refuses a missing list, an empty list and too many pages", () => {
    expect(readChartImages(undefined).ok).toBe(false);
    expect(readChartImages("pages").ok).toBe(false);
    expect(readChartImages([]).ok).toBe(false);
    expect(readChartImages(Array(MAX_CHART_PAGES + 1).fill(page)).ok).toBe(false);
  });
  it("refuses an empty page, a page that isn't a photo or PDF, and junk", () => {
    expect(readChartImages([{ base64: "", mimeType: "image/png" }]).ok).toBe(false);
    expect(readChartImages([{ base64: "aGk=", mimeType: "text/html" }]).ok).toBe(false);
    expect(readChartImages([{ base64: "aGk=", mimeType: "" }]).ok).toBe(false);
    expect(readChartImages([{ base64: 42, mimeType: "image/png" }]).ok).toBe(false);
    expect(readChartImages([null]).ok).toBe(false);
    expect(readChartImages(["aGk="]).ok).toBe(false);
  });
});
