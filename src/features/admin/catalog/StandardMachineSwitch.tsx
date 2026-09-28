/**
 * "STANDARD MACHINE" — on the machine's own page in the catalog editor.
 *
 * Wave 2 of the Machine Catalog room (AJ, Sep 28 2026: "we dont need to
 * restore standard machine button, a machine just needs to be able to be
 * marked as a standard machine, a task only by admins"). One switch, writing
 * the flag the Standard template's list writes (`inStandardSet`,
 * standard-set.ts), with the same words and the same question before a
 * machine comes out. Membership only: the order a new floor starts in stays
 * the Standard template's.
 *
 * The switch reads the LIVE catalog document its host hands in (both hosts
 * re-read the machine from the catalog listener), so a change made on the
 * Standard template shows here at once, and the other way round.
 *
 * Administrators only. The rules already refuse anyone else's write to
 * `machines/{id}`; this keeps the switch off the screen for them too (a
 * menu is not a gate), and says in words who changes it.
 */
import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ListOrdered } from "lucide-react";
import { auth, db } from "../../../firebase";
import { useToast } from "../../../contexts/ToastContext";
import { useOptionalActiveStudio } from "../../../contexts/ActiveStudioContext";
import { Switch } from "@/components/ui/switch";
import type { MachineCatalogEntry } from "../../../types/machines";
import { isStandardSetMachine } from "../studios/registry";
import { AdminBadge, AdminPanel, ConfirmDialog } from "../primitives";
import { standardSetPatch, standardSetSaid, takeOutQuestion } from "./standard-set";

export interface StandardMachineSwitchProps {
  /** The live catalog document. */
  machine: MachineCatalogEntry;
  /**
   * Who may change it. Omitted: administrators and the founder, from the
   * app's own answer (`isAdmin` on the active-studio context).
   */
  canEdit?: boolean;
}

export function StandardMachineSwitch({ machine, canEdit }: StandardMachineSwitchProps) {
  const ctx = useOptionalActiveStudio();
  const allowed = canEdit ?? ctx?.isAdmin ?? false;
  const { success: toastSuccess, error: toastError } = useToast();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const inSet = isStandardSetMachine(machine);
  const name = machine.name || "This machine";

  const write = async (next: boolean) => {
    setBusy(true);
    try {
      await updateDoc(doc(db, "machines", machine.id), {
        ...standardSetPatch(next),
        updatedAt: serverTimestamp(),
        updatedBy: auth.currentUser?.uid ?? null,
      });
      toastSuccess(standardSetSaid(name, next));
    } catch (err) {
      console.error("[catalog] standard machine:", err);
      toastError("Could not change the standard set. Catalog writes are administrators'.");
    } finally {
      setBusy(false);
    }
  };

  const question = takeOutQuestion(name);

  return (
    <AdminPanel
      title="The standard"
      icon={<ListOrdered className="w-4 h-4" />}
      subtitle={
        inSet
          ? "A new studio starts with this machine, and a floor without it is offered it under New in the MSF standard."
          : "Not in the standard set: a studio adds it from All MSF machines, one floor at a time."
      }
      actions={
        allowed ? undefined : (
          <AdminBadge tone={inSet ? "ok" : "neutral"}>{inSet ? "Standard machine" : "Not a standard machine"}</AdminBadge>
        )
      }
    >
      {allowed ? (
        <label className="flex min-h-10 cursor-pointer items-center gap-3" data-testid="standard-machine">
          <Switch
            checked={inSet}
            disabled={busy}
            aria-label="Standard machine"
            onCheckedChange={(on) => {
              if (on) void write(true);
              else setAsking(true);
            }}
          />
          <span className="adm-row__name">Standard machine</span>
        </label>
      ) : (
        <p className="adm-row__meta">An administrator marks a machine as a standard machine.</p>
      )}
      <ConfirmDialog
        open={asking}
        title={question.title}
        body={question.body}
        confirmLabel="Take it out"
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          void write(false);
        }}
      />
    </AdminPanel>
  );
}
