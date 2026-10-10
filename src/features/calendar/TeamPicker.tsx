import { memo, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Users } from "lucide-react";
import "../rooms/rooms.css";
import "./calendar.css";

/**
 * WHOSE BOOKINGS (the rooms round, Oct 10 2026): the Calendar's team filter,
 * a tool on its room bar.
 *
 * It was a native select inside a 170px box, which cut a trainer's name
 * ("Christopher Feath…") and drew on the decorative hairline. It is now a
 * raised button on the firm 3:1 edge saying whose bookings are showing, and
 * a list of whole names in 44px rows, yours first and marked "You". Escape
 * or a tap outside closes it; nothing is chosen until a row is tapped.
 */

export const ENTIRE_TEAM = "all";
export const ENTIRE_TEAM_WORDS = "Entire team";

export interface TeamPickerTrainer {
  id: string;
  /** The whole name: never cut. */
  name: string;
}

export interface TeamPickerProps {
  trainers: ReadonlyArray<TeamPickerTrainer>;
  /** A trainer's id, or ENTIRE_TEAM. */
  value: string;
  onChange: (next: string) => void;
  /** The signed-in trainer: first in the list, marked "You". */
  selfId?: string | null;
}

/** The list's order: you, then everyone else by name. */
export function pickerOrder(trainers: ReadonlyArray<TeamPickerTrainer>, selfId: string | null | undefined): TeamPickerTrainer[] {
  const me = selfId ? trainers.filter((t) => t.id === selfId) : [];
  const rest = trainers.filter((t) => t.id !== selfId).sort((a, b) => a.name.localeCompare(b.name));
  return [...me, ...rest];
}

function TeamPickerView({ trainers, value, onChange, selfId = null }: TeamPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const chosen = value === ENTIRE_TEAM ? null : trainers.find((t) => t.id === value) ?? null;
  const words = chosen ? chosen.name : ENTIRE_TEAM_WORDS;
  const options = [{ id: ENTIRE_TEAM, name: ENTIRE_TEAM_WORDS }, ...pickerOrder(trainers, selfId)];

  return (
    <div className="cal-pick" ref={wrapRef}>
      <button
        type="button"
        className="rm-tool cal-pick__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Whose bookings: ${words}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Users size={16} strokeWidth={2.4} aria-hidden />
        <span className="cal-pick__name">{words}</span>
        <ChevronDown size={16} strokeWidth={2.4} aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="cal-pick__list" role="listbox" aria-label="Whose bookings">
          {options.map((o) => {
            const picked = o.id === value || (o.id === ENTIRE_TEAM && chosen === null);
            return (
              <li key={o.id} role="none">
                <button
                  type="button"
                  role="option"
                  aria-selected={picked}
                  className="cal-pick__opt"
                  onClick={() => {
                    setOpen(false);
                    if (!picked) onChange(o.id);
                  }}
                >
                  <span className="cal-pick__optname">
                    {o.name}
                    {selfId && o.id === selfId && <span className="cal-pick__you">You</span>}
                  </span>
                  {picked && <Check size={16} strokeWidth={2.6} aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export const TeamPicker = memo(TeamPickerView);
