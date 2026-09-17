import { useEffect, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../../firebase";
import { notify } from "../../notifications";
import { FLAG_NOTE_MAX, type CareActor, type MachineCare } from "./machine-care";

/**
 * MACHINE CARE — Firestore. See machine-care.ts for what the documents mean.
 *
 *   studios/{s}/machineCare/{machineId}   one per machine, merged field by field
 *   studios/{s}/upkeepLog/{auto}          a wipe or deep clean is ALSO appended
 *                                         here (kind "clean" / "deep-clean"),
 *                                         the log Operations → Equipment reads
 *
 * Both go in one batch. The rules: anyone at the studio (writesForStudio)
 * may write care; the log's create rule already allows the same people.
 */
export function machineCareRef(studioId: string) {
  return collection(db, "studios", studioId, "machineCare");
}

function careFromDoc(id: string, d: Record<string, unknown>): MachineCare {
  const actor = (v: unknown): CareActor | null =>
    v && typeof v === "object" && typeof (v as CareActor).id === "string" ? { id: (v as CareActor).id, name: String((v as CareActor).name ?? "") } : null;
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const flagRaw = d.flag as Record<string, unknown> | null | undefined;
  const flagBy = flagRaw ? actor(flagRaw.by) : null;
  return {
    machineId: typeof d.machineId === "string" ? d.machineId : id,
    lastWipedAt: num(d.lastWipedAt),
    lastWipedBy: actor(d.lastWipedBy),
    lastDeepCleanAt: num(d.lastDeepCleanAt),
    lastDeepCleanBy: actor(d.lastDeepCleanBy),
    flag:
      flagRaw && typeof flagRaw.note === "string" && flagBy
        ? { note: flagRaw.note, by: flagBy, at: num(flagRaw.at) ?? 0 }
        : null,
    updatedAt: d.updatedAt,
  };
}

export interface MachineCareState {
  byMachineId: Record<string, MachineCare>;
  loading: boolean;
  error: string | null;
}

export function useMachineCare(studioId: string | null): MachineCareState {
  const [state, setState] = useState<MachineCareState>({ byMachineId: {}, loading: Boolean(studioId), error: null });
  useEffect(() => {
    if (!studioId) {
      setState({ byMachineId: {}, loading: false, error: null });
      return;
    }
    setState({ byMachineId: {}, loading: true, error: null });
    const unsub = onSnapshot(
      machineCareRef(studioId),
      (snap) => {
        const byMachineId: Record<string, MachineCare> = {};
        snap.forEach((d) => {
          byMachineId[d.id] = careFromDoc(d.id, d.data() as Record<string, unknown>);
        });
        setState({ byMachineId, loading: false, error: null });
      },
      (err) => {
        console.warn("[relay] machineCare read failed:", err);
        // A failed read is "unknown", never "clean": keep what we had.
        setState((s) => ({ ...s, loading: false, error: "Couldn't load the floor's care record." }));
      },
    );
    return unsub;
  }, [studioId]);
  return state;
}

export type CareKind = "wipe" | "deep-clean";

/** A wipe or a deep clean: the care document and the studio's upkeep log, together. */
export async function recordCare(params: { studioId: string; machineId: string; kind: CareKind; author: CareActor }): Promise<void> {
  const { studioId, machineId, kind, author } = params;
  const at = Date.now();
  const batch = writeBatch(db);
  batch.set(
    doc(machineCareRef(studioId), machineId),
    kind === "wipe"
      ? { machineId, lastWipedAt: at, lastWipedBy: author, updatedAt: serverTimestamp() }
      : { machineId, lastWipedAt: at, lastWipedBy: author, lastDeepCleanAt: at, lastDeepCleanBy: author, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  // The log is a bonus for the Operations screen: caught, never blocking.
  try {
    await addDoc(collection(db, "studios", studioId, "upkeepLog"), {
      machineId,
      kind: kind === "wipe" ? "clean" : "deep-clean",
      at: new Date(at).toISOString(),
      byId: author.id,
      byName: author.name,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[relay] upkeepLog append failed:", err);
  }
}

export async function flagMachine(params: {
  studioId: string;
  machineId: string;
  machineName: string;
  note: string;
  author: CareActor;
  /** Whose bell to ring: the studio's leader, when known. */
  leaderId?: string | null;
}): Promise<void> {
  const { studioId, machineId, machineName, author } = params;
  const note = params.note.trim().slice(0, FLAG_NOTE_MAX);
  if (!note) throw new Error("A flag needs a note.");
  const batch = writeBatch(db);
  batch.set(
    doc(machineCareRef(studioId), machineId),
    { machineId, flag: { note, by: author, at: Date.now() }, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await batch.commit();
  await notify({
    to: params.leaderId ?? null,
    actor: author,
    kind: "machine-flagged",
    title: `${author.name.split(" ")[0]} flagged the ${machineName}`,
    body: note,
    studioId,
    link: { view: "studio-tasks" },
  });
}

export async function clearMachineFlag(params: { studioId: string; machineId: string }): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(machineCareRef(params.studioId), params.machineId), { machineId: params.machineId, flag: null, updatedAt: serverTimestamp() }, { merge: true });
  await batch.commit();
}
