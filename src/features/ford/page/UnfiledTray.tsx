/**
 * TO FILE — details caught on the floor with no pillar yet.
 *
 * Framed as tidying, never as an error: an unfiled capture means a trainer
 * kept their eyes on the client, which is the behaviour we want. Each line
 * says where it was caught and by whom, and four labelled buttons file it —
 * the letter AND the word, 40px, so nothing depends on a tooltip. The quote
 * opens the detail for anything more than a filing.
 *
 * Filing writes only the pillar (`tagFordEntry`). A reader who may not write
 * FORD sees the tray without the buttons.
 *
 * A capture saved with a Follow up next time (a detail added with no pillar)
 * shows its question here, because no pillar's Ask next can show it until it
 * is filed — a question nobody can see is a write with no reader.
 */
import { useState } from "react";
import { Inbox } from "lucide-react";
import { Btn, Card, FordMark, curly } from "../../client-codex/kit";
import { FORD_META, FORD_PILLARS, shortDate, type FordEntry, type FordPillar } from "../types";
import { ORIGIN_WORDS } from "../page-model";
import { hasOpenFollowUp, normaliseFollowUp } from "../ask-next";

/** How many captures show before "Show all". */
export const TRAY_SHOWN = 3;

export function UnfiledTray({
  untagged,
  now,
  onOpen,
  onFile,
}: {
  untagged: readonly FordEntry[];
  now: Date;
  /** Opens a capture in the detail dialog; null when this reader may not write FORD. */
  onOpen: ((entry: FordEntry) => void) | null;
  /** Files a capture under a pillar; resolves false when it did not save. Null: read only. */
  onFile: ((entry: FordEntry, pillar: FordPillar) => Promise<boolean>) | null;
}) {
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  if (untagged.length === 0) return null;
  const shown = all ? untagged : untagged.slice(0, TRAY_SHOWN);

  const file = async (entry: FordEntry, pillar: FordPillar) => {
    if (!onFile) return;
    setBusy(entry.id);
    setFailed(null);
    const ok = await onFile(entry, pillar);
    setBusy(null);
    if (!ok) setFailed(entry.id);
  };

  return (
    <Card className="fordpg-tray" eyebrow={`To file · ${untagged.length}`} icon={Inbox}>
      <ul className="fordpg-tray__list">
        {shown.map((entry) => {
          const who = entry.authorName?.trim() || entry.authorInitials?.trim() || "";
          const when = shortDate(entry.occurredAt, now);
          // "Caught mid-session by Jess Moreno, Mar 15" — the whole name, never cut.
          const meta = `${ORIGIN_WORDS[entry.origin] ?? "Caught"}${who ? ` by ${who}` : ""}${when ? `, ${when}` : ""}`;
          return (
            <li key={entry.id} className="fordpg-tray__row">
              <div className="fordpg-tray__text">
                {onOpen ? (
                  <button type="button" className="fordpg-tray__quote" onClick={() => onOpen(entry)}>
                    {curly(entry.body)}
                  </button>
                ) : (
                  <span className="fordpg-tray__quote">{curly(entry.body)}</span>
                )}
                <span className="fordpg-tray__meta">{meta}</span>
                {hasOpenFollowUp(entry) ? (
                  <span className="fordpg-tray__meta">Follow up next time: {curly(normaliseFollowUp(entry.followUp))}</span>
                ) : null}
                {failed === entry.id ? (
                  <span className="fordpg-tray__meta" role="alert">
                    Not filed — try again.
                  </span>
                ) : null}
              </div>
              {onFile ? (
                <div className="fordpg-tray__picks" role="group" aria-label="File it under">
                  {FORD_PILLARS.map((p) => (
                    <Btn
                      key={p}
                      className="fordpg-file"
                      aria-label={`File under ${FORD_META[p].label}`}
                      disabled={busy === entry.id}
                      onClick={() => void file(entry, p)}
                    >
                      <FordMark pillar={p} size={22} />
                      {FORD_META[p].label}
                    </Btn>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {untagged.length > TRAY_SHOWN ? (
        <div>
          <Btn variant="quiet" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? "Show fewer" : `Show all ${untagged.length}`}
          </Btn>
        </div>
      ) : null}
    </Card>
  );
}
