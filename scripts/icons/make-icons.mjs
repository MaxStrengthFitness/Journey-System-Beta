// make-icons.mjs - rasterise the Home Screen icon SVGs with the Chrome or Edge already on the PC.
// No npm packages: Chrome renders, node:zlib reads and writes the PNGs.
//
//   node scripts/icons/make-icons.mjs                  (scripts/icons -> public)
//   node scripts/icons/make-icons.mjs <svgDir> <outDir>
//
// Each PNG is rendered at its exact pixel size (no downscaling), cropped from Chrome's
// screenshot, checked to be fully opaque, and written as 8-bit RGB with no alpha channel
// (iOS paints any transparency black, so an alpha channel is never wanted on these).
// favicon.svg is copied as it is. The SVGs in this folder are the sources: edit them, run
// this, commit the PNGs. src/features/home-screen/README.md has the rest.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const [svgDir = HERE, outDir = join(HERE, "..", "..", "public")] = process.argv.slice(2);

const TARGETS = [
  { svg: "icon.svg", size: 180, out: "apple-touch-icon.png" },
  { svg: "icon.svg", size: 192, out: "icon-192.png" },
  { svg: "icon.svg", size: 512, out: "icon-512.png" },
  { svg: "icon-maskable.svg", size: 512, out: "icon-maskable-512.png" },
  { svg: "favicon.svg", size: 32, out: "favicon-32.png" },
];

const BROWSERS = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) throw new Error("No Chrome or Edge found - set CHROME to its full path.");

// ---- PNG ------------------------------------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

function decodePng(buf) {
  let off = 8, width = 0, height = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4); colorType = data[9];
      if (data[8] !== 8 || data[12] !== 0 || (colorType !== 2 && colorType !== 6))
        throw new Error("Unexpected PNG format from the browser");
    } else if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3, stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      line[i] = (line[i] + [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      line.copy(rgba, (y * width + x) * 4, x * bpp, x * bpp + 3);
      rgba[(y * width + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, rgba };
}

function encodeRgbPng(width, height, rgb) {
  const stride = width * 3, rows = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const line = rgb.subarray(y * stride, (y + 1) * stride);
    let best = null, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = Buffer.alloc(stride + 1);
      out[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? line[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0;
        const v = (line[i] - [0, a, b, (a + b) >> 1, paeth(a, b, c)][f]) & 0xff;
        out[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = out; }
    }
    rows.push(best);
    prev = line;
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit truecolour, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- Render ---------------------------------------------------------------------------
const work = join(tmpdir(), `journey-icons-${process.pid}`);
mkdirSync(work, { recursive: true });
mkdirSync(outDir, { recursive: true });

try {
  for (const { svg, size, out } of TARGETS) {
    // The SVG inline at its exact size in the top-left corner. Headless Chrome will not make a
    // window narrower than about 500px, so the window is larger and the icon is cropped out.
    const markup = readFileSync(join(svgDir, svg), "utf8")
      .replace(/<svg\b/, `<svg width="${size}" height="${size}" style="display:block"`);
    const page = join(work, `${out}.html`);
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">${markup}</body></html>`);
    const shot = join(work, `${out}.shot.png`);
    const win = Math.max(size, 640);
    execFileSync(browser, [
      "--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
      `--window-size=${win},${win}`, "--default-background-color=00000000",
      `--user-data-dir=${join(work, "profile")}`, `--screenshot=${shot}`,
      "file:///" + resolve(page).replace(/\\/g, "/"),
    ], { stdio: "ignore" });

    const { width, rgba } = decodePng(readFileSync(shot));
    const rgb = Buffer.alloc(size * size * 3);
    let translucent = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * width + x) * 4;
        if (rgba[i + 3] !== 255) translucent++;
        rgba.copy(rgb, (y * size + x) * 3, i, i + 3);
      }
    if (translucent) throw new Error(`${out}: ${translucent} pixels are not opaque - the SVG needs a full-bleed background`);
    const png = encodeRgbPng(size, size, rgb);
    writeFileSync(join(outDir, out), png);
    console.log(`${out.padEnd(24)} ${String(size).padStart(3)}x${size}  RGB, opaque  ${png.length} bytes`);
  }
  copyFileSync(join(svgDir, "favicon.svg"), join(outDir, "favicon.svg"));
  console.log(`${"favicon.svg".padEnd(24)} copied`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
