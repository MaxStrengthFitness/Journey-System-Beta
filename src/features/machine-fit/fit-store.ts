/**
 * MACHINE FIT — the Firestore half: reading the two tiers, keeping the studio
 * index current.
 *
 * COST, stated once so nobody has to work it out:
 *
 *   STUDIO    one QUERY for the studio's whole machineFit collection — one
 *             document per machine that anyone is set up on, so about twenty
 *             reads — the first time a Setup screen (or the Machine Fit
 *             report) opens at that studio, then nothing for FRESH_MS. A save
 *             from THIS iPad is folded into the cached copy, so the next
 *             client's suggestions already include the one just set up.
 *   COMPANY   one read per machine per app session, through the Settings
 *             card's own cache (fetchMachineTrend) — the document is rebuilt
 *             weekly, so re-reading it would buy nothing.
 *
 * Nothing here is a listener. Suggestions do not need to change under a
 * trainer's thumb, and thirty live listeners per open profile is exactly the
 * bill the cost round took out.
 *
 * A FAILED READ IS UNKNOWN, NEVER EMPTY. The studio tier comes back `null`
 * (not `[]`) when it could not be read, so the engine falls through to
 * company data instead of concluding nobody at the studio is set up.
 *
 * THE INDEX WRITE NEVER BLOCKS A SAVE. upsertFitRow catches everything: the
 * client's settings are the record, the index is a copy that
 * scripts/rebuild-machine-fit.ts can always rebuild. (A trainer covering at
 * another studio may be refused by the rules when the client's home is a
 * studio they do not work at — that save still succeeds.)
 */

import { useEffect, useMemo, useState } from "react";
import {
  FieldPath,
  collection,
  deleteField,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  type WriteBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { fetchMachineTrend } from "../equipment/useMachineTrend";
import {
  samplesFromCompanyBlock,
  samplesFromFitDoc,
  toFitRow,
  type CompanyFitBlock,
  type FitClientRecord,
  type FitRowDoc,
  type MachineFitDoc,
} from "./fit-index";
import type { FitSources } from "./engine";
import type { SettingSource } from "./types";

/** How long a studio's index is trusted before the next screen re-reads it. */
export const FRESH_MS = 10 * 60_000;

type StudioFit = Record<string, MachineFitDoc>;

interface CacheEntry {
  at: number;
  promise: Promise<StudioFit | null>;
}

const studioCache = new Map<string, CacheEntry>();

/** Every machine's index for one studio, or null when it could not be read. */
export function fetchStudioFit(studioId: string, now: number = Date.now()): Promise<StudioFit | null> {
  const hit = studioCache.get(studioId);
  if (hit && now - hit.at < FRESH_MS) return hit.promise;
  const promise = getDocs(collection(db, "studios", studioId, "machineFit"))
    .then((snap) => {
      const out: StudioFit = {};
      snap.docs.forEach((d) => {
        const data = d.data() as Partial<MachineFitDoc>;
        out[d.id] = { machineId: d.id, studioId, rows: data.rows ?? {}, rebuiltAt: data.rebuiltAt };
      });
      return out;
    })
    .catch((err) => {
      console.warn("[machine fit] studio index read failed", studioId, err);
      // Do not cache a failure for ten minutes: the next screen tries again.
      studioCache.delete(studioId);
      return null;
    });
  studioCache.set(studioId, { at: now, promise });
  return promise;
}

/** Fold a row this iPad just saved into the cached index, so nothing has to be re-read to see it. */
function foldIntoCache(studioId: string, machineId: string, clientId: string, row: FitRowDoc | null) {
  const hit = studioCache.get(studioId);
  if (!hit) return;
  hit.promise = hit.promise.then((fit) => {
    if (!fit) return fit;
    const current = fit[machineId] ?? { machineId, studioId, rows: {} };
    const rows = { ...current.rows };
    if (row) rows[clientId] = row;
    else delete rows[clientId];
    return { ...fit, [machineId]: { ...current, rows } };
  });
}

/** Test seam. */
export function __resetFitCache() {
  studioCache.clear();
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

export interface FitRowWrite {
  /** The CLIENT'S home studio — the roster her row will be joined against. */
  homeStudioId: string | null | undefined;
  machineId: string;
  clientId: string;
  /** The settings as saved, in the machine's storage keys. */
  settings: Record<string, unknown> | null | undefined;
  sources?: Record<string, SettingSource | undefined> | null;
  at?: number;
}

function rowPayload({ homeStudioId, machineId, clientId, settings, sources, at }: FitRowWrite) {
  const row = toFitRow(settings, sources, at ?? Date.now());
  return {
    row,
    ref: doc(db, "studios", homeStudioId as string, "machineFit", machineId),
    data: {
      machineId,
      studioId: homeStudioId,
      rows: { [clientId]: row ?? deleteField() },
      updatedAt: serverTimestamp(),
    },
    // One row, addressed by path: two iPads setting up two clients on the
    // same machine never overwrite each other, and the row is REPLACED, so a
    // cleared setting actually goes. FieldPath, not a dotted string — a
    // client id is not guaranteed to be free of dots.
    options: { mergeFields: ["machineId", "studioId", "updatedAt", new FieldPath("rows", clientId)] },
  };
}

/** Keep one client's row current. Caught: it never fails the save that called it. */
export async function upsertFitRow(write: FitRowWrite): Promise<boolean> {
  if (!write.homeStudioId || !write.machineId || !write.clientId) return false;
  try {
    const { ref, data, options, row } = rowPayload(write);
    await setDoc(ref, data, options);
    foldIntoCache(write.homeStudioId, write.machineId, write.clientId, row);
    return true;
  } catch (err) {
    console.warn("[machine fit] index write skipped", write.machineId, err);
    return false;
  }
}

/** The same write, queued on a batch (the Setup screen saves many machines at once). */
export function queueFitRow(batch: WriteBatch, write: FitRowWrite): (() => void) | null {
  if (!write.homeStudioId || !write.machineId || !write.clientId) return null;
  const { ref, data, options, row } = rowPayload(write);
  batch.set(ref, data, options);
  // Called by the caller once the batch has committed.
  return () => foldIntoCache(write.homeStudioId as string, write.machineId, write.clientId, row);
}

/* ------------------------------------------------------------------ *
 * Reading, for a screen
 * ------------------------------------------------------------------ */

export type FitDataStatus = "idle" | "loading" | "ready";

export interface FitData {
  status: FitDataStatus;
  /** machineId → both tiers, ready for the engine. */
  sources: Record<string, FitSources>;
  /** How many of this studio's clients have at least one verified setting on file, per machine. */
  studioCounts: Record<string, number>;
}

const EMPTY: FitData = { status: "idle", sources: {}, studioCounts: {} };

/**
 * Both tiers for a list of machines. `enabled` gates every read: the Setup
 * segment passes true only once it has been opened (a sub-view that is never
 * looked at costs nothing — the four-tab profile's rule).
 *
 * `clients` is the studio roster the app already holds. Rows are joined to it
 * here, so a corrected height changes the next suggestion with no re-read.
 */
export function useFitData(
  studioId: string | null | undefined,
  machineIds: readonly string[],
  clients: readonly (FitClientRecord & { id?: string | null })[],
  enabled: boolean,
): FitData {
  const [studioFit, setStudioFit] = useState<StudioFit | null | undefined>(undefined);
  const [company, setCompany] = useState<Record<string, CompanyFitBlock | null>>({});
  const idsKey = useMemo(() => [...machineIds].sort().join("|"), [machineIds]);

  useEffect(() => {
    if (!enabled || !studioId) {
      setStudioFit(undefined);
      return;
    }
    let live = true;
    setStudioFit(undefined);
    fetchStudioFit(studioId).then((fit) => {
      if (live) setStudioFit(fit);
    });
    return () => {
      live = false;
    };
  }, [enabled, studioId]);

  useEffect(() => {
    if (!enabled || !idsKey) return;
    let live = true;
    const ids = idsKey.split("|");
    Promise.all(
      ids.map((id) =>
        fetchMachineTrend(id).then((trend) => [id, (trend as { fit?: CompanyFitBlock } | null)?.fit ?? null] as const),
      ),
    ).then((pairs) => {
      if (live) setCompany(Object.fromEntries(pairs));
    });
    return () => {
      live = false;
    };
  }, [enabled, idsKey]);

  return useMemo<FitData>(() => {
    if (!enabled) return EMPTY;
    const byId = new Map<string, FitClientRecord>();
    for (const c of clients) if (c?.id) byId.set(c.id, c);
    const now = new Date();
    const sources: Record<string, FitSources> = {};
    const studioCounts: Record<string, number> = {};
    for (const id of idsKey ? idsKey.split("|") : []) {
      const studio = studioFit ? samplesFromFitDoc(studioFit[id] ?? { machineId: id, rows: {} }, byId, now) : null;
      sources[id] = {
        studio,
        company: id in company ? samplesFromCompanyBlock(company[id]) : null,
      };
      studioCounts[id] = studio?.length ?? 0;
    }
    const companyLoaded = !idsKey || idsKey.split("|").every((id) => id in company);
    return {
      status: studioFit === undefined || !companyLoaded ? "loading" : "ready",
      sources,
      studioCounts,
    };
  }, [enabled, clients, studioFit, company, idsKey]);
}
