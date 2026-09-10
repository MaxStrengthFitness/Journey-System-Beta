/**
 * THE PLAYBOOK, AT THE MACHINE.
 *
 * This is the other half of the loop, and the half that makes the first half
 * worth doing. AJ: "anytime I have a client with shoulder pain, I can refer to
 * my shoulder pain reference, and then a studio can kinda build up a
 * repertoire."
 *
 * Answers get captured on the hub when a request is resolved. They get USED
 * here — standing at the compound row with a client whose shoulder hurts,
 * inside the screen a trainer already opens to check setup. Knowledge nobody
 * finds at the moment of need is knowledge nobody wrote.
 *
 * PRESENTATIONAL ONLY. The listener lives in CatalogView, for the same reason
 * upkeep and studio settings do: mounting a snapshot in the detail pane means
 * tearing it down and rebuilding it on every tap in the machine rail.
 *
 * NO CLIENT NAMES, and there is nowhere to put one — a PlaybookEntry has no
 * clientId, the Firestore rule refuses a write that carries one, and this card
 * therefore cannot leak one however it is styled later.
 */
import { BookOpen, Check } from "lucide-react";
import type { PlaybookEntry } from "./playbook";
// The `--st-*` tokens this leans on come from studio-tasks.css, which the
// barrel already pulls in wherever this can be mounted.
import "./studio-hub.css";

export interface MachinePlaybookCardProps {
  entries: PlaybookEntry[];
  /** Confirmations are a studio signal, so who confirmed is worth showing. */
  currentUserId?: string | null;
  /** Open the hub's playbook lane on this entry. Optional — read-only without. */
  onOpenInHub?: (entryId: string) => void;
}

export function MachinePlaybookCard({
  entries,
  currentUserId,
  onOpenInHub,
}: MachinePlaybookCardProps) {
  if (entries.length === 0) return null;

  return (
    <div className="pbm">
      {/*
        Said once, at the top, because a trainer meeting this card for the
        first time needs to know it is their own studio's writing and not
        another wall of manufacturer copy.
      */}
      <p className="pbm__intro">
        <BookOpen size={12} aria-hidden />
        What this studio has worked out on this machine.
      </p>

      <ul className="pbm__list">
        {entries.map((e) => {
          const confirms = e.confirmations
            ? Object.keys(e.confirmations).length
            : 0;
          const mine = Boolean(currentUserId && e.confirmations?.[currentUserId]);
          return (
            <li key={e.id} className="pbm__entry">
              <button
                type="button"
                className="pbm__entry-main"
                disabled={!onOpenInHub}
                onClick={() => onOpenInHub?.(e.id)}
              >
                <span className="pbm__entry-title">{e.title}</span>
                {e.worked && <span className="pbm__entry-body">{e.worked}</span>}
              </button>

              <span className="pbm__entry-meta">
                {e.tags?.slice(0, 3).map((t) => (
                  <span key={t} className="pbm__tag">
                    {t}
                  </span>
                ))}
                {/*
                  Confirmations are the trust signal — "four other trainers
                  found this held up" is the difference between a note and a
                  method. Zero is left blank rather than shown as 0, which
                  reads as a mark against a perfectly good entry that simply
                  nobody has hit yet.
                */}
                {confirms > 0 && (
                  <span
                    className={`pbm__confirms${mine ? " pbm__confirms--mine" : ""}`}
                    title={`${confirms} trainer${confirms === 1 ? "" : "s"} confirmed this`}
                  >
                    <Check size={11} strokeWidth={3} aria-hidden />
                    {confirms}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
