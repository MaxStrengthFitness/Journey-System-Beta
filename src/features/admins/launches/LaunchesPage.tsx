/**
 * ADMINS → STUDIOS → LAUNCHES — the studios opening, block by block, in words.
 *
 * The blueprint's "Openings board", renamed Launches (AJ: yes) so it never
 * clashes with My Studio → Openings. A studio is here while its stage is
 * Setting up or Handed over (set on its page); each is a row that opens its
 * page, with its opening day, a word for each of the five blocks, and where
 * it stands in a sentence. What is overdue across every studio opening is
 * said at the top. Add a studio starts one.
 *
 * The reads: for each studio opening, its checklist's documents and its
 * floor, once when the page opens and again on Check again (useSetupData).
 * A studio whose checklist couldn't be read says so on its row.
 */
import { useMemo, useState } from "react";
import { Plus, RefreshCw, Rocket } from "lucide-react";
import type { FranchiseNetwork, Studio, Trainer } from "../../../types";
import type { MachineCatalogEntry } from "../../../types/machines";
import { AdminButton, AdminEmpty, AdminHeader, AdminNotice, AdminScreen } from "../../admin/primitives";
import { HqStatus } from "../kit";
import { dayLabel } from "../studios/stages";
import {
  blocksOf,
  buildChecklist,
  isLaunching,
  openingDayOf,
  readiness,
  stageLine,
  stageOf,
  todayFor,
  type ChecklistItem,
} from "./checklist";
import { AddStudioSheet } from "./AddStudioSheet";
import { LOADING_SETUP, useSetupData } from "./useSetupData";
import "../admins.css";

export interface LaunchesPageProps {
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  authTrainer: Trainer;
  catalog: MachineCatalogEntry[];
  catalogLoading: boolean;
  onOpenStudio: (studioId: string) => void;
  onRefresh?: (collectionName: "studios" | "networks" | "trainers") => Promise<void>;
}

/** Studios opening, soonest first; no opening day last; then by name. */
export function launchingStudios(studios: readonly Studio[]): Studio[] {
  return studios
    .filter((s) => s.id && isLaunching(s))
    .sort((a, b) => (openingDayOf(a) ?? "9999").localeCompare(openingDayOf(b) ?? "9999") || (a.name || "").localeCompare(b.name || ""));
}

export function LaunchesPage({ studios, networks, trainers, authTrainer, catalog, catalogLoading, onOpenStudio, onRefresh }: LaunchesPageProps) {
  const [seq, setSeq] = useState(0);
  const [adding, setAdding] = useState(false);
  const launching = useMemo(() => launchingStudios(studios), [studios]);
  const data = useSetupData(
    useMemo(() => launching.map((s) => s.id!), [launching]),
    seq,
  );

  const rows = launching.map((studio) => {
    const d = data[studio.id!] ?? LOADING_SETUP;
    const facts = { studio, studios, trainers, roster: d.roster, today: todayFor(studio) };
    const items = d.items.state === "ok" ? buildChecklist(facts, d.items.docs) : null;
    return { studio, state: d.items.state, items, blocks: items ? blocksOf(items, facts) : null, ready: items ? readiness(items, stageOf(studio)) : null };
  });
  // What is overdue, one line per studio: its count, and the oldest.
  const overdue: { studio: Studio; items: ChecklistItem[] }[] = rows
    .map((r) => ({ studio: r.studio, items: (r.items ?? []).filter((i) => i.overdue).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? "")) }))
    .filter((x) => x.items.length > 0);

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Rocket className="w-5 h-5" />}
        title="Launches"
        subtitle="The studios opening: each one's setup, block by block, in words. A studio is here while its stage is Setting up or Handed over; its page sets the stage and holds the checklist."
        actions={
          <>
            <AdminButton onClick={() => setSeq((n) => n + 1)}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Check again
            </AdminButton>
            <AdminButton variant="primary" onClick={() => setAdding(true)}>
              <Plus className="w-4 h-4" aria-hidden="true" /> Add a studio
            </AdminButton>
          </>
        }
      />

      {launching.length === 0 ? (
        <AdminEmpty title="No studio is opening right now">
          Add one with Add a studio, or set a studio&apos;s stage to Setting up on its page.
        </AdminEmpty>
      ) : (
        <>
          {overdue.length > 0 ? (
            <AdminNotice tone="warn">
              Overdue:{" "}
              {overdue
                .map(({ studio, items }) =>
                  items.length === 1
                    ? `${studio.name}'s “${items[0].title}”, due ${dayLabel(items[0].dueOn!)}`
                    : `${studio.name}, ${items.length} items, the oldest “${items[0].title}”, due ${dayLabel(items[0].dueOn!)}`,
                )
                .join("; ")}
              .
            </AdminNotice>
          ) : rows.every((r) => r.state === "ok") ? (
            <p className="hq-standing">Nothing is overdue.</p>
          ) : null}

          <div className="hq-launches" role="list" aria-label="Studios opening">
            {rows.map((r) => (
              <div key={r.studio.id} role="listitem">
                <button type="button" className="hq-launch" onClick={() => onOpenStudio(r.studio.id!)} aria-label={`Open ${r.studio.name}'s setup`}>
                  <span className="hq-launch__head">
                    <span className="hq-launch__name">{r.studio.name}</span>
                    <span className="hq-launch__when">{stageLine(r.studio)}</span>
                  </span>
                  {r.state === "loading" ? (
                    <span className="hq-launch__say">Reading its checklist…</span>
                  ) : r.state === "failed" ? (
                    <span className="hq-launch__say">
                      <HqStatus tone="unknown">Couldn&apos;t read its checklist just now</HqStatus>
                    </span>
                  ) : (
                    <>
                      <span className="hq-launch__blocks">
                        {r.blocks!.map((b) => (
                          <span key={b.block} className="hq-launch__cell">
                            <span className="hq-launch__block">{b.title}</span>
                            <HqStatus tone={b.tone}>{b.word}</HqStatus>
                          </span>
                        ))}
                      </span>
                      <span className="hq-launch__say">{r.ready!.sentence}</span>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <AddStudioSheet
        open={adding}
        authTrainer={authTrainer}
        studios={studios}
        networks={networks}
        catalog={catalog}
        catalogLoading={catalogLoading}
        onClose={() => setAdding(false)}
        onCreated={async (id) => {
          setAdding(false);
          await onRefresh?.("networks");
          await onRefresh?.("studios");
          onOpenStudio(id);
        }}
      />
    </AdminScreen>
  );
}
