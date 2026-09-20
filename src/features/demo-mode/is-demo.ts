import { DEMO_STUDIO_ID } from "./constants";

/**
 * Every field name in this app that means "the studio this record belongs to".
 * A record is demo-scoped if ANY of them points at the demo studio.
 *
 * Kept as one list because the app is genuinely inconsistent here — a client
 * uses `homeStudioId`, a session uses `hostedAtStudioId` AND
 * `clientHomeStudioId`, a log and a routine use `studioId`. A guard that
 * checked only one of them would leak. (The Sep 20 2026 audit counted six
 * spellings of "the studio" across the codebase; these four are the ones that
 * appear on documents.)
 */
export const STUDIO_SCOPE_FIELDS = [
  "studioId",
  "homeStudioId",
  "hostedAtStudioId",
  "clientHomeStudioId",
] as const;

/** Anything carrying a studio reference, a demo flag, or both. */
type MaybeScoped =
  | ({ isDemo?: boolean } & Partial<
      Record<(typeof STUDIO_SCOPE_FIELDS)[number], unknown>
    >)
  | null
  | undefined;

/** True for the well-known demo studio id, and nothing else. */
export function isDemoStudioId(studioId?: string | null): boolean {
  return studioId === DEMO_STUDIO_ID;
}

/**
 * True for the demo studio document. Checks the id first, then the `isDemo`
 * flag — so a second demo studio, if one is ever created, is still treated as
 * demo everywhere without touching this file.
 */
export function isDemoStudio(
  studio: { id?: string; isDemo?: boolean } | null | undefined,
): boolean {
  if (!studio) return false;
  return isDemoStudioId(studio.id) || studio.isDemo === true;
}

/**
 * True for any record that belongs to the demo studio: a client, session,
 * exercise log, routine, journal entry, task — anything with a studio field
 * or the `isDemo` flag.
 */
export function isDemoRecord(record: MaybeScoped): boolean {
  if (!record) return false;
  if (record.isDemo === true) return true;
  return STUDIO_SCOPE_FIELDS.some((field) => {
    const value = record[field];
    return typeof value === "string" && isDemoStudioId(value);
  });
}

/**
 * Drop demo records from a list. Use this at the point where data leaves the
 * app for something real — a report, an export, a company-wide metric, a
 * payroll sheet. Reporting that quietly counts practice sessions is worse than
 * no reporting at all, because nobody can tell it is wrong.
 */
export function excludeDemo<T extends MaybeScoped>(records: T[]): T[] {
  return records.filter((record) => !isDemoRecord(record));
}

/** The inverse — for the demo studio's own screens. */
export function onlyDemo<T extends MaybeScoped>(records: T[]): T[] {
  return records.filter((record) => isDemoRecord(record));
}

/**
 * Stamp a payload as demo-owned at write time.
 *
 * Called by the seeder and by any write made while a trainer is inside the
 * demo studio, so the flag is on the document from the moment it exists and
 * `isDemoRecord` never has to guess.
 */
export function withDemoFlag<T extends object>(
  payload: T,
  isDemo: boolean,
): T & { isDemo?: boolean } {
  return isDemo ? { ...payload, isDemo: true } : payload;
}
