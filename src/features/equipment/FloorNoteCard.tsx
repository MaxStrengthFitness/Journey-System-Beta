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
 * So the sheet reads both, once, when it opens — two documents, no listener,
 * no index — and draws them read-only under the watch-outs: the flag first
 * (something is wrong with it today), then the floor's note. Neither is
 * about the client, so neither is written here; the door to change the
 * floor's note is where it lives. Nothing when there is nothing, and a read
 * that failed says so rather than looking like "no notes".
 */
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { Wrench } from "lucide-react";
import { db } from "../../firebase";
import { firstSentences } from "../../lib/first-sentences";
import { studioDateKey } from "../../lib/studio-time";

type FloorRead =
  | { status: "loading" }
  | { status: "failed" }
  | {
      status: "ready";
      note: { text: string; by: string | null; day: string | null } | null;
      flag: { text: string; by: string | null; day: string | null } | null;
    };

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

/** Read the floor's note and the Relay flag for one machine, once. */
export function useFloorNote(studioId: string | null, machineId: string | null): FloorRead {
  const [read, setRead] = useState<FloorRead>({ status: "loading" });
  useEffect(() => {
    let cancelled = false;
    if (!studioId || !machineId) {
      setRead({ status: "ready", note: null, flag: null });
      return;
    }
    setRead({ status: "loading" });
    // Inside a promise, so even a read that throws as it starts is a failed read, never a crash.
    Promise.resolve()
      .then(() =>
        Promise.all([
          getDoc(doc(db, "studios", studioId, "machineNotes", machineId)),
          getDoc(doc(db, "studios", studioId, "machineCare", machineId)),
        ]),
      )
      .then(([noteSnap, careSnap]) => {
        if (cancelled) return;
        const n = noteSnap.exists() ? (noteSnap.data() as Record<string, unknown>) : null;
        const text = typeof n?.notes === "string" ? n.notes.trim() : "";
        const c = careSnap.exists() ? (careSnap.data() as Record<string, unknown>) : null;
        const f = c?.flag as Record<string, unknown> | null | undefined;
        const flagText = typeof f?.note === "string" ? f.note.trim() : "";
        setRead({
          status: "ready",
          note: text ? { text, by: nameOf(n?.updatedBy), day: dayOf(n?.updatedAt) } : null,
          flag: f ? { text: flagText, by: nameOf(f.by), day: dayOf(f.at) } : null,
        });
      })
      .catch(() => {
        if (!cancelled) setRead({ status: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [studioId, machineId]);
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
  const whose = studioName?.trim() ? `${studioName.trim()}'s` : "The floor's";
  if (read.status === "loading") return null;
  if (read.status === "failed") {
    return (
      <p className="eq-floornote__failed" data-testid="floor-note-failed">
        {whose} notes on this machine couldn&rsquo;t be read just now.
      </p>
    );
  }
  if (!read.note && !read.flag) return null;
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
