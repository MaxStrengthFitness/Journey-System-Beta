/**
 * THE FLOOR'S NOTE ON THIS MACHINE, AT THE MACHINE (notes round, Oct 3 2026).
 *
 * A studio writes what it knows about the unit in its building — "the left
 * pad sticks, use the footstool", "ours sits two notches lower than the
 * card" — on Learning → Catalog and My Studio → Machines
 * (`studios/{s}/machineNotes/{machineId}`), and a trainer flags a fault on
 * Relay (`studios/{s}/machineCare/{machineId}.flag`). Until now neither
 * reached the one moment it is for: the trainer standing at that machine
 * with a client, setting it up. The session's machine sheet read only the
 * client's own notes and the company's set-up guide.
 *
 * So the sheet reads them once, when it opens — no listener — and draws them
 * read-only under the watch-outs: the flag first (something is wrong with it
 * today), then the floor's open notes on this machine, each with its latest
 * update (the dated list since AJ's answer 2A: `studios/{s}/floorNotes`, one
 * query on the machine; it has no index of its own, because the Enterprise
 * edition refuses single-field index settings, so it reads through this one
 * studio's floor notes, which are few), then the old Studio notes while nobody has copied
 * them into that list. Closed notes are history and stay on the Catalog.
 * None of it is about the client, so none is written here; the door to
 * change the floor's notes is where they live. Nothing when there is
 * nothing, and a read that failed says so rather than looking like "no
 * notes".
 */
import { useEffect, useRef, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { Wrench } from "lucide-react";
import { db } from "../../firebase";
import { firstSentences } from "../../lib/first-sentences";
import { studioDateKey } from "../../lib/studio-time";
import { copiedKeysOf, earlierNotes, floorNoteFromDoc, floorThreads, openFloorLines, type FloorNote } from "../floor-notes/floor-notes";

export type FloorRead =
  | { status: "loading" }
  | { status: "failed" }
  | {
      status: "ready";
      /** The floor's open notes on this machine, newest word first. */
      open: { text: string; latest: string | null; by: string | null; day: string | null }[];
      /** The old Studio notes, while nobody has copied them into the list. */
      note: { text: string; by: string | null; day: string | null } | null;
      flag: { text: string; by: string | null; day: string | null } | null;
    };

/** At most this many open notes at the machine; the rest are on the Catalog. */
export const FLOOR_NOTES_AT_MACHINE = 4;

const dayOf = (v: unknown): string | null => {
  if (!v) return null;
  const d =
    typeof (v as { toDate?: () => Date }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate()
      : typeof v === "number"
        ? new Date(v)
        : v instanceof Date
          ? v
          : null;
  return d && !isNaN(d.getTime()) ? studioDateKey(d) : null;
};

const nameOf = (by: unknown): string | null => {
  if (!by || typeof by !== "object") return null;
  const n = (by as { name?: unknown }).name;
  return typeof n === "string" && n.trim() ? n.trim().split(/\s+/)[0] : null;
};

/**
 * Read the floor's notes and the Relay flag for one machine, once. A new
 * `round` reads them again (the machine menu, after it adds a floor note):
 * the last answer stays on screen until the new one comes, and a read again
 * that fails keeps it, so nothing drawn from it flickers away.
 */
export function useFloorNote(studioId: string | null, machineId: string | null, round = 0): FloorRead {
  const [read, setRead] = useState<FloorRead>({ status: "loading" });
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const key = `${studioId ?? ""}|${machineId ?? ""}`;
    const again = lastKey.current === key;
    lastKey.current = key;
    if (!studioId || !machineId) {
      setRead({ status: "ready", open: [], note: null, flag: null });
      return;
    }
    if (!again) setRead({ status: "loading" });
    // Inside a promise, so even a read that throws as it starts is a failed read, never a crash.
    Promise.resolve()
      .then(() =>
        Promise.all([
          getDoc(doc(db, "studios", studioId, "machineNotes", machineId)),
          getDoc(doc(db, "studios", studioId, "machineCare", machineId)),
          getDocs(query(collection(db, "studios", studioId, "floorNotes"), where("machineId", "==", machineId))),
        ]),
      )
      .then(([noteSnap, careSnap, floorSnap]) => {
        if (cancelled) return;
        const n = noteSnap.exists() ? (noteSnap.data() as Record<string, unknown>) : null;
        const text = typeof n?.notes === "string" ? n.notes.trim() : "";
        const c = careSnap.exists() ? (careSnap.data() as Record<string, unknown>) : null;
        const f = c?.flag as Record<string, unknown> | null | undefined;
        const flagText = typeof f?.note === "string" ? f.note.trim() : "";
        const notes = floorSnap.docs
          .map((d) => floorNoteFromDoc(d.id, d.data() as Record<string, unknown>))
          .filter((x): x is FloorNote => x !== null);
        const threads = floorThreads(notes, machineId);
        // The old note shows only while it hasn't become one of the dated ones.
        const stillEarlier = text
          ? earlierNotes({ studioNotes: { text } }, threads, copiedKeysOf(notes, machineId)).length > 0
          : false;
        setRead({
          status: "ready",
          open: openFloorLines(threads).map((o) => ({
            text: o.text,
            latest: o.latest,
            by: o.by.trim() ? o.by.trim().split(/\s+/)[0] : null,
            day: o.atMs ? studioDateKey(new Date(o.atMs)) : null,
          })),
          note: stillEarlier ? { text, by: nameOf(n?.updatedBy), day: dayOf(n?.updatedAt) } : null,
          flag: f ? { text: flagText, by: nameOf(f.by), day: dayOf(f.at) } : null,
        });
      })
      .catch(() => {
        if (!cancelled) setRead((prev) => (again && prev.status === "ready" ? prev : { status: "failed" }));
      });
    return () => {
      cancelled = true;
    };
  }, [studioId, machineId, round]);
  return read;
}

export function FloorNoteCard({
  studioId,
  studioName,
  machineId,
}: {
  studioId: string | null;
  studioName?: string | null;
  machineId: string | null;
}) {
  const read = useFloorNote(studioId, machineId);
  return <FloorNoteLines read={read} studioName={studioName} />;
}

/**
 * The card drawn from a read already made: the machine menu reads the floor
 * once (its safety strip and the header pill's count both need the answer)
 * and hands it in, so the unit is never read twice.
 */
export function FloorNoteLines({ read, studioName }: { read: FloorRead; studioName?: string | null }) {
  const whose = studioName?.trim() ? `${studioName.trim()}'s` : "The floor's";
  if (read.status === "loading") return null;
  if (read.status === "failed") {
    return (
      <p className="eq-floornote__failed" data-testid="floor-note-failed">
        {whose} notes on this machine couldn&rsquo;t be read just now.
      </p>
    );
  }
  if (!read.note && !read.flag && read.open.length === 0) return null;
  const shown = read.open.slice(0, FLOOR_NOTES_AT_MACHINE);
  const more = read.open.length - shown.length;
  return (
    <section className="eq-floornote" aria-label={`${whose} notes on this machine`} data-testid="floor-note">
      <span className="eq-floornote__kicker">
        <Wrench size={12} strokeWidth={2.6} aria-hidden />
        {whose} notes on this machine
      </span>
      {read.flag && (
        <p className="eq-floornote__flag" data-testid="floor-note-flag">
          <b>Flagged{read.flag.text ? ":" : ""}</b> {read.flag.text ? firstSentences(read.flag.text, 140) || read.flag.text : "something's wrong with it."}
          {read.flag.by || read.flag.day ? (
            <i>
              {" "}
              {[read.flag.by, read.flag.day].filter(Boolean).join(" · ")}
            </i>
          ) : null}
        </p>
      )}
      {shown.map((o, i) => (
        <p key={i} className="eq-floornote__text" data-testid="floor-note-open">
          {o.text}
          {o.latest && <span className="eq-floornote__latest">Latest: {o.latest}</span>}
          {o.by || o.day ? (
            <i>
              {" "}
              {[o.by, o.day].filter(Boolean).join(" · ")}
            </i>
          ) : null}
        </p>
      ))}
      {more > 0 && (
        <p className="eq-floornote__more">
          {more} more on the machine&rsquo;s Catalog page.
        </p>
      )}
      {read.note && (
        <p className="eq-floornote__text">
          {read.note.text}
          {read.note.by || read.note.day ? (
            <i>
              {" "}
              {[read.note.by, read.note.day].filter(Boolean).join(" · ")}
            </i>
          ) : null}
        </p>
      )}
    </section>
  );
}
