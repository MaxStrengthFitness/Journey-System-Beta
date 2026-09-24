/**
 * OVER TIME — how she arrives and how each session lands, what she told us in
 * the Pulse, and what InBody measured, on one six-month timeline (AJ's
 * decisions 7 and 9).
 *
 * Client codex, Sep 2026 (phase 13). The card leads with the everyday half:
 * the briefing's "How's the body since last time?" over her recent sessions,
 * in words ("asked at 12 of her last 24 sessions. “Still feeling it” or
 * “Still wrecked” at 3 of them."), never a score. Then the timeline
 * (BodyTimeline.tsx, from timeline.ts's model) and a footer that says how
 * each reading is drawn, what it counts, and what it does NOT draw: sessions
 * before Journey, and — when Journey may not hold her whole story — the
 * coverage caveat.
 *
 * The sessions are the journal's own (`recentSessions`): the card reads
 * nothing. A read still out, or failed, says so in its lane; the rest draws.
 */
import { Card, Lede, cap, type Pronouns } from "../kit";
import { BodyTimeline } from "./BodyTimeline";
import type { TimelineModel } from "./timeline";

export function OverTimeCard({ model, pronouns: p }: { model: TimelineModel; pronouns: Pronouns }) {
  return (
    <Card eyebrow="Over time" id="body-timeline">
      <Lede className="bp-tl__lede">{model.lede}</Lede>
      <p className="bp-quiet">
        {`At every session: how ${p.subject} arrived and how it landed. Every few months: the Pulse. Every scan: InBody.`}
      </p>
      <p className="bp-legend">
        <span>
          <i className="bp-lg-s" aria-hidden="true" />
          Measured
        </span>
        <span>
          <i className="bp-lg-r" aria-hidden="true" />
          {`${cap(p.subject)} told us, in the Pulse's own words`}
        </span>
        <span>
          <i className="bp-lg-m" aria-hidden="true" />
          At the door and after the session, where it was asked
        </span>
      </p>
      <BodyTimeline model={model} />
      <div className="bp-tl__foot">
        {model.footer.map((line, i) => (
          <p key={i} className="bp-foot">
            {line}
          </p>
        ))}
      </div>
    </Card>
  );
}
