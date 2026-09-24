/**
 * WHAT A CHART SCAN MAY SEND — the one answer, shared by the legacy chart
 * importer (src/features/admin/import/LegacyChartImporter.tsx) and the two
 * Gemini routes that read it (server/gemini-routes.ts).
 *
 * Round: Gemini route lock-down (Sep 24 2026). The routes used to take a
 * 50 MB body from anyone. That ceiling existed because the importer sent raw
 * iPad photos — about 5 MB each once base64-encoded — and the settings call
 * sends every page at once. Now the importer shrinks each photo to
 * MAX_CHART_EDGE_PX on its long edge before sending it (well past what the
 * model reads a page at), a page is about 1 MB, and the server takes
 * CHART_BODY_LIMIT: the full MAX_CHART_PAGES comes to roughly 12-16 MB, and
 * the rest is headroom for a PDF or a photo the browser could not shrink.
 *
 * No browser or server imports here: both sides read the same numbers.
 */

/** Pages in one scan. The settings call sends all of them in one request. */
export const MAX_CHART_PAGES = 12;

/** A photo larger than this on its long edge is shrunk before it is sent. */
export const MAX_CHART_EDGE_PX = 2048;

/** JPEG quality for a shrunk photo. */
export const CHART_JPEG_QUALITY = 0.85;

/** The request-body ceiling on the two Gemini routes (an Express `limit`). */
export const CHART_BODY_LIMIT = "20mb";

/** Photos and PDFs; the model reads both. */
const CHART_MIME = /^(image\/[a-z0-9.+-]+|application\/pdf)$/i;

export interface ChartImage {
  base64: string;
  mimeType: string;
}

/**
 * The size a width x height photo is drawn at so its long edge is at most
 * `maxEdge`, keeping its shape. Never scales up. Null when nothing needs to
 * change (or the size is unusable), so the caller sends the original.
 */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_CHART_EDGE_PX,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0) || !(maxEdge > 0)) return null;
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return null;
  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Why a scan can't be sent, or null when it can. The sentence is shown on screen. */
export function chartPagesProblem(pageCount: number): string | null {
  if (pageCount < 1) return "Add at least one chart page first.";
  if (pageCount > MAX_CHART_PAGES) {
    return `Read up to ${MAX_CHART_PAGES} chart pages at a time. This scan has ${pageCount}: remove some and scan the rest separately.`;
  }
  return null;
}

/**
 * One flat shape rather than a union: this project compiles without
 * strictNullChecks, where `if (!r.ok)` does not narrow a union.
 */
export interface ChartImagesResult {
  ok: boolean;
  /** Empty unless ok. */
  images: ChartImage[];
  /** Empty when ok; otherwise the sentence to answer with. */
  error: string;
}

function refused(error: string): ChartImagesResult {
  return { ok: false, images: [], error };
}

/**
 * The images in a request body, checked: a list of 1..MAX_CHART_PAGES
 * `{ base64, mimeType }`, each a non-empty string and a photo or a PDF.
 */
export function readChartImages(value: unknown): ChartImagesResult {
  if (!Array.isArray(value)) return refused("That request carried no chart pages.");
  const tooMany = chartPagesProblem(value.length);
  if (tooMany) return refused(tooMany);
  const images: ChartImage[] = [];
  for (const item of value) {
    const base64 = item && typeof item === "object" ? (item as any).base64 : undefined;
    const mimeType = item && typeof item === "object" ? (item as any).mimeType : undefined;
    if (typeof base64 !== "string" || base64 === "") {
      return refused("One of those chart pages was empty.");
    }
    if (typeof mimeType !== "string" || !CHART_MIME.test(mimeType)) {
      return refused("Chart pages must be photos or PDFs.");
    }
    images.push({ base64, mimeType });
  }
  return { ok: true, images, error: "" };
}
