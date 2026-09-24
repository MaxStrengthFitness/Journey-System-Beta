/**
 * The InBody card: a client's body composition, kept for good.
 *
 * Lives on Notes & Profile → Body & Pulse, last on the page ("Body
 * composition · InBody"). The printout's "Body Composition History" block
 * keeps eight tests; this keeps all of them, on the iPad, during a session.
 *
 *   - the latest scan's four headline numbers, each with its change since
 *     the first scan (muscle up and fat down in green). A change inside the
 *     client's home studio's InBody variation keeps its number but is not
 *     called a change (variation.ts), and carries no colour
 *   - weight, muscle and body-fat trend lines once there are two scans —
 *     unless the host draws the trends itself (`showTrends={false}`: Body &
 *     Pulse's timeline does)
 *   - every scan, newest first; tap one to correct or remove it. A row wraps
 *     rather than cutting its numbers, and who entered it shows at every width
 *
 * Client codex, Sep 2026 (phase 12): drawn with the codex kit and its tokens
 * (it was Tailwind emerald / amber / sky / slate) — good is --cx-ok, a change
 * worth watching is plum --cx-warn, anything else the muted ink.
 *
 * Reading follows the client (whoever can open the profile). Recording and
 * removing follow features/inbody/access.ts, which mirrors firestore.rules.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Scale } from "lucide-react";
import { auth } from "../../firebase";
import { studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import { Btn, Card, EmptyLine, Meta, cls } from "../client-codex/kit";
import { useInBodyScans, type InBodyScansState } from "./useInBodyScans";
import { InBodyScanDialog } from "./InBodyScanDialog";
import { InBodyTrend } from "./InBodyTrend";
import { canRecordInBody, canRemoveInBodyScan } from "./access";
import { useInBodyVariation } from "./useInBodyVariation";
import {
  changeBetween,
  changeTone,
  formatCalledChange,
  formatMeasure,
  scanDateLabel,
  sortScans,
  summarizeScans,
  summarySentence,
  trendPoints,
  type MeasureKey,
} from "./scans";
import type { InBodyScan } from "./types";
import "./inbody-card.css";

const HEADLINE: { key: MeasureKey; label: string }[] = [
  { key: "weightLb", label: "Weight" },
  { key: "skeletalMuscleMassLb", label: "Skeletal muscle" },
  { key: "bodyFatMassLb", label: "Body fat mass" },
  { key: "percentBodyFat", label: "Body fat" },
];

/** The trend lines the printout draws, with the smallest span each shows. */
const TRENDS: { key: MeasureKey; label: string; minSpan: number }[] = [
  { key: "weightLb", label: "Weight", minSpan: 6 },
  { key: "skeletalMuscleMassLb", label: "Skeletal muscle", minSpan: 3 },
  { key: "percentBodyFat", label: "Body fat %", minSpan: 3 },
];

export interface InBodyCardProps {
  client: Client;
  authTrainer: Trainer | null;
  /**
   * This client's scans, already streaming (client codex): the Notes &
   * Profile tab reads them ONCE and shares the result with every page that
   * needs them, so the card opens no listener of its own when it is given
   * one. Left out, the card reads the scans itself, as it always has.
   */
  inbody?: InBodyScansState;
  /**
   * Draw the trend lines (the default). Body & Pulse passes false: its
   * timeline draws the trends, and the card keeps the numbers and the scans.
   */
  showTrends?: boolean;
}

export function InBodyCard({ client, authTrainer, inbody, showTrends = true }: InBodyCardProps) {
  const today = studioTodayKey();
  // What counts as a change: the client's HOME studio's numbers, wherever
  // the profile is opened (variation.ts).
  const variation = useInBodyVariation(client);
  // Disabled rather than skipped when scans are handed in (hooks cannot be
  // conditional); a disabled useInBodyScans opens no listener.
  const own = useInBodyScans(client.id ?? null, !inbody);
  const { scans, loading, error } = inbody ?? own;
  const ordered = useMemo(() => sortScans(scans), [scans]);
  const [editing, setEditing] = useState<InBodyScan | "new" | null>(null);
  const [showAll, setShowAll] = useState(false);

  const studioId = client.homeStudioId ?? null;
  const canRecord = canRecordInBody(authTrainer, studioId);
  const uid = auth.currentUser?.uid ?? null;

  const latest = ordered[ordered.length - 1] ?? null;
  const first = ordered.length >= 2 ? ordered[0] : null;
  const summary = useMemo(() => summarizeScans(ordered), [ordered]);
  const editingScan = editing && editing !== "new" ? editing : null;

  return (
    <Card
      className="ib-card cx-kit"
      eyebrow="Body composition · InBody"
      icon={Scale}
      actions={
        canRecord ? (
          <Btn variant="live" icon={Plus} onClick={() => setEditing("new")}>
            Add scan
          </Btn>
        ) : null
      }
    >
      {error ? (
        <p className="ib-quiet">{error}</p>
      ) : loading ? (
        <p className="ib-quiet">Loading scans…</p>
      ) : !latest ? (
        <EmptyLine>
          {`No InBody scans yet. ${
            canRecord
              ? "Add one from the printout — the Renewal Brief and progress reports pick it up from here."
              : "Trainers at this client's studio can add them from the printout."
          }`}
        </EmptyLine>
      ) : (
        <>
          <p className="ib-meta">
            Latest: <b className="ib-strong">{scanDateLabel(latest.testedAt, today)}</b>
            {latest.device ? ` · ${latest.device}` : ""}
            {first ? ` · compared with the first scan, ${scanDateLabel(first.testedAt, today)}` : ""}
          </p>

          <div className="ib-tiles">
            {HEADLINE.map((h) => {
              const delta = changeBetween(first, latest, h.key);
              return (
                <div key={h.key} className="ib-tile">
                  <span className="ib-tile__label">{h.label}</span>
                  <span className="ib-tile__value">{formatMeasure(latest[h.key], h.key)}</span>
                  {delta !== null ? (
                    <span className="ib-tile__change" data-tone={changeTone(h.key, delta, variation)}>
                      {formatCalledChange(delta, h.key, variation)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          {summary && summary.scanCount >= 2 ? (
            <p className="ib-summary">{summarySentence(summary, today, variation)}</p>
          ) : null}

          {showTrends ? (
            ordered.length >= 2 ? (
              <div className="ib-trends">
                {TRENDS.map((t) => (
                  <InBodyTrend
                    key={t.key}
                    points={trendPoints(ordered, t.key)}
                    measure={t.key}
                    label={t.label}
                    minSpan={t.minSpan}
                    today={today}
                  />
                ))}
              </div>
            ) : (
              <p className="ib-quiet">Trend lines appear after the second scan.</p>
            )
          ) : null}

          <div className="ib-all">
            <Btn
              variant="quiet"
              icon={showAll ? ChevronDown : ChevronRight}
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
            >
              {`Every scan (${ordered.length})`}
            </Btn>
            {showAll ? (
              <ul className="ib-scans">
                {[...ordered].reverse().map((s) => {
                  const row = (
                    <>
                      <span className="ib-scan__date">{scanDateLabel(s.testedAt, today)}</span>
                      <span className="ib-scan__values">
                        {formatMeasure(s.weightLb, "weightLb")} · muscle{" "}
                        {formatMeasure(s.skeletalMuscleMassLb, "skeletalMuscleMassLb")} · fat{" "}
                        {formatMeasure(s.percentBodyFat, "percentBodyFat")}
                      </span>
                      {s.enteredByName ? <Meta className="ib-scan__by">{s.enteredByName}</Meta> : null}
                    </>
                  );
                  return (
                    <li key={s.id}>
                      {canRecord ? (
                        <button
                          type="button"
                          className={cls("ib-scan", "ib-scan--button")}
                          onClick={() => setEditing(s)}
                          aria-label={`Correct or remove the ${scanDateLabel(s.testedAt, today)} scan`}
                        >
                          {row}
                          <ChevronRight className="ib-scan__chev" size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="ib-scan">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </>
      )}

      {canRecord && (
        <InBodyScanDialog
          open={editing !== null}
          onClose={() => setEditing(null)}
          client={client}
          scan={editingScan}
          scans={ordered}
          authTrainer={authTrainer}
          canRemove={editingScan ? canRemoveInBodyScan(authTrainer, uid, editingScan, studioId) : false}
        />
      )}
    </Card>
  );
}
