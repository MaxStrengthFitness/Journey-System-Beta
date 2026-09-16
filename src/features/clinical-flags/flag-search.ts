/**
 * Clinical flags — finding and grouping them (client-profile audit, Sep
 * 2026: "trainers must be able to type a condition and instantly toggle it").
 * Pure; the picker is ClinicalFlagPicker.tsx.
 */

import { CLINICAL_FLAGS_MATRIX } from "../../data/clinical-matrix";
import { shortCondition, toneOf, type WatchOutTone } from "../../lib/clinical-watchouts";
import type { ClinicalSafetyFlag } from "../../types";

export const COMMON_CATEGORY = "Common constraints";

/** Words trainers actually say, per flag, beyond the condition name. */
const ALIASES: Record<string, string[]> = {
  "cv-hypertension": ["blood pressure", "bp", "high bp"],
  "cv-recent-cardiac": ["heart attack", "stent", "bypass", "mi"],
  "cv-pacemaker": ["icd", "defibrillator", "heart"],
  "bone-osteoporosis": ["osteopenia", "bone density", "brittle"],
  "bone-frailty": ["fall", "falls", "frail", "balance"],
  "spine-ddd": ["disc", "stenosis", "sciatica", "back"],
  "spine-cervical": ["neck"],
  "spine-deformity": ["scoliosis", "kyphosis", "back"],
  "spine-spondylolisthesis": ["back", "spine"],
  "joint-tha": ["hip replacement", "hip"],
  "joint-tka": ["knee replacement", "knee"],
  "neuro-parkinsons": ["ms", "stroke", "parkinson"],
  "neuro-neuropathy": ["feet", "numb", "tingling"],
  "soft-ra": ["arthritis", "flare"],
  "soft-tendonitis": ["tennis elbow", "carpal", "wrist", "elbow", "bursitis"],
  "soft-rotator": ["shoulder", "impingement", "rotator"],
  "sys-diabetes": ["blood sugar", "insulin"],
  "sys-dvt": ["clot", "embolism", "blood clot"],
  "sys-hernia": ["hernia", "abdomen"],
  "gen-shoulder": ["shoulder", "rotator"],
  "gen-knee": ["knee"],
  "gen-low-back": ["back", "lumbar", "low back"],
  "gen-hip": ["hip"],
  "gen-neck": ["neck", "cervical"],
  "gen-elbow-wrist": ["elbow", "wrist", "hand", "grip", "thumb"],
  "gen-blood-pressure": ["blood pressure", "bp", "hypertension"],
  "gen-balance": ["balance", "dizzy", "fall"],
  "gen-recent-surgery": ["surgery", "operation", "post-op"],
};

export interface FlagOption {
  id: string;
  name: string;
  full: string;
  /**
   * What the matrix puts in brackets — "Grade 2 or higher", "within 4 weeks".
   * The name drops it (shortCondition), but it is often what decides whether
   * the condition applies at all, so the picker shows it as a quiet second
   * line. Null when the name has no brackets.
   */
  detail: string | null;
  category: string;
  tone: WatchOutTone;
  severity: string;
}

/** "Spondylolisthesis (Grade 2 or higher)" → "Grade 2 or higher". */
export function conditionDetail(name: string): string | null {
  const parts = [...name.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function toOption(flag: ClinicalSafetyFlag): FlagOption {
  return {
    id: flag.id,
    name: shortCondition(flag.conditionName),
    full: flag.conditionName,
    detail: conditionDetail(flag.conditionName),
    category: flag.category,
    tone: toneOf(flag.severity),
    severity: flag.severity,
  };
}

/** Most serious first. */
export const TONE_ORDER: Record<WatchOutTone, number> = { alert: 0, caution: 1, modify: 2 };

/**
 * The picker's severity badge (Sep 16 2026 redesign). The old rows printed
 * the matrix's full severity — "ABSOLUTE CONTRAINDICATION" — beside every
 * name, which overlapped the name on an iPad and made a list of 21 read as a
 * wall of alarms. Now two short words mark the exceptions and "modify" (the
 * common case) carries no badge at all; a legend above the list says what
 * each means, in the matrix's own terms.
 */
export const TONE_BADGE: Record<WatchOutTone, { short: string; meaning: string } | null> = {
  alert: { short: "Stop", meaning: "Absolute contraindication" },
  caution: { short: "High", meaning: "High risk" },
  modify: null,
};

/** The quick-toggle row. */
export function commonFlags(matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX): FlagOption[] {
  return matrix.filter((f) => f.category === COMMON_CATEGORY).map(toOption);
}

/**
 * Flags matching a query, best first: a name that starts with it, then a name
 * containing it, then an alias or category match. Every word must match.
 */
export function searchFlags(query: string, matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX): FlagOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { opt: FlagOption; score: number }[] = [];
  for (const f of matrix) {
    const name = f.conditionName.toLowerCase();
    const extra = [...(ALIASES[f.id] || []), f.category.toLowerCase()].join(" | ");
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (name.startsWith(w)) score += 3;
      else if (name.includes(w)) score += 2;
      else if (extra.includes(w)) score += 1;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ opt: toOption(f), score });
  }
  return scored.sort((a, b) => b.score - a.score || a.opt.name.localeCompare(b.opt.name)).map((s) => s.opt);
}

/** Every flag grouped by category, in the matrix's order, common constraints first. */
export function flagsByCategory(matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX): { category: string; flags: FlagOption[] }[] {
  const groups = new Map<string, FlagOption[]>();
  for (const f of matrix) {
    const list = groups.get(f.category) || [];
    list.push(toOption(f));
    groups.set(f.category, list);
  }
  // Inside a group, most serious first (a stable sort keeps the matrix's
  // order within a tier), so a Stop is never the fourth thing read.
  const out = [...groups.entries()].map(([category, flags]) => ({
    category,
    flags: [...flags].sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]),
  }));
  return out.sort((a, b) => (a.category === COMMON_CATEGORY ? -1 : b.category === COMMON_CATEGORY ? 1 : 0));
}

/** The selected flags, most serious first. Unknown ids are kept as-is so nothing silently disappears. */
export function selectedFlags(ids: readonly string[] | null | undefined, matrix: readonly ClinicalSafetyFlag[] = CLINICAL_FLAGS_MATRIX): FlagOption[] {
  const rank = TONE_ORDER;
  return (ids || [])
    .map((id) => {
      const f = matrix.find((m) => m.id === id);
      return f
        ? toOption(f)
        : { id, name: id, full: id, detail: null, category: "Unknown", tone: "modify" as WatchOutTone, severity: "Unknown" };
    })
    .sort((a, b) => rank[a.tone] - rank[b.tone] || a.name.localeCompare(b.name));
}
