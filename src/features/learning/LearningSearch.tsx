import { useMemo, useState } from "react";
import type { Machine } from "../../types";
import { useActiveStudio } from "../../ActiveStudioContext";
import {
  PAGE_SECTION_LABEL,
  WikiSearch,
  accentForPattern,
  useStudioWiki,
  type WikiAccent,
  type WikiSearchGroup,
} from "../wiki";
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
import { learningRefKey, type LearningRef } from "./ref";
import {
  searchLearning,
  type LearningSearchEntry,
  type LearningSearchGroupKey,
} from "./search";

/**
 * ONE SEARCH FOR ALL OF LEARNING — the screen.
 *
 * Round: Learning + Planner, Sep 2026. The matching lives in ./search.ts.
 *
 * Opened from the masthead on every Learning page. It replaces the page on
 * screen rather than sitting over it (see WikiSearch for why), but the page
 * underneath stays mounted — LearningView hides it — so closing search puts
 * the trainer back exactly where they were, scroll position and all.
 *
 * What it searches, and the one thing it deliberately does not:
 *   - this studio's machines, by name, Academy code, muscle, category;
 *   - the Academy's machine documents, modules, topic titles, glossary terms;
 *   - this studio's own pages.
 * Not the text of the curriculum: that would mean downloading all 283,000
 * words to look inside them, on an iPad, mid-shift.
 */

/* One accent per Academy group — the same assignment the Academy index uses,
   so a result's colour matches the section it opens in. */
const ACCENT: Record<Exclude<LearningSearchGroupKey, "catalog">, WikiAccent> = {
  "academy-machines": "push",
  studio: "hips",
  academy: "pull",
  glossary: "posterior",
  topics: "pull",
};

export interface LearningSearchProps {
  /** The global machine list, for a studio whose roster is still empty. */
  machines: Machine[];
  onClose: () => void;
  onOpen: (ref: LearningRef) => void;
}

export function LearningSearch({ machines, onClose, onOpen }: LearningSearchProps) {
  const { activeStudioId, activeStudio } = useActiveStudio();
  const studioName = activeStudio?.name ?? "This studio";
  const [query, setQuery] = useState("");

  const { machines: catalog } = useCatalogMachines(activeStudioId, machines);
  const cards = useAcademyCards(true);
  const scripts = useAcademyScripts(true);
  const overviews = useAcademyOverviews(true);
  const glossary = useAcademyGlossary(true);
  const { pages } = useStudioWiki(activeStudioId);

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

    if (activeStudioId) {
      for (const p of pages) {
        out.push({
          ref: { kind: "studio-page", id: p.id, studioId: activeStudioId },
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
  }, [catalog, academyMachines, pages, glossary, activeStudioId]);

  const results = useMemo(() => searchLearning(entries, query), [entries, query]);

  const label: Record<LearningSearchGroupKey, string> = {
    catalog: `Machines at ${studioName}`,
    "academy-machines": "Academy — machine cards & scripts",
    studio: `${studioName}'s pages`,
    academy: "Academy — modules & reference",
    glossary: "Glossary",
    topics: "Curriculum topics",
  };

  const groups: WikiSearchGroup[] = results.map((r) => ({
    key: r.group,
    label: r.more > 0 ? `${label[r.group]} · ${r.more} more — keep typing` : label[r.group],
    items: r.hits.map((h) => ({
      id: learningRefKey(h.ref),
      title: h.title,
      meta: h.meta,
      accent: h.accent,
      code: h.code,
    })),
  }));

  const refByKey = useMemo(() => {
    const map = new Map<string, LearningRef>();
    for (const r of results) for (const h of r.hits) map.set(learningRefKey(h.ref), h.ref);
    return map;
  }, [results]);

  return (
    <WikiSearch
      value={query}
      onChange={setQuery}
      onClose={onClose}
      onPick={(id) => {
        const ref = refByKey.get(id);
        if (ref) onOpen(ref);
      }}
      groups={groups}
      placeholder="Search machines, muscles, the Academy…"
      idle={
        <div className="wk__empty">
          <p>
            One search for everything in Learning: {studioName}'s machines, the MSF
            Academy, and the pages {studioName} has written.
          </p>
          <p>
            Try an Academy code (<strong>CP</strong>, <strong>LP</strong>), a
            muscle (<strong>glute</strong>, <strong>lat</strong>), a topic, or a
            term (<strong>turnaround</strong>). Topic titles are searched; the
            full text of the curriculum is not.
          </p>
        </div>
      }
    />
  );
}
