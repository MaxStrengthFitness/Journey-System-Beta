import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import {
  isOverlayFor,
  type StudioWikiDoc,
  type WikiTargetType,
} from "./studio-wiki";

/**
 * The studio's own wiki content, live.
 *
 * Round: Wiki Redesign Phase 4, Sep 2026.
 *
 * ONE UNFILTERED LISTENER over `studios/{id}/wiki`, and deliberately not a
 * filtered query. Three reasons, all learned the hard way on this project:
 *
 *   - A studio's own content is tens of documents. Every screen that wants it
 *     wants to search across all of it client-side anyway.
 *   - `where("retiredAt", "==", null)` would drop every document written
 *     before that field existed. A Firestore inequality silently excludes
 *     documents that never carried the field — the trap that hit trainer
 *     tombstone filtering in September and usePlaybook documents at length.
 *   - The alternative is one listener per machine article, torn down and
 *     rebuilt on every tap in the Catalog index.
 *
 * Mount this ONCE per screen, high up, and pass the result down — the same
 * rule the Catalog already follows for upkeep, studio settings and the
 * playbook.
 */
export interface UseStudioWikiResult {
  docs: StudioWikiDoc[];
  /** True until THIS studio's documents have arrived (or failed). */
  loading: boolean;
  /**
   * The read failed. The lists are then empty, and a screen must say it
   * couldn't load them — never that nothing is written.
   */
  error: string | null;
  /** The single overlay attached to one target, or null. See targetDocId. */
  overlayFor: (type: WikiTargetType, id: string) => StudioWikiDoc | null;
  /** Live studio-authored pages, retired ones excluded. */
  pages: StudioWikiDoc[];
}

export function useStudioWiki(studioId: string | null): UseStudioWikiResult {
  /*
   * Learning + Planner round (review): the documents are held WITH the studio
   * they belong to. After a studio switch the old studio's pages used to stay
   * until the new snapshot, and a read that failed kept them for good, so a
   * link could be stamped with one studio and a page of another. And loading
   * started false, so "that page is gone" flashed before the first snapshot.
   */
  const [held, setHeld] = useState<{
    studioId: string | null;
    docs: StudioWikiDoc[];
    error: string | null;
  }>({ studioId: null, docs: [], error: null });

  useEffect(() => {
    if (!studioId) {
      setHeld({ studioId: null, docs: [], error: null });
      return;
    }
    const unsub = onSnapshot(
      collection(db, "studios", studioId, "wiki"),
      (snap) => {
        setHeld({
          studioId,
          error: null,
          docs: snap.docs.map((d) => {
            const data = d.data() as Partial<StudioWikiDoc>;
            /*
             * Defaulted at the door, not at every use site. A document written
             * by an older build (or by hand in the console) can be missing
             * `blocks`, `machineIds` or `tags`, and one `.map` on undefined
             * inside a render takes the whole screen down with it.
             */
            return {
              ...(data as object),
              id: d.id,
              blocks: data.blocks ?? [],
              machineIds: data.machineIds ?? [],
              tags: data.tags ?? [],
            } as StudioWikiDoc;
          }),
        });
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `studios/${studioId}/wiki`,
        );
        setHeld({
          studioId,
          docs: [],
          error: "Couldn't load this studio's pages. Check the connection.",
        });
      },
    );
    return () => unsub();
  }, [studioId]);

  const current = held.studioId === studioId;
  const docs = current ? held.docs : NO_DOCS;
  const loading = Boolean(studioId) && !current;
  const error = current ? held.error : null;

  const overlayFor = useCallback(
    (type: WikiTargetType, id: string) =>
      docs.find((d) => !d.retiredAt && isOverlayFor(d, type, id)) ?? null,
    [docs],
  );

  const pages = useMemo(
    () =>
      docs
        .filter((d) => d.kind === "page" && !d.retiredAt)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [docs],
  );

  return { docs, loading, error, overlayFor, pages };
}

const NO_DOCS: StudioWikiDoc[] = [];
