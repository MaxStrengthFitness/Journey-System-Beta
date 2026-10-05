/**
 * THE MACHINE MENU — the header (machine menu design §C, "Header").
 *
 * Line 1: the unit's floor name at 22px and the client's display name at
 * 17px (nickname-aware, the same in both doors), both wrapping; the safety
 * pill while the strip is scrolled out of view (its place kept, hidden,
 * while it isn't, and a row of its own on a phone); Close (48×48, "Close Leg
 * Press"), which goes through the unsaved gate (the host's `onClose`).
 * Line 2 is the SET-DOWN read, header-words.ts's `lastTimeLine`: "Last time"
 * at 15px, the figures at 28px tabular, the grid's QualityMark only when the
 * set was marked, the day at 17px.
 *
 * The header never shows height, gender or age: it takes the names and the
 * line, and nothing else of the client record. That is the fix for the old
 * headers' "· None".
 *
 * `titleAs` is the dialog's own title in the dialog (Base UI's DialogTitle
 * names the dialog), a plain heading inline on Programming → All Machines.
 */
import type { ElementType } from "react";
import { AlertTriangle, ChevronLeft, X } from "lucide-react";
import { QualityMark } from "../journey-grid/QualityMark";
import { closeLabel, safetyPillWords, type HeaderLine } from "./header-words";
import "./machine-menu.css";

export interface MenuHeaderProps {
  machineName: string;
  clientName: string;
  line: HeaderLine;
  /** The heading's element: the dialog's DialogTitle, or an h2. */
  titleAs?: ElementType;
  /** Close (the dialog), through the unsaved gate. */
  onClose?: () => void;
  /** Back to the list (Programming → All Machines, one pane at a time). Shown instead of Close. */
  onBack?: () => void;
  backLabel?: string;
  /** The safety strip's lines, and whether one is a Critical note. */
  safety: { count: number; critical: boolean };
  /** The strip is scrolled out of view: the pill shows. */
  pillVisible: boolean;
  onPill?: () => void;
}

export function MenuHeader({
  machineName,
  clientName,
  line,
  titleAs: Title = "h2",
  onClose,
  onBack,
  backLabel = "Machines",
  safety,
  pillVisible,
  onPill,
}: MenuHeaderProps) {
  // The pill keeps its place whenever the strip has something, hidden while
  // the strip is in view: showing it never narrows the names nor changes the
  // header's height under a finger mid-drag (on a phone it has a row of its
  // own). Hidden, nothing can reach it.
  const pill = safety.count > 0 ? safetyPillWords(safety.count) : null;
  return (
    <header className="mm-head">
      <div className="mm-head__row">
        {onBack ? (
          <button type="button" className="mm-btn mm-head__back" onClick={onBack}>
            <ChevronLeft size={18} strokeWidth={2.4} aria-hidden />
            {backLabel}
          </button>
        ) : null}
        <Title className="mm-head__title">
          <span className="mm-head__machine">{machineName}</span> <span className="mm-head__client">{clientName}</span>
        </Title>
        {pill ? (
          <button
            type="button"
            className="mm-head__pill"
            data-critical={safety.critical ? "true" : undefined}
            data-shown={pillVisible ? "true" : undefined}
            aria-hidden={pillVisible ? undefined : true}
            tabIndex={pillVisible ? undefined : -1}
            aria-label={pill.ariaLabel}
            onClick={pillVisible ? onPill : undefined}
          >
            {safety.critical ? <AlertTriangle size={18} strokeWidth={2.4} className="mm-head__crit" aria-hidden /> : null}
            <span>{pill.label}</span>
          </button>
        ) : null}
        {onClose ? (
          <button type="button" className="mm-close" aria-label={closeLabel(machineName)} onClick={onClose}>
            <X size={22} strokeWidth={2.4} aria-hidden />
          </button>
        ) : null}
      </div>
      <p className="mm-head__last" data-kind={line.kind} data-header-line="">
        {line.lead ? <span className="mm-head__lbl">{line.lead}</span> : null}
        {line.words ? <span className="mm-head__words">{line.words}</span> : null}
        {line.figures ? <span className="mm-head__num">{line.figures}</span> : null}
        {line.mark ? (
          <>
            <QualityMark quality={line.mark === "max" ? 3 : 1} size={22} className={line.mark === "max" ? "mm-star" : "mm-kaizen"} />
            {line.markWords ? <span className="sr-only">{line.markWords}</span> : null}
          </>
        ) : null}
        {line.day ? <span className="mm-head__day">{line.figures || line.words ? `· ${line.day}` : line.day}</span> : null}
        {line.rest.map((r) => (
          <span key={r} className="mm-head__rest">
            · {r}
          </span>
        ))}
      </p>
    </header>
  );
}
