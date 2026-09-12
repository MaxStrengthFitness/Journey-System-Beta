/**
 * COMMENTS — the writes. A post is one document; each person it tags gets a
 * notification in their bell (notify() is best-effort and never throws, so a
 * bell that cannot be rung never loses the comment).
 */

import { addDoc, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { auth } from "../../firebase";
import { learningRefKey, learningRefLabel, type StoredLearningRef } from "../learning/ref";
import { notify } from "../notifications/mutations";
import { commentsRef } from "./hooks";
import { commentExcerpt, mentionTitle, newMentions, type Mention, type StudioComment } from "./comments";

export interface CommentAuthor {
  /** The Firebase Auth uid — the rules pin authorId to it. */
  id: string;
  name: string;
}

function ringBells(studioId: string, author: CommentAuthor, target: StoredLearningRef, body: string, tagged: Mention[]) {
  const label = learningRefLabel(target);
  return Promise.all(
    tagged.map((m) =>
      notify({
        to: m.id,
        actor: { id: author.id, name: author.name || "A trainer" },
        kind: "comment-mention",
        title: mentionTitle(author.name, label),
        body: commentExcerpt(body),
        studioId,
        link: { view: target.kind === "machine" ? "machine-anatomy" : "academy", learning: target },
      }),
    ),
  );
}

export async function postComment(
  studioId: string,
  target: StoredLearningRef,
  body: string,
  mentions: Mention[],
  author: CommentAuthor,
): Promise<void> {
  const uid = auth.currentUser?.uid ?? author.id;
  await addDoc(commentsRef(studioId), {
    studioId,
    targetKey: learningRefKey(target),
    target,
    body: body.trim(),
    authorId: uid,
    authorName: (author.name || "A trainer").slice(0, 80),
    mentions,
    createdAt: serverTimestamp(),
  });
  await ringBells(studioId, { ...author, id: uid }, target, body.trim(), mentions);
}

/** The author's correction. Only people it newly tags are told. */
export async function editComment(
  studioId: string,
  comment: StudioComment,
  body: string,
  mentions: Mention[],
  author: CommentAuthor,
): Promise<void> {
  await updateDoc(doc(commentsRef(studioId), comment.id), {
    body: body.trim(),
    mentions,
    editedAt: serverTimestamp(),
  });
  const added = newMentions(comment.mentions, mentions);
  if (added.length > 0) await ringBells(studioId, author, comment.target, body.trim(), added);
}

export async function deleteComment(studioId: string, commentId: string): Promise<void> {
  await deleteDoc(doc(commentsRef(studioId), commentId));
}
