import { useEffect, useRef, useState } from "react";
import { UserCog } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { saveStudioMachineNotes } from "./mutations";

/**
 * The studio-scoped notes box.
 *
 * Everything about where this writes, and why not to the roster, is in
 * mutations.ts. What matters here is that the UI never claims a save that did
 * not happen: the version this replaces set one boolean and rendered "Stored
 * Successfully" DURING the request, reverting to "Save Notes" on failure.
 */
export interface StudioNotesCardProps {
  machineId: string;
  studioId: string | null;
  studioName?: string;
  /** Current value from Firestore, via the adapter. */
  value: string;
  author?: { id: string; name: string } | null;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export function StudioNotesCard({
  machineId,
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
      <p className="cat__notes-scope">
        <UserCog size={12} aria-hidden /> Visible only at {scope}.
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
