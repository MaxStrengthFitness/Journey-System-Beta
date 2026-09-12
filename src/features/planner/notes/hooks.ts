/**
 * PLANNER NOTES — the listeners, and the client search the editor links with.
 *
 * A failed read is "unknown", never "empty": every hook reports an error
 * separately, and the screens say they could not load rather than "no notes".
 */

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { queryStudioIds } from "../../../lib/tenancy";
import type { Client, Trainer } from "../../../types";
import { noteFoldersRef, notesRef, sharedNotesRef } from "./mutations";
import { folderFromDoc, noteFromDoc, sharedNoteFromDoc, sortFolders } from "./notes";
import type { NoteFolder, SharedNote, TrainerNote } from "./types";

/** The top of the Unicode range: a prefix query's upper bound, as the directory does it. */
const END = "\uf8ff";

/** Estimated server times, so a note just saved sorts as newest at once. */
const ESTIMATE = { serverTimestamps: "estimate" } as const;

export interface TrainerNotesState {
  notes: TrainerNote[];
  folders: NoteFolder[];
  loading: boolean;
  error: string | null;
}

/** A trainer's notes and folders: two listeners, on their own tree only. */
export function useTrainerNotes(uid: string | null): TrainerNotesState {
  const [notes, setNotes] = useState<{ list: TrainerNote[]; ready: boolean; error: string | null }>({
    list: [],
    ready: false,
    error: null,
  });
  const [folders, setFolders] = useState<{ list: NoteFolder[]; ready: boolean; error: string | null }>({
    list: [],
    ready: false,
    error: null,
  });

  useEffect(() => {
    if (!uid) {
      setNotes({ list: [], ready: true, error: null });
      setFolders({ list: [], ready: true, error: null });
      return;
    }
    setNotes((p) => ({ ...p, ready: false, error: null }));
    setFolders((p) => ({ ...p, ready: false, error: null }));
    const offNotes = onSnapshot(
      query(notesRef(uid), orderBy("updatedAt", "desc"), limit(500)),
      (snap) =>
        setNotes({ list: snap.docs.map((d) => noteFromDoc(d.id, d.data(ESTIMATE))), ready: true, error: null }),
      (err: any) => {
        console.warn("[notes] read failed:", err);
        setNotes({ list: [], ready: true, error: "Couldn't load your notes. Check the connection and open the Planner again." });
      },
    );
    const offFolders = onSnapshot(
      query(noteFoldersRef(uid), limit(200)),
      (snap) =>
        setFolders({
          list: sortFolders(snap.docs.map((d) => folderFromDoc(d.id, d.data(ESTIMATE)))),
          ready: true,
          error: null,
        }),
      (err: any) => {
        console.warn("[notes] folders read failed:", err);
        setFolders({ list: [], ready: true, error: "Couldn't load your folders." });
      },
    );
    return () => {
      offNotes();
      offFolders();
    };
  }, [uid]);

  return {
    notes: notes.list,
    folders: folders.list,
    loading: !notes.ready || !folders.ready,
    error: notes.error ?? folders.error,
  };
}

export interface SharedNotesState {
  /** Newest first. */
  notes: SharedNote[];
  loading: boolean;
  error: string | null;
}

/** The notes trainers have shared onto one client's record. One listener per open profile. */
export function useSharedNotes(clientId: string | null | undefined): SharedNotesState {
  const [state, setState] = useState<SharedNotesState>({ notes: [], loading: Boolean(clientId), error: null });
  useEffect(() => {
    if (!clientId) {
      setState({ notes: [], loading: false, error: null });
      return;
    }
    setState((p) => ({ ...p, loading: true, error: null }));
    return onSnapshot(
      query(sharedNotesRef(clientId), orderBy("updatedAt", "desc"), limit(100)),
      (snap) =>
        setState({
          notes: snap.docs.map((d) => sharedNoteFromDoc(d.id, d.data(ESTIMATE))),
          loading: false,
          error: null,
        }),
      (err: any) => {
        console.warn("[notes] shared notes read failed:", err);
        setState({
          notes: [],
          loading: false,
          error:
            err?.code === "permission-denied"
              ? "Plans from the team are only visible to this client's studio."
              : "Couldn't load the team's plans.",
        });
      },
    );
  }, [clientId]);
  return state;
}

/**
 * Is the shared copy of this note still on the client's record?
 *
 *   checking    not known yet (or offline — the cache cannot say "gone")
 *   present     it is there
 *   missing     it is not: a studio leader, or this trainer on another
 *               device, removed it
 *   unreadable  this trainer can no longer open that client's record
 *
 * Only a SERVER answer can say "missing": the local cache answers "no such
 * document" for anything it has never seen, which is not the same thing.
 */
export type SharedCopyStatus = "checking" | "present" | "missing" | "unreadable";

export function useSharedCopy(clientId: string | null, noteId: string | null): SharedCopyStatus {
  const [status, setStatus] = useState<SharedCopyStatus>("checking");
  useEffect(() => {
    if (!clientId || !noteId) {
      setStatus("checking");
      return;
    }
    setStatus("checking");
    return onSnapshot(
      doc(sharedNotesRef(clientId), noteId),
      { includeMetadataChanges: true },
      (snap) => {
        // Capture metadata before exists() narrows snap's type to never in the else branch.
        const fromCache = snap.metadata.fromCache;
        if (snap.exists()) setStatus("present");
        else if (!fromCache) setStatus("missing");
      },
      (err: any) => setStatus(err?.code === "permission-denied" ? "unreadable" : "checking"),
    );
  }, [clientId, noteId]);
  return status;
}

export interface ClientDocState {
  client: Client | null;
  /** unreadable: the rules said no. failed: no answer (offline, say). */
  state: "idle" | "loading" | "ready" | "unreadable" | "failed";
}

/**
 * One client's document, read once — for the one case the Planner does not
 * already hold it: a note about a client who is not on today's schedule, so
 * Share can check their studio. Never called in a loop: a note has at most
 * one client when this matters.
 */
export function useClientDoc(clientId: string | null): ClientDocState {
  const [state, setState] = useState<ClientDocState>({ client: null, state: "idle" });
  useEffect(() => {
    if (!clientId) {
      setState({ client: null, state: "idle" });
      return;
    }
    let live = true;
    setState({ client: null, state: "loading" });
    getDoc(doc(db, "clients", clientId)).then(
      (snap) => {
        if (!live) return;
        setState(
          snap.exists()
            ? { client: { ...(snap.data() as Client), id: snap.id }, state: "ready" }
            : { client: null, state: "ready" },
        );
      },
      (err: any) => {
        if (!live) return;
        console.warn("[notes] client read failed:", err);
        setState({ client: null, state: err?.code === "permission-denied" ? "unreadable" : "failed" });
      },
    );
    return () => {
      live = false;
    };
  }, [clientId]);
  return state;
}

export interface ClientSearchState {
  results: Client[];
  searching: boolean;
  /** The search itself failed: the results say nothing about who exists. */
  failed?: boolean;
}

/**
 * Clients to link, by name, at the studio the trainer is standing in.
 *
 * The same two queries the client directory runs (first name, last name, by
 * a three-letter prefix, `homeStudioId in` the trainer's studios) — same
 * indexes, same tenancy (src/lib/tenancy.ts), nothing new to deploy. Today's
 * roster, which the Planner already has, is offered before anything is typed.
 */
export function useClientSearch(
  term: string,
  authTrainer: Trainer | null | undefined,
  activeStudioId: string | null | undefined,
): ClientSearchState {
  const [state, setState] = useState<ClientSearchState>({ results: [], searching: false });
  const studioKey = queryStudioIds(authTrainer ?? null, activeStudioId).join(",");

  useEffect(() => {
    const t = term.trim().toLowerCase();
    // The first word's letters: "Al Smith" searches "al", not "als" — the
    // prefix used to run across the space (review fix). The other words
    // still narrow the results below.
    const alpha = (t.split(/\s+/)[0] ?? "").replace(/[^a-z]/g, "");
    const prefix = alpha.slice(0, 3);
    const studioIds = studioKey ? studioKey.split(",") : [];
    if (!prefix || studioIds.length === 0) {
      setState({ results: [], searching: false });
      return;
    }
    let live = true;
    setState((p) => ({ ...p, searching: true }));
    const handle = setTimeout(async () => {
      const cap = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      const ref = collection(db, "clients");
      try {
        const [a, b] = await Promise.all([
          getDocs(query(ref, where("homeStudioId", "in", studioIds), where("firstName", ">=", cap), where("firstName", "<=", cap + END), limit(30))),
          getDocs(query(ref, where("homeStudioId", "in", studioIds), where("lastName", ">=", cap), where("lastName", "<=", cap + END), limit(30))),
        ]);
        const byId = new Map<string, Client>();
        for (const d of [...a.docs, ...b.docs]) byId.set(d.id, { ...(d.data() as Client), id: d.id });
        const words = t.split(/\s+/).filter(Boolean);
        const results = [...byId.values()].filter((c) => {
          const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase();
          return words.every((w) => name.includes(w));
        });
        if (live) setState({ results, searching: false });
      } catch (err) {
        console.warn("[notes] client search failed:", err);
        if (live) setState({ results: [], searching: false, failed: true });
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [term, studioKey]);

  return state;
}
