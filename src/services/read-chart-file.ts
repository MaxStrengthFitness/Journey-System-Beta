/**
 * A chart page, read in the browser for the legacy chart importer.
 *
 * Round: Gemini route lock-down (Sep 24 2026). A photo larger than
 * MAX_CHART_EDGE_PX on its long edge is redrawn at that size as a JPEG before
 * it is kept: an iPad photo drops from about 5 MB to about 1 MB, which is what
 * lets a whole scan fit the Gemini routes' body limit (chart-upload.ts says
 * why the numbers). The model reads a page well below that size anyway.
 *
 * Anything that can't be shrunk — a PDF, a photo this browser can't draw
 * (HEIC on a desktop browser), a photo that is already small — is sent as it
 * is, exactly as before.
 *
 * Browser only: the pure half (the sizes, the checks) is chart-upload.ts.
 */

import { CHART_JPEG_QUALITY, fitWithin, type ChartImage } from "./chart-upload";

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read that file."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser can't draw that photo."));
    };
    img.src = url;
  });
}

/** The photo redrawn within MAX_CHART_EDGE_PX, or null to send the original. */
async function shrink(file: File): Promise<Blob | null> {
  const img = await loadImage(file);
  // Safari and Chrome both apply a photo's EXIF rotation to an <img> and to
  // what drawImage draws from it, so a page photographed sideways stays the
  // way it was taken.
  const size = fitWithin(img.naturalWidth, img.naturalHeight);
  if (!size) return null;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // JPEG has no transparency: without a backdrop a transparent PNG turns black.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.drawImage(img, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", CHART_JPEG_QUALITY),
  );
  // iPad Safari caps total canvas memory; hand this one back straight away.
  canvas.width = 0;
  canvas.height = 0;
  return blob && blob.size < file.size ? blob : null;
}

export async function readChartFile(file: File): Promise<ChartImage> {
  if (file.type.startsWith("image/")) {
    try {
      const smaller = await shrink(file);
      if (smaller) return { base64: await readAsBase64(smaller), mimeType: "image/jpeg" };
    } catch {
      // Can't be drawn here: send it as it is.
    }
  }
  return { base64: await readAsBase64(file), mimeType: file.type };
}
