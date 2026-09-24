/**
 * PULSE · THE LIVING ASSESSMENT — read first: one line per area, in the
 * Pulse's three pillars; then Update Pulse (the editor in place) and Hand to
 * client (her own sheet).
 *
 * Client codex, Sep 2026 (phase 12). The long scroll mounted the whole Pulse
 * editor as the section. Now the card reads: each area's title, verbatim, and
 * ONE statement per area (the most recently answered) with its word and day —
 * "“I wake up feeling rested.” Often · Mar 10" — the pain map's spots, the
 * stress worries in her own words, protein and hydration as days a week, and
 * "over 90 days, due a look" where an area has gone quiet (pulse-read.ts).
 *
 * THE ONE DRAFT. The page owns the client's ONE `useCheckInDraft` (the open
 * round) and hands it here; Update Pulse swaps the read grid for the existing
 * ClientCheckInPanel over the SAME draft (its `draft` prop), so the panel
 * reads nothing of its own and there are never two drafts of one client
 * autosaving side by side (KNOWN-TRAPS → Ratings, notes and Pulse). The saved
 * rounds are the tab's one read-only history. Once opened, the panel stays
 * mounted (hidden) so an open topic survives Done and a second look.
 *
 * Hand to client opens the panel's client mode (a full-screen sheet) on the
 * same draft. The Pulse is the progress reports collection, which every
 * trainer may write, so a cross-train visitor may update it too.
 */
import { useMemo, useState } from "react";
import { Check, HeartPulse, TrendingUp, Users } from "lucide-react";
import type { Client, Machine, Trainer } from "../../../types";
import { ClientCheckInPanel } from "../../../components/journal/ClientCheckInPanel";
import { LoadingMark } from "../../../components/LoadingMark";
import type { CheckInDraftState } from "../../subjective-report/useCheckInDraft";
import {
  buildHistoryLog,
  lastUpdated,
  previousFromHistory,
  type AssessmentHistory,
} from "../../subjective-report/assessment-history";
import type { ProgressReportsStatus } from "../../client-profile/client-answer";
import { FORD_META } from "../../ford/types";
import { studioDayKeyOf } from "../../../lib/studio-time";
import { Btn, CardHead, anchorProps, joinDots, plural } from "../kit";
import { NOT_ASKED, dayWords, pulseAreaRows, type PulseSource } from "./pulse-read";

export interface PulseCardProps {
  client: Client;
  authTrainer: Trainer | null;
  machines: Machine[];
  /** The page's ONE draft. */
  draft: CheckInDraftState;
  /** The tab's one read-only history (saved rounds), and whether it answered. */
  history: AssessmentHistory | null;
  historyStatus: ProgressReportsStatus;
  /** Filed progress reports, once the reports are read; null while unknown. */
  filedCount: number | null;
  onOpenReports: () => void;
  /** Whether this reader may read FORD (the stress row's "also shown on FORD"). */
  fordReadable: boolean;
  now: Date;
}

export function PulseCard({
  client,
  authTrainer,
  machines,
  draft,
  history,
  historyStatus,
  filedCount,
  onOpenReports,
  fordReadable,
  now,
}: PulseCardProps) {
  const [editing, setEditing] = useState(false);
  const [handing, setHanding] = useState(false);
  // The editor mounts the first time it is asked for, then stays (hidden).
  const [panelMounted, setPanelMounted] = useState(false);

  const source = useMemo<PulseSource>(
    () => ({
      draft: draft.loading
        ? null
        : draft.hasDraft
          ? {
              assessment: draft.assessment,
              savedAt: draft.savedAt,
              reviewed: draft.reviewed,
              doneIds: draft.sections.filter((s) => s.isDone).map((s) => s.id),
            }
          : null,
      history: historyStatus === "ready" ? history : null,
    }),
    [
      draft.loading,
      draft.hasDraft,
      draft.assessment,
      draft.savedAt,
      draft.reviewed,
      draft.sections,
      history,
      historyStatus,
    ],
  );
  const pillars = useMemo(() => pulseAreaRows(source, now), [source, now]);

  const last = useMemo(() => {
    if (historyStatus !== "ready") return null;
    const rows = buildHistoryLog({
      history,
      draftId: draft.draftId,
      draftChangeLog: draft.hasDraft ? (draft.assessment.changeLog ?? null) : null,
    });
    return lastUpdated(rows, previousFromHistory(history));
  }, [history, historyStatus, draft.draftId, draft.hasDraft, draft.assessment.changeLog]);

  const lastDay = last ? dayWords(studioDayKeyOf(last.at) ?? "", now) : "";
  const lastWords = lastDay ? `last updated ${lastDay}${last?.byName ? ` by ${last.byName}` : ""}` : null;
  const round = draft.loading
    ? null
    : draft.hasDraft
      ? `${draft.doneCount} of ${draft.totalSections} areas this round`
      : "no round open";
  const meta = joinDots([lastWords, round, "one statement shown per area"]);

  const openEditor = () => {
    setPanelMounted(true);
    setEditing(true);
  };
  const handToClient = () => {
    setPanelMounted(true);
    setHanding(true);
  };

  const unknownLine = historyStatus === "failed" ? "Not known: the saved Pulse couldn't be read" : null;

  return (
    <section className="cx-card" {...anchorProps("body-pulse")}>
      <CardHead
        eyebrow="Pulse · the living assessment"
        icon={HeartPulse}
        meta={meta}
        actions={
          authTrainer ? (
            <>
              <Btn icon={Users} onClick={handToClient} disabled={draft.loading}>
                Hand to client
              </Btn>
              {editing ? (
                <Btn variant="live" icon={Check} onClick={() => setEditing(false)}>
                  Done
                </Btn>
              ) : (
                <Btn variant="live" onClick={openEditor}>
                  Update Pulse
                </Btn>
              )}
            </>
          ) : null
        }
      />

      {!editing ? (
        historyStatus === "loading" ? (
          <LoadingMark size="sm" label="Loading the Pulse…" />
        ) : (
          <>
            {historyStatus === "failed" ? (
              <p className="bp-quiet">
                The Pulse history couldn't be loaded just now. What the open round holds is shown; the rest is unknown,
                not unasked.
              </p>
            ) : null}
            <div className="bp-pulse">
              {pillars.map((p) => (
                <div key={p.title} className="bp-pa">
                  <h4 className="bp-pa__title">{p.title}</h4>
                  {p.rows.map((r) => {
                    const ford =
                      fordReadable && r.alsoOnFord.length > 0
                        ? ` · also shown on FORD · ${r.alsoOnFord.map((x) => FORD_META[x].label).join(", ")}`
                        : "";
                    const line = r.line === NOT_ASKED && unknownLine ? unknownLine : r.line;
                    return (
                      <div key={r.id} className="bp-pa__row" data-stale={r.stale ? "" : undefined}>
                        <span className="bp-pa__name">{r.title}</span>
                        <span className="bp-pa__line">{`${line}${ford}`}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )
      ) : null}

      {panelMounted ? (
        <div className="bp-pulse-editor" hidden={!editing}>
          <ClientCheckInPanel
            client={client}
            trainer={authTrainer}
            machines={machines}
            draft={draft}
            startInClientMode={handing}
            onClientModeClose={() => setHanding(false)}
          />
        </div>
      ) : null}

      <div>
        <Btn variant="quiet" icon={TrendingUp} onClick={onOpenReports}>
          {filedCount === null
            ? "Filed reports · Activity Archive"
            : filedCount === 0
              ? "No filed reports yet · Activity Archive"
              : `${plural(filedCount, "filed report")} · Activity Archive`}
        </Btn>
      </div>
    </section>
  );
}
