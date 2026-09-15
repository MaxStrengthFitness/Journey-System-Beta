/**
 * ONE LINE ON THE BRIEFING: something to ask about.
 *
 * The briefing is the 1–5 minutes before hands go on a client, and roughly a
 * minute of it is conversation. That minute is where FORD details are earned
 * and where they pay off, so this is the one place the framework gets to speak
 * before the session rather than after it.
 *
 * It is deliberately ONE ROW, not a section. The briefing's job is "is there
 * anything here that could hurt them", and a personal detail must never
 * compete with a contraindication for a trainer's eye. So: small, quiet, below
 * the critical strip, and gone entirely when there is nothing worth saying.
 *
 * WHAT IT PICKS
 *   1. The soonest dated detail — a graduation eight days out, an anniversary
 *      next week. The highest-value thing a trainer can open with.
 *   2. Failing that, the most recent standing fact, so a trainer who has never
 *      met this client still has one true thing to say.
 *   3. Failing that, a prompt from the emptiest pillar — a question to ASK,
 *      which is how the record gets filled in the first place. Rotated by day
 *      so the studio's trainers are not all asking about the dog on the same
 *      Tuesday.
 */

import { useMemo } from "react";
import { MessageCircle } from "lucide-react";
import type { Client } from "../../types";
import { FORD_META, FORD_PILLARS, type FordEntry, type FordPillar } from "./types";
import { useClientFord } from "./useClientFord";
import { FordMark, WhenChip, pillarPrompt } from "./ui";
import "./ford.css";

export interface FordBriefingCueProps {
  client: Client | null;
}

type Cue =
  | { kind: "detail"; entry: FordEntry }
  | { kind: "prompt"; pillar: FordPillar };

export function FordBriefingCue({ client }: FordBriefingCueProps) {
  const { entries, buckets, upcoming } = useClientFord({
    clientId: client?.id ?? null,
    client,
  });

  const cue = useMemo<Cue | null>(() => {
    const soonest = upcoming[0];
    if (soonest) return { kind: "detail", entry: soonest.entry };

    const pinned = entries.filter((e) => e.isPinned && !e.isArchived);
    if (pinned.length > 0) return { kind: "detail", entry: pinned[pinned.length - 1] };

    // Nothing on file — ask, rather than show an empty state. The thinnest
    // pillar first, so the record fills out evenly instead of four deep
    // Family notes and nothing else.
    const thinnest = [...buckets].sort(
      (a, b) =>
        a.pinned.length + a.moments.length - (b.pinned.length + b.moments.length),
    )[0];
    return { kind: "prompt", pillar: thinnest?.pillar ?? FORD_PILLARS[0] };
  }, [entries, buckets, upcoming]);

  if (!client || !cue) return null;

  return (
    <div className="ford-upnext" style={{ marginBlock: "0.5rem" }}>
      <div className="ford-upnext__row" style={{ cursor: "default" }}>
        {cue.kind === "detail" ? (
          <>
            <FordMark pillar={cue.entry.pillar} size={30} />
            <span className="ford-upnext__body">
              <span className="ford-upnext__text">{cue.entry.body}</span>
              <span className="ford-upnext__meta">
                {cue.entry.opportunity?.idea
                  ? cue.entry.opportunity.idea
                  : "Worth asking about today"}
              </span>
            </span>
            <WhenChip
              date={cue.entry.eventDate}
              recurrence={cue.entry.recurrence}
            />
          </>
        ) : (
          <>
            <span className="ford-mark ford-mark--unfiled" style={{ width: 30, height: 30 }}>
              <MessageCircle size={15} strokeWidth={2.5} />
            </span>
            <span className="ford-upnext__body">
              <span className="ford-upnext__text">
                “{pillarPrompt(cue.pillar)}”
              </span>
              <span className="ford-upnext__meta">
                Nothing on file under {FORD_META[cue.pillar].label} yet — catch
                the answer with Remember this
              </span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
