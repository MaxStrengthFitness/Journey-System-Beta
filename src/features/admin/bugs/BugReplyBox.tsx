/**
 * THE REPLY ON AN OPENED BUG REPORT (the Admins room's second wave, Sep 28
 * 2026; bug-reply.ts says what it is). Reply writes the one field, signed
 * with the Auth uid and the server's time; the reporter reads it on Settings
 * → Your reports. Nothing is emailed, and the box says so. A reply half
 * typed joins the leave question.
 */
import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { MessageSquareReply } from "lucide-react";
import { auth, db } from "../../../firebase";
import { AdminButton, AdminField, AdminNotice, AdminTextarea } from "../primitives";
import { useUnsavedChanges } from "../../unsaved-changes";
import { REPLY_MAX, replyLine, replyPayload, type BugReply } from "./bug-reply";
import type { ReportView } from "./reportView";

export function BugReplyBox({
  report,
  replierName,
  onSaved,
}: {
  report: ReportView;
  /** The signed-in administrator's name, signed on the reply. */
  replierName: string;
  onSaved: (reply: BugReply) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(report.reply?.text ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const who = report.reporter || "the reporter";

  const dirty = editing && text.trim() !== (report.reply?.text ?? "").trim();
  const close = () => {
    setEditing(false);
    setText(report.reply?.text ?? "");
    setError(null);
  };
  useUnsavedChanges(dirty && !busy, `your reply to ${who}`, { onDiscard: close });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const uid = auth.currentUser?.uid ?? "";
      const payload = replyPayload(text, uid, replierName);
      await updateDoc(doc(db, "bug_reports", report.id), { reply: { ...payload, at: serverTimestamp() } });
      onSaved({ text: payload.text, byName: payload.by.name, byUid: payload.by.uid, at: Date.now() });
      setEditing(false);
    } catch (err) {
      setError(`Couldn't save the reply: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="hq-reply">
        <AdminField
          label={`Reply to ${who}`}
          htmlFor={`hq-reply-${report.id}`}
          hint={`${who} reads it on this report in Settings, the next time they look. Nothing is emailed.`}
        >
          <AdminTextarea id={`hq-reply-${report.id}`} value={text} maxLength={REPLY_MAX} rows={3} onChange={(e) => setText(e.target.value)} />
        </AdminField>
        {error ? <AdminNotice tone="alert">{error}</AdminNotice> : null}
        <div className="hq-reply__acts">
          <AdminButton size="sm" variant="primary" disabled={!text.trim() || !dirty} busy={busy} onClick={() => void save()}>
            Save the reply
          </AdminButton>
          <AdminButton size="sm" variant="ghost" onClick={close} disabled={busy}>
            Cancel
          </AdminButton>
        </div>
      </div>
    );
  }

  if (report.reply) {
    return (
      <div className="hq-reply">
        <p className="hq-reply__head">
          {replyLine(report.reply)}. {who} reads it in Settings.
        </p>
        <p className="hq-reply__text">{report.reply.text}</p>
        <div className="hq-reply__acts">
          <AdminButton
            size="sm"
            onClick={() => {
              setText(report.reply?.text ?? "");
              setEditing(true);
            }}
          >
            Edit the reply
          </AdminButton>
        </div>
      </div>
    );
  }

  return (
    <div className="hq-reply__acts">
      <AdminButton size="sm" onClick={() => setEditing(true)}>
        <MessageSquareReply className="w-3.5 h-3.5" aria-hidden="true" /> Reply to {who}
      </AdminButton>
    </div>
  );
}
