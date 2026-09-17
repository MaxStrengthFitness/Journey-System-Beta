/**
 * MACHINE FIT — the two stores, as plain data.
 *
 *   studios/{studioId}/machineFit/{machineId}     THE STUDIO INDEX
 *       rows: { [clientId]: { s: settings, src?: sources, a?: reviews, t: savedAt } }
 *
 *     One document per machine per studio: who is set to what. Written
 *     whenever a client's settings are saved (one row, one key — two iPads
 *     never overwrite each other), readable by the people who work at that
 *     studio, and rebuilt whole by scripts/rebuild-machine-fit.ts.
 *
 *     IT HOLDS NO BODY DATA. No height, no weight, nothing from InBody. A row
 *     is joined to the client's record AT READ TIME, from the studio roster
 *     the app already holds in memory (useStudioRoster). Three things follow:
 *     a corrected height is right everywhere at once, with nothing to
 *     re-index; health data is never copied out of the client record; and the
 *     document stays small (a few dozen bytes a client).
 *
 *   machineTrends/{machineId}.fit                 THE COMPANY BLOCK
 *       cells: { "67|f": { "gap=4;seat=3": 12, … } }
 *
 *     Every studio pooled by the weekly job, ANONYMOUS: a cell is a height, a
 *     gender and a count. "Never a client row" (machine-trends README) still
 *     holds — which is also why the company tier can only match on height and
 *     gender.
 *
 * WHAT COUNTS AS EVIDENCE. A value a trainer typed, or copied from the
 * FileMaker chart, is evidence the day it is saved: a person chose it for
 * that body. A value that was only ACCEPTED from a suggestion is not — until
 * the client has actually performed that machine since. Without that rule the
 * engine would learn from its own guesses: suggest Seat 3, see Seat 3
 * accepted, grow more sure of Seat 3, for ever. `verifiedSettings` is that
 * rule, in one place, for both tiers.
 */

import { normalizeSettingKey, normalizeSnapshot } from "../machine-trends/trends.ts";
import { factorsOf, type FitClientInput } from "./factors.ts";
import type { FitAck, FitFactors, FitSample, SettingSource } from "./types.ts";

/* ------------------------------------------------------------------ *
 * The studio index
 * ------------------------------------------------------------------ */

export interface FitRowDoc {
  /** Normalised settings. */
  s: Record<string, string>;
  /** Normalised key → where the value came from. Only non-"typed" sources are stored. */
  src?: Record<string, Exclude<SettingSource, "typed">>;
  /**
   * "Right for this client" reviews that still apply: ack key → the value it
   * was given for. A copy of clientMachineSettings.fitAcks, kept here so the
   * studio-wide check (kaizen.ts) can leave reviewed settings alone without
   * reading every client's settings document.
   */
  a?: Record<string, string>;
  /** When the settings were last saved, ms since epoch. */
  t: number;
}

/** The most reviews one row carries. A machine has a handful of fields; this is a guard, not a budget. */
export const MAX_ROW_ACKS = 12;

/**
 * The reviews worth copying onto a row: the ones whose value is still the
 * value on file. A review lapses when the setting changes (audit.ts), so a
 * lapsed one is dead weight. A combination's key is "a+b" and its value
 * "va+vb" (comboAckKey / comboAckValue, both sorted by key).
 */
export function liveAcks(
  s: Record<string, string>,
  acks: Record<string, { value?: unknown } | undefined> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, ack] of Object.entries(acks ?? {})) {
    const value = ack?.value;
    if (typeof value !== "string" || !value) continue;
    const parts = key.split("+");
    const current = parts.map((k) => s[k]);
    if (current.some((v) => v === undefined)) continue;
    if (current.join("+") !== value) continue;
    out[key] = value;
    if (Object.keys(out).length >= MAX_ROW_ACKS) break;
  }
  return out;
}

export interface MachineFitDoc {
  machineId: string;
  studioId: string;
  rows: Record<string, FitRowDoc>;
  updatedAt?: unknown;
  /** Set by scripts/rebuild-machine-fit.ts when it replaced the document whole. */
  rebuiltAt?: string;
}

/**
 * The row for one client's saved settings, or null when nothing usable is
 * set (the caller then deletes the row). `settings` and `sources` arrive in
 * the machine's STORAGE keys ("Back Pad" or "back-pad"); both leave normalised.
 */
export function toFitRow(
  settings: Record<string, unknown> | null | undefined,
  sources: Record<string, SettingSource | undefined> | null | undefined,
  savedAt: number,
  acks?: Record<string, { value?: unknown } | undefined> | null,
): FitRowDoc | null {
  const s = normalizeSnapshot(settings ?? null);
  if (!s) return null;
  const src: NonNullable<FitRowDoc["src"]> = {};
  for (const [rawKey, source] of Object.entries(sources ?? {})) {
    const key = normalizeSettingKey(rawKey);
    if (!key || !(key in s)) continue;
    if (source === "suggested" || source === "legacy") src[key] = source;
  }
  const a = liveAcks(s, acks);
  const row: FitRowDoc = { s, t: savedAt };
  if (Object.keys(src).length > 0) row.src = src;
  if (Object.keys(a).length > 0) row.a = a;
  return row;
}

const EASTERN_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The studio's (Eastern) calendar day of an instant, YYYY-MM-DD — the form machineStats dates use. */
export function easternDayOf(ms: number): string {
  return EASTERN_DAY.format(new Date(ms));
}

/** What the engine needs from a client to verify a row: the machine's last performed day. */
export interface FitClientRecord extends FitClientInput {
  machineStats?: Record<string, { lastPerformedDate?: string | null } | undefined> | null;
}

/**
 * The part of a row that counts as evidence (see the header). A "suggested"
 * value is kept only when the client has performed the machine on or after
 * the day the row was saved.
 */
export function verifiedSettings(
  row: FitRowDoc,
  lastPerformedDay: string | null | undefined,
): Record<string, string> {
  const suggested = Object.entries(row.src ?? {}).filter(([, v]) => v === "suggested");
  if (suggested.length === 0) return row.s;
  const performedSince = !!lastPerformedDay && lastPerformedDay >= easternDayOf(row.t);
  if (performedSince) return row.s;
  const out = { ...row.s };
  for (const [key] of suggested) delete out[key];
  return out;
}

/**
 * One machine's studio index, joined to the client records the app holds.
 * A row whose client is not in `clientsById` (moved studio, not loaded) is
 * left out: a set-up with no body attached is not evidence about any build.
 */
export function samplesFromFitDoc(
  doc: Pick<MachineFitDoc, "machineId" | "rows"> | null | undefined,
  clientsById: ReadonlyMap<string, FitClientRecord>,
  now: Date = new Date(),
): FitSample[] {
  const out: FitSample[] = [];
  if (!doc?.rows) return out;
  for (const [clientId, row] of Object.entries(doc.rows)) {
    if (!row || typeof row !== "object" || !row.s) continue;
    const client = clientsById.get(clientId);
    if (!client) continue;
    const settings = verifiedSettings(row, client.machineStats?.[doc.machineId]?.lastPerformedDate);
    if (Object.keys(settings).length === 0) continue;
    out.push({ clientId, n: 1, settings, factors: factorsOf(client, now) });
  }
  return out;
}

/**
 * One client's set-up as the studio-wide check reads it (kaizen.ts).
 *
 * Not the same thing as a sample. A SAMPLE is evidence, so a value that was
 * only accepted from a suggestion is left out of it until she has trained on
 * it. A SUBJECT is what is actually on file for her — every saved value,
 * accepted ones included, because an accepted value is exactly the kind that
 * deserves a second look.
 */
export interface FitAuditSubject {
  clientId: string;
  studioId: string | null;
  settings: Record<string, string>;
  factors: FitFactors;
  /** Reviews on file, as the audit takes them. */
  acks: Record<string, FitAck>;
}

export function subjectsFromFitDoc(
  doc: (Pick<MachineFitDoc, "machineId" | "rows"> & { studioId?: string | null }) | null | undefined,
  clientsById: ReadonlyMap<string, FitClientRecord>,
  now: Date = new Date(),
): FitAuditSubject[] {
  const out: FitAuditSubject[] = [];
  if (!doc?.rows) return out;
  for (const [clientId, row] of Object.entries(doc.rows)) {
    if (!row || typeof row !== "object" || !row.s || Object.keys(row.s).length === 0) continue;
    const client = clientsById.get(clientId);
    if (!client) continue;
    const acks: Record<string, FitAck> = {};
    for (const [key, value] of Object.entries(row.a ?? {})) {
      if (typeof value === "string") acks[key] = { value, by: "", byName: "", at: "" };
    }
    out.push({ clientId, studioId: doc.studioId ?? null, settings: row.s, factors: factorsOf(client, now), acks });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The company block
 * ------------------------------------------------------------------ */

/**
 * The smallest group of clients a published cell may describe.
 *
 * A cell is a height, a gender and a whole set-up, so in a small company
 * nearly every cell is ONE PERSON — "the 6'7" man: Gap 0, Seat 1" — in a
 * document any signed-in trainer at any studio can read. No id, no studio,
 * but a row about a person all the same, and machineTrends is aggregates
 * only. So the block is k-anonymous on the two things that could point at
 * someone: every published (height, gender) group holds at least this many
 * clients. A gender too small at a height is pooled with the unknowns ("x");
 * if that pool is still too small the whole height is pooled; a height with
 * too few clients altogether is left out. What is left out comes back by
 * itself as the company grows — and a height with four clients was never
 * going to reach the ladder's minimum of five anyway.
 */
export const CELL_MIN_CLIENTS = 5;

export interface CompanyFitBlock {
  /** Clients contributing (verified settings and a height on file). */
  clients: number;
  /** Clients left out because their height had fewer than CELL_MIN_CLIENTS company-wide. */
  heldBack?: number;
  /** Studios those clients belong to. */
  studios: number;
  /** cell ("67|f") → signature ("gap=4;seat=3") → clients. */
  cells: Record<string, Record<string, number>>;
  builtAt: string;
}

export function cellKey(heightIn: number, gender: "m" | "f" | null | undefined): string {
  return `${heightIn}|${gender ?? "x"}`;
}

export function parseCellKey(key: string): { heightIn: number; gender: "m" | "f" | null } | null {
  const m = /^(\d{2,3})\|([mfx])$/.exec(key);
  if (!m) return null;
  return { heightIn: Number(m[1]), gender: m[2] === "x" ? null : (m[2] as "m" | "f") };
}

/**
 * "gap=4;seat=3" — the settings, keys in order. Normalised keys and values
 * are [a-z0-9_-] only, so "=" and ";" can never appear inside one.
 */
export function signatureOf(settings: Record<string, string>): string {
  return Object.keys(settings)
    .sort()
    .map((k) => `${k}=${settings[k]}`)
    .join(";");
}

export function settingsOfSignature(signature: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of signature.split(";")) {
    const at = part.indexOf("=");
    if (at <= 0) continue;
    out[part.slice(0, at)] = part.slice(at + 1);
  }
  return out;
}

/**
 * Pool studio samples into anonymous cells. Samples with no height are left
 * out — they match nothing. `minCell` is CELL_MIN_CLIENTS everywhere but the
 * tests that need a small fixture to stay small.
 */
export function buildCompanyBlock(
  samplesByStudio: ReadonlyMap<string, readonly FitSample[]>,
  builtAt: string,
  minCell: number = CELL_MIN_CLIENTS,
): CompanyFitBlock {
  type Gender = "m" | "f" | "x";
  const genderOf = (s: FitSample): Gender => (s.factors.gender === "m" || s.factors.gender === "f" ? s.factors.gender : "x");

  // Pass 1: how many clients at each height, and of each gender there.
  const perHeight = new Map<number, Record<Gender, number>>();
  for (const samples of samplesByStudio.values()) {
    for (const s of samples) {
      const h = s.factors.heightIn;
      if (typeof h !== "number" || !signatureOf(s.settings)) continue;
      const row = perHeight.get(h) ?? { m: 0, f: 0, x: 0 };
      row[genderOf(s)] += s.n;
      perHeight.set(h, row);
    }
  }

  // Which cell each gender at each height is published in: its own, the pooled one, or none.
  const cellFor = new Map<number, Record<Gender, Gender | null>>();
  for (const [h, row] of perHeight) {
    const total = row.m + row.f + row.x;
    if (total < minCell) {
      cellFor.set(h, { m: null, f: null, x: null });
      continue;
    }
    const own = { m: row.m >= minCell, f: row.f >= minCell };
    const pooled = row.x + (own.m ? 0 : row.m) + (own.f ? 0 : row.f);
    // A pool that is itself too small would point at the few people in it
    // ("the two men at 5'4\""): pool the whole height instead.
    const poolAll = pooled > 0 && pooled < minCell;
    cellFor.set(h, {
      m: own.m && !poolAll ? "m" : "x",
      f: own.f && !poolAll ? "f" : "x",
      x: "x",
    });
  }

  const cells: CompanyFitBlock["cells"] = {};
  let clients = 0;
  let heldBack = 0;
  let studios = 0;
  for (const samples of samplesByStudio.values()) {
    let contributed = false;
    for (const s of samples) {
      const h = s.factors.heightIn;
      if (typeof h !== "number") continue;
      const signature = signatureOf(s.settings);
      if (!signature) continue;
      const publishAs = cellFor.get(h)?.[genderOf(s)] ?? null;
      if (publishAs === null) {
        heldBack += s.n;
        continue;
      }
      const key = cellKey(h, publishAs === "x" ? null : publishAs);
      const cell = (cells[key] ??= {});
      cell[signature] = (cell[signature] ?? 0) + s.n;
      clients += s.n;
      contributed = true;
    }
    if (contributed) studios += 1;
  }
  return heldBack > 0 ? { clients, heldBack, studios, cells, builtAt } : { clients, studios, cells, builtAt };
}

/** The company block back as samples the engine can run on. */
export function samplesFromCompanyBlock(block: CompanyFitBlock | null | undefined): FitSample[] {
  const out: FitSample[] = [];
  for (const [key, signatures] of Object.entries(block?.cells ?? {})) {
    const cell = parseCellKey(key);
    if (!cell) continue;
    for (const [signature, n] of Object.entries(signatures)) {
      const count = Number(n);
      if (!Number.isFinite(count) || count <= 0) continue;
      const settings = settingsOfSignature(signature);
      if (Object.keys(settings).length === 0) continue;
      out.push({ settings, n: count, factors: { heightIn: cell.heightIn, gender: cell.gender } });
    }
  }
  return out;
}
