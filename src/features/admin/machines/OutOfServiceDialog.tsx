/**
 * "WHY IS IT OUT OF SERVICE?" — the floor editor asks, in a few words.
 *
 * Wave 2 of the Machine Catalog room (AJ, Sep 28 2026, "all yes"): a reason
 * on Out of service, "a short note and who set it, on the studio's machine
 * entry, so the row can say why". Trainers read it on the floor list and on
 * the machine's Catalog page, with who set it and when
 * (features/catalog/out-of-service.ts).
 *
 * The reason is asked for, never guessed: the button stays until something
 * is typed, and a reason is at most 140 characters (the rules hold the same
 * number). What is typed joins the unsaved-changes guard, so a navigation
 * over it asks first; a tap on the dim background closes it only while it
 * is empty. Nothing is written here: the host writes, signed by the person
 * at the iPad.
 */
import { useState } from "react";
import { useUnsavedChanges } from "../../unsaved-changes";
import { OUT_OF_SERVICE_REASON_MAX, reasonToStore } from "../../catalog/out-of-service";
import { AdminButton, AdminField, AdminTextarea } from "../primitives";

export function OutOfServiceDialog({
  machineName,
  busy = false,
  onCancel,
  onConfirm,
}: {
  machineName: string;
  busy?: boolean;
  onCancel: () => void;
  /** The reason, tidied and within the limit. */
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  const [why, setWhy] = useState<string | null>(null);
  useUnsavedChanges(text.trim() !== "", `why ${machineName} is out of service`, {
    onDiscard: () => setText(""),
  });

  const confirm = () => {
    const r = reasonToStore(text);
    if (r.ok === false) {
      setWhy(r.why);
      return;
    }
    onConfirm(r.reason);
  };

  return (
    <div
      className="adm-scrim adm"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && text.trim() === "") onCancel();
      }}
    >
      <div
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Take ${machineName} out of service`}
        style={{ maxWidth: 520 }}
      >
        <div className="adm-dialog__body">
          <h3 className="adm-dialog__title">Take {machineName} out of service</h3>
          <p className="adm-dialog__text">
            Trainers see it as out of service on the floor list and on its Catalog page, with the reason and who set it.
          </p>
          <AdminField
            label="Why is it out of service?"
            htmlFor="oos-reason"
            error={why}
            hint={`A few words, up to ${OUT_OF_SERVICE_REASON_MAX} characters.`}
            wide
          >
            <AdminTextarea
              id="oos-reason"
              value={text}
              maxLength={OUT_OF_SERVICE_REASON_MAX}
              onChange={(e) => {
                setText(e.target.value);
                if (why) setWhy(null);
              }}
              placeholder="A new cable is on order"
            />
          </AdminField>
        </div>
        <div className="adm-dialog__foot">
          <AdminButton variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </AdminButton>
          <AdminButton variant="primary" busy={busy} disabled={text.trim() === ""} onClick={confirm}>
            Take it out of service
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
