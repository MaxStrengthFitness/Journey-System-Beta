import { useEffect, useRef, useState } from "react";
import { UserCog } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { useUnsavedChanges } from "../unsaved-changes";
import { saveStudioMachineNotes } from "./mutations";

/**
 * The studio-scoped notes box.
 *
 * Everything about where this writes, and why not to the roster, is in
 * mutations.ts. What matters here is that the UI never claims a save that did
 * not happen: the version this replaces set one boolean and rendered "Stored
 * Successfully" DURING the request, reverting to "Save Notes" on failure.
 *
 * Typing that is not saved is registered with the unsaved-changes guard
 * (voice review follow-up, Sep 27 2026): the bottom bar, Learning's sections,
 * the machine page's links and My Studio's sections ask before they take it
 * away. "Leave" puts the note back to what is saved, because the card itself
 * can survive a navigation (a studio switch keeps the same machine page), and
 * a draft typed for one studio must never be saved onto the next.
 */
export interface StudioNotesCardProps {
  machineId: string;
  /** For the leave question: "Solon's notes on the Chest Press". */
  machineName?: string;
  studioId: string | null;
  studioName?: string;
  /** Current value from Firestore, via the adapter. */
  value: string;
  author?: { id: string; name: string } | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function StudioNotesCard({
  machineId,
  machineName,
  studioId,
  studioName,
  value,
  author,
}: StudioNotesCardProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [draft, setDraft] = useState(value);
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<SaveState>("idle");
  const seededFor = useRef<string | null>(null);

  // Re-seed when the machine changes, and when this studio's note arrives from
  // Firestore after the machine was already selected — but never while the
  // trainer is mid-edit, or an onSnapshot echo eats their typing.
  useEffect(() => {
    const isNewMachine = seededFor.current !== machineId;
    if (!isNewMachine && dirty) return;
    seededFor.current = machineId;
    setDraft(value);
    if (isNewMachine) {
      setDirty(false);
      setState("idle");
    }
  }, [machineId, value, dirty]);

  const scope = studioName ?? "this studio";

  useUnsavedChanges(
    dirty && draft !== value,
    `${scope}’s notes on ${machineName ?? "this machine"}`,
    {
      onDiscard: () => {
        setDraft(value);
        setDirty(false);
        setState("idle");
      },
    },
  );

  const save = async () => {
    if (!studioId) {
      setState("error");
      toastError("No active studio selected — pick a studio before saving.");
      return;
    }
    setState("saving");
    try {
      await saveStudioMachineNotes({
        studioId,
        machineId,
        notes: draft,
        author: author ?? null,
      });
      setDirty(false);
      setState("saved");
      toastSuccess(`Notes saved for ${scope}.`);
    } catch (err) {
      console.error("Failed to save studio machine notes:", err);
      setState("error");
      toastError("Could not save studio notes. Check your connection.");
    }
  };

  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "error"
          ? "Retry save"
          : "Save notes";

  const btnClass =
    state === "saved"
      ? "cat__btn cat__btn--ok"
      : state === "error"
        ? "cat__btn cat__btn--error"
        : "cat__btn cat__btn--primary";

  const textareaId = `cat-notes-${machineId}`;

  return (
    <>
      {/* This is ONE shared text block, not per-trainer notes: everyone at
          the studio reads and edits the same field, so a deletion is a
          deletion for the whole location. That was not said anywhere, and a
          trainer would only find out by doing it. (Sep 5 2026 iPad pass.) */}
      <p className="cat__notes-scope">
        <UserCog size={12} aria-hidden /> {scope}’s shared clipboard
      </p>
      <p className="cat__notes-warning">
        Everyone at this location sees and edits this same note, so anything
        you delete is deleted for the whole studio. It does not follow you to
        other locations.
      </p>
      <textarea
        id={textareaId}
        className="cat__textarea"
        value={draft}
        placeholder={`Quirks and workarounds for this machine at ${scope} — the left pad sticks, use the footstool, that sort of thing.`}
        onChange={(e) => {
          setDraft(e.target.value);
          setDirty(true);
          if (state !== "idle") setState("idle");
        }}
      />
      <button
        type="button"
        className={btnClass}
        onClick={save}
        disabled={state === "saving"}
      >
        {label}
      </button>
    </>
  );
}
