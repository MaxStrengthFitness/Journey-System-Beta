/**
 * ONE DIRECTORY ROW, DRAWN (hub fixes, Oct 1 2026).
 *
 * The Client Directory's row, out of ClientDirectory.tsx so the Hub's search
 * can draw the SAME row from the SAME model (row.ts): Last in · Next · Left in
 * the Directory's words, never a second set. AJ, Oct 1 2026, on why: "our
 * tracking of clients next sessions and how many they have total is a mess at
 * the moment… we are more concerened we can have a useable app that gives us
 * correct information about the current time". The Hub's old search cards
 * said "Previous session: No history" for a client with 54 sessions.
 *
 * Presentational: the screen that hosts it decides the rows, the grid's
 * columns (`--cd-cols`) and what a tap does.
 */
import { useState, type CSSProperties } from "react";
import type { Trainer } from "../../types";
import { KaizenToggle } from "../trainer-profile/KaizenToggle";
import { KaizenMark } from "../trainer-profile/KaizenMark";
import "../trainer-profile/trainer-profile.tokens.css";
import type { DirectoryRow } from "./row";
import type { NameMatch, Range } from "./search";
import "./client-directory.css";

/** A mark in the attention gutter. The seam for note marks; nothing draws one yet. */
export interface DirectoryMark {
  kind: "note" | "critical";
  /** The accessible label: "2 open notes you haven't marked off, 1 critical." */
  label: string;
}

export type ExtraColumn = "total" | "age" | "height";

/** A field's text with the matched letters marked. */
export function Highlighted({ text, ranges }: { text: string; ranges?: Range[] }) {
  if (!ranges || ranges.length === 0) return <>{text}</>;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const parts: React.ReactNode[] = [];
  let at = 0;
  sorted.forEach(([s, e], i) => {
    if (s < at) return;
    if (s > at) parts.push(text.slice(at, s));
    parts.push(<mark key={i}>{text.slice(s, e)}</mark>);
    at = e;
  });
  if (at < text.length) parts.push(text.slice(at));
  return <>{parts}</>;
}

export function NameLine({ row, match }: { row: DirectoryRow; match: NameMatch | null }) {
  const { first, nickname, last } = row.name;
  return (
    <span className="cd-name-text">
      {first && <Highlighted text={first} ranges={match?.ranges.first} />}
      {nickname && (
        <>
          {" \u201c"}
          <Highlighted text={nickname} ranges={match?.ranges.nickname} />
          {"\u201d"}
        </>
      )}
      {match?.alias && !nickname && <span className="cd-why-match">{` (${match.alias})`}</span>}
      {last && (
        <>
          {" "}
          <Highlighted text={last} ranges={match?.ranges.last} />
        </>
      )}
    </span>
  );
}

/** A cell's value, its second line, and — for an unknown — the reason on a tap. */
export function Cell({
  value,
  sub,
  reason,
  state,
  sorted,
  label,
  extra = false,
}: {
  value: string;
  sub: string | null;
  reason: string | null;
  state: string;
  sorted: boolean;
  label: string;
  extra?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const explain = !!reason && (state === "unknown" || state === "before-journey" || state === "nothing-recorded" || state === "none");
  return (
    <div className={extra ? "cd-cell cd-x" : "cd-cell"} data-state={state} data-sorted={sorted ? "true" : "false"} data-col={label}>
      {explain ? (
        <button
          type="button"
          className="cd-why cd-hit-target"
          aria-expanded={open}
          aria-label={`${label}: ${value}. Why?`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <span className="cd-val">{value}</span>
          <span className="cd-why-mark" aria-hidden="true">
            i
          </span>
        </button>
      ) : (
        <span className="cd-val">{value}</span>
      )}
      {sub && <span className="cd-sub">{sub}</span>}
      {open && reason && <span className="cd-reason">{reason}</span>}
    </div>
  );
}

export interface DirectoryRowViewProps {
  row: DirectoryRow;
  match?: NameMatch | null;
  /** The grid's columns (`--cd-cols`, `--cd-cols-wide`), the host's. */
  gridVars: CSSProperties;
  showGutter?: boolean;
  mark?: DirectoryMark | null;
  /** Bold at the head of the identity line (the sort's own word), or null. */
  lead?: string | null;
  /** The identity line ("62 · Nurse · retired"). */
  ident?: string;
  wide?: ReadonlySet<ExtraColumn>;
  /** The column the host sorts by, marked on its cells. */
  sortKey?: string | null;
  /** The LIVE trainer document: the Kaizen toggle. Absent: the read-only mark. */
  liveAuthTrainer?: Trainer | null;
  /** The Start column is drawn. */
  showStart?: boolean;
  /** Start on every row (the Hub's search), not only a client booked today (In today). */
  startAlways?: boolean;
  onSelect: (clientId: string) => void;
  onStart?: (clientId: string) => void;
}

export function DirectoryRowView({
  row,
  match = null,
  gridVars,
  showGutter = false,
  mark = null,
  lead = null,
  ident = "",
  wide = NO_EXTRAS,
  sortKey = null,
  liveAuthTrainer = null,
  showStart = false,
  startAlways = false,
  onSelect,
  onStart,
}: DirectoryRowViewProps) {
  return (
    <div className="cd-grid cd-row" data-client-id={row.id} style={gridVars}>
      <button
        type="button"
        className="cd-open"
        aria-label={`Open ${row.name.display}. Last in: ${row.lastIn.text}. Next: ${row.next.text}. Left: ${row.left.text}.`}
        onClick={() => onSelect(row.id)}
      />
      {showGutter && (
        <div className="cd-gutter" title={mark?.label}>
          {mark ? "\u25cf" : null}
        </div>
      )}
      <div className="cd-avatar" aria-hidden="true">
        {row.name.initials}
      </div>
      <div className="cd-client">
        <div className="cd-name">
          <NameLine row={row} match={match} />
          {/* The Kaizen Roster toggle, as the old directory had it (the
              only place a trainer adds a client from the client's
              side), now 40px. Without the live trainer document it
              is the read-only mark: the toggle rewrites the whole
              roster, and from a stale copy that would drop entries. */}
          {liveAuthTrainer ? (
            <span className="cd-kaizen cd-hit-target" onClick={(e) => e.stopPropagation()}>
              <KaizenToggle trainer={liveAuthTrainer} client={row.client} variant="icon" className="h-10 w-10 border-none bg-transparent" />
            </span>
          ) : row.kaizen ? (
            <span className="cd-kaizen">
              <KaizenMark quiet size={15} title="On your Kaizen Roster" />
            </span>
          ) : null}
          {row.badges.map((b) => (
            <span key={b} className="cd-badge">
              {b}
            </span>
          ))}
          {match?.why && <span className="cd-why-match">{match.why}</span>}
        </div>
        {(lead || ident) && (
          <div className="cd-ident">
            {lead && <strong>{lead}</strong>}
            {lead && ident ? " \u00b7 " : ""}
            {ident}
          </div>
        )}
      </div>
      <Cell label="Last in" value={row.lastIn.text} sub={row.lastIn.sub} reason={row.lastIn.reason} state={row.lastIn.state} sorted={sortKey === "lastIn"} />
      <Cell label="Next" value={row.next.text} sub={row.next.sub} reason={row.next.reason} state={row.next.state} sorted={sortKey === "next"} />
      <Cell label="Left" value={row.left.text} sub={row.left.sub} reason={row.left.reason} state={row.left.state} sorted={sortKey === "left"} />
      {wide.has("total") && (
        <Cell extra label="Total" value={row.total.text} sub={row.total.sub} reason={row.total.reason} state={row.total.state} sorted={sortKey === "total"} />
      )}
      {wide.has("age") && <Cell extra label="Age" value={row.age.text} sub={null} reason={null} state={row.age.value === null ? "unknown" : "known"} sorted={sortKey === "age"} />}
      {wide.has("height") && (
        <Cell extra label="Height" value={row.height.text} sub={null} reason={null} state={row.height.inches === null ? "unknown" : "known"} sorted={sortKey === "height"} />
      )}
      {showStart && (
        <div>
          {(startAlways || row.today) && (
            <button
              type="button"
              className="cd-start cd-hit-target"
              aria-label={`Start ${row.name.goesBy}\u2019s session`}
              onClick={(e) => {
                e.stopPropagation();
                onStart?.(row.id);
              }}
            >
              Start
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const NO_EXTRAS: ReadonlySet<ExtraColumn> = new Set();
