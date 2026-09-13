import React from "react";
import { studioDateKey, studioTodayKey } from "../../lib/studio-time";
import { concernLabel, interestLabel, leaningLabel } from "./conversation";
import { dayLabel } from "./sentences";
import { useRenewalTouches } from "./useRenewalCycle";

/**
 * WHAT WAS SAID SO FAR (tracker round, Sep 2026).
 *
 * The conversation history for one renewal cycle, in one place. It used to
 * be drawn twice — on the renewal card and in the leaders' brief — and not
 * at all in the dialog where a trainer is about to have the conversation.
 * "Sometimes we want to jump back in to see what past trainers have said so
 * we know how to approach it" — so it sits above the form now.
 */
export function TouchHistory({
  studioId,
  cycleKey,
  compact = false,
  title = "Conversations so far",
}: {
  studioId: string | null | undefined;
  cycleKey: string | null | undefined;
  compact?: boolean;
  title?: string | null;
}) {
  const enabled = Boolean(studioId && cycleKey);
  const { touches, error } = useRenewalTouches(studioId || "", cycleKey || "", enabled);
  const today = studioTodayKey();
  if (!enabled) return null;
  return (
    <div className="space-y-2">
      {title && <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>}
      {error && <p className="text-[12px] text-amber-700 dark:text-amber-300">{error}</p>}
      {touches.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">Nobody has logged a conversation yet — you're first.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {(compact ? touches.slice(0, 3) : touches).map((t) => (
            <li key={t.id} className={compact ? "px-3 py-2" : "p-3"}>
              <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                {leaningLabel(t.leaning)}
                {t.concerns.length > 0 && ` — ${t.concerns.map(concernLabel).join(", ").toLowerCase()}`}
                {t.needsLeader && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                    Needs a leader
                  </span>
                )}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {t.authorName}
                {studioDateKey((t.at ?? null) as any) ? ` · ${dayLabel(studioDateKey(t.at as any), today)}` : ""}
                {t.interestedIn ? ` · interested in ${interestLabel(t.interestedIn).toLowerCase()}` : ""}
              </p>
              {t.note && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{t.note}</p>}
            </li>
          ))}
          {compact && touches.length > 3 && (
            <li className="px-3 py-2 text-[12px] text-muted-foreground">{touches.length - 3} earlier on the renewal card.</li>
          )}
        </ul>
      )}
    </div>
  );
}
