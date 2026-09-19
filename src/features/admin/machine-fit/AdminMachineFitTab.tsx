/**
 * Operations → Machine fit. The Kaizen report.
 *
 * The Setup screen (Programming → Setup, on a client's profile) looks at one
 * CLIENT across every machine. This looks at one MACHINE across every client,
 * and answers what AJ's brief asked a head trainer to be able to see:
 *
 *   "For each machine, what are clients who are 5'7" set to versus clients
 *    who are 5'4"… and for each setting, how many clients use it, what body
 *    types they are and their average height."
 *
 * TWO SCOPES, ONE SCREEN
 *   This studio     leaders and up. Live, built in the browser from the
 *                   studio's own index and the client list the app already
 *                   holds. It may name clients ("Worth a look"), because a
 *                   leader may see their own — and a tap opens that client's
 *                   Setup on Check.
 *   All MSF studios administrators. The weekly job's stored report: every
 *                   studio pooled, named studios, never a named client.
 *
 * READ-ONLY. Nothing here saves, so there is no SaveBar; the one action is
 * opening a client. It follows the admin README otherwise: kit primitives,
 * admin tokens, plain studio English.
 *
 * SENTENCES, NOT SCORES. A cell that rests on fewer than the named minimum
 * says "not enough data yet". A link between height and a setting is said in
 * words, never as a coefficient. Studios are described, never ranked.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ruler } from "lucide-react";
import type { Client, Machine, Studio } from "../../../types";
import { LoadingArea } from "../../../components/LoadingMark";
import { clientDisplayName } from "../../../lib/client-name";
import { writeStoredLocation } from "../../client-profile/profile-nav";
import { displayValue } from "../../equipment/setting-suggestions";
import type { KaizenReport, SubjectFinding } from "../../machine-fit/kaizen";
import { MIN_CLIENTS } from "../../machine-fit/match-spec";
import { fieldByNk, shownValue } from "../../machine-fit/ui/field-values";
import { useFitFloor } from "./useFitFloor";
import {
  NOT_ENOUGH,
  bandLabel,
  bodyLine,
  checkSentence,
  coverageSentence,
  habitSentence,
  linkSentences,
  studioSentence,
} from "../../machine-fit/ui/kaizen-sentences";
import { writeSetupHint } from "../../machine-fit/ui/open-hint";
import { flagSentence } from "../../machine-fit/ui/sentences";
import {
  AdminBadge,
  AdminEmpty,
  AdminHeader,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminScreen,
  AdminSelect,
  AdminStatTile,
  AdminTiles,
} from "../primitives";
import {
  useCompanyFitReport,
  useCompanyFitSummary,
  useStudioFitReports,
} from "./useMachineFitReports";
import "./machine-fit-admin.css";
import { PickOneStudio, useOperationsScope } from "../scope-context";

type Scope = "studio" | "company";

interface Props {
  machines: Machine[];
  /** The active studio's client list, as the app already holds it. */
  clients: Client[];
  studios: Studio[];
  activeStudioId: string | null;
  /** Administrators and founders: the only people the rules let read the company report. */
  isAdmin: boolean;
  onNavigateProfile?: (clientId: string) => void;
}

/** "back-pad" → "Back pad": for a setting the catalog does not know (an old label still on file). */
const plainKey = (key: string) => {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
};

export function AdminMachineFitTab({ machines, clients, studios, activeStudioId, isAdmin, onNavigateProfile }: Props) {
  const [scope, setScope] = useState<Scope>("studio");
  // Under "All my studios" (Operations round) the studio half is a prompt;
  // the company half is the weekly report and needs no studio.
  const ops = useOperationsScope();
  const [machineId, setMachineId] = useState<string | null>(null);
  const activeStudio = studios.find((s) => s.id === activeStudioId) ?? null;

  /* ---------------- the floor: every machine, its fields, the floor's order (useFitFloor) ---------------- */

  const { floor, floorById, fieldsOf } = useFitFloor(machines, activeStudio);

  /* ---------------- data ---------------- */

  const studio = useStudioFitReports(activeStudioId, clients, fieldsOf, scope === "studio");
  const companySummary = useCompanyFitSummary(scope === "company" && isAdmin);
  const companyReport = useCompanyFitReport(machineId, scope === "company" && isAdmin);

  /** One list for both scopes: the floor's machines, plus any the data names that the floor does not. */
  const list = useMemo(() => {
    const counts = new Map<string, { onFile: number; unusual: number }>();
    if (scope === "studio") {
      for (const [id, r] of Object.entries(studio.byMachine)) counts.set(id, { onFile: r.report.onFile, unusual: r.report.unusual });
    } else {
      for (const [id, m] of Object.entries(companySummary.summary?.machines ?? {})) counts.set(id, { onFile: m.onFile, unusual: m.unusual });
    }
    const rows = floor.map((m) => ({ id: m.id, name: m.name, ...(counts.get(m.id) ?? { onFile: 0, unusual: 0 }) }));
    for (const [id, c] of counts) if (!floorById.has(id)) rows.push({ id, name: id, ...c });
    return rows;
  }, [scope, studio.byMachine, companySummary.summary, floor, floorById]);

  const status = scope === "studio" ? studio.status : companySummary.status;

  // Open on the first machine anybody is set up on, not on an empty one — so
  // wait for the counts. (Choosing on the first render, before the index had
  // answered, always landed on the top of the floor with "nobody set up".)
  // Once a person has picked a machine, a scope switch keeps it.
  const pickedByHand = useRef(false);
  useEffect(() => {
    if (status !== "ready") return;
    const stillThere = machineId !== null && list.some((m) => m.id === machineId);
    if (stillThere && pickedByHand.current) return;
    if (stillThere && (list.find((m) => m.id === machineId)?.onFile ?? 0) > 0) return;
    const first = list.find((m) => m.onFile > 0) ?? list[0];
    if (first && first.id !== machineId) setMachineId(first.id);
  }, [status, list, machineId]);
  const pickMachine = (id: string | null) => {
    pickedByHand.current = true;
    setMachineId(id);
  };

  const selected = list.find((m) => m.id === machineId) ?? null;
  const machine = machineId ? (floorById.get(machineId) ?? null) : null;

  const fieldOrder = useMemo(() => machine?.fields.map((f) => f.nk) ?? [], [machine]);

  const show = useMemo(() => {
    const byNk = fieldByNk(machine?.fields ?? []);
    return {
      label: (key: string) => byNk.get(key)?.label ?? plainKey(key),
      value: (key: string, value: string) => {
        const f = byNk.get(key);
        return f ? shownValue(f, value) : displayValue(value, null);
      },
    };
  }, [machine]);

  const report: KaizenReport | null =
    scope === "studio" ? (machineId ? (studio.byMachine[machineId]?.report ?? null) : null) : companyReport.report;
  const findings: SubjectFinding[] = scope === "studio" && machineId ? (studio.byMachine[machineId]?.findings ?? []) : [];

  const clientsById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const studioName = (id: string) => studios.find((s) => s.id === id)?.name ?? id;

  const openClient = (clientId: string) => {
    // Her profile resumes wherever its stored location says; send it to
    // Programming → Setup, on Check (ui/open-hint.ts).
    writeStoredLocation(clientId, { tab: "programming", view: "setup" });
    writeSetupHint(clientId, "check");
    onNavigateProfile?.(clientId);
  };

  const builtAt = scope === "company" ? (companySummary.summary?.builtAt ?? null) : null;

  return (
    <AdminScreen>
      <AdminHeader
        icon={<Ruler className="w-5 h-5" />}
        title="Machine fit"
        subtitle="Where clients of each build are set on every machine — and who is set somewhere unusual."
        actions={
          isAdmin ? (
            <div className="adm-segmented" role="tablist" aria-label="Which studios">
              <button type="button" role="tab" className="adm-seg" aria-selected={scope === "studio"} onClick={() => setScope("studio")}>
                This studio
              </button>
              <button type="button" role="tab" className="adm-seg" aria-selected={scope === "company"} onClick={() => setScope("company")}>
                All MSF studios
              </button>
            </div>
          ) : undefined
        }
      />

      <p className="adm-fit-scope">
        {scope === "studio"
          ? `${activeStudio?.name ?? "This studio"}, live: every set-up saved here counts straight away.`
          : builtAt
            ? `Every studio pooled. Rebuilt weekly — last built ${new Date(builtAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}. Studios are named; clients never are.`
            : "Every studio pooled. Rebuilt weekly. Studios are named; clients never are."}
      </p>

      {!activeStudioId && scope === "studio" ? (
        ops.scope.kind === "all" ? (
          <PickOneStudio what="Machine fit" />
        ) : (
          <AdminNotice tone="info">Choose a studio to see its machine fit.</AdminNotice>
        )
      ) : status === "failed" ? (
        <AdminNotice tone="warn">
          {scope === "studio"
            ? "This studio's set-ups could not be loaded just now. Nothing is wrong with them — try again in a moment."
            : "The company report could not be loaded just now. Try again in a moment."}
        </AdminNotice>
      ) : status !== "ready" ? (
        <LoadingArea label="Loading machine set-ups…" />
      ) : scope === "company" && !companySummary.summary ? (
        <AdminEmpty title="No company report yet">
          The weekly job builds it on Sunday night. To build it now, run the machine-trends script from the PC with
          --commit (the round document has the steps).
        </AdminEmpty>
      ) : (
        <>
          {scope === "studio" && studio.rowsOffList > 0 ? (
            <AdminNotice tone="info">
              {studio.rowsOffList} saved {studio.rowsOffList === 1 ? "set-up belongs" : "set-ups belong"} to clients who are not on
              this studio's list (they moved studio, or the list is still loading) and {studio.rowsOffList === 1 ? "is" : "are"} left
              out.
            </AdminNotice>
          ) : null}

          <div className="adm-fit">
            {/* Landscape: a list to scan. Portrait: the same list as a select. */}
            <AdminPanel title="Machines" subtitle="In the floor's order" flush className="adm-fit__list">
              <AdminRows>
                {list.map((m) => (
                  <AdminRow
                    key={m.id}
                    className={m.id === machineId ? "adm-fit__machine adm-fit__machine--on" : "adm-fit__machine"}
                    name={m.name}
                    meta={m.onFile === 0 ? "Nobody set up yet" : `${m.onFile} set up`}
                    trailing={m.unusual > 0 ? <AdminBadge tone="warn">{m.unusual} to look at</AdminBadge> : undefined}
                    onClick={() => pickMachine(m.id)}
                  />
                ))}
              </AdminRows>
            </AdminPanel>

            <div className="adm-fit__pick">
              <label className="adm-label" htmlFor="adm-fit-machine">
                Machine
              </label>
              <AdminSelect id="adm-fit-machine" value={machineId ?? ""} onChange={(e) => pickMachine(e.target.value || null)}>
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.onFile === 0 ? "nobody set up yet" : `${m.onFile} set up`}
                    {m.unusual > 0 ? `, ${m.unusual} to look at` : ""}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div className="adm-fit__detail">
              {!selected ? (
                <AdminEmpty title="No machines on this floor yet" />
              ) : scope === "company" && companyReport.status === "failed" ? (
                <AdminNotice tone="warn">This machine's report could not be loaded just now.</AdminNotice>
              ) : scope === "company" && companyReport.status !== "ready" ? (
                <LoadingArea label="Loading the report…" />
              ) : !report || report.onFile === 0 ? (
                <AdminEmpty title={selected.name}>
                  {scope === "studio" ? "Nobody at this studio is set up on this machine yet." : "Nobody is set up on this machine yet."}{" "}
                  Set-ups are saved from a client's profile: Programming → Setup.
                </AdminEmpty>
              ) : (
                <FitReport
                  name={selected.name}
                  report={report}
                  fieldOrder={fieldOrder}
                  scope={scope}
                  show={show}
                  findings={findings}
                  clientName={(id) => {
                    const c = clientsById.get(id);
                    return c ? clientDisplayName(c) : "A client";
                  }}
                  studioName={studioName}
                  onOpenClient={onNavigateProfile ? openClient : undefined}
                />
              )}
            </div>
          </div>
        </>
      )}
    </AdminScreen>
  );
}

/* ==================================================================== *
 * One machine's report
 * ==================================================================== */

interface FitReportProps {
  name: string;
  report: KaizenReport;
  /** The machine's own field order. The weekly job has no catalog and lists fields by use; the screen puts them back. */
  fieldOrder: readonly string[];
  scope: Scope;
  show: { label: (key: string) => string; value: (key: string, value: string) => string };
  findings: SubjectFinding[];
  clientName: (clientId: string) => string;
  studioName: (studioId: string) => string;
  onOpenClient?: (clientId: string) => void;
}

function FitReport({ name, report, fieldOrder, scope, show, findings, clientName, studioName, onOpenClient }: FitReportProps) {
  const keys = useMemo(() => {
    const present = report.fieldKeys.filter((k) => report.fields[k]);
    const known = fieldOrder.filter((k) => present.includes(k));
    return [...known, ...present.filter((k) => !known.includes(k))];
  }, [report, fieldOrder]);
  const [fieldKey, setFieldKey] = useState<string | null>(keys[0] ?? null);
  useEffect(() => {
    if (!fieldKey || !keys.includes(fieldKey)) setFieldKey(keys[0] ?? null);
  }, [keys, fieldKey]);

  const field = fieldKey ? report.fields[fieldKey] : null;
  const bands = keys.length > 0 ? report.fields[keys[0]].bands : [];
  const studioIds = Object.keys(report.byStudio);

  return (
    <div className="adm-fit-report">
      <div className="adm-fit-report__head">
        <h2 className="adm-fit-report__name">{name}</h2>
        <p className="adm-fit-report__line">{coverageSentence(report, scope)}</p>
        <p className="adm-fit-report__line">{checkSentence(report)}</p>
      </div>

      <AdminTiles>
        <AdminStatTile label="Set up" value={report.onFile} foot={scope === "company" ? `${report.studios} studios` : "clients at this studio"} />
        <AdminStatTile label="With a height on file" value={report.withHeight} foot="what 'by height' is built from" />
        <AdminStatTile label="Could be compared" value={report.checked} foot={`needs ${MIN_CLIENTS} similar clients`} />
        {/* No tone: the kit's attention colour reads as red, and red here is rep quality's. */}
        <AdminStatTile label="Worth a look" value={report.unusual} foot="set where nobody similar is" />
      </AdminTiles>

      {/* ---- worth a look (this studio only: it names clients) ---- */}
      {scope === "studio" && findings.length > 0 ? (
        <AdminPanel
          title="Worth a look"
          subtitle="Set somewhere nobody of a similar build is, and not yet marked right for them. It may well be right — a look is all this asks."
          flush
        >
          <AdminRows>
            {findings.map((f) => (
              <AdminRow
                key={f.clientId}
                className="adm-fit-finding"
                name={clientName(f.clientId)}
                meta={
                  <span className="adm-fit-finding__why">
                    {f.flags.map((flag) => flagSentence(flag, show, f.cohort, "studio")).join(" ")}
                  </span>
                }
                trailing={onOpenClient ? <span className="adm-fit-finding__go">Open set-up</span> : undefined}
                onClick={onOpenClient ? () => onOpenClient(f.clientId) : undefined}
              />
            ))}
          </AdminRows>
        </AdminPanel>
      ) : null}

      {/* ---- what follows what ---- */}
      <AdminPanel title="What follows what" subtitle="Whether each setting can be predicted from a client's build on this machine.">
        <ul className="adm-fit-sentences">
          {keys.flatMap((k) => linkSentences(show.label(k), report.fields[k]).map((s, i) => <li key={`${k}-${i}`}>{s}</li>))}
        </ul>
      </AdminPanel>

      {/* ---- by height ---- */}
      <AdminPanel
        title="By height"
        subtitle={`Where clients of each height are mostly set. A band is as narrow as the data allows, and needs ${MIN_CLIENTS} clients to say anything.`}
        flush
      >
        {bands.length === 0 ? (
          <p className="adm-fit-none">No heights on file for the clients set up on this machine — {NOT_ENOUGH}.</p>
        ) : (
          <div className="adm-fit-tablewrap">
            <table className="adm-fit-table">
              <thead>
                <tr>
                  <th scope="col">Height</th>
                  <th scope="col" className="adm-fit-table__num">
                    Clients
                  </th>
                  {keys.map((k) => (
                    <th key={k} scope="col">
                      {show.label(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bands.map((band, row) => (
                  <tr key={`${band.from}-${band.to}`}>
                    <th scope="row">{bandLabel(band)}</th>
                    <td className="adm-fit-table__num">{band.clients}</td>
                    {band.clients < MIN_CLIENTS ? (
                      <td colSpan={keys.length} className="adm-fit-table__thin">
                        {NOT_ENOUGH}
                      </td>
                    ) : (
                      keys.map((k) => {
                        const cell = report.fields[k].bands[row];
                        if (!cell || !cell.top) {
                          return (
                            <td key={k} className="adm-fit-table__thin">
                              {NOT_ENOUGH}
                            </td>
                          );
                        }
                        return (
                          <td key={k}>
                            <span className="adm-fit-cell__top">{show.value(k, cell.top.value)}</span>
                            <span className="adm-fit-cell__of">
                              {cell.top.clients} of {cell.withField}
                            </span>
                            {cell.next ? (
                              <span className="adm-fit-cell__next">
                                then {show.value(k, cell.next.value)} ({cell.next.clients})
                              </span>
                            ) : null}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {/* ---- by setting ---- */}
      <AdminPanel
        title="By setting"
        subtitle="Who is on each value. An average needs five clients behind it."
        actions={
          keys.length > 1 ? (
            <div className="adm-segmented adm-fit-fields" role="tablist" aria-label="Which setting">
              {keys.map((k) => (
                <button key={k} type="button" role="tab" className="adm-seg" aria-selected={fieldKey === k} onClick={() => setFieldKey(k)}>
                  {show.label(k)}
                </button>
              ))}
            </div>
          ) : undefined
        }
        flush
      >
        {!field || field.values.length === 0 ? (
          <p className="adm-fit-none">Nobody has this setting filled in yet.</p>
        ) : (
          <div className="adm-fit-tablewrap">
            <table className="adm-fit-table">
              <thead>
                <tr>
                  <th scope="col">{show.label(field.key)}</th>
                  <th scope="col" className="adm-fit-table__num">
                    Clients
                  </th>
                  <th scope="col" className="adm-fit-table__bar" aria-hidden="true" />
                  <th scope="col">Who they are</th>
                </tr>
              </thead>
              <tbody>
                {field.values.map((v) => (
                  <tr key={v.value}>
                    <th scope="row" className="adm-fit-table__value">
                      {show.value(field.key, v.value)}
                    </th>
                    <td className="adm-fit-table__num">{v.clients}</td>
                    <td className="adm-fit-table__bar" aria-hidden="true">
                      <span className="adm-fit-bar">
                        <span className="adm-fit-bar__fill" style={{ width: `${Math.max(2, Math.round(v.share * 100))}%` }} />
                      </span>
                    </td>
                    <td className="adm-fit-table__who">{bodyLine(v)}</td>
                  </tr>
                ))}
                {field.otherClients > 0 ? (
                  <tr>
                    <th scope="row">Other values</th>
                    <td className="adm-fit-table__num">{field.otherClients}</td>
                    <td className="adm-fit-table__bar" aria-hidden="true" />
                    <td className="adm-fit-table__who">Values used by very few clients, not listed one by one.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </AdminPanel>

      {/* ---- whole set-ups ---- */}
      <AdminPanel
        title="Set-ups seen together"
        subtitle="Whole combinations more than one client shares — the settings that move together on this machine."
        flush
      >
        {report.clusters.length === 0 ? (
          <p className="adm-fit-none">No two clients share a whole set-up yet.</p>
        ) : (
          <AdminRows>
            {report.clusters.map((c, i) => (
              <AdminRow
                key={i}
                className="adm-fit-cluster"
                name={
                  <span className="adm-fit-cluster__chips">
                    {Object.entries(c.settings).map(([k, v]) => (
                      <span key={k} className="adm-fit-chip">
                        {show.label(k)} <b>{show.value(k, v)}</b>
                      </span>
                    ))}
                  </span>
                }
                meta={`${c.clients} clients (${Math.round(c.share * 100)}%) · ${bodyLine(c)}`}
              />
            ))}
          </AdminRows>
        )}
      </AdminPanel>

      {/* ---- by studio (company only) ---- */}
      {scope === "company" && studioIds.length > 0 ? (
        <AdminPanel
          title="By studio"
          subtitle="Counts, not a ranking. Every client is compared with similar clients across all studios."
        >
          <ul className="adm-fit-sentences">
            {studioIds.map((id) => (
              <li key={id}>
                {studioSentence(studioName(id), report.byStudio[id])}
                {report.byStudio[id].habits.length > 0 ? (
                  <ul className="adm-fit-sentences adm-fit-sentences--nested">
                    {report.byStudio[id].habits.map((h) => (
                      <li key={h.key}>{habitSentence(h, show)}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </AdminPanel>
      ) : null}
    </div>
  );
}
