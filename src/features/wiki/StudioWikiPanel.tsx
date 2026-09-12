import { useState, type ReactNode } from "react";
import { PencilLine, Plus, Building2 } from "lucide-react";
import { useToast } from "../../contexts/ToastContext";
import { WikiBlocks } from "./WikiArticle";
import { WikiEditor } from "./WikiEditor";
import {
  saveStudioWikiDoc,
  retireStudioWikiDoc,
} from "./studio-wiki-mutations";
import {
  serialiseBlocks,
  whenLabel,
  type StudioWikiDoc,
  type WikiTargetType,
} from "./studio-wiki";

/**
 * THIS STUDIO'S OWN NOTE ON WHATEVER YOU ARE READING.
 *
 * Round: Wiki Redesign Phase 4, Sep 2026.
 *
 * Drops onto any article in either wiki — a machine, an Academy topic, a
 * quick card, a script, a deep dive. One component, because the reader's
 * question is the same everywhere: "does OUR studio do this differently?"
 *
 * WHY IT RENDERS BESIDE THE BASELINE AND NEVER OVER IT
 * ---------------------------------------------------
 * The shipped corpus is the Academy's own words and it is identical at every
 * location. A studio that could edit it in place would fork the curriculum
 * silently, and the next trainer would have no way to tell which parts of
 * what they were reading came from Max Strength and which came from whoever
 * was on shift in September. So the overlay is a clearly-marked, attributed,
 * dated block underneath the real thing — and the real thing is always still
 * there to compare against.
 *
 * WHY ANY TRAINER CAN WRITE ONE
 * -----------------------------
 * Same posture as machineNotes: an overlay carries no override power over
 * safety content, and the person who discovers that the left pad sticks is
 * the person standing at the machine, not the person who can edit pages.
 * The rule enforces this split; this component only reflects it.
 *
 * ONE DOCUMENT PER TARGET. Two trainers editing the Chest Press overlay
 * converge on the same document and see each other's text — see targetDocId.
 * "Add a section" means adding a `## heading` line, not a second document.
 */

export interface StudioWikiPanelProps {
  studioId: string | null;
  studioName?: string | null;
  targetType: WikiTargetType;
  targetId: string;
  /** The subject's own name. Becomes the overlay's title; never edited. */
  targetName: string;
  /** From useStudioWiki().overlayFor(...). Null when nothing is written. */
  overlay: StudioWikiDoc | null;
  author: { id: string; name: string } | null;
  /** What the empty state invites. "Add a note for this studio" by default. */
  emptyLabel?: string;
  /** Placeholder text in the editor, tuned per target type by the caller. */
  placeholder?: string;
  /**
   * Beside Edit, on a written note: the machine page's "Share with all MSF
   * studios" switch (features/machine-db). The caller decides where sharing
   * applies — only machine notes are shared.
   */
  headerAction?: ReactNode;
}

export function StudioWikiPanel({
  studioId,
  studioName,
  targetType,
  targetId,
  targetName,
  overlay,
  author,
  emptyLabel,
  placeholder,
  headerAction,
}: StudioWikiPanelProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const scope = studioName ?? "this studio";
  const canWrite = Boolean(studioId && author);

  const save = async (values: { title: string; body: string }) => {
    if (!studioId || !author) {
      toastError("No active studio selected — pick a studio before saving.");
      return;
    }
    setBusy(true);
    try {
      await saveStudioWikiDoc(
        studioId,
        {
          kind: "overlay",
          title: values.title,
          body: values.body,
          targetType,
          targetId,
        },
        author,
        overlay?.id,
      );
      setEditing(false);
      toastSuccess(`Saved for ${scope}.`);
    } catch (err) {
      console.error("Failed to save studio wiki overlay:", err);
      toastError("Could not save. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!studioId || !overlay || !author) return;
    setBusy(true);
    try {
      await retireStudioWikiDoc(studioId, overlay.id, author.id);
      setEditing(false);
      toastSuccess("Retired. The Academy's own version is still here.");
    } catch (err) {
      console.error("Failed to retire studio wiki overlay:", err);
      toastError("Could not retire that. Check your connection.");
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <section className="wk__studio">
        <p className="wk__studio-head">
          <Building2 size={13} aria-hidden />
          {scope}
        </p>
        <WikiEditor
          kind="overlay"
          fixedTitle={targetName}
          initial={{ body: overlay ? serialiseBlocks(overlay.blocks) : "" }}
          busy={busy}
          placeholder={placeholder}
          saveLabel={overlay ? "Save changes" : "Add note"}
          onSave={(v) => save({ title: targetName, body: v.body })}
          onCancel={() => setEditing(false)}
          onRetire={overlay ? retire : undefined}
        />
      </section>
    );
  }

  if (!overlay) {
    if (!canWrite) return null;
    return (
      <button
        type="button"
        className="wk__addnote"
        onClick={() => setEditing(true)}
      >
        <Plus size={15} aria-hidden />
        <span>
          <strong>{emptyLabel ?? `Add a note for ${scope}`}</strong>
          <em>
            Anything this location does differently. Everyone here sees it; it
            does not follow you to other studios.
          </em>
        </span>
      </button>
    );
  }

  const updated = whenLabel(overlay.updatedAt ?? overlay.createdAt);
  const who = overlay.updatedByName || overlay.authorName;

  return (
    <section className="wk__studio">
      <p className="wk__studio-head">
        <Building2 size={13} aria-hidden />
        {scope}
        {canWrite && (
          <button
            type="button"
            className="wk__studio-edit"
            onClick={() => setEditing(true)}
          >
            <PencilLine size={12} aria-hidden />
            Edit
          </button>
        )}
        {headerAction}
      </p>

      <WikiBlocks blocks={overlay.blocks} />

      {/* Attribution is not decoration. It is what lets the next reader judge
          how much to trust a note that contradicts the Academy — and it is
          the difference between a wiki and an anonymous sticky note. */}
      {(who || updated) && (
        <p className="wk__studio-by">
          {who ? `Written by ${who}` : "Written at this studio"}
          {updated ? ` · updated ${updated}` : ""}
        </p>
      )}
    </section>
  );
}
