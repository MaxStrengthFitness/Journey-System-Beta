/**
 * One machine of a routine, as Programming draws it: order · machine ·
 * progression · watch-outs · setup chips · how often · the load and the last
 * outcome (moved out of RoutinesTab, Oct 8 2026, so the plan's Lineup draws
 * "In Routine A" with the same rows and loses nothing they say).
 *
 * Two looks:
 * - "list", the hairline row Routine A and B have always drawn;
 * - "cell", the Lineup's (routine-plan/ui/PlanLineup): the place in the
 *   order outside the row (`lead`), the row a raised cell, an action beside
 *   it (`action`), and the plan's word under the name (`note`: "instead of
 *   Seated Dip", "not in the plan").
 *
 * Tapping the row opens the machine's card (the machine menu), in both.
 */
import { memo, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import type { RoutineRow } from "./routine-rows";
// The row borrows the All Machines rail's pills and chips (equipment.css), as it always has.
import "../equipment/equipment.css";
import "./routines.css";

export interface RoutineRowItemProps {
  row: RoutineRow;
  onSelect?: (id: string) => void;
  variant?: "list" | "cell";
  /** The cell's place in the order, drawn outside it. */
  lead?: ReactNode;
  /** Beside the cell. */
  action?: ReactNode;
  /** The plan's word under the name. */
  note?: string | null;
  /** Where the cell sits in the plan's A | B lineup (`rpl-aside`). */
  className?: string;
}

export const RoutineRowItem = memo(function RoutineRowItem({ row, onSelect, variant = "list", lead, action, note, className }: RoutineRowItemProps) {
  const outcome =
    row.outcome === null ? null : row.isHold ? `${row.outcome}s hold` : `${row.outcome} ${row.outcome === 1 ? "rep" : "reps"}`;
  const showStart = row.startingWeight !== null && row.weight !== null && row.startingWeight !== row.weight;
  const pct = row.progressionPct;
  const worst = row.watchOuts[0]?.tone ?? null;
  const cell = variant === "cell";
  const Tag: "button" | "div" = onSelect ? "button" : "div";
  const hit = (
    <Tag
      type={onSelect ? "button" : undefined}
      className={cell ? "rt-row__hit rt-cellrow__hit" : "rt-row__hit"}
      onClick={onSelect ? () => onSelect(row.machineId) : undefined}
      // The plan's word read aloud too (the label replaces the visible words), a weak area's tint included.
      aria-label={onSelect ? (note ? `Open ${row.name} · ${note}` : `Open ${row.name}`) : undefined}
    >
      {!cell && (
        <span className="rt-row__n" aria-hidden="true">
          {row.order}
        </span>
      )}
      <span className="rt-row__main">
        {/* Line 1 is the All Machines rail's line 1: name, progression, flags. */}
        <span className="rt-row__top">
          <span className="rt-row__name">{row.name}</span>
          {pct !== null && (
            <span
              className={`eq-item__prog ${pct > 0 ? "eq-item__prog--up" : pct < 0 ? "eq-item__prog--down" : ""}`}
              title={`${pct > 0 ? "+" : ""}${pct}% since the first set`}
            >
              {pct > 0 ? "+" : ""}
              {pct}%
            </span>
          )}
          {worst && (
            <span className="eq-watch-chip" data-tone={worst} title={row.watchOuts.map((w) => w.condition).join(", ")}>
              <ShieldAlert size={12} strokeWidth={2.6} aria-hidden />
              {row.watchOuts.length === 1 ? row.watchOuts[0].condition : `${row.watchOuts.length} watch-outs`}
            </span>
          )}
        </span>
        {/* Line 2 is the rail's line 2: setup chips and how often. */}
        <span className="rt-row__sub">
          {row.settings.length > 0 && (
            <span className="eq-item__settings" aria-label="Setup">
              {row.settings.map(([k, v], i) => (
                <span key={`${k}${i}`} className="eq-item__chip">
                  {k} {v}
                </span>
              ))}
            </span>
          )}
          {row.timesPerformed > 0 && (
            <span className="eq-item__count" title={`Performed in ${row.timesPerformed} sessions`}>
              {row.timesPerformed}×
            </span>
          )}
          {row.region ? <span className="rt-row__region">{row.region}</span> : null}
          {row.note ? <span className="rt-row__note">“{row.note}”</span> : null}
          {row.missing ? <span className="rt-row__region">Not on this studio's roster</span> : null}
          {note ? <span className="rt-row__plan">{note}</span> : null}
        </span>
      </span>
      <span className="rt-row__nums">
        {row.weight === null ? (
          <span className="eq-item__empty">No load yet</span>
        ) : (
          <span className="rt-row__load">
            {showStart && (
              <span className="rt-row__start">
                {row.startingWeight} <span aria-hidden="true">→</span>{" "}
              </span>
            )}
            <b>{row.weight}</b> <small>lb</small>
          </span>
        )}
        <span className="rt-row__outcome">{outcome ?? (row.weight === null ? "" : "no set logged")}</span>
      </span>
    </Tag>
  );
  if (!cell) {
    return <li className={["rt-row", row.missing ? "rt-row--missing" : ""].filter(Boolean).join(" ")}>{hit}</li>;
  }
  return (
    <li className={["rt-cellrow", row.missing ? "rt-row--missing" : "", className ?? ""].filter(Boolean).join(" ")}>
      {lead ? <span className="rt-cellrow__lead">{lead}</span> : null}
      {hit}
      {action}
    </li>
  );
});
