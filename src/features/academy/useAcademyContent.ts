/**
 * Loading the Academy content, a module at a time.
 *
 * Round: MSF Topics, Sep 2026.
 *
 * The whole corpus is about a megabyte of JSON. The index — every module and
 * topic title, with reading times — is 16KB and is imported statically, so
 * browsing and searching are instant. A topic's actual prose is fetched only
 * when someone opens it, and cached for the session after that.
 *
 * `import()` with a template literal would defeat Vite's static analysis and
 * bundle nothing, so the loaders are an explicit map. Ten lines of repetition
 * buys a real chunk per module.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import index from "./content/index.json";
import type { AcademyIndex, ModuleContent, CardsFile, GlossaryFile, OverviewsFile } from "./types";

export const ACADEMY_INDEX = index as unknown as AcademyIndex;

/*
 * Typed as `unknown` rather than ModuleContent because TypeScript widens a
 * JSON import's string literals — `kind: "heading"` becomes `kind: string` —
 * so the inferred type never satisfies the union. The shape is guaranteed by
 * the generator and pinned by content.test.ts, which validates the real files
 * against these types; asserting here and checking there is the honest split.
 */
const MODULE_LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  intro: () => import("./content/intro.json"),
  benefits: () => import("./content/benefits.json"),
  principles: () => import("./content/principles.json"),
  performance: () => import("./content/performance.json"),
  "continuous-tension": () => import("./content/continuous-tension.json"),
  programming: () => import("./content/programming.json"),
  variations: () => import("./content/variations.json"),
  equipment: () => import("./content/equipment.json"),
  instruction: () => import("./content/instruction.json"),
  mastery: () => import("./content/mastery.json"),
};

const cache = new Map<string, ModuleContent>();

export function useAcademyModule(moduleId: string | null) {
  const [content, setContent] = useState<ModuleContent | null>(
    moduleId ? (cache.get(moduleId) ?? null) : null,
  );
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const active = useRef<string | null>(null);

  useEffect(() => {
    active.current = moduleId;
    if (!moduleId) {
      setContent(null);
      return;
    }
    const cached = cache.get(moduleId);
    if (cached) {
      setContent(cached);
      setFailed(false);
      return;
    }
    const load = MODULE_LOADERS[moduleId];
    if (!load) {
      setFailed(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    load()
      .then((m) => {
        const loaded = m.default as ModuleContent;
        cache.set(moduleId, loaded);
        // A slow chunk arriving after the reader moved on must not overwrite
        // what they are looking at now.
        if (active.current === moduleId) setContent(loaded);
      })
      .catch(() => {
        if (active.current === moduleId) setFailed(true);
      })
      .finally(() => {
        if (active.current === moduleId) setLoading(false);
      });
  }, [moduleId]);

  return { content, loading, failed };
}

/** The per-machine cards. One chunk, loaded on demand. */
export function useAcademyCards(enabled: boolean) {
  const [cards, setCards] = useState<CardsFile["cards"] | null>(null);
  useEffect(() => {
    if (!enabled || cards) return;
    let live = true;
    import("./content/cards.json").then((m) => {
      if (live) setCards((m.default as unknown as CardsFile).cards);
    });
    return () => {
      live = false;
    };
  }, [enabled, cards]);
  return cards;
}

export function useAcademyGlossary(enabled: boolean) {
  const [terms, setTerms] = useState<GlossaryFile["glossary"] | null>(null);
  useEffect(() => {
    if (!enabled || terms) return;
    let live = true;
    import("./content/glossary.json").then((m) => {
      if (live) setTerms((m.default as unknown as GlossaryFile).glossary);
    });
    return () => {
      live = false;
    };
  }, [enabled, terms]);
  return terms;
}

export function useAcademyOverviews(enabled: boolean) {
  const [overviews, setOverviews] = useState<OverviewsFile["overviews"] | null>(null);
  useEffect(() => {
    if (!enabled || overviews) return;
    let live = true;
    import("./content/overviews.json").then((m) => {
      if (live) setOverviews((m.default as unknown as OverviewsFile).overviews);
    });
    return () => {
      live = false;
    };
  }, [enabled, overviews]);
  return overviews;
}

/**
 * Search across every topic title in the index.
 *
 * Titles only, deliberately: full-text would mean shipping the corpus to
 * search it, which is the thing this file exists to avoid. A trainer looking
 * for "turnaround" finds the topic; a trainer looking for a phrase inside an
 * essay opens the module and reads.
 */
export function useTopicSearch() {
  return useCallback((query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: { moduleId: string; moduleTitle: string; topicId: string; title: string }[] = [];
    for (const mod of ACADEMY_INDEX.modules) {
      for (const t of mod.topics) {
        if (t.title.toLowerCase().includes(q)) {
          hits.push({
            moduleId: mod.id,
            moduleTitle: mod.title,
            topicId: t.id,
            title: t.title,
          });
        }
      }
    }
    return hits.slice(0, 40);
  }, []);
}
