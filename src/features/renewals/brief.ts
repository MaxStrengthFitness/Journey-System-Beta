/**
 * RENEWALS — the Renewal Brief, the pure half: one screen to prepare for the
 * conversation (proposal §4.3).
 *
 * Ordered to lead with HEALTH, not bodybuilding — AJ, Sep 10: clients "just
 * want to be healthy, not a body builder", and are intimidated by a big
 * commitment. So: their journey, then health wins, then strength in plain
 * words, then where they stand, then the options.
 */

import { clientSinceLabel } from "../../lib/client-since";
import { CATEGORY_BY_KEY } from "../subjective-report/questions";
import { MIN_MACHINE_SESSIONS } from "./engine";
import { dayLabel, paceSentence } from "./sentences";
import type { Client } from "../../types";
import type { PackageTier, RenewalSettings, RenewalSnapshot } from "./types";

export interface StrengthGain {
  machineId: string;
  name: string;
  first: number;
  last: number;
  pct: number;
  sessions: number;
}

/** The biggest machine gains, first logged weight against the latest. */
export function strengthGains(
  client: Client,
  machineNames: Record<string, string>,
  limit = 5,
): StrengthGain[] {
  const out: StrengthGain[] = [];
  for (const [machineId, stat] of Object.entries(client.machineStats ?? {})) {
    const first = stat?.firstWeight;
    const last = stat?.lastWeight;
    const sessions = stat?.timesPerformed ?? 0;
    const name = machineNames[machineId];
    if (!name || !(typeof first === "number" && first > 0 && typeof last === "number" && last > first)) continue;
    if (sessions < MIN_MACHINE_SESSIONS) continue;
    out.push({ machineId, name, first, last, pct: Math.round(((last - first) / first) * 100), sessions });
  }
  return out.sort((a, b) => b.pct - a.pct).slice(0, limit);
}

/** "Leg Press: 100 → 130 lb, 30% stronger." */
export function gainSentence(g: StrengthGain): string {
  return `${g.name}: ${g.first} → ${g.last} lb, ${g.pct}% stronger`;
}

export function tierOf(settings: RenewalSettings, key: string | null): PackageTier | null {
  return settings.packages.find((p) => p.key === key) ?? null;
}

/** Their journey in a few plain lines. */
export function journeyLines(client: Client, s: RenewalSnapshot | null, settings: RenewalSettings): string[] {
  const lines: string[] = [];
  const since = clientSinceLabel(client);
  if (since) lines.push(`${since.label} ${since.value}`);
  if (s) {
    if (s.proof.weeksAttended !== null && s.proof.weeksObserved !== null) {
      lines.push(`Trained in ${s.proof.weeksAttended} of the last ${s.proof.weeksObserved} weeks`);
    }
    lines.push(paceSentence(s));
    const tier = tierOf(settings, s.packageKey);
    if (tier && s.sessionsLeft !== null && s.sessionsLeftSource === "mindbody" && s.paymentMode !== "sessions-only") {
      // "About": sessions left can include complimentary ones and a few
      // carried over, so this is the package's count less what's left.
      const used = tier.sessions - s.sessionsLeft;
      if (used >= 0 && used <= tier.sessions) lines.push(`About ${used} of ${tier.sessions} sessions used on this package`);
    }
  }
  return lines;
}

/** Health first: the 90-day check-in, the InBody, the goal. */
export function healthLines(client: Client, s: RenewalSnapshot | null, today: string): string[] {
  const lines: string[] = [];
  const inbody = s?.proof.inbody;
  if (inbody) {
    const bits = [
      inbody.muscleLbChange !== 0
        ? `muscle ${inbody.muscleLbChange > 0 ? "up" : "down"} ${Math.abs(Math.round(inbody.muscleLbChange * 10) / 10)} lb`
        : null,
      inbody.bodyFatPctChange !== 0
        ? `body fat ${inbody.bodyFatPctChange < 0 ? "down" : "up"} ${Math.abs(Math.round(inbody.bodyFatPctChange * 10) / 10)} points`
        : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`InBody since ${dayLabel(inbody.since, today)}: ${bits.join(", ")}`);
  }
  const snap = client.subjectiveSnapshot;
  if (snap?.date) {
    const overall = snap.overallStatus
      ? `overall ${snap.overallStatus[0].toUpperCase()}${snap.overallStatus.slice(1)}${
          typeof snap.overallPercent === "number" ? ` (${Math.round(snap.overallPercent)}%)` : ""
        }`
      : null;
    lines.push(
      `90-day check-in, ${dayLabel(snap.date.slice(0, 10), today)}${overall ? `: ${overall}` : ""}`,
    );
    if (snap.redCategories?.length) {
      lines.push(`Red on: ${snap.redCategories.map((k) => CATEGORY_BY_KEY[k]?.title ?? k).join(", ")}`);
    }
  }
  const goal = (client.smartGoal || client.globalNotes || "").trim();
  if (goal) lines.push(`Their goal: ${goal}`);
  return lines;
}
