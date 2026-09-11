/**
 * The renewal, in one line, on the pre-session briefing.
 *
 * Proposal §4.4: the latest conversation — "Unsure — price. Jen, Sep 3.
 * Needs a leader." — so the next trainer doesn't ask again. Shown only when
 * the client is in a renewal window or someone has already talked to them;
 * otherwise the briefing stays about the session.
 *
 * Styled with the briefing's own classes (briefing.css), so it reads as part
 * of that screen rather than a card dropped onto it.
 */

import { CalendarClock } from "lucide-react";
import type { Client } from "../../types";
import { studioTodayKey } from "../../lib/studio-time";
import { chipText } from "./sentences";
import { latestLine, renewalPromptDue } from "./conversation";
import { useRenewalCycle } from "./useRenewalCycle";

export function BriefingRenewalLine({ client }: { client: Client }) {
  const s = client.renewal ?? null;
  const { cycle } = useRenewalCycle(s ? client.homeStudioId : null, s?.cycleKey ?? null);
  const today = studioTodayKey();
  const latest = latestLine(cycle, today);
  const inWindow = renewalPromptDue(s) || s?.situation === "will-bank";
  if (!s || (!inWindow && !latest)) return null;

  return (
    <div className="br__inset">
      <span className="br__label">
        <CalendarClock className="w-3.5 h-3.5" />
        Renewal
      </span>
      <p className="br__quote">{chipText(s, today)}</p>
      <p className="br__meta">
        {latest ? `Last talk: ${latest}` : "Nobody has talked to them about renewing yet."}
      </p>
    </div>
  );
}
