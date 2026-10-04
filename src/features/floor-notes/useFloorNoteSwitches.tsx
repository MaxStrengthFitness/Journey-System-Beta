import { useCallback, useState, type ReactNode } from "react";
import { useToast } from "../../contexts/ToastContext";
import { isDemoStudioId } from "../demo-mode/is-demo";
import { setFloorNoteOffer, setNoteOffer } from "../machine-db/mutations";
import { ShareToggle, tapOffers } from "../machine-db/ShareToggle";
import type { EarlierNote, FloorNote } from "./floor-notes";

/**
 * The "Offer to all MSF studios" switches the floor's notes carry, for both
 * places the list is drawn (the Catalog page and My Studio → Machines), so
 * the two never differ on who may offer what.
 *
 *   a dated note       its author, or a leader (the playbook tip's rule)
 *   the old Catalog    anyone at the studio, as before; it keeps its switch
 *     note             while shared or offered, so it can always be taken back
 *
 * Nothing in Demo Mode reaches head office (the realm rule, Oct 2 2026), so
 * there are no switches there. Sharing waits for an administrator.
 */
export function useFloorNoteSwitches(input: {
  studioId: string | null;
  studioName: string;
  /** sharedKeysFor([machineId], floor): the lineages other studios find it under. */
  keys: string[];
  uid: string | null;
  canLead: boolean;
  /** May write at this studio at all. */
  canWrite: boolean;
}): {
  offerSwitch?: (note: FloorNote) => ReactNode;
  catalogNoteSwitch?: (note: EarlierNote) => ReactNode;
} {
  const { studioId, studioName, keys, uid, canLead, canWrite } = input;
  const { success, error } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, on: boolean, work: () => Promise<void>) => {
      setBusy(key);
      try {
        await work();
        success(
          on
            ? "Offered. An administrator reads it before other MSF studios see it."
            : "Taken back. Other studios don't see it.",
        );
      } catch (err) {
        console.error("[floor-notes] sharing failed:", err);
        error("Could not change sharing. Check your connection.");
      } finally {
        setBusy(null);
      }
    },
    [success, error],
  );

  if (!studioId || !canWrite || isDemoStudioId(studioId) || keys.length === 0) return {};
  const where = { keys, studioName };

  return {
    offerSwitch: (note) =>
      canLead || (uid !== null && note.authorId === uid) ? (
        <ShareToggle
          item={note}
          busy={busy === `f:${note.id}`}
          onToggle={() =>
            run(`f:${note.id}`, tapOffers(note), () => setFloorNoteOffer(studioId, note.id, tapOffers(note), where))
          }
        />
      ) : null,
    catalogNoteSwitch: (e) => {
      if (!e.wikiDocId) return null;
      const item = { shared: e.shared, shareStatus: e.shareStatus, shareReviewNote: e.shareReviewNote };
      // A copied note keeps only the way back; a note still standing alone keeps the whole switch.
      if (e.copied && !(e.shared || e.shareStatus === "pending")) return null;
      return (
        <ShareToggle
          item={item}
          busy={busy === `n:${e.wikiDocId}`}
          onToggle={() =>
            run(`n:${e.wikiDocId}`, tapOffers(item), () => setNoteOffer(studioId, e.wikiDocId!, tapOffers(item), where))
          }
        />
      );
    },
  };
}
