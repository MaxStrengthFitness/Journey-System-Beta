/**
 * The Renewal Brief — one screen to prepare for the conversation
 * (proposal §4.3). Opened from any row in Operations → Renewals.
 *
 * Health first, because that is what MSF's clients say they came for:
 *   1. their journey   2. health wins   3. strength, in plain words
 *   4. best rhythm (on demand)   5. where they stand   6. options
 *   7. every conversation so far
 *
 * The numbers are worked out fresh for this one client (useLiveRenewal).
 * A leader sets the stage and who is leading here; trainers can't. Nothing
 * on this screen contacts the client.
 */

import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquarePlus, Search, X } from "lucide-react";
import {
  AdminButton,
  AdminEmpty,
  AdminField,
  AdminNotice,
  AdminPanel,
  AdminRow,
  AdminRows,
  AdminSelect,
} from "../primitives";
import { useToast } from "../../../contexts/ToastContext";
import { studioDateKey, studioTodayKey } from "../../../lib/studio-time";
import type { Client, Machine, Trainer } from "../../../types";
import { useLiveRenewal } from "../../renewals/useLiveRenewal";
import {
  updateCycleAsLeader,
  useRenewalCycle,
  useRenewalTouches,
} from "../../renewals/useRenewalCycle";
import { LogConversationDialog } from "../../renewals/LogConversationDialog";
import {
  SITUATION_TONE,
  dayLabel,
  paceSentence,
  situationSentence,
} from "../../renewals/sentences";
import {
  STAGES,
  concernLabel,
  effectiveStage,
  interestLabel,
  latestLine,
  leaningLabel,
} from "../../renewals/conversation";
import { gainSentence, healthLines, journeyLines, strengthGains } from "../../renewals/brief";
import { optionsFor, upgradeVerdict } from "../../renewals/options";
import { useClinicalReport, buildReport, rangeForPreset } from "../../clinical-review";
import type { RenewalStage } from "../../renewals/types";
import "./renewals.css";

export interface RenewalBriefProps {
  client: Client;
  /** People who can lead a conversation at this studio. */
  studioTrainers: Trainer[];
  machines: Machine[];
  trainers: Trainer[];
  authTrainer: Trainer | null;
  canManage: boolean;
  onClose: () => void;
}

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

function signedMoney(n: number | null): string {
  if (n === null || n === 0) return "—";
  return `${n < 0 ? "−" : "+"}${money(Math.abs(n))}`;
}

export function RenewalBrief({
  client,
  studioTrainers,
  machines,
  trainers,
  authTrainer,
  canManage,
  onClose,
}: RenewalBriefProps) {
  const today = studioTodayKey();
  const { success: toastSuccess, error: toastError } = useToast();
  const machineNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of machines) if (m.id && m.name) map[m.id] = m.name;
    return map;
  }, [machines]);
  const { snapshot: s, settings, live, loading, error } = useLiveRenewal(client, { machineNames });
  const studioId = client.homeStudioId;
  const cycleKey = s?.cycleKey ?? null;
  const { cycle } = useRenewalCycle(studioId, cycleKey);
  const { touches } = useRenewalTouches(studioId, cycleKey, true);
  const [logging, setLogging] = useState(false);
  const [saving, setSaving] = useState(false);
  const clinical = useClinicalReport(client.id ?? null, { enabled: true });

  const name = `${client.firstName ?? ""} ${client.lastName ?? ""}`.trim();
  const gains = strengthGains(client, machineNames);
  const options = s ? optionsFor(settings, s.packageKey, s.pacePerWeek) : [];
  const verdict = s ? upgradeVerdict(s, settings) : null;
  const currentTier = s ? settings.packages.find((p) => p.key === s.packageKey) ?? null : null;
  const hasLongerPackage = currentTier ? settings.packages.some((p) => p.months > currentTier.months) : false;
  const health = s ? healthLines(client, s, today) : [];
  const rhythm = useMemo(() => {
    if (clinical.status !== "ready" || !clinical.data) return null;
    const report = buildReport({
      client,
      machines,
      trainers,
      sessions: clinical.data.sessions,
      logs: clinical.data.logs,
      incidents: clinical.data.incidents,
      range: clinical.data.range,
    });
    // Only patterns the Clinical Review calls solid: an early signal is not
    // something to say across the table.
    return report.allInsights.filter((i) => i.kind === "rhythm" && !/early signal/.test(i.evidence));
  }, [clinical.status, clinical.data, client, machines, trainers]);

  // Whoever is leading stays in the list even if they've since moved studio,
  // so the picker never shows "Nobody yet" for a conversation someone owns.
  const leadOptions = useMemo(() => {
    const leadId = cycle?.leadTrainerId ?? null;
    if (!leadId || studioTrainers.some((t) => t.id === leadId)) return studioTrainers;
    const lead = trainers.find((t) => t.id === leadId);
    return lead ? [...studioTrainers, lead] : studioTrainers;
  }, [cycle?.leadTrainerId, studioTrainers, trainers]);

  const setCycle = async (patch: Parameters<typeof updateCycleAsLeader>[3]) => {
    if (!cycleKey || !client.id) return;
    setSaving(true);
    try {
      await updateCycleAsLeader(studioId, cycleKey, { clientId: client.id, clientName: name, cycleKey }, patch);
      toastSuccess("Saved.");
    } catch (err: any) {
      toastError(err?.code === "permission-denied" ? "Only this studio's leaders can change that." : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <div className="adm adm-brief-scrim" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="adm-brief" role="dialog" aria-modal="true" aria-label={`Renewal brief for ${name}`}>
        <div className="adm-brief__head">
          <div className="min-w-0">
            <h2 className="adm-brief__title">{name}</h2>
            <p className="adm-brief__sub">
              {s?.packageLabel ?? "Package not recognized yet"} · {live ? "worked out just now" : loading ? "updating…" : "as of last night"}
            </p>
          </div>
          <AdminButton variant="ghost" iconOnly onClick={onClose} aria-label="Close the brief">
            <X className="w-5 h-5" />
          </AdminButton>
        </div>

        <div className="adm-brief__body">
          {error && <AdminNotice tone="warn">{error}</AdminNotice>}
          {!s ? (
            <AdminEmpty title={loading ? "Working it out…" : "Nothing to show yet"}>
              {loading ? null : "The nightly job hasn't reached this client, and there's no Mindbody data to work from."}
            </AdminEmpty>
          ) : (
            <>
              <p className={`adm-brief__situation adm-brief__situation--${SITUATION_TONE[s.situation]}`}>
                {situationSentence(s, today)}
              </p>

              {canManage && cycleKey && (
                <div className="adm-brief__controls">
                  <AdminField label="Stage" htmlFor="brief-stage">
                    <AdminSelect
                      id="brief-stage"
                      value={effectiveStage(cycle)}
                      disabled={saving}
                      onChange={(e) => void setCycle({ stage: e.target.value as RenewalStage })}
                    >
                      {STAGES.map((st) => (
                        <option key={st.key} value={st.key}>
                          {st.label}
                        </option>
                      ))}
                    </AdminSelect>
                  </AdminField>
                  <AdminField label="Leading the conversation" htmlFor="brief-lead">
                    <AdminSelect
                      id="brief-lead"
                      value={cycle?.leadTrainerId ?? ""}
                      disabled={saving}
                      onChange={(e) => void setCycle({ leadTrainerId: e.target.value || null })}
                    >
                      <option value="">Nobody yet</option>
                      {leadOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.fullName}
                        </option>
                      ))}
                    </AdminSelect>
                  </AdminField>
                  {cycle?.needsLeader && (
                    <AdminButton variant="quiet" disabled={saving} onClick={() => void setCycle({ needsLeader: false })}>
                      Mark the follow-up handled
                    </AdminButton>
                  )}
                </div>
              )}

              <AdminPanel title="1. Their journey">
                <div className="adm-brief__lines">
                  {journeyLines(client, s, settings).map((l) => (
                    <p key={l}>{l}</p>
                  ))}
                </div>
              </AdminPanel>

              <AdminPanel title="2. Health wins" subtitle="Lead with these. Most clients came to be healthy, not to lift more.">
                {health.length === 0 ? (
                  <p className="adm-hint">No InBody scans, check-ins or goal on file yet.</p>
                ) : (
                  <div className="adm-brief__lines">
                    {health.map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                  </div>
                )}
              </AdminPanel>

              <AdminPanel title="3. Strength" subtitle="First logged weight against the latest, machines logged 3+ times.">
                {gains.length === 0 ? (
                  <p className="adm-hint">Not enough machine history in Journey yet.</p>
                ) : (
                  <div className="adm-brief__lines">
                    {s.proof.machinesImproved !== null && s.proof.machinesTracked !== null && (
                      <p className="font-semibold">
                        Stronger on {s.proof.machinesImproved} of {s.proof.machinesTracked} machines
                      </p>
                    )}
                    {gains.map((g) => (
                      <p key={g.machineId}>{gainSentence(g)}</p>
                    ))}
                  </div>
                )}
              </AdminPanel>

              <AdminPanel
                title="4. Best rhythm"
                subtitle="Time-of-day and rest-day patterns from the Clinical Review — only the solid ones."
                actions={
                  clinical.status !== "ready" ? (
                    <AdminButton
                      variant="quiet"
                      size="sm"
                      busy={clinical.status === "loading"}
                      onClick={() => void clinical.generate(rangeForPreset("6m"))}
                    >
                      <Search className="w-3.5 h-3.5" />
                      Look for patterns
                    </AdminButton>
                  ) : undefined
                }
              >
                {clinical.status === "idle" ? (
                  <p className="adm-hint">Loads the last six months of sets for this client, on request.</p>
                ) : clinical.status === "loading" ? (
                  <p className="adm-hint">{clinical.progress || "Loading…"}</p>
                ) : clinical.status === "error" ? (
                  <p className="adm-hint adm-hint--error">{clinical.error}</p>
                ) : rhythm && rhythm.length > 0 ? (
                  <div className="adm-brief__lines">
                    {rhythm.slice(0, 3).map((i) => (
                      <p key={i.id}>
                        <strong>{i.title}.</strong> {i.body} <span className="adm-hint">({i.evidence})</span>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="adm-hint">No solid pattern yet — not enough sessions to say.</p>
                )}
              </AdminPanel>

              <AdminPanel title="5. Where they stand">
                <AdminRows>
                  <AdminRow
                    name="Sessions left"
                    meta={
                      s.sessionsLeft === null
                        ? "Not known"
                        : `${s.sessionsLeft}${s.sessionsLeftSource === "estimate" ? " (estimated)" : ""}${
                            s.paymentsLeft ? ` — ${s.sessionsOnHand ?? 0} on hand, ${s.paymentsLeft} payment${s.paymentsLeft === 1 ? "" : "s"} to come` : ""
                          }`
                    }
                  />
                  <AdminRow
                    name={s.autoRenews === false ? "Billing ends" : "Auto-renews"}
                    meta={
                      s.chargeDate
                        ? `${dayLabel(s.chargeDate, today)}${s.chargeDateSource === "estimate" ? " (estimated)" : ""}`
                        : s.paymentMode === "prepaid"
                          ? "Paid in full — no auto-renew"
                          : "Not known"
                    }
                  />
                  <AdminRow name="Pace" meta={paceSentence(s)} />
                  {s.situation === "will-bank" && (
                    <AdminRow
                      name="Banked when billing ends"
                      meta={`About ${s.bankedAtCharge} sessions. Sessions never expire, so they carry over — decide in Mindbody whether the renewal should wait.`}
                    />
                  )}
                  {s.runOutDate && <AdminRow name="Runs out" meta={`Around ${dayLabel(s.runOutDate, today)} at this pace`} />}
                  {s.flags.map((f) => (
                    <AdminRow key={f.code + f.text} name="Worth knowing" meta={f.text} />
                  ))}
                  {s.dataGaps.map((g) => (
                    <AdminRow key={g} name="Missing" meta={g} />
                  ))}
                </AdminRows>
              </AdminPanel>

              <AdminPanel
                title="6. Options"
                subtitle="The studio's own prices. A longer package lowers every payment."
              >
                <div className="adm-options-wrap">
                  <table className="adm-options">
                    <thead>
                      <tr>
                        <th>Package</th>
                        <th>Per session</th>
                        <th>Every 4 weeks</th>
                        <th>All sessions, monthly</th>
                        <th>Paid in full</th>
                        <th>vs today's rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {options.map((o) => (
                        <tr key={o.tier.key} className={o.isCurrent ? "is-current" : undefined}>
                          <td>
                            {o.tier.label} · {o.tier.months} mo{o.isCurrent ? " (now)" : ""}
                          </td>
                          <td>
                            {money(o.tier.ratePerSession)}
                            {o.perSessionDiff ? ` (${signedMoney(o.perSessionDiff)})` : ""}
                          </td>
                          <td className={o.paymentDiff !== null && o.paymentDiff < 0 ? "is-saving" : undefined}>
                            {money(o.tier.paymentAmount)}
                            {o.paymentDiff ? ` (${signedMoney(o.paymentDiff)})` : ""}
                          </td>
                          <td>{money(o.totalMonthly)}</td>
                          <td>{money(o.totalPrepaid)}</td>
                          <td className={o.savingsVsCurrent !== null && o.savingsVsCurrent > 0 ? "is-saving" : undefined}>
                            {o.savingsVsCurrent !== null && o.savingsVsCurrent > 0
                              ? `${money(o.savingsVsCurrent)} less`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="adm-brief__lines mt-3">
                  {options
                    .filter((o) => o.fitNote)
                    .map((o) => (
                      <p key={o.tier.key}>
                        <strong>{o.tier.label}:</strong> {o.fitNote}
                      </p>
                    ))}
                  {verdict && verdict.candidate && (
                    <AdminNotice tone="ok">
                      A longer package looks like a fit: {verdict.reasons.join(" ")}
                    </AdminNotice>
                  )}
                  {verdict && !verdict.candidate && hasLongerPackage && verdict.blockers.length > 0 && (
                    <p className="adm-hint">
                      Not suggesting a longer package yet: {verdict.blockers.join(" ")}
                    </p>
                  )}
                </div>
              </AdminPanel>

              <AdminPanel
                title="7. Conversations"
                actions={
                  cycleKey ? (
                    <AdminButton variant="primary" size="sm" onClick={() => setLogging(true)}>
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      Log a conversation
                    </AdminButton>
                  ) : undefined
                }
                flush
              >
                {latestLine(cycle, today) && <p className="px-4 pt-3 font-semibold">Latest: {latestLine(cycle, today)}</p>}
                {touches.length === 0 ? (
                  <AdminEmpty title="Nobody has talked to them yet" />
                ) : (
                  <AdminRows>
                    {touches.map((t) => (
                      <AdminRow
                        key={t.id}
                        name={`${leaningLabel(t.leaning)}${t.concerns.length ? ` — ${t.concerns.map(concernLabel).join(", ").toLowerCase()}` : ""}`}
                        meta={[
                          t.authorName,
                          studioDateKey((t.at ?? null) as any) ? dayLabel(studioDateKey(t.at as any), today) : null,
                          t.interestedIn ? `interested in ${interestLabel(t.interestedIn).toLowerCase()}` : null,
                          t.needsLeader ? "asked for a leader" : null,
                          t.note || null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))}
                  </AdminRows>
                )}
              </AdminPanel>
            </>
          )}
        </div>
      </div>
      <LogConversationDialog
        open={logging}
        onClose={() => setLogging(false)}
        client={client}
        snapshot={s}
        trainer={authTrainer}
      />
    </div>
  );

  return createPortal(body, document.body);
}
