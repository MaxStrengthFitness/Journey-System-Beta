/**
 * COMMENTS — one listener per open page, on that studio's thread for it.
 * A failed read is "unknown", never "no comments".
 */

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { commentFromDoc, sortComments, type StudioComment } from "./comments";

export function commentsRef(studioId: string) {
  return collection(db, "studios", studioId, "comments");
}

export interface CommentsState {
  comments: StudioComment[];
  loading: boolean;
  error: string | null;
}

export function useComments(studioId: string | null, targetKey: string | null): CommentsState {
  const [state, setState] = useState<CommentsState>({ comments: [], loading: Boolean(studioId && targetKey), error: null });
  useEffect(() => {
    if (!studioId || !targetKey) {
      setState({ comments: [], loading: false, error: null });
      return;
    }
    setState({ comments: [], loading: true, error: null });
    // The newest 200, then read oldest first (sortComments). Oldest-first
    // with the limit would drop the newest — the one just posted — once a
    // page passed 200. The index in firestore.indexes.json is descending.
    return onSnapshot(
      query(commentsRef(studioId), where("targetKey", "==", targetKey), orderBy("createdAt", "desc"), limit(200)),
      (snap) =>
        setState({
          comments: sortComments(
            snap.docs
              .map((d) => commentFromDoc(d.id, studioId, d.data({ serverTimestamps: "estimate" })))
              .filter((c): c is StudioComment => c !== null),
          ),
          loading: false,
          error: null,
        }),
      (err: any) => {
        console.warn("[comments] read failed:", err);
        setState({
          comments: [],
          loading: false,
          error:
            err?.code === "permission-denied"
              ? "Comments here are for the people who work at this studio."
              : "Couldn't load the comments. Check the connection.",
        });
      },
    );
  }, [studioId, targetKey]);
  return state;
}
