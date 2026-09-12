import { useMemo } from "react";
import type { Machine } from "../../types";
import { PAGE_SECTION_LABEL, accentForPattern, useStudioWiki, type WikiAccent } from "../wiki";
import { useCatalogMachines } from "../catalog/useCatalogMachines";
import {
  ACADEMY_INDEX,
  useAcademyCards,
  useAcademyGlossary,
  useAcademyOverviews,
  useAcademyScripts,
} from "../academy/useAcademyContent";
import { buildAcademyMachines, whatItHas } from "../academy/academy-machines";
import { CATEGORY_LABEL, abbr, categoryOf } from "../routine-builder/academy";
import type { LearningRef } from "./ref";
import type { LearningSearchEntry, LearningSearchGroupKey } from "./search";

/**
 * EVERYTHING IN LEARNING THAT CAN BE LINKED TO, as search entries.
 *
 * Round: Learning + Planner, Sep 2026. Built for the one search (Learning
 * search), and shared since Phase 6 with the announcement composer's "link a
 * Learning page" picker — so an announcement can point at exactly the pages
 * a trainer can find, and the two can never disagree about what exists.
 *
 * `includeStudioPages` is off where a link would reach people at other
 * studios: a studio's own page opens only at that studio.
 */

/* One accent per Academy group — the same assignment the Academy index uses,
   so a result's colour matches the section it opens in. */
export const LEARNING_ACCENT: Record<Exclude<LearningSearchGroupKey, "catalog">, WikiAccent> = {
  "academy-machines": "push",
  studio: "hips",
  academy: "pull",
  glossary: "posterior",
  topics: "pull",
};

const ACCENT = LEARNING_ACCENT;

export function useLearningEntries({
  machines,
  studioId,
  includeStudioPages = true,
  enabled = true,
}: {
  /** The app's machine list, for a studio whose roster is still empty. */
  machines: Machine[];
  studioId: string | null;
  includeStudioPages?: boolean;
  /** Loads the Academy's machine documents and glossary (cached chunks) when true. */
  enabled?: boolean;
}): LearningSearchEntry[] {
  const { machines: catalog } = useCatalogMachines(studioId, machines);
  const cards = useAcademyCards(enabled);
  const scripts = useAcademyScripts(enabled);
  const overviews = useAcademyOverviews(enabled);
  const glossary = useAcademyGlossary(enabled);
  const { pages } = useStudioWiki(includeStudioPages ? studioId : null);

  const academyMachines = useMemo(
    () => buildAcademyMachines(cards, scripts, overviews),
    [cards, scripts, overviews],
  );

  const entries = useMemo<LearningSearchEntry[]>(() => {
    const out: LearningSearchEntry[] = [];

    for (const m of catalog) {
      const category = categoryOf(m.id);
      out.push({
        ref: { kind: "machine", id: m.id },
        group: "catalog",
        title: m.name,
        code: abbr(m.id),
        meta: [m.movementPattern, m.anatomicalRegion].filter(Boolean).join(" · ") || undefined,
        accent: accentForPattern(m.movementPattern),
        keywords: [
          ...m.targetMuscles,
          ...m.synergists,
          ...(category ? [CATEGORY_LABEL[category]] : []),
        ],
      });
    }

    for (const a of academyMachines) {
      const ref: LearningRef | null = a.cardId
        ? { kind: "academy-card", id: a.cardId }
        : a.scriptId
          ? { kind: "academy-script", id: a.scriptId }
          : a.overviewId
            ? { kind: "academy-overview", id: a.overviewId }
            : null;
      if (!ref) continue;
      out.push({
        ref,
        group: "academy-machines",
        title: a.name,
        code: a.abbr ?? abbr(a.machineId),
        meta: whatItHas(a),
        accent: ACCENT["academy-machines"],
      });
    }

    if (studioId && includeStudioPages) {
      for (const p of pages) {
        out.push({
          ref: { kind: "studio-page", id: p.id, studioId },
          group: "studio",
          title: p.title,
          meta: p.section ? PAGE_SECTION_LABEL[p.section] : "Studio page",
          accent: ACCENT.studio,
          keywords: [...p.tags, p.summary ?? ""],
        });
      }
    }

    for (const mod of ACADEMY_INDEX.modules) {
      out.push({
        ref: { kind: "academy-module", id: mod.id },
        group: "academy",
        title: `${mod.n}. ${mod.title}`,
        meta: `Module · ${mod.topics.length} topic${mod.topics.length === 1 ? "" : "s"}`,
        accent: ACCENT.academy,
        keywords: [mod.blurb],
      });
    }
    out.push(
      {
        ref: { kind: "academy-cueing" },
        group: "academy",
        title: "Cueing phrasebook",
        meta: "What to say, by the moment in the set",
        accent: ACCENT.academy,
        keywords: ["cue", "cues", "phrases", "language", "what to say"],
      },
      {
        ref: { kind: "academy-glossary" },
        group: "academy",
        title: "Glossary",
        meta: `${ACADEMY_INDEX.glossaryCount} terms`,
        accent: ACCENT.academy,
        keywords: ["terms", "definitions", "vocabulary"],
      },
    );

    for (const g of glossary ?? []) {
      out.push({
        ref: { kind: "academy-glossary", id: g.term },
        group: "glossary",
        title: g.term,
        meta: "Glossary term",
        accent: ACCENT.glossary,
      });
    }

    for (const mod of ACADEMY_INDEX.modules) {
      for (const t of mod.topics) {
        out.push({
          ref: { kind: "academy-topic", id: t.id, moduleId: mod.id },
          group: "topics",
          title: t.title,
          meta: `${mod.title} · ${t.readingMinutes} min`,
          accent: ACCENT.topics,
        });
      }
    }
    return out;
  }, [catalog, academyMachines, pages, glossary, studioId, includeStudioPages]);

  return entries;
}
