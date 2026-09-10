import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  PAGE_SECTIONS,
  PAGE_SECTION_LABEL,
  WIKI_TITLE_MAX,
  validateDraft,
  type StudioWikiDraft,
  type WikiDocKind,
  type WikiPageSection,
} from "./studio-wiki";

/**
 * THE EDITOR.
 *
 * Round: Wiki Redesign Phase 4, Sep 2026.
 *
 * A PLAIN TEXTAREA, AND THAT IS THE DESIGN
 * ----------------------------------------
 * A rich text editor here would be weeks of work, a serialisation format to
 * maintain forever, and a paste surface that smuggles Word styling into the
 * studio's knowledge base. The person this is for is standing at a machine on
 * an iPad wanting to type three lines. So the format is the two conventions
 * everybody already knows from every chat app — `## heading` and `- bullet` —
 * and the hint below the field says so rather than hiding it in a tooltip.
 *
 * INLINE, NOT A DIALOG
 * --------------------
 * It renders in the flow of the article, like an edit form on a real wiki. It
 * is also the safer choice on this hardware: a Base UI/Radix dialog that
 * unmounts on an early return can leave `pointer-events: none` on <body>,
 * which presents as "the mouse works but the iPad is frozen". No overlay, no
 * leak. Same reasoning as the search screen.
 *
 * THE SAVE BUTTON NEVER LIES
 * --------------------------
 * `busy` is owned by the caller, which is the thing that actually knows
 * whether Firestore answered. The card this pattern comes from once rendered
 * "Stored Successfully" DURING the request and reverted to "Save" on failure.
 */

export interface WikiEditorValues {
  title: string;
  summary: string;
  body: string;
  section?: WikiPageSection;
  tags: string[];
}

export interface WikiEditorProps {
  kind: WikiDocKind;
  initial?: Partial<WikiEditorValues>;
  /** Overlays are titled after the thing they annotate; the field is hidden. */
  fixedTitle?: string;
  busy?: boolean;
  saveLabel?: string;
  placeholder?: string;
  onSave: (draft: WikiEditorValues) => void;
  onCancel: () => void;
  /** Offered on an existing document. Retires, never deletes. */
  onRetire?: () => void;
}

export function WikiEditor({
  kind,
  initial,
  fixedTitle,
  busy,
  saveLabel = "Save",
  placeholder,
  onSave,
  onCancel,
  onRetire,
}: WikiEditorProps) {
  const [title, setTitle] = useState(initial?.title ?? fixedTitle ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [section, setSection] = useState<WikiPageSection | undefined>(
    initial?.section ?? (kind === "page" ? "method" : undefined),
  );
  const [tagText, setTagText] = useState((initial?.tags ?? []).join(", "));
  const [touched, setTouched] = useState(false);

  const tags = useMemo(
    () => tagText.split(",").map((t) => t.trim()).filter(Boolean),
    [tagText],
  );

  const draft: StudioWikiDraft = {
    kind,
    title: fixedTitle ?? title,
    summary,
    body,
    section,
    tags,
  };
  const problems = validateDraft(draft);
  const problemFor = (field: "title" | "body" | "section") =>
    touched ? problems.find((p) => p.field === field)?.message : undefined;

  return (
    <form
      className="wk__editor"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (problems.length > 0) return;
        onSave({ title: fixedTitle ?? title, summary, body, section, tags });
      }}
    >
      {!fixedTitle && (
        <label className="wk__field">
          <span className="wk__field-label">Title</span>
          <input
            className="wk__input"
            value={title}
            maxLength={WIKI_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="How we run a first session"
            autoCorrect="off"
          />
          {problemFor("title") && (
            <span className="wk__field-error">{problemFor("title")}</span>
          )}
        </label>
      )}

      {kind === "page" && (
        <>
          <label className="wk__field">
            <span className="wk__field-label">Summary — optional</span>
            <input
              className="wk__input"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One line, so someone scanning the index knows if this is the page they want."
            />
          </label>

          <div className="wk__field">
            <span className="wk__field-label">Section</span>
            <div className="wk__seg" role="group" aria-label="Section">
              {PAGE_SECTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="wk__seg-btn"
                  aria-pressed={section === s}
                  onClick={() => setSection(s)}
                >
                  {PAGE_SECTION_LABEL[s]}
                </button>
              ))}
            </div>
            {problemFor("section") && (
              <span className="wk__field-error">{problemFor("section")}</span>
            )}
          </div>
        </>
      )}

      <label className="wk__field">
        <span className="wk__field-label">
          {kind === "overlay" ? "What this studio does differently" : "The page"}
        </span>
        <textarea
          className="wk__textarea"
          value={body}
          rows={kind === "overlay" ? 6 : 14}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            placeholder ??
            (kind === "overlay"
              ? "Ours sits two notches lower than the card says — the seat track is worn."
              : "## When it applies\nSpell it out the way you would tell a new trainer.\n\n- one step\n- the next step")
          }
        />
        <span className="wk__hint">
          <Info size={12} aria-hidden />
          Start a line with <code>##</code> for a heading, or <code>-</code> for
          a bullet. Everything else is a paragraph.
        </span>
        {problemFor("body") && (
          <span className="wk__field-error">{problemFor("body")}</span>
        )}
      </label>

      {kind === "page" && (
        <label className="wk__field">
          <span className="wk__field-label">Tags — optional, comma separated</span>
          <input
            className="wk__input"
            value={tagText}
            onChange={(e) => setTagText(e.target.value)}
            placeholder="onboarding, shoulder, deload"
            autoCorrect="off"
            autoCapitalize="none"
          />
        </label>
      )}

      <div className="wk__editor-actions">
        <button
          type="submit"
          className="wk__btn wk__btn--primary"
          disabled={busy}
        >
          {busy ? "Saving…" : saveLabel}
        </button>
        <button
          type="button"
          className="wk__btn"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </button>
        {onRetire && (
          <button
            type="button"
            className="wk__btn wk__btn--quiet"
            onClick={onRetire}
            disabled={busy}
          >
            Retire
          </button>
        )}
      </div>
    </form>
  );
}
