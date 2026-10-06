/**
 * A CPU profile (Profiler.stop's answer) folded into self time per SOURCE
 * file and per function, through the build's source maps. A small VLQ
 * decoder of its own, so the lab needs no package.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

function decodeVlq(segment) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64_INDEX.get(ch);
    if (digit === undefined) continue;
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/** Parsed map: lines[generatedLine] = sorted [genCol, sourceIndex, origLine, origCol, nameIndex]. */
function parseMap(map) {
  const lines = [];
  let src = 0;
  let oLine = 0;
  let oCol = 0;
  let name = 0;
  const rows = map.mappings.split(";");
  for (let l = 0; l < rows.length; l += 1) {
    let gCol = 0;
    const segs = [];
    if (rows[l]) {
      for (const raw of rows[l].split(",")) {
        if (!raw) continue;
        const v = decodeVlq(raw);
        gCol += v[0];
        if (v.length >= 4) {
          src += v[1];
          oLine += v[2];
          oCol += v[3];
          if (v.length >= 5) name += v[4];
          segs.push([gCol, src, oLine, oCol, v.length >= 5 ? name : -1]);
        }
      }
    }
    lines.push(segs);
  }
  return { lines, sources: map.sources || [], names: map.names || [] };
}

function lookup(parsed, line, col) {
  const segs = parsed.lines[line];
  if (!segs || segs.length === 0) return null;
  let lo = 0;
  let hi = segs.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segs[mid][0] <= col) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (best < 0) return null;
  const s = segs[best];
  return { source: parsed.sources[s[1]], line: s[2] + 1, name: s[4] >= 0 ? parsed.names[s[4]] : null };
}

/** Shortens a source path to something readable: src/..., or the package in node_modules. */
function shortSource(source) {
  if (!source) return "(unknown)";
  const s = source.replace(/\\/g, "/");
  const nm = s.lastIndexOf("node_modules/");
  if (nm >= 0) {
    const rest = s.slice(nm + 13).split("/");
    const pkg = rest[0].startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
    return `node_modules/${pkg}`;
  }
  const i = s.indexOf("src/");
  return i >= 0 ? s.slice(i) : s.replace(/^(\.\.\/)+/, "");
}

export class SourceMaps {
  constructor(buildDir) {
    this.buildDir = buildDir;
    this.cache = new Map();
  }
  forUrl(url) {
    if (this.cache.has(url)) return this.cache.get(url);
    let parsed = null;
    try {
      const path = new URL(url).pathname;
      const mapFile = join(this.buildDir, `${decodeURIComponent(path)}.map`);
      if (existsSync(mapFile)) parsed = parseMap(JSON.parse(readFileSync(mapFile, "utf8")));
    } catch {
      parsed = null;
    }
    this.cache.set(url, parsed);
    return parsed;
  }
}

/**
 * Self time per source file and per function, in ms. A node's position is
 * its function's start, which the map names (the minified name otherwise).
 * Also: the package file in node_modules (react-dom, firestore...) is folded
 * to the package.
 */
export function foldProfile(profile, maps, { top = 15 } = {}) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const selfUs = new Map();
  const { samples = [], timeDeltas = [] } = profile;
  for (let i = 0; i < samples.length; i += 1) {
    const dt = timeDeltas[i + 1] ?? 0;
    selfUs.set(samples[i], (selfUs.get(samples[i]) ?? 0) + Math.max(0, dt));
  }
  const byFile = new Map();
  const byFn = new Map();
  let total = 0;
  for (const [id, us] of selfUs) {
    const node = nodes.get(id);
    if (!node) continue;
    const cf = node.callFrame;
    // Idle is the main thread waiting: not work, and it would top every list.
    if (!cf.url && cf.functionName === "(idle)") continue;
    total += us;
    let file;
    let fn;
    if (!cf.url) {
      file = `(${cf.functionName || "program"})`;
      fn = file;
    } else if (!cf.url.startsWith("http")) {
      file = "(browser)";
      fn = cf.functionName || "(anonymous)";
    } else {
      const parsed = maps.forUrl(cf.url);
      const hit = parsed ? lookup(parsed, cf.lineNumber, cf.columnNumber) : null;
      file = hit ? shortSource(hit.source) : new URL(cf.url).pathname;
      fn = `${(hit && hit.name) || cf.functionName || "(anonymous)"} ${file}${hit ? `:${hit.line}` : ""}`;
    }
    byFile.set(file, (byFile.get(file) ?? 0) + us);
    byFn.set(fn, (byFn.get(fn) ?? 0) + us);
  }
  const rank = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, top)
      .map(([name, us]) => ({ name, ms: Math.round(us / 100) / 10 }));
  return { totalMs: Math.round(total / 1000), files: rank(byFile), functions: rank(byFn) };
}
