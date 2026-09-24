/**
 * THE SWEEP — filing what was caught, on the post-session screen.
 *
 * The other half of "capture now, tag at teardown". Every detail typed during
 * the session with no letter chosen comes back here as a card with four big
 * buttons under it. One tap each, then it is gone.
 *
 * DESIGN RULES THIS SCREEN OBEYS
 * ------------------------------
 *   - It renders NOTHING when there is nothing to file. The post-session
 *     teardown is thirty seconds long; an empty tray asking to be dismissed
 *     would be worse than no tray at all.
 *   - It never blocks Finish. Nothing here is required, in the same way the
 *     not-reached machines strip is not required. A trainer who walks away
 *     loses nothing — the captures sit in the FORD page's To file tray and
 *     can be filed from the profile at any point, including next week.
 *   - Filing is optimistic. The card leaves the tray the instant it is tapped
 *     rather than waiting for Firestore, because on studio wifi that round
 *     trip is long enough for a trainer to tap twice.
 *
 * It sits above the assessment on the post-session screen: filing four
 * sentences is seconds, the assessment is minutes, and the short thing first
 * is what gets both done.
 */

import { useMemo, useState } from "react";
import { Inbox, Check, Trash2, Info } from "lucide-react";
import {
  FORD_META,
  FORD_PILLARS,
  type FordEntry,
  type FordPillar,
} from "./types";
import { discardUntaggedCapture, tagFordEntry } from "./ford-write";
import type { FordReadStatus } from "./read-status";
import { attribution } from "./ui";
import "./ford.css";

export interface FordSweepProps {
  clientId: string;
  clientFirstName: string;
  /** Unfiled captures, straight from useClientFord. */
  untagged: FordEntry[];
  /** Limit to one session's captures. Omit to sweep everything outstanding. */
  sessionId?: string | null;
  /**
   * useClientFord's read status (client codex, phase 1). An empty tray is only
   * "nothing to file" when FORD answered: on a failed read the sweep says it
   * could not check, rather than vanishing as if nothing had been caught.
   * Omitted = the caller vouches the list was read.
   */
  status?: FordReadStatus;
}

export function FordSweep({
  clientId,
  clientFirstName,
  untagged,
  sessionId = null,
  status = "ready",
}: FordSweepProps) {
  // Cards leave the moment they are tapped. The Firestore write follows, and
  // if it fails the snapshot puts the card back — which is the right outcome,
  // because the detail genuinely is not filed.
  const [settled, setSettled] = useState<Set<string>>(new Set());

  const queue = useMemo(() => {
    const scoped = sessionId
      ? untagged.filter((e) => e.sessionId === sessionId)
      : untagged;
    return scoped.filter((e) => !settled.has(e.id));
  }, [untagged, sessionId, settled]);

  const [filed, setFiled] = useState(0);

  const settle = (id: string) =>
    setSettled((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

  const file = (entry: FordEntry, pillar: FordPillar) => {
    settle(entry.id);
    setFiled((n) => n + 1);
    void tagFordEntry(clientId, entry.id, pillar);
  };

  const discard = (entry: FordEntry) => {
    settle(entry.id);
    void discardUntaggedCapture(clientId, entry.id);
  };

  // Could not read FORD: the captures may be there, so say so — quietly,
  // and without a button, because nothing here is required. A refused read
  // (a visiting trainer) has nothing to say: their captures were refused too.
  if (queue.length === 0 && filed === 0 && status === "failed") {
    return (
      <section className="ford-sweep" aria-label="Details to file" data-testid="ford-sweep-unread">
        <div className="ford-sweep__done">
          <Info size={16} className="shrink-0" aria-hidden />
          Couldn&apos;t check for details caught this session. Anything caught
          is kept, and waits on their profile under Life.
        </div>
      </section>
    );
  }

  // Nothing outstanding and nothing filed just now: render nothing at all.
  if (queue.length === 0 && filed === 0) return null;

  if (queue.length === 0) {
    return (
      <section className="ford-sweep" aria-label="Details filed">
        <div className="ford-sweep__done">
          <Check size={16} className="text-[var(--ford-recreation-ink)]" />
          {filed === 1
            ? "Filed. It is on their profile under Life."
            : `All ${filed} filed. They are on their profile under Life.`}
        </div>
      </section>
    );
  }

  return (
    <section className="ford-sweep" aria-label="Details to file">
      <header className="ford-sweep__head">
        <Inbox size={16} className="text-[var(--ford-unfiled)]" />
        <div className="min-w-0">
          <span className="ford-sweep__title">
            {queue.length === 1
              ? "One thing to file"
              : `${queue.length} things to file`}
          </span>
          <span className="ford-sweep__sub">
            You caught {queue.length === 1 ? "this" : "these"} about{" "}
            {clientFirstName}. One tap each — or skip it, nothing is lost.
          </span>
        </div>
      </header>

      {queue.map((entry) => (
        <article key={entry.id} className="ford-sweep__card">
          <p className="ford-sweep__quote">“{entry.body}”</p>

          <div className="ford-letters">
            {FORD_PILLARS.map((p) => {
              const meta = FORD_META[p];
              return (
                <button
                  key={p}
                  type="button"
                  className={`ford-letter ford-letter--${p}`}
                  onClick={() => file(entry, p)}
                  aria-label={`File under ${meta.label}`}
                >
                  <span className="ford-letter__glyph">{meta.letter}</span>
                  <span className="ford-letter__label">{meta.label}</span>
                </button>
              );
            })}
          </div>

          <div className="ford-sweep__foot">
            <span>{attribution(entry)}</span>
            <button
              type="button"
              className="ford-btn ford-btn--ghost"
              onClick={() => discard(entry)}
            >
              <Trash2 size={14} />
              Discard
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
