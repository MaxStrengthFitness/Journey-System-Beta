/**
 * MACHINE TRENDS — the panel on a machine's Catalog page.
 *
 * Round: the Machine Trends screen, Sep 19 2026. The weekly job has written
 * `machineTrends/*` since the cost round and nothing displayed it; this is the
 * screen, and it lives where a trainer already stands when the question comes
 * up — the machine's own page in Learning -> Catalog.
 *
 * WHAT IT ANSWERS
 * ---------------
 *   "What are people set to on this machine?"   the settings table
 *   "And what do they lift there?"               the median best beside it
 *   "What about someone this client's size?"     the height table
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It names nobody. `machineTrends/*` is readable by any signed-in trainer and
 * clients are studio-scoped, so the document holds counts and medians and no
 * client rows at all — there is no version of this screen that lists people,
 * and that is the point rather than a limitation. It is also not a ranking:
 * the values are ordered by how many people use them, which is a description
 * of the floor, not a score anyone is winning.
 *
 * COST
 * ----
 * One document read per machine per app session, through the same
 * module-level cache the Settings card uses (`useMachineTrend.ts`). Opening
 * the panel on a machine the trainer already set someone up on today costs
 * nothing. The read is gated on the panel being open, so a trainer who never
 * expands it never pays for it.
 */

import { useEffect, useState } from "react";
import { fetchMachineTrendRead } from "../equipment/useMachineTrend";
import {
  WITHHELD_LABEL,
  headlineFor,
  loadSentence,
  presentMachineTrends,
  type MachineTrendDoc,
  type MachineTrendsView,
} from "./present";
import "./machine-trends.css";

export interface MachineTrendsPanelProps {
  machineId: string;
  /**
   * The host's foldable state. The read only happens once this is true, so a
   * closed panel costs nothing at all.
   */
  active: boolean;
}

/** Local mirror of the hook's result so the panel can say "still loading". */
type PanelState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; view: MachineTrendsView };

export function MachineTrendsPanel({ machineId, active }: MachineTrendsPanelProps) {
  const [state, setState] = useState<PanelState>({ status: "idle" });

  useEffect(() => {
    if (!active || !machineId) return;
    let alive = true;
    setState({ status: "loading" });
    fetchMachineTrendRead(machineId).then((read) => {
      if (!alive) return;
      setState({
        status: "done",
        view: presentMachineTrends({ trend: read.trend as MachineTrendDoc | null, failed: read.failed }),
      });
    });
    return () => {
      alive = false;
    };
  }, [machineId, active]);

  if (state.status !== "done") {
    return <p className="mt__quiet">Reading how this machine is used…</p>;
  }

  const { view } = state;
  const headline = headlineFor(view);

  if (view.kind !== "ready") {
    return (
      <div className="mt__panel">
        <p className="mt__lead">{headline}</p>
        {view.kind === "unreadable" && (
          <p className="mt__quiet">
            That is "we could not look", not "nobody trains here". Try again in a moment.
          </p>
        )}
        {view.kind === "thin" && (
          <p className="mt__quiet">
            {view.sets} {view.sets === 1 ? "set" : "sets"} recorded. The weekly job fills this in as more
            people train on it.
          </p>
        )}
      </div>
    );
  }

  const load = loadSentence(view.load);

  return (
    <div className="mt__panel">
      <p className="mt__lead">{headline}</p>
      {load ? <p className="mt__lead">{load}</p> : null}

      {view.settings.length > 0 && (
        <section className="mt__block" aria-labelledby="mt-settings-head">
          <h3 className="mt__head" id="mt-settings-head">
            What people are set to
          </h3>
          {view.settings.map((group) => (
            <div className="mt__group" key={group.key}>
              <div className="mt__group-name">{group.label}</div>
              <table className="mt__table">
                <thead>
                  <tr>
                    <th scope="col">Value</th>
                    <th scope="col">Clients</th>
                    <th scope="col">Sets</th>
                    <th scope="col">Median best</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.value}>
                      <th scope="row">{row.value}</th>
                      <td>
                        <span className="mt__bar" aria-hidden>
                          <span
                            className="mt__bar-fill"
                            style={{ width: `${Math.round((row.clients / Math.max(1, group.rows[0].clients)) * 100)}%` }}
                          />
                        </span>
                        {row.clients}
                      </td>
                      <td>{row.sets}</td>
                      <td>
                        {row.medianBest === null ? (
                          <span className="mt__withheld">{WITHHELD_LABEL}</span>
                        ) : (
                          `${Math.round(row.medianBest)} lb`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {view.heights.length > 0 && (
        <section className="mt__block" aria-labelledby="mt-heights-head">
          <h3 className="mt__head" id="mt-heights-head">
            By height
          </h3>
          <table className="mt__table">
            <thead>
              <tr>
                <th scope="col">Height</th>
                <th scope="col">Clients</th>
                <th scope="col">Median best</th>
              </tr>
            </thead>
            <tbody>
              {view.heights.map((h) => (
                <tr key={h.inches}>
                  <th scope="row">{h.label}</th>
                  <td>{h.clients}</td>
                  <td>
                    {h.medianBest === null ? (
                      <span className="mt__withheld">{WITHHELD_LABEL}</span>
                    ) : (
                      `${Math.round(h.medianBest)} lb`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="mt__quiet">
        Every MSF studio, no names. A median is left out where fewer than five clients sit on a
        value.
        {view.asOf ? ` Built ${new Date(view.asOf).toLocaleDateString()}.` : ""}
      </p>
    </div>
  );
}
