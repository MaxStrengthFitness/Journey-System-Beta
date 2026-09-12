/**
 * InBody scans in Firestore: one listener per open client, and the writes.
 *
 * Every write is a batch of two: the scan itself, and the client document's
 * `inbodySummary` recomputed from the full list — so the summary the nightly
 * renewals job reads can never disagree with the scans for long. (Two
 * people saving scans for the same client in the same second could leave the
 * summary one scan behind until the next save; nobody scans that fast.)
 */

import { useEffect, useState } from "react";
import {
  collection,
  deleteField,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import { scanFromDoc, summarizeScans } from "./scans";
import type { InBodyMeasures, InBodyScan } from "./types";

export function inbodyScansRef(clientId: string) {
  return collection(db, "clients", clientId, "inbodyScans");
}

export interface InBodyScansState {
  /** Oldest first. */
  scans: InBodyScan[];
  loading: boolean;
  error: string | null;
}

export function useInBodyScans(clientId: string | null | undefined, enabled = true): InBodyScansState {
  const [state, setState] = useState<InBodyScansState>({ scans: [], loading: Boolean(clientId && enabled), error: null });
  useEffect(() => {
    if (!clientId || !enabled) {
      setState({ scans: [], loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    return onSnapshot(
      query(inbodyScansRef(clientId), orderBy("testedAt", "asc"), limit(200)),
      (snap) => {
        const scans: InBodyScan[] = [];
        snap.docs.forEach((d) => {
          const s = scanFromDoc(d.id, d.data());
          if (s) scans.push(s);
        });
        setState({ scans, loading: false, error: null });
      },
      (err: any) => {
        console.warn("[inbody] scans read failed:", err);
        setState({
          scans: [],
          loading: false,
          error:
            err?.code === "permission-denied"
              ? "InBody scans are only visible to this client's studio."
              : "Couldn't load InBody scans.",
        });
      },
    );
  }, [clientId, enabled]);
  return state;
}

export interface SaveInBodyScanArgs {
  clientId: string;
  /** Null to add a new scan. */
  scanId: string | null;
  testedAt: string;
  device: string;
  measures: InBodyMeasures;
  /** The client's home studio, recorded on a new scan. */
  studioId: string;
  enteredByName: string;
  /** Every scan on screen now, for the summary. */
  existing: InBodyScan[];
  /** Also set the profile's Weight field to this scan's weight. */
  updateProfileWeight: boolean;
}

/** Adds or corrects one scan and rewrites the client's summary. Returns the scan id. */
export async function saveInBodyScan(args: SaveInBodyScanArgs): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw Object.assign(new Error("Not signed in"), { code: "unauthenticated" });

  const ref = args.scanId ? doc(inbodyScansRef(args.clientId), args.scanId) : doc(inbodyScansRef(args.clientId));
  const batch = writeBatch(db);
  const fields = { testedAt: args.testedAt, device: args.device, ...args.measures };

  if (args.scanId) {
    batch.update(ref, { ...fields, updatedBy: uid, updatedAt: serverTimestamp() });
  } else {
    batch.set(ref, {
      ...fields,
      source: "manual",
      studioId: args.studioId,
      enteredBy: uid,
      enteredByName: args.enteredByName.slice(0, 80),
      createdAt: serverTimestamp(),
    });
  }

  const previous = args.existing.find((s) => s.id === ref.id);
  const next: InBodyScan[] = [
    ...args.existing.filter((s) => s.id !== ref.id),
    {
      ...(previous ?? {
        source: "manual" as const,
        studioId: args.studioId,
        enteredBy: uid,
        enteredByName: args.enteredByName,
      }),
      ...fields,
      id: ref.id,
    } as InBodyScan,
  ];
  const clientPatch: Record<string, unknown> = { inbodySummary: summaryField(next) };
  if (args.updateProfileWeight) clientPatch.weight = String(Math.round(args.measures.weightLb));
  batch.update(doc(db, "clients", args.clientId), clientPatch);

  await batch.commit();
  return ref.id;
}

/** Removes a scan entered by mistake, and rewrites the summary without it. */
export async function deleteInBodyScan(clientId: string, scanId: string, existing: InBodyScan[]): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(inbodyScansRef(clientId), scanId));
  batch.update(doc(db, "clients", clientId), {
    inbodySummary: summaryField(existing.filter((s) => s.id !== scanId)),
  });
  await batch.commit();
}

function summaryField(scans: InBodyScan[]) {
  const summary = summarizeScans(scans);
  return summary ? { ...summary, updatedAt: serverTimestamp() } : deleteField();
}
