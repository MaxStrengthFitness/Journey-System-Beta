/**
 * THE MSF MACHINE DATABASE — the reads. Two collection-group queries over
 * what studios chose to share, and nothing else.
 *
 * Both need the collection-group indexes in firestore.indexes.json and the
 * `{path=**}` read rules in firestore.rules (Learning + Planner round). Until
 * those are deployed the queries fail; the screens then say the shared part
 * could not be loaded rather than pretending nobody shared anything.
 */

import { useEffect, useState } from "react";
import { collectionGroup, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { resolveMachine } from "../../lib/resolve-machine";
import type { RosterEntryCustom } from "../../types/machines";
import { fromResolvedMachine } from "../catalog/adapters";
import type { SharedStudioMachine } from "./database";
import { noteFromWikiDoc, tipFromDoc, type NetworkItem } from "./network";

/** The studio a collection-group document sits under: studios/{id}/… */
const studioFromPath = (ref: { parent: { parent: { id: string } | null } }) => ref.parent.parent?.id ?? null;

export interface SharedMachinesState {
  machines: SharedStudioMachine[];
  loading: boolean;
  error: string | null;
}

/** Every studio machine listed in the database. One listener, while the database is open. */
export function useSharedMachines(enabled: boolean): SharedMachinesState {
  const [state, setState] = useState<SharedMachinesState>({ machines: [], loading: enabled, error: null });
  useEffect(() => {
    if (!enabled) {
      setState({ machines: [], loading: false, error: null });
      return;
    }
    setState((p) => ({ ...p, loading: true, error: null }));
    return onSnapshot(
      query(collectionGroup(db, "roster"), where("shared", "==", true), limit(300)),
      (snap) => {
        const machines: SharedStudioMachine[] = [];
        for (const d of snap.docs) {
          const data = d.data() as Partial<RosterEntryCustom> & { sharedStudioName?: string };
          const studioId = data.studioId || studioFromPath(d.ref as never);
          if (!studioId || data.source !== "custom" || !data.definition?.name) continue;
          const entry = { ...data, machineId: d.id, studioId, status: data.status ?? "active" } as RosterEntryCustom;
          const resolved = resolveMachine(entry);
          if (!resolved) continue;
          machines.push({
            studioId,
            studioName: (data.sharedStudioName ?? "").trim() || "Another studio",
            machineId: d.id,
            machine: fromResolvedMachine(resolved),
            definition: data.definition,
            basedOn: data.basedOn ?? null,
            adoptedFrom: data.adoptedFrom ?? null,
          });
        }
        setState({ machines, loading: false, error: null });
      },
      (err: any) => {
        console.warn("[machine-db] shared machines read failed:", err);
        setState({ machines: [], loading: false, error: "Couldn't load the machines studios have shared." });
      },
    );
  }, [enabled]);
  return state;
}

export interface NetworkNotesState {
  items: NetworkItem[];
  loading: boolean;
  error: string | null;
}

/**
 * What studios shared about one machine: their notes and their tips, filed
 * under its lineage key. Two listeners, only while that machine's page is open.
 */
export function useNetworkNotes(lineageKey: string | null): NetworkNotesState {
  const [tips, setTips] = useState<{ items: NetworkItem[]; ready: boolean; error: string | null }>({
    items: [],
    ready: false,
    error: null,
  });
  const [notes, setNotes] = useState<{ items: NetworkItem[]; ready: boolean; error: string | null }>({
    items: [],
    ready: false,
    error: null,
  });

  useEffect(() => {
    if (!lineageKey) {
      setTips({ items: [], ready: true, error: null });
      setNotes({ items: [], ready: true, error: null });
      return;
    }
    setTips({ items: [], ready: false, error: null });
    setNotes({ items: [], ready: false, error: null });
    const failed = "Couldn't load what other studios shared about this machine.";
    const offTips = onSnapshot(
      query(
        collectionGroup(db, "playbook"),
        where("shared", "==", true),
        where("sharedKeys", "array-contains", lineageKey),
        limit(40),
      ),
      (snap) =>
        setTips({
          items: snap.docs
            .map((d) => tipFromDoc(d.id, studioFromPath(d.ref as never), d.data()))
            .filter((x): x is NonNullable<typeof x> => x !== null),
          ready: true,
          error: null,
        }),
      (err: any) => {
        console.warn("[machine-db] shared tips read failed:", err);
        setTips({ items: [], ready: true, error: failed });
      },
    );
    const offNotes = onSnapshot(
      query(
        collectionGroup(db, "wiki"),
        where("shared", "==", true),
        where("sharedKeys", "array-contains", lineageKey),
        limit(40),
      ),
      (snap) =>
        setNotes({
          items: snap.docs
            .map((d) => noteFromWikiDoc(d.id, studioFromPath(d.ref as never), d.data()))
            .filter((x): x is NonNullable<typeof x> => x !== null),
          ready: true,
          error: null,
        }),
      (err: any) => {
        console.warn("[machine-db] shared notes read failed:", err);
        setNotes({ items: [], ready: true, error: failed });
      },
    );
    return () => {
      offTips();
      offNotes();
    };
  }, [lineageKey]);

  return {
    items: [...notes.items, ...tips.items],
    loading: !tips.ready || !notes.ready,
    error: tips.error ?? notes.error,
  };
}
