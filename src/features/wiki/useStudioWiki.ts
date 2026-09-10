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
  loading: boolean;
  /** The single overlay attached to one target, or null. See targetDocId. */
  overlayFor: (type: WikiTargetType, id: string) => StudioWikiDoc | null;
  /** Live studio-authored pages, retired ones excluded. */
  pages: StudioWikiDoc[];
}

export function useStudioWiki(studioId: string | null): UseStudioWikiResult {
  const [docs, setDocs] = useState<StudioWikiDoc[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studioId) {
      setDocs([]);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      collection(db, "studios", studioId, "wiki"),
      (snap) => {
        setDocs(
          snap.docs.map((d) => {
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
        );
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(
          error,
          OperationType.GET,
          `studios/${studioId}/wiki`,
        );
        setLoading(false);
      },
    );
    return () => unsub();
  }, [studioId]);

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

  return { docs, loading, overlayFor, pages };
}
