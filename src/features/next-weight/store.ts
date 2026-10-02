/**
 * The one writer of the next session's weight (see next-weight.ts).
 *
 * A merge onto `clientMachineSettings/{clientId}_{machineId}`, the document
 * every session start already reads: `currentWeight` and the `nextWeight`
 * mark (deleted when the trainer sets it back to today's weight). Never the
 * client document. The rules let any trainer write this collection.
 *
 * Never awaited on the floor: the write is on the iPad the moment it is
 * made, and the caller fires and forgets with a toast on failure.
 */
import { deleteField, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { withoutUndefined } from "../studio-tasks/task-wizard";
import type { NextWeightMark } from "./next-weight";

export function nextWeightPatch(input: {
  clientId: string;
  machineId: string;
  homeStudioId?: string | null;
  weight: number;
  mark: NextWeightMark | null;
  updatedBy: string;
}): Record<string, unknown> {
  return withoutUndefined({
    clientId: input.clientId,
    machineId: input.machineId,
    homeStudioId: input.homeStudioId || undefined,
    clientHomeStudioId: input.homeStudioId || undefined,
    currentWeight: input.weight,
    nextWeight: input.mark ? withoutUndefined({ ...input.mark }) : deleteField(),
    updatedBy: input.updatedBy,
    updatedAt: serverTimestamp(),
  });
}

export function saveNextWeight(input: Parameters<typeof nextWeightPatch>[0]): Promise<void> {
  return setDoc(doc(db, "clientMachineSettings", `${input.clientId}_${input.machineId}`), nextWeightPatch(input), { merge: true });
}
