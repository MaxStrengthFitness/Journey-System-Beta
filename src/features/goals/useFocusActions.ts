/**
 * THE FOCUS ACTIONS — set a focus, achieve it, extend it, retire it, and
 * file a check-in against it, each with its toast.
 *
 * Moved out of ClientJournalTab unchanged (client codex, Sep 2026), so the
 * journal's Focus area today and the Goals & Focus page tomorrow file a
 * focus the SAME way. The board itself (FocusBoard) draws; this owns the
 * writes. Nothing here reads Firestore.
 *
 * WHO THE COACH IS
 * ----------------
 *   - `author.id` is the AUTH UID, not `authTrainer.id`: the journalEntries
 *     rule pins `authorId` to it, and the two differ on older accounts.
 *   - `viewerIds` is every id the signed-in coach may be stored under on a
 *     focus (the Auth uid and the trainer document id), which is what the
 *     board checks before offering Achieve / Extend / Retire on a focus.
 *
 * A CHECK-IN CARRIES ITS FOCUS
 * ----------------------------
 * `onCheckIn` files the note right here with the focus id. It used to set
 * state in one journal mount and scroll to the composer in another — a
 * different component instance that never saw the focus — so the note saved
 * without `focusId` and the focus's thread stayed empty (Goals & Focus
 * round). Keep it one call.
 */
import { useMemo } from "react";
import { auth } from "../../firebase";
import { useToast } from "../../contexts/ToastContext";
import {
  createClientFocus,
  createJournalEntry,
  extendFocus,
  setFocusStatus,
  type JournalAuthor,
} from "../../hooks/useClientJournal";
import type { ClientFocus, FocusCategory } from "../../types/journal";
import type { Client, Trainer } from "../../types";

export interface FocusActions {
  /** Every id the signed-in coach may be stored under on a focus. */
  viewerIds: string[];
  /** The signed-in coach's role, for the admin/owner override the rules allow. */
  viewerRole: string | null;
  onCreate: (input: {
    category: FocusCategory;
    intent: string;
    targetMachineId: string | null;
  }) => Promise<void>;
  onAchieve: (focus: ClientFocus, rewardNote: string) => Promise<void>;
  onExtend: (focus: ClientFocus) => Promise<void>;
  onRetire: (focus: ClientFocus) => Promise<void>;
  /** Files a check-in against this focus. Resolves true when it saved. */
  onCheckIn: (focus: ClientFocus, body: string) => Promise<boolean>;
}

export function useFocusActions({
  clientId,
  client,
  authTrainer,
}: {
  clientId: string | null;
  client: Client | null;
  authTrainer?: Trainer | null;
}): FocusActions {
  const { success: toastSuccess, error: toastError } = useToast();

  const author = useMemo<JournalAuthor>(
    () => ({
      // The Auth uid: the journalEntries rule pins authorId to it, and it
      // differs from authTrainer.id on older accounts.
      id: auth.currentUser?.uid || authTrainer?.id || "unknown",
      initials: (authTrainer?.initials || "TR").toUpperCase(),
      fullName: authTrainer?.fullName || "Coach",
    }),
    [authTrainer],
  );

  /** Every id the signed-in coach may be stored under on a focus. */
  const viewerIds = useMemo(
    () =>
      [auth.currentUser?.uid, authTrainer?.id].filter(
        (v): v is string => typeof v === "string" && v.length > 0,
      ),
    [authTrainer],
  );

  const studioId = client?.homeStudioId || "";
  const viewerRole = authTrainer?.role ?? null;

  return useMemo<FocusActions>(() => {
    const onCreate: FocusActions["onCreate"] = async (input) => {
      if (!clientId) return;
      try {
        await createClientFocus(clientId, studioId, author, input);
        toastSuccess(`Focus set: ${input.category}.`);
      } catch {
        toastError("Could not set that focus.");
      }
    };

    const onAchieve: FocusActions["onAchieve"] = async (focus, rewardNote) => {
      try {
        await setFocusStatus(focus.id, "passed", { rewardNote });
        toastSuccess(`${focus.category} focus achieved. Nice work.`);
      } catch {
        toastError("Could not update that focus.");
      }
    };

    const onExtend: FocusActions["onExtend"] = async (focus) => {
      try {
        await extendFocus(focus.id);
        toastSuccess("Focus extended by three weeks.");
      } catch {
        toastError("Could not extend that focus.");
      }
    };

    const onRetire: FocusActions["onRetire"] = async (focus) => {
      try {
        await setFocusStatus(focus.id, "retired");
        toastSuccess("Focus retired.");
      } catch {
        toastError("Could not retire that focus.");
      }
    };

    // Filed from the focus card itself, carrying the focus id — see the header.
    const onCheckIn: FocusActions["onCheckIn"] = async (focus, body) => {
      if (!clientId || !body.trim()) return false;
      try {
        await createJournalEntry(clientId, studioId, author, {
          kind: "coaching",
          category: focus.category,
          body: body.trim(),
          importance: "standard",
          machineId: focus.targetMachineId ?? null,
          focusId: focus.id,
          origin: "manual",
        });
        toastSuccess("Check-in logged.");
        return true;
      } catch {
        toastError("Could not save that check-in. Check your connection and try again.");
        return false;
      }
    };

    return { viewerIds, viewerRole, onCreate, onAchieve, onExtend, onRetire, onCheckIn };
  }, [clientId, studioId, author, viewerIds, viewerRole, toastSuccess, toastError]);
}
