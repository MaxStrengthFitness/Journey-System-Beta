/**
 * Filing the Note for the next trainer keeps it on the next briefing
 * (voice-review follow-up, Sep 27 2026).
 *
 * AJ: "Ideally the end session note is made for the next sessions pre session
 * briefing but also can be filed to the profile". Finish writes it as an
 * unfiled Heads up, so the Wrap-up's To-file tray offers it for filing. These
 * prove that filing writes only its kind and category, so it is still a
 * Heads up afterwards and the briefing still reads it out; and that a discard
 * is an archive, which is why the tray offers no Discard on that card.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const writes = vi.hoisted(() => [] as Array<{ path: string; data: Record<string, unknown> }>);

vi.mock("../../firebase", () => ({ db: { __fake: true }, auth: { currentUser: { uid: "uid-jane" } } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const real = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...real,
    doc: (_db: unknown, ...parts: string[]) => ({ path: parts.join("/") }),
    updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      writes.push({ path: ref.path, data });
    },
    serverTimestamp: () => ({ __server: true }),
  };
});

import { discardUnfiledEntry, fileUnfiledEntry } from "./file-unfiled";
import { isNextTrainerNote, isUnfiled } from "./note-catalog";
import { isHeadsUpLive } from "../../hooks/useClientJournal";
import { briefingNotes } from "../briefing/briefing-notes";
import { assembleThreads } from "./threads";
import type { JournalEntry } from "../../types/journal";

const NOW = new Date(2026, 8, 27, 10, 0).getTime();

/** The End Session box's note, exactly as Finish writes it (WorkoutTrackerView, commitEndSession). */
const nextTrainerNote = (): JournalEntry => ({
  id: "j-next",
  clientId: "c1",
  studioId: "s1",
  kind: "general",
  category: null,
  body: "Right knee sore after the move. Go light on leg press.",
  importance: "elevated",
  machineId: null,
  focusId: null,
  threadId: null,
  sessionId: "sess1",
  origin: "post_session",
  authorId: "uid-jane",
  authorInitials: "JC",
  authorName: "Jane Coach",
  occurredAt: new Date(NOW - 60_000),
  createdAt: null,
  updatedAt: null,
  effectiveFrom: null,
  effectiveUntil: null,
  resolvedAt: null,
  isArchived: false,
  searchTags: [],
});

/** What the stream hands back after a write: the fields the write set, over the entry. */
const applied = (entry: JournalEntry, data: Record<string, unknown>): JournalEntry => {
  const { updatedAt: _stamp, ...fields } = data;
  return { ...entry, ...fields } as JournalEntry;
};

beforeEach(() => {
  writes.length = 0;
});

describe("the Note for the next trainer, filed from the Wrap-up", () => {
  it("is unfiled when Finish writes it, which is why it comes back in the To-file tray", () => {
    const note = nextTrainerNote();
    expect(isUnfiled(note)).toBe(true);
    expect(isNextTrainerNote(note, { sessionId: "sess1", id: null, body: note.body })).toBe(true);
    expect(isHeadsUpLive(note, NOW)).toBe(true);
  });

  it("filing writes its kind and category and nothing else", async () => {
    await fileUnfiledEntry("j-next", "preference");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("journalEntries/j-next");
    expect(Object.keys(writes[0].data).sort()).toEqual(["category", "kind", "updatedAt"]);
    expect(writes[0].data).toMatchObject({ kind: "preference", category: null });

    // A coaching tip keeps its P; the loudness is still not touched.
    await fileUnfiledEntry("j-next", "coaching", "Pace");
    expect(writes[1].data).toMatchObject({ kind: "coaching", category: "Pace" });
    expect(writes[1].data).not.toHaveProperty("importance");
  });

  it("stays on the next briefing once filed, under any category", async () => {
    for (const [category, p] of [
      ["preference", null],
      ["injury", null],
      ["coaching", "Posture"],
      ["equipment", null],
      ["incident", null],
    ] as const) {
      writes.length = 0;
      await fileUnfiledEntry("j-next", category, p);
      const filed = applied(nextTrainerNote(), writes[0].data);
      expect(isUnfiled(filed)).toBe(false);
      // The hook's headsUpEntries is exactly this filter over its entries.
      expect(isHeadsUpLive(filed, NOW)).toBe(true);
      // And the briefing picks it out of what the hook hands it.
      const out = briefingNotes(assembleThreads([filed]), [], [filed], null);
      expect(out.headsUp.map((t) => t.root.id)).toEqual(["j-next"]);
    }
  });

  it("a discard is an archive: it writes isArchived and nothing else", async () => {
    await discardUnfiledEntry("j-next");
    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe("journalEntries/j-next");
    expect(Object.keys(writes[0].data).sort()).toEqual(["isArchived", "updatedAt"]);
    expect(writes[0].data).toMatchObject({ isArchived: true });
    // What an archive does to the briefing is the hook's to prove: its merge
    // keeps only notes that are not archived, so headsUpEntries loses this
    // one (useClientJournal.render.test.tsx, "drops it once it is archived").
    // Hence no Discard on its card.
  });
});
