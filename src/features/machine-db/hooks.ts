/**
 * THE MSF MACHINE DATABASE — the reads. Two collection-group queries over
 * what studios chose to share, and nothing else.
 *
 * Both need the collection-group indexes in firestore.indexes.json and the
 * `{path=**}` read rules in firestore.rules (Learning + Planner round). Until
 * those are deployed the queries fail; the screens then say the shared part
 * could not be loaded rather than pretending nobody shared anything.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { collectionGroup, limit, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useActiveStudio } from "../../ActiveStudioContext";
import { resolveMachine } from "../../lib/resolve-machine";
import type { RosterEntryCustom } from "../../types/machines";
import { fromResolvedMachine } from "../catalog/adapters";
import type { SharedStudioMachine } from "./database";
import { noteFromWikiDoc, tipFromDoc, type NetworkItem } from "./network";

/**
 * The studio a collection-group document sits under: studios/{id}/…, else
 * null. The path, never the document's own `studioId` field: only people at
 * that studio can write under its path, while the field says whatever the
 * writer typed (review, Learning + Planner round).
 */
type PathRef = { parent: { parent: { id: string; parent: { id: string } } | null } };
const studioFromPath = (ref: PathRef): string | null => {
  const studio = ref.parent.parent;
  return studio && studio.parent.id === "studios" ? studio.id : null;
};

/**
 * A studio's name from its own document, falling back to the name the shared
 * item carries (for a studio this device hasn't loaded). The carried name is
 * free text its writer chose.
 */
function useStudioNameOf(): (studioId: string, carried: string) => string {
  const { studios } = useActiveStudio();
  return useCallback(
    (studioId: string, carried: string) =>
      (studios ?? []).find((s) => s.id === studioId)?.name?.trim() || carried,
    [studios],
  );
}

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
          const studioId = studioFromPath(d.ref as never);
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
  const nameOf = useStudioNameOf();
  return useMemo(
    () => ({
      ...state,
      machines: state.machines.map((m) => ({ ...m, studioName: nameOf(m.studioId, m.studioName) })),
    }),
    [state, nameOf],
  );
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
            .map((d) => {
              const studioId = studioFromPath(d.ref as never);
              return studioId ? tipFromDoc(d.id, studioId, d.data()) : null;
            })
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
            .map((d) => {
              const studioId = studioFromPath(d.ref as never);
              return studioId ? noteFromWikiDoc(d.id, studioId, d.data()) : null;
            })
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

  const nameOf = useStudioNameOf();
  const items = useMemo(
    () => [...notes.items, ...tips.items].map((i) => ({ ...i, studioName: nameOf(i.studioId, i.studioName) })),
    [notes.items, tips.items, nameOf],
  );
  return {
    items,
    loading: !tips.ready || !notes.ready,
    error: tips.error ?? notes.error,
  };
}
