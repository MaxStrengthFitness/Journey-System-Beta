/**
 * THE PLAYBOOK — how this studio has found success before.
 *
 * "I had a client with shoulder pain on the compound row and I didn't know how
 * to approach it." Somebody answers. Six months later a different trainer hits
 * the same thing and the answer is gone, because it lived in a request that
 * scrolled away.
 *
 * The playbook is the only thing in this feature that gets MORE valuable with
 * age. That is the whole argument for giving it its own lane instead of a
 * category chip: everything else on the screen is trying to reach zero, and a
 * thing that should accumulate must not sit in a list that is trying to empty.
 *
 * ============================================================================
 * ENTRIES ARE ABOUT PATTERNS, NEVER ABOUT NAMED CLIENTS
 * ============================================================================
 * There is no `clientId` on this type, and that is a deliberate design
 * decision rather than an omission — do not add one later without re-opening
 * the argument.
 *
 * A playbook entry describes a physical complaint and a workaround, it is
 * readable by every trainer at the studio, and it is designed to LAST. Attach
 * a name to that and you have quietly built a searchable health record about
 * identifiable clients that anyone on the floor can browse — a different thing
 * from a session note, which is attached to care being delivered and read by
 * the person delivering it.
 *
 * The entry loses almost nothing by being anonymous, because the useful part
 * was never the person: "anterior shoulder discomfort at the top of the
 * compound row pull" is what the next trainer searches for.
 *
 * Initiative submissions DO carry client ids (see initiatives.ts). That is
 * consistent: those record that routine admin happened for a named client.
 *
 * PURE MODULE — no Firestore, no React.
 */

/** studios/{studioId}/playbook/{entryId} */
export interface PlaybookEntry {
  id: string;
  studioId: string;

  /** What a trainer would search for. "Shoulder pain on compound row". */
  title: string;
  /** The situation, in the trainer's words. */
  situation: string;
  /** What was tried — including what did not work, which is half the value. */
  tried?: string;
  /** The bit that worked. The reason anyone opens the entry. */
  worked: string;

  /**
   * Machines this applies to. The anchor that makes an entry findable at the
   * point of need: standing at the compound row, the Catalog can show
   * "3 notes from your studio about this machine".
   */
  machineIds: string[];
  /** Free tags: "shoulder", "deload", "returning from injury". */
  tags: string[];

  /** Set when promoted from a resolved request, so the thread stays reachable. */
  sourceRequestId?: string;

  authorId: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;

  /**
   * "This worked for me too", keyed by trainer id.
   *
   * Not a like. It is the only evidence the studio has that a thing works for
   * more than one person, and it is what `staleness` reads to decide whether
   * an entry still reflects how the studio actually coaches.
   */
  confirmations?: Record<string, { name: string; on: string }>;

  /** YYYY-MM-DD of the newest confirmation or edit. Studio-local. */
  lastConfirmedOn?: string;

  /** Retired, not deleted: something linked to it and history is not ours to erase. */
  retiredAt?: unknown;
  retiredBy?: string;
}

export interface PlaybookDraft {
  title: string;
  situation: string;
  tried?: string;
  worked: string;
  machineIds: string[];
  tags: string[];
  sourceRequestId?: string;
}

export const PLAYBOOK_TITLE_MAX = 120;
export const PLAYBOOK_BODY_MAX = 2000;

/**
 * A resolved request, turned into a playbook draft.
 *
 * THIS IS THE FEATURE. Nobody on a floor running back-to-back 20-minute
 * sessions is going to sit down and write documentation. But they will answer
 * a colleague's question — they already do. So the knowledge base fills itself
 * out of work that was happening anyway, and the marginal cost of contributing
 * is one tap on a thing you already finished.
 *
 * Returns null when there is nothing worth keeping: a request resolved with no
 * written resolution taught the studio nothing, and prompting to save it would
 * train people to dismiss the prompt.
 */
export function draftFromRequest(r: {
  id: string;
  title: string;
  detail?: string;
  resolution?: string;
  machineId?: string;
}): PlaybookDraft | null {
  const worked = (r.resolution ?? "").trim();
  if (worked.length < 12) return null;

  return {
    title: r.title.slice(0, PLAYBOOK_TITLE_MAX),
    situation: (r.detail ?? r.title).slice(0, PLAYBOOK_BODY_MAX),
    worked: worked.slice(0, PLAYBOOK_BODY_MAX),
    machineIds: r.machineId ? [r.machineId] : [],
    tags: [],
    sourceRequestId: r.id,
  };
}

/* ------------------------------------------------------------------ *
 * Finding things again
 * ------------------------------------------------------------------ */

export interface PlaybookHit {
  entry: PlaybookEntry;
  score: number;
}

/**
 * Rank entries against a search term.
 *
 * Deliberately naive — substring matching over a few weighted fields, no index
 * and no service. A studio's playbook is tens of entries, not thousands; a
 * search service here would be infrastructure to maintain in exchange for
 * nothing a trainer could perceive. Revisit past a few hundred entries.
 *
 * Title outweighs body because people search for the name of the problem.
 * Tags outweigh body for the same reason. A confirmed entry edges out an
 * unconfirmed one at equal relevance: two trainers saying it worked is the
 * closest thing to evidence this dataset has.
 */
export function searchPlaybook(
  entries: PlaybookEntry[],
  term: string,
  opts: { machineId?: string; includeRetired?: boolean } = {},
): PlaybookHit[] {
  const q = term.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);

  const hits: PlaybookHit[] = [];
  for (const e of entries) {
    if (e.retiredAt && !opts.includeRetired) continue;
    if (opts.machineId && !e.machineIds.includes(opts.machineId)) continue;

    let score = 0;
    if (words.length === 0) {
      score = 1;
    } else {
      const title = e.title.toLowerCase();
      const tags = e.tags.join(" ").toLowerCase();
      const body = `${e.situation} ${e.tried ?? ""} ${e.worked}`.toLowerCase();
      for (const w of words) {
        if (title.includes(w)) score += 6;
        if (tags.includes(w)) score += 4;
        if (body.includes(w)) score += 1;
      }
      // Every word has to land somewhere, or "shoulder press" returns every
      // entry that merely says "shoulder".
      const missing = words.some(
        (w) =>
          !title.includes(w) && !tags.includes(w) && !body.includes(w),
      );
      if (missing) continue;
    }

    score += Math.min(3, Object.keys(e.confirmations ?? {}).length);
    hits.push({ entry: e, score });
  }

  return hits.sort(
    (a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title),
  );
}

/* ------------------------------------------------------------------ *
 * Keeping it honest
 * ------------------------------------------------------------------ */

export type Staleness = "fresh" | "aging" | "stale";

export const STALE_AFTER_DAYS = 365;
export const AGING_AFTER_DAYS = 180;

/**
 * How much to trust an entry.
 *
 * The classic failure of every internal wiki is that it becomes a record of
 * how the team USED to work, and nobody can tell which parts. An entry nobody
 * has confirmed in a year gets a quiet "is this still how we do it?" — one tap
 * to confirm, one to retire.
 *
 * It is a prompt, never an auto-delete. Something being old is not evidence
 * that it is wrong, and silently hiding a correct answer is worse than showing
 * an old one with a date on it.
 */
export function staleness(
  entry: PlaybookEntry,
  todayKey: string,
): { state: Staleness; days: number | null } {
  const last = entry.lastConfirmedOn;
  if (!last) return { state: "aging", days: null };

  const a = Date.UTC(
    Number(last.slice(0, 4)),
    Number(last.slice(5, 7)) - 1,
    Number(last.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)),
  );
  if (Number.isNaN(a) || Number.isNaN(b)) return { state: "aging", days: null };

  const days = Math.round((b - a) / 86_400_000);
  if (days >= STALE_AFTER_DAYS) return { state: "stale", days };
  if (days >= AGING_AFTER_DAYS) return { state: "aging", days };
  return { state: "fresh", days };
}

/** Confirming is idempotent — the same trainer twice is one confirmation. */
export function withConfirmation(
  entry: PlaybookEntry,
  trainer: { id: string; name: string },
  todayKey: string,
): Pick<PlaybookEntry, "confirmations" | "lastConfirmedOn"> {
  return {
    confirmations: {
      ...(entry.confirmations ?? {}),
      [trainer.id]: { name: trainer.name, on: todayKey },
    },
    lastConfirmedOn: todayKey,
  };
}

/** Entries worth nudging the studio about. Stale, not retired, oldest first. */
export function needsReview(
  entries: PlaybookEntry[],
  todayKey: string,
): PlaybookEntry[] {
  return entries
    .filter((e) => !e.retiredAt && staleness(e, todayKey).state === "stale")
    .sort((a, b) => (a.lastConfirmedOn ?? "").localeCompare(b.lastConfirmedOn ?? ""));
}
