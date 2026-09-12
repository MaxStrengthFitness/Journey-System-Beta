import { useMemo, useState } from "react";
import type { Machine } from "../../types";
import { useActiveStudio } from "../../ActiveStudioContext";
import { WikiSearch, type WikiSearchGroup } from "../wiki";
import { learningRefKey, type LearningRef } from "./ref";
import { searchLearning, type LearningSearchGroupKey } from "./search";
import { useLearningEntries } from "./useLearningEntries";

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
 *
 * What there is to find is built by useLearningEntries, which the
 * announcement composer's Learning picker shares.
 */

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

  const entries = useLearningEntries({ machines, studioId: activeStudioId });

  const results = useMemo(() => searchLearning(entries, query), [entries, query]);

  const label: Record<LearningSearchGroupKey, string> = {
    catalog: `Machines at ${studioName}`,
    network: "Shared by other MSF studios",
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
            One search for everything in Learning: {studioName}'s machines, the ones
            other MSF studios have shared, the MSF Academy, and the pages{" "}
            {studioName} has written.
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
