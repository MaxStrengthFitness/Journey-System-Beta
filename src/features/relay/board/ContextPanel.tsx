import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "../../../lib/utils";
import type { PanelContent } from "./RelayContext";

/**
 * THE CONTEXT PANEL — detail beside the board, never on top of it.
 *
 * Round: Relay, Sep 2026. The Sep 16 Planner opened every detail as a modal
 * that hid the list; you could not glance at the board while writing a
 * closing note or compare two asks. This is one component with two
 * presentations, decided by CSS: a right column in landscape (>= 900px) and a
 * bottom sheet in portrait (relay.css, .cp). The tab underneath stays live.
 *
 * Escape closes it. It is rendered only while it has content, which is safe
 * here because it is a plain element, not a Base UI dialog — nothing sets
 * pointer-events on <body>.
 */
export function ContextPanel({ content, onClose }: { content: PanelContent | null; onClose: () => void }) {
  useEffect(() => {
    if (!content) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [content, onClose]);

  if (!content) return null;
  return (
    <aside className={cn("cp", content.tall && "cp--tall")} aria-label={content.title}>
      <span className="cp__grip" aria-hidden />
      <header className="cp__head">
        <h2 className="cp__title">
          {content.kicker && <span className="cp__kicker">{content.kicker}</span>}
          {content.title}
        </h2>
        <button type="button" className="cp__close" aria-label="Close" onClick={onClose}>
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="cp__body">{content.body}</div>
      {content.foot && <footer className="cp__foot">{content.foot}</footer>}
    </aside>
  );
}
