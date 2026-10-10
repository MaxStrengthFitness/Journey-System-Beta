/**
 * THE RESET'S BACKUP, AND THE WAY BACK (the pre-launch reset, Oct 10 2026).
 *
 * `scripts/reset-test-data.ts` writes every document it deletes and every
 * field it changes to `backups/reset-<stamp>/reset.ndjson` BEFORE its first
 * write, and `--restore <dir>` puts them back from that file. JSON alone
 * would lose what Firestore stores and JSON does not have, so every such
 * value is written with a tag and read back as the same type:
 *
 *   {"__t":"ts","s":<seconds>,"n":<nanoseconds>}   a Timestamp
 *   {"__t":"geo","lat":..,"lng":..}                  a GeoPoint
 *   {"__t":"ref","path":"clients/abc"}               a DocumentReference
 *   {"__t":"bytes","b64":"..."}                      Bytes
 *   {"__t":"num","v":"NaN" | "Infinity" | "-Infinity"}
 *   {"__t":"map","v":{...}}                          a map that itself has a "__t" key
 *   {"__t":"absent"}                                 a field that wasn't there (field records only)
 *
 * Everything else (strings, finite numbers, booleans, null, arrays, maps) is
 * written as itself. A value the codec doesn't know (a vector, say) THROWS:
 * a backup that silently dropped a value would restore a different document,
 * and the reset stops before its first write.
 *
 * Pure: the Firestore classes come in through a `ValueKit`, so the Admin SDK
 * stays in the script and the tests use stand-ins.
 */

/** How the codec recognises and rebuilds Firestore's own value types. */
export interface ValueKit {
  timestampParts(value: unknown): { seconds: number; nanoseconds: number } | null;
  makeTimestamp(seconds: number, nanoseconds: number): unknown;
  geoPointParts(value: unknown): { latitude: number; longitude: number } | null;
  makeGeoPoint(latitude: number, longitude: number): unknown;
  refPath(value: unknown): string | null;
  makeRef(path: string): unknown;
  bytesOf(value: unknown): Uint8Array | null;
  makeBytes(bytes: Uint8Array): unknown;
}

const TAG = "__t";

/** The encoded form of "no value here". */
export const ENCODED_ABSENT = Object.freeze({ [TAG]: "absent" });

export function isEncodedAbsent(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)[TAG] === "absent" &&
    Object.keys(value as object).length === 1
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** One Firestore value as JSON that `decodeValue` turns back into the same value. */
export function encodeValue(value: unknown, kit: ValueKit, at = "value"): unknown {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return { [TAG]: "num", v: Number.isNaN(value) ? "NaN" : value > 0 ? "Infinity" : "-Infinity" };
  }
  if (value === undefined) throw new Error(`${at} is undefined, which Firestore never stores.`);
  const ts = kit.timestampParts(value);
  if (ts) return { [TAG]: "ts", s: ts.seconds, n: ts.nanoseconds };
  const geo = kit.geoPointParts(value);
  if (geo) return { [TAG]: "geo", lat: geo.latitude, lng: geo.longitude };
  const ref = kit.refPath(value);
  if (ref !== null) return { [TAG]: "ref", path: ref };
  const bytes = kit.bytesOf(value);
  if (bytes) return { [TAG]: "bytes", b64: toBase64(bytes) };
  if (Array.isArray(value)) return value.map((v, i) => encodeValue(v, kit, `${at}[${i}]`));
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = encodeValue(v, kit, `${at}.${k}`);
    }
    return TAG in value ? { [TAG]: "map", v: out } : out;
  }
  const kind = (value as { constructor?: { name?: string } })?.constructor?.name ?? typeof value;
  throw new Error(`${at} is a ${kind}, which the reset's backup can't write. Nothing was changed.`);
}

/** The reverse of `encodeValue`. */
export function decodeValue(value: unknown, kit: ValueKit): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => decodeValue(v, kit));
  const obj = value as Record<string, unknown>;
  if (typeof obj[TAG] === "string") {
    switch (obj[TAG]) {
      case "ts":
        return kit.makeTimestamp(Number(obj.s), Number(obj.n));
      case "geo":
        return kit.makeGeoPoint(Number(obj.lat), Number(obj.lng));
      case "ref":
        return kit.makeRef(String(obj.path));
      case "bytes":
        return kit.makeBytes(fromBase64(String(obj.b64)));
      case "num":
        return obj.v === "NaN" ? NaN : obj.v === "Infinity" ? Infinity : -Infinity;
      case "map": {
        const inner = obj.v as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(inner)) out[k] = decodeValue(v, kit);
        return out;
      }
      case "absent":
        throw new Error("An absent marker can't be decoded as a value.");
      default:
        throw new Error(`Unknown tag ${String(obj[TAG])} in the backup.`);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = decodeValue(v, kit);
  return out;
}

/** A whole document's data. */
export function encodeData(data: Record<string, unknown>, kit: ValueKit, path: string): Record<string, unknown> {
  return encodeValue(data, kit, path) as Record<string, unknown>;
}

export function decodeData(data: Record<string, unknown>, kit: ValueKit): Record<string, unknown> {
  return decodeValue(data, kit) as Record<string, unknown>;
}

/** JSON with every map's keys in order, so two encodings of one value compare equal. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const keys = Object.keys(value as object).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
}

/* ------------------------------------------------------------------ *
 * The backup file's lines
 * ------------------------------------------------------------------ */

export const BACKUP_FILE = "reset.ndjson";
export const MANIFEST_FILE = "manifest.json";
export const BACKUP_VERSION = 1;

/** A document the reset deleted, whole. */
export interface DeletedDocLine {
  kind: "doc";
  path: string;
  group: string;
  part: string;
  /** Encoded with `encodeData`. */
  data: Record<string, unknown>;
}

/** One field the reset changed on a document it kept. */
export interface FieldChangeRecord {
  /** The field's path, segment by segment. */
  field: string[];
  group: string;
  part: string;
  /** Encoded; ENCODED_ABSENT when the field wasn't there. */
  before: unknown;
  /** Encoded; ENCODED_ABSENT for a cleared field. */
  after: unknown;
}

/** The fields the reset changed on one document it kept. */
export interface ChangedFieldsLine {
  kind: "fields";
  path: string;
  changes: FieldChangeRecord[];
}

export type BackupLine = DeletedDocLine | ChangedFieldsLine;

export interface BackupManifest {
  version: number;
  projectId: string;
  databaseId: string;
  /** The ISO time printed before the first write: the moment for point-in-time recovery. */
  startedAt: string;
  groups: string[];
  includeDemo: boolean;
  before: string;
  documents: number;
  fieldDocuments: number;
  fields: number;
  /** Set when the last write has been sent; absent if the run stopped part way. */
  finishedAt?: string;
}

export function parseBackupLines(text: string): BackupLine[] {
  const lines: BackupLine[] = [];
  const rows = text.split(/\r?\n/);
  rows.forEach((row, i) => {
    if (!row.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row);
    } catch {
      throw new Error(`Line ${i + 1} of the backup isn't JSON.`);
    }
    const line = parsed as Partial<BackupLine>;
    if (line.kind === "doc" && typeof line.path === "string" && line.data && typeof line.data === "object") {
      lines.push(line as DeletedDocLine);
    } else if (line.kind === "fields" && typeof line.path === "string" && Array.isArray((line as ChangedFieldsLine).changes)) {
      lines.push(line as ChangedFieldsLine);
    } else {
      throw new Error(`Line ${i + 1} of the backup isn't a document or a field record.`);
    }
  });
  return lines;
}

/* ------------------------------------------------------------------ *
 * Restore: what to put back, given what is there now
 * ------------------------------------------------------------------ */

/** The encoded value at a field path of an encoded document, or ENCODED_ABSENT. */
export function encodedValueAt(data: Record<string, unknown> | null, field: readonly string[]): unknown {
  let at: unknown = data;
  for (const seg of field) {
    if (at === null || typeof at !== "object" || Array.isArray(at)) return ENCODED_ABSENT;
    let obj = at as Record<string, unknown>;
    // A map holding a "__t" key is wrapped by the codec.
    if (obj[TAG] === "map" && obj.v && typeof obj.v === "object") obj = obj.v as Record<string, unknown>;
    if (!(seg in obj)) return ENCODED_ABSENT;
    at = obj[seg];
  }
  return at === undefined ? ENCODED_ABSENT : at;
}

export interface FieldRestore {
  field: string[];
  /** Encoded; ENCODED_ABSENT means delete the field again. */
  value: unknown;
}

export interface RestorePlan {
  /** Documents to create again (they are not there now). */
  create: DeletedDocLine[];
  /** Documents that exist now: never overwritten, reported. */
  docsExistingNow: DeletedDocLine[];
  /** Per kept document, the fields to put back. */
  fields: { path: string; restores: FieldRestore[] }[];
  /** Fields someone or something changed since the reset: never overwritten, reported. */
  fieldsChangedSince: { path: string; field: string[] }[];
  /** Documents whose fields were changed but which are gone now. */
  fieldDocsGone: string[];
}

/**
 * `existsNow` is every backed-up document path that exists today;
 * `currentOf(path)` is a kept document's data today, ENCODED with the same
 * kit (null when it is gone). Restore never overwrites: a document that
 * exists now, or a field whose value is no longer the one the reset left, is
 * left alone and reported. A path or field listed twice is restored from its
 * first line.
 */
export function planRestore(
  lines: readonly BackupLine[],
  existsNow: ReadonlySet<string>,
  currentOf: (path: string) => Record<string, unknown> | null,
): RestorePlan {
  const plan: RestorePlan = { create: [], docsExistingNow: [], fields: [], fieldsChangedSince: [], fieldDocsGone: [] };
  const seenDocs = new Set<string>();
  const byPath = new Map<string, { restores: FieldRestore[]; seen: Set<string> }>();
  for (const line of lines) {
    if (line.kind === "doc") {
      if (seenDocs.has(line.path)) continue;
      seenDocs.add(line.path);
      if (existsNow.has(line.path)) plan.docsExistingNow.push(line);
      else plan.create.push(line);
      continue;
    }
    const current = currentOf(line.path);
    if (current === null) {
      if (!plan.fieldDocsGone.includes(line.path)) plan.fieldDocsGone.push(line.path);
      continue;
    }
    const entry = byPath.get(line.path) ?? { restores: [], seen: new Set<string>() };
    for (const change of line.changes) {
      const key = change.field.join("\u0000");
      if (entry.seen.has(key)) continue;
      entry.seen.add(key);
      const now = encodedValueAt(current, change.field);
      if (stableJson(now) !== stableJson(change.after)) {
        plan.fieldsChangedSince.push({ path: line.path, field: change.field });
        continue;
      }
      entry.restores.push({ field: change.field, value: change.before });
    }
    byPath.set(line.path, entry);
  }
  for (const [path, entry] of byPath) {
    if (entry.restores.length > 0) plan.fields.push({ path, restores: entry.restores });
  }
  return plan;
}
