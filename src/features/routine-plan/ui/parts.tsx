/**
 * The Lineup's small parts (the design round, Oct 8 2026): a row's number and
 * cell, a group's head, an order effect's quiet row, the bench's entry, the
 * Source tag, the line that says what a change did, chips, a tick, the
 * meter, and the sheet every one of the plan's questions opens in.
 *
 * The look is `routine-plan.css`'s, in the Hub's palette. Nothing here
 * writes; every tap is the caller's.
 */
import { useState, type ReactNode } from "react";
import { ArrowLeftRight, BookOpen, Check, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { meterSegments, type BenchRow } from "../lineup";
import type { OrderEffect } from "../order-effects";
import type { PlanProgress } from "../plan";
import { startingSourceWords } from "../start-part";
import "./routine-plan.css";

/* ── The meter ──────────────────────────────────────────────────────────── */

/** "3 of 6" as a segmented meter, one segment a planned machine. A picture of the line beside it, so hidden from a reader. */
export function PlanMeter({ progress }: { progress: PlanProgress }) {
  return (
    <span className="rpl-meter" aria-hidden="true">
      {meterSegments(progress).map((kind, i) => (
        <span key={i} className="rpl-meter__seg" data-kind={kind} />
      ))}
    </span>
  );
}

/* ── A group's head ─────────────────────────────────────────────────────── */

export function GroupHead({ label, count, right }: { label: ReactNode; count?: number; right?: ReactNode }) {
  return (
    <li className="rpl-group">
      <span className="rpl-group__label">{label}</span>
      {count !== undefined && <span className="rpl-group__count">{count}</span>}
      <span className="rpl-group__rule" aria-hidden="true" />
      {right}
    </li>
  );
}

/* ── A row ─────────────────────────────────────────────────────────────── */

export type CellTone = "solid" | "deck" | "next";

export function Num({ n, tone = "solid" }: { n: number; tone?: CellTone }) {
  const cls = tone === "deck" ? "rpl-num rpl-num--deck" : tone === "next" ? "rpl-num rpl-num--next" : "rpl-num";
  return (
    <span className={cls} aria-hidden="true">
      {n}
    </span>
  );
}

export function NextPill() {
  return <span className="rpl-pill">Next</span>;
}

/**
 * One machine in the lineup: its place, its name (never cut short) and a
 * line under it ("Second workout adds", "instead of Seated Dip"). Tapping it
 * opens what `onOpen` opens; `action` sits beside it (Add to A now, Change).
 */
export function LineupRow({
  n,
  tone = "solid",
  name,
  sub,
  badge,
  onOpen,
  openLabel,
  action,
}: {
  n: number;
  tone?: CellTone;
  name: string;
  sub?: ReactNode;
  badge?: ReactNode;
  onOpen?: () => void;
  openLabel?: string;
  action?: ReactNode;
}) {
  const cls = tone === "deck" ? "rpl-cell rpl-cell--deck" : tone === "next" ? "rpl-cell rpl-cell--next" : "rpl-cell";
  const inner = (
    <span className="rpl-cell__text">
      <span className="rpl-cell__top">
        <span className="rpl-cell__name">{name}</span>
        {badge}
      </span>
      {sub ? <span className="rpl-cell__sub">{sub}</span> : null}
    </span>
  );
  return (
    <li className="rpl-row">
      <span className="rpl-row__lead">
        <Num n={n} tone={tone} />
      </span>
      <span className="rpl-row__body">
        {onOpen ? (
          <button type="button" className={cls} onClick={onOpen} aria-label={openLabel}>
            {inner}
          </button>
        ) : (
          <span className={cls}>{inner}</span>
        )}
        {action}
      </span>
    </li>
  );
}

/* ── An order effect ───────────────────────────────────────────────────── */

/**
 * "Lumbar directly into Leg Press · the Academy says avoid": a quiet row
 * between the two machines that trip it, the Academy's why and its source a
 * tap away. Never a block.
 */
export function OrderNote({ effect }: { effect: OrderEffect }) {
  const [open, setOpen] = useState(false);
  const source = startingSourceWords(effect.source);
  return (
    <li>
      <button type="button" className="rpl-effect" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="rpl-effect__bar" aria-hidden="true" />
        <span className="rpl-effect__text">{effect.sentence}</span>
        <Info size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="rpl-effect__why">
          <p>{effect.why}</p>
          {source && <span className="rpl-meta">{source}</span>}
        </div>
      )}
    </li>
  );
}

/* ── The bench ─────────────────────────────────────────────────────────── */

export function BenchEntry({
  row,
  name,
  onReopen,
}: {
  row: BenchRow;
  name: string;
  /** Reopen: the machine back where it stood (a dated mark that has ended says "back on" and is reopened the same way). Absent when nothing may write. */
  onReopen?: () => void;
}) {
  return (
    <li className="rpl-row">
      <span className="rpl-row__lead">
        <span className="rpl-num rpl-num--bench" aria-hidden="true">
          <X size={16} />
        </span>
      </span>
      <span className="rpl-bench">
        <span className="rpl-bench__text">
          <span className="rpl-bench__name">{name}</span>
          <span className="rpl-bench__line">{row.line}</span>
          <span className="rpl-bench__line">{row.standIn}</span>
        </span>
        {onReopen && (
          <Button variant="outline" onClick={onReopen}>
            Reopen
          </Button>
        )}
      </span>
    </li>
  );
}

/* ── Words ─────────────────────────────────────────────────────────────── */

/** Where a suggestion came from: a tag (no pointer), the starting routine's name and its source in words. */
export function SourceTag({ children }: { children: ReactNode }) {
  return (
    <span className="rpl-source">
      <BookOpen size={14} aria-hidden="true" />
      {children}
    </span>
  );
}

/** What the last change did ("Chest Flye instead of Seated Dip"), said once, dismissed with a tap. */
export function SaidLine({ children, onClear }: { children: ReactNode; onClear?: () => void }) {
  return (
    <div className="rpl-said" role="status">
      <ArrowLeftRight size={16} className="rpl-said__icon" aria-hidden="true" />
      <span className="rpl-said__text">{children}</span>
      {onClear && (
        <Button variant="ghost" size="icon" aria-label="Dismiss" onClick={onClear}>
          <X />
        </Button>
      )}
    </div>
  );
}

/* ── Controls ──────────────────────────────────────────────────────────── */

/**
 * One of the two doors when Journey can't tell how a client starts
 * ("Starting out here · Start a plan", "Trained here before · Enter their
 * routine"): Programming's Start a plan and the briefing both draw them.
 */
export function DoorButton({ icon, title, line, onClick }: { icon: ReactNode; title: string; line: string; onClick: () => void }) {
  return (
    <button type="button" className="rpl-door" onClick={onClick}>
      <span className="rpl-door__icon">{icon}</span>
      <span className="rpl-door__text">
        <span className="rpl-door__title">{title}</span>
        <span className="rpl-door__line">{line}</span>
      </span>
    </button>
  );
}

/** A chip a trainer taps. `on` makes it a toggle (aria-pressed); without it, it is an action. */
export function Chip({
  on,
  onClick,
  disabled,
  children,
  label,
}: {
  on?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  label?: string;
}) {
  return (
    <button type="button" className="rpl-chip" aria-pressed={on === undefined ? undefined : on} aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** A tick with its words: the row is the target, the box 40px on the firm edge, blue when on. */
export function TickRow({ on, onChange, label, sub }: { on: boolean; onChange: (on: boolean) => void; label: string; sub?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} className="rpl-tick" onClick={() => onChange(!on)}>
      <span className="rpl-tick__box" data-on={on ? "true" : "false"} aria-hidden="true">
        {on && <Check size={20} strokeWidth={3} />}
      </span>
      <span className="rpl-tick__text">
        <span className="rpl-tick__label">{label}</span>
        {sub && <span className="rpl-tick__sub">{sub}</span>}
      </span>
    </button>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────── */

/**
 * A sheet from the foot of the iPad, over the navy scrim: the plan's every
 * question opens here. Closing it (the X, Escape, a tap on the scrim) asks
 * `onClose`, which a sheet holding typing guards.
 */
export function PlanSheet({
  open,
  title,
  meta,
  onClose,
  footer,
  children,
}: {
  open: boolean;
  title: ReactNode;
  meta?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent side="bottom" showCloseButton={false} className="gap-0 rounded-t-2xl p-0">
        <div className="rpl-sheet">
          <div className="rpl-sheet__head">
            <div className="rpl-sheet__titles">
              <SheetTitle className="rpl-sheet__title">{title}</SheetTitle>
              {meta ? <SheetDescription className="rpl-meta">{meta}</SheetDescription> : null}
            </div>
            <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
              <X />
            </Button>
          </div>
          {children}
          {footer ? <div className="rpl-sheet__foot">{footer}</div> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
