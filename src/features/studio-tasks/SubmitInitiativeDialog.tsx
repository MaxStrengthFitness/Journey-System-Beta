/**
 * "I did it with these five clients."
 *
 * A manager posts an initiative — five progress reports each by Friday — and
 * this is how a trainer logs which clients they did it with. The manager then
 * opens the roll-up and can go and look at those five.
 *
 * WHY A PICKER AND NOT A NUMBER
 * A count would be half the feature and all of the busywork. "Six done" tells
 * a manager nothing they can act on; six names tell them whose reports to
 * read, and it makes the claim checkable, which is what stops an initiative
 * quietly becoming a box people tick.
 *
 * Client ids ARE stored here, unlike the playbook. That distinction is
 * deliberate and argued in initiatives.ts: this records that routine coaching
 * admin happened for a named client, which is ordinary operational record. The
 * playbook records a physical complaint and a workaround, which is not.
 */
import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "../../lib/utils";
import type { Client } from "../../types";
import { CLIENT_ACTION_LABEL } from "./types";
import {
  withEntry,
  withoutEntry,
  type InitiativeTarget,
  type SubmissionEntry,
} from "./initiatives";

export interface SubmitInitiativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The initiative's own ask. */
  target?: InitiativeTarget;
  title: string;
  clients: Client[];
  /** What this trainer has already logged, so the dialog opens on their work. */
  entries: SubmissionEntry[];
  saving?: boolean;
  onSave: (entries: SubmissionEntry[]) => Promise<void> | void;
}

export function SubmitInitiativeDialog({
  open,
  onOpenChange,
  target,
  title,
  clients,
  entries,
  saving,
  onSave,
}: SubmitInitiativeDialogProps) {
  const [draft, setDraft] = useState<SubmissionEntry[]>(entries);
  const [term, setTerm] = useState("");

  const per = target?.perTrainer ?? 0;
  const actionLabel = target?.action
    ? CLIENT_ACTION_LABEL[target.action]
    : "this";

  const chosen = useMemo(
    () => new Set(draft.map((e) => e.clientId)),
    [draft],
  );

  /*
   * Search is over the roster already in memory. Capped at 40 results: a
   * picker on a tablet that renders 600 rows is unusable, and anyone past the
   * fortieth match should type another letter rather than scroll.
   */
  const matches = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = clients.filter((c) => {
      if (!c.id) return false;
      if (!q) return true;
      return `${c.firstName ?? ""} ${c.lastName ?? ""}`
        .toLowerCase()
        .includes(q);
    });
    return list.slice(0, 40);
  }, [clients, term]);

  const toggle = (c: Client) => {
    if (!c.id) return;
    setDraft((prev) =>
      chosen.has(c.id!)
        ? withoutEntry(prev, c.id!)
        : withEntry(prev, {
            clientId: c.id!,
            clientName: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Client",
          }),
    );
  };

  const remaining = Math.max(0, per - draft.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[12px] leading-relaxed text-ink-d3">
            {per > 0 ? (
              <>
                Log the clients you did {actionLabel.toLowerCase()} with.{" "}
                <strong className="text-ink-d1">
                  {draft.length} of {per}
                </strong>
                {remaining > 0 ? ` — ${remaining} to go.` : " — that's your share."}
              </>
            ) : (
              <>Log the clients you did {actionLabel.toLowerCase()} with.</>
            )}
          </p>

          {/* What's already logged, so removing one does not mean hunting the list. */}
          {draft.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {draft.map((e) => (
                <li key={e.clientId}>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((prev) => withoutEntry(prev, e.clientId))
                    }
                    className="inline-flex items-center gap-1.5 rounded-full border border-div-d bg-bg-dark-3 px-3 py-1.5 text-[12px] text-ink-d1"
                  >
                    {e.clientName}
                    <X size={12} aria-hidden />
                    <span className="sr-only">Remove {e.clientName}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="relative flex items-center">
            <Search
              size={14}
              aria-hidden
              className="pointer-events-none absolute left-3 text-ink-d3"
            />
            <input
              type="search"
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Find a client…"
              aria-label="Find a client"
              className="min-h-10 w-full rounded-xl border border-input bg-card px-9 text-sm text-ink-d1 placeholder:text-ink-d3 focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <ul className="max-h-64 overflow-y-auto rounded-xl border border-div-d">
            {matches.length === 0 && (
              <li className="p-3 text-[13px] text-ink-d3">
                No clients match “{term.trim()}”.
              </li>
            )}
            {matches.map((c) => {
              const on = chosen.has(c.id!);
              return (
                <li key={c.id} className="border-b border-div-d last:border-0">
                  <button
                    type="button"
                    onClick={() => toggle(c)}
                    aria-pressed={on}
                    // 44px: this is a thumb on an iPad between sessions.
                    className="flex min-h-11 w-full items-center gap-3 px-3 text-left"
                  >
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                        on
                          ? "border-[var(--tp-kaizen,#0a548b)] bg-[var(--tp-kaizen-fill,#eaf0f4)] text-[var(--tp-kaizen,#0a548b)]"
                          : "border-input bg-card text-transparent",
                      )}
                    >
                      <Check size={12} strokeWidth={3} aria-hidden />
                    </span>
                    <span className="text-sm text-ink-d1">
                      {c.firstName} {c.lastName}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <DialogFooter className="gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-10 rounded-xl border border-div-d px-4 text-[11px] font-black uppercase tracking-widest text-ink-d2 hover:border-ink-d3"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave(draft)}
            className="h-10 rounded-xl bg-cta-strong px-5 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : `Log ${draft.length}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
