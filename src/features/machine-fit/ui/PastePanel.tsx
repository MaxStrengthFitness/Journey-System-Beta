/**
 * MACHINE FIT — paste a whole chart.
 *
 * If a client's FileMaker settings can be copied out as text — one machine a
 * line, however that chart happened to spell them — this reads the lot in one
 * go (shorthand.ts) and fills the drafts. Lines that name no machine on this
 * floor are listed back, untouched, so nothing is lost without anyone
 * noticing. Like everything else on this screen, it only fills DRAFTS.
 */

import { useMemo, useState } from "react";
import { parseShorthandBlock, type ShorthandBlockLine, type ShorthandMachine } from "../shorthand";

export interface PastePanelProps {
  machines: ShorthandMachine[];
  onFill: (lines: ShorthandBlockLine[]) => void;
  onClose: () => void;
}

export function PastePanel({ machines, onFill, onClose }: PastePanelProps) {
  const [text, setText] = useState("");
  const lines = useMemo(() => (text.trim() ? parseShorthandBlock(text, machines) : []), [text, machines]);
  const placed = lines.filter((l) => l.machineId && l.result && Object.keys(l.result.values).length + (l.result.weight ? 1 : 0) > 0);
  const unplaced = lines.filter((l) => !l.machineId);

  return (
    <section className="fit-paste" aria-label="Paste a chart">
      <header className="fit-match__head">
        <div>
          <h3 className="fit-match__title">Paste a chart</h3>
          <p className="fit-match__sub">
            One machine a line, the way the chart spells it &mdash; <i>Comp. Row: G:4, S:3, H:W</i>. It fills the boxes
            below; nothing is saved until you press Save.
          </p>
        </div>
        <button type="button" className="fit-btn fit-btn--quiet" onClick={onClose}>
          Close
        </button>
      </header>
      <textarea
        className="fit-paste__text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={"Hip ADD  S 8  Gap 9\nLeg Press  Gap 8  P- 2  S- 3.75\nComp. Row: Pad- D, S- 6, Gap- 0"}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Chart text"
      />
      {lines.length > 0 ? (
        <p className="fit-paste__summary">
          <b>{placed.length}</b> {placed.length === 1 ? "machine" : "machines"} read
          {unplaced.length > 0 ? (
            <>
              {" "}
              &middot; <b>{unplaced.length}</b> {unplaced.length === 1 ? "line names" : "lines name"} no machine on this
              floor: {unplaced.map((l) => `“${l.line}”`).join(", ")}
            </>
          ) : null}
        </p>
      ) : null}
      <div className="fit-suggest__actions">
        <button
          type="button"
          className="fit-btn fit-btn--live"
          disabled={placed.length === 0}
          onClick={() => {
            onFill(placed);
            setText("");
            onClose();
          }}
        >
          Fill {placed.length || ""} {placed.length === 1 ? "machine" : "machines"}
        </button>
      </div>
    </section>
  );
}
