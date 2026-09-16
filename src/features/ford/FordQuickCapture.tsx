/**
 * REMEMBER THIS — catching a detail mid-session.
 *
 * THE PROBLEM THIS SOLVES
 * -----------------------
 * A client is thirty seconds into a set to failure. The trainer's eyes are on
 * their form and their hand is near the machine. Between sets the client says
 * "my grandson graduates in May". That sentence is the single most valuable
 * thing said in the whole hour, and today it survives only if the trainer
 * happens to remember it at 6pm.
 *
 * WHY IT HAS NO REQUIRED FIELDS
 * -----------------------------
 * Every category, importance level, date picker and machine selector we could
 * put in front of that sentence is a decision taken while a client waits. So
 * there is exactly one required thing — the sentence — and one button. The
 * four letters are there, and a trainer with a spare second can tap one, but
 * saving without touching them is the designed path, not the degraded one:
 * `pillar` is nullable all the way down to the security rules. Untagged
 * captures come back as cards on the post-session screen, where filing each
 * one costs a single tap with nobody waiting.
 *
 * Same anti-blocker rule as the set outcomes: the app never stands between a
 * trainer and their client.
 *
 * Lives as the second mode of the Session Notes sidebar, so it is reached by
 * the button a trainer already knows rather than a new one competing for room
 * on the session bar.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Inbox } from "lucide-react";
import {
  FORD_META,
  FORD_PILLARS,
  type FordOrigin,
  type FordPillar,
} from "./types";
import { createFordEntry, type FordAuthor } from "./ford-write";
import { FordMark } from "./ui";
import "./ford.css";

export interface FordQuickCaptureProps {
  clientId: string;
  clientFirstName: string;
  studioId: string;
  author: FordAuthor;
  sessionId?: string | null;
  origin?: FordOrigin;
  /** Rendered under the box so a trainer can see what they already caught. */
  recent?: { id: string; body: string; pillar: FordPillar | null }[];
  onSaved?: () => void;
  /**
   * A letter to start on — the briefing's cue opens the capture already
   * filed under the pillar it asked about. Still one tap to clear.
   */
  defaultPillar?: FordPillar | null;
}

export function FordQuickCapture({
  clientId,
  clientFirstName,
  studioId,
  author,
  sessionId = null,
  origin = "in_session",
  recent = [],
  onSaved,
  defaultPillar = null,
}: FordQuickCaptureProps) {
  const [body, setBody] = useState("");
  const [pillar, setPillar] = useState<FordPillar | null>(defaultPillar);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);
  const flashRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (flashRef.current) window.clearTimeout(flashRef.current);
    },
    [],
  );

  const save = async () => {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      await createFordEntry(clientId, studioId, author, {
        pillar,
        body: text,
        origin,
        sessionId,
      });
      // Clear and hand the keyboard straight back: a client who is talking
      // usually says two things, not one.
      setBody("");
      setPillar(defaultPillar);
      setJustSaved(true);
      if (flashRef.current) window.clearTimeout(flashRef.current);
      flashRef.current = window.setTimeout(() => setJustSaved(false), 2200);
      boxRef.current?.focus();
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ford-capture">
      <p className="ford-capture__hint">
        Something {clientFirstName} just told you. Type it and save — you can
        file it under a letter after the session.
      </p>

      <textarea
        ref={boxRef}
        className="ford-capture__field"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter saves. A trainer on a keyboard-equipped iPad never
          // has to find the button.
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
        placeholder={`“Grandson graduates in May”`}
        aria-label={`Something ${clientFirstName} told you`}
      />

      <div className="ford-letters">
        {FORD_PILLARS.map((p) => {
          const meta = FORD_META[p];
          const on = pillar === p;
          return (
            <button
              key={p}
              type="button"
              className={`ford-letter ford-letter--${p}${on ? " ford-letter--on" : ""}`}
              onClick={() => setPillar(on ? null : p)}
              aria-pressed={on}
              aria-label={meta.label}
            >
              <span className="ford-letter__glyph">{meta.letter}</span>
              <span className="ford-letter__label">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="ford-capture__actions">
        <button
          type="button"
          className="ford-btn ford-btn--primary"
          onClick={() => void save()}
          disabled={!body.trim() || saving}
        >
          {saving ? "Saving…" : "Remember this"}
        </button>
        {justSaved ? (
          <span className="ford-when ford-when--soon" role="status">
            <Check size={13} /> Saved
          </span>
        ) : (
          <span className="ford-capture__hint">
            {pillar ? `Filing under ${FORD_META[pillar].label}` : "No letter needed"}
          </span>
        )}
      </div>

      {recent.length > 0 ? (
        <>
          <div className="ford-capture__hint flex items-center gap-1.5 pt-1">
            <Inbox size={13} />
            Caught this session
          </div>
          <ul className="ford-capture__recent">
            {recent.map((r) => (
              <li key={r.id}>
                <FordMark pillar={r.pillar} size={26} />
                <span className="flex-1 min-w-0">{r.body}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
