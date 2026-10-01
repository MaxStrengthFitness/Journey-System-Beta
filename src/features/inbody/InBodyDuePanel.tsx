/**
 * WHEN SHE IS DUE A SCAN — the InBody card's first line, and where her own
 * number is set (FileMaker parity, Oct 1 2026).
 *
 * The sentence comes from due.ts (the one answer). The editor writes
 * `inbodyEvery` through the shell's record form, so it saves with the ONE
 * Save bar and only the changed field is written — never the whole client.
 * Three choices: the studio's number, her own, or not for her.
 */
import { useState } from "react";
import { Bell } from "lucide-react";
import { EditButton, Picks, TextInput, useReadEdit } from "../client-codex/kit";
import { clientEveryOf, inbodyDueSentence, inbodyEverySourceWords, INBODY_EVERY_MAX, INBODY_EVERY_MIN, type InBodyDue } from "./due";

type Mode = "studio" | "own" | "never";

function modeOf(value: unknown): Mode {
  if (value === "never") return "never";
  if (typeof value === "number") return "own";
  return "studio";
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface InBodyDuePanelProps {
  due: InBodyDue;
  /** her · his · their */
  possessive: string;
  /** The studio's number, as the setting resolved it. */
  studioEvery: number;
  /** May this reader change the record (codexAccess().canEdit)? */
  canEdit: boolean;
  /** The form's current `inbodyEvery`. */
  value: unknown;
  onChange: (next: number | "never" | null) => void;
  dirty: boolean;
  /** The record form's revision: a save or discard closes the editor. */
  revision: number;
}

export function InBodyDuePanel({ due, possessive, studioEvery, canEdit, value, onChange, dirty, revision }: InBodyDuePanelProps) {
  const { open, toggle } = useReadEdit({ canEdit, revision });
  // Kept apart from the value so "Her own number" stays picked while the box is empty.
  const [mode, setMode] = useState<Mode>(modeOf(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if (!(mode === "own" && (value === null || value === undefined))) setMode(modeOf(value));
  }
  const source = inbodyEverySourceWords(due);
  const bad = mode === "own" && typeof value === "number" && clientEveryOf(value) === null;

  return (
    <div className="ib-due" data-due={due.kind === "count" && due.due ? "" : undefined} data-testid="inbody-due">
      <div className="ib-due__head">
        <p className="ib-due__line">
          <Bell size={14} aria-hidden="true" className="ib-due__icon" />
          <span>{inbodyDueSentence(due, possessive)}</span>
        </p>
        {canEdit ? <EditButton open={open} onToggle={toggle} label="when an InBody scan is due" /> : null}
      </div>
      {source && !open ? (
        <p className="ib-quiet ib-due__source">
          {`Counted against ${source}${dirty ? " · unsaved" : ""}.`}
        </p>
      ) : null}
      {open ? (
        <div className="ib-due__edit">
          <Picks
            label="How often is a scan due?"
            value={mode}
            options={[
              { value: "studio", label: `The studio's number (${studioEvery})` },
              { value: "own", label: `${cap(possessive)} own number` },
              { value: "never", label: `Not for ${possessive === "their" ? "them" : possessive === "his" ? "him" : "her"}` },
            ]}
            onChange={(next) => {
              const m = (next || "studio") as Mode;
              setMode(m);
              if (m === "studio") onChange(null);
              else if (m === "never") onChange("never");
              else onChange(typeof value === "number" ? value : studioEvery);
            }}
          />
          {mode === "own" ? (
            <TextInput
              label="Sessions between scans"
              type="number"
              inputMode="numeric"
              value={typeof value === "number" ? value : ""}
              onChange={(text) => {
                const t = text.trim();
                const n = Number(t);
                onChange(t === "" || !Number.isFinite(n) ? null : n);
              }}
              hint={
                bad
                  ? `Enter a whole number from ${INBODY_EVERY_MIN} to ${INBODY_EVERY_MAX}. Until then the studio's number counts.`
                  : `From ${INBODY_EVERY_MIN} to ${INBODY_EVERY_MAX}. Saves with the record's Save bar.`
              }
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
