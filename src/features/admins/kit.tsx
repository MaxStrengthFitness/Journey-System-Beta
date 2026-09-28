/**
 * THE ADMINS DASHBOARD'S OWN PIECES — the status word and the two-line row.
 *
 * Round: the Admins room (Sep 28 2026). Everything else a page needs comes
 * from the admin kit (features/admin/primitives.tsx): panels, the save bar,
 * notices, the confirm dialog. These two are what the redesign added, and
 * they carry two house rules the old rows kept breaking:
 *
 *   SENTENCES, NOT SCORES. A status is a word with a small mark beside it,
 *   and the mark's SHAPE says as much as its colour: a filled dot is fine, a
 *   diamond wants a look, a dashed ring is "couldn't check", a hollow ring is
 *   waiting. Colour is never the only signal, and "couldn't check" never
 *   looks like "none".
 *
 *   NAMES ARE NEVER CUT SHORT. A row's first line is the whole name, and it
 *   wraps; the second line is one sentence of state; the row has at most one
 *   action of its own. Tapping the row opens the thing.
 */
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import "./admins.css";

export type HqTone = "ok" | "watch" | "unknown" | "idle" | "live";

/** A status in words, with a mark whose shape carries the meaning too. */
export function HqStatus({ tone, children }: { tone: HqTone; children: ReactNode }) {
  return (
    <span className={cn("hq-status", `hq-status--${tone}`)}>
      <span className="hq-status__mark" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/** A run of rows that reads as one list. */
export function HqRows({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="hq-rows" role="list" aria-label={label}>
      {children}
    </div>
  );
}

/**
 * One row: the whole name (it wraps), a quiet context after it, one sentence
 * of state, and at most one action. With `onOpen` the name and sentence are
 * one button that opens the thing; the action stays a separate button, so no
 * button ever sits inside another.
 */
export function HqRow({
  name,
  context,
  say,
  action,
  onOpen,
  openLabel,
  selected,
}: {
  name: ReactNode;
  context?: ReactNode;
  say?: ReactNode;
  action?: ReactNode;
  onOpen?: () => void;
  /** What the open button says to a screen reader, when the name alone is not enough. */
  openLabel?: string;
  selected?: boolean;
}) {
  const body = (
    <>
      <span className="hq-row__name">
        {name}
        {context ? <span className="hq-row__ctx">{context}</span> : null}
      </span>
      {say ? <span className="hq-row__say">{say}</span> : null}
    </>
  );
  return (
    <div className={cn("hq-row", selected && "hq-row--on")} role="listitem">
      {onOpen ? (
        <button type="button" className="hq-row__open" onClick={onOpen} aria-label={openLabel}>
          {body}
        </button>
      ) : (
        <div className="hq-row__body">{body}</div>
      )}
      {action ? <div className="hq-row__act">{action}</div> : null}
      {onOpen && !action ? <ChevronRight className="hq-row__chev" aria-hidden="true" /> : null}
    </div>
  );
}

/** A group's heading above its rows: a name, and the rule that put the rows here. */
export function HqGroupHead({ title, note }: { title: string; note?: ReactNode }) {
  return (
    <div className="hq-grouphead">
      <h3 className="hq-grouphead__title">{title}</h3>
      {note ? <p className="hq-grouphead__note">{note}</p> : null}
    </div>
  );
}
