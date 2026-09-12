/**
 * The Renewal card — tapped from the package tile on a client's profile.
 *
 * Everyone who can open the client sees it (proposal §3): where the client
 * stands on both clocks, in sentences; anything worth knowing before the
 * conversation; what the app couldn't see; and every conversation logged so
 * far, newest first — so a leader opening a client knows "if and who has
 * talked to them about renewals", and a trainer doesn't ask again.
 *
 * It works the numbers out fresh (useLiveRenewal) and falls back to last
 * night's snapshot while that loads or if it can't.
 */

import React, { useState } from "react";
import { CalendarClock, MessageSquarePlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useLiveRenewal } from "./useLiveRenewal";
import { useRenewalCycle, useRenewalTouches } from "./useRenewalCycle";
import { LogConversationDialog } from "./LogConversationDialog";
import {
  SITUATION_TONE,
  dayLabel,
  paceSentence,
  proofSentence,
  situationSentence,
} from "./sentences";
import { concernLabel, interestLabel, latestLine, leaningLabel } from "./conversation";
import { studioDateKey, studioTodayKey } from "../../lib/studio-time";
import type { Client, Trainer } from "../../types";
import type { RenewalSnapshot } from "./types";

export interface RenewalCardDialogProps {
  open: boolean;
  onClose: () => void;
  client: Client;
  trainer: Pick<Trainer, "fullName"> | null;
  machineNames?: Record<string, string>;
}

const TONE_CLASS: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300",
  warn: "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300",
  alert: "bg-rose-50 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300",
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

const LABEL = "text-[11px] font-bold uppercase tracking-widest text-muted-foreground";

function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-card p-3 dark:border-slate-800">
      <p className={LABEL}>{label}</p>
      <p className="mt-1 text-[15px] font-bold text-slate-900 dark:text-slate-50">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Clocks({ s, today }: { s: RenewalSnapshot; today: string }) {
  const est = (src: string | null) => (src === "estimate" ? "estimated" : src === "mindbody" ? "from Mindbody" : undefined);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Fact
        label="Sessions left"
        value={s.sessionsLeft ?? "Not known"}
        sub={
          s.sessionsLeft !== null
            ? [est(s.sessionsLeftSource), s.paymentsLeft ? `${s.sessionsOnHand ?? 0} on hand + ${s.paymentsLeft} payment${s.paymentsLeft === 1 ? "" : "s"} to come` : null]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
      />
      <Fact
        label={s.paymentMode === "monthly" ? (s.autoRenews === false ? "Billing ends" : "Auto-renews") : "Package"}
        value={
          s.paymentMode === "monthly"
            ? dayLabel(s.chargeDate, today) || "Not known"
            : s.paymentMode === "prepaid"
              ? "Paid in full"
              : s.paymentMode === "sessions-only"
                ? "Billing finished"
                : "Not known"
        }
        sub={s.paymentMode === "monthly" ? est(s.chargeDateSource) : s.packageLabel ?? undefined}
      />
      <Fact label="Pace" value={paceSentence(s)} sub={s.lastVisitDate ? `Last visit ${dayLabel(s.lastVisitDate, today)}` : undefined} />
      <Fact
        label={s.situation === "will-bank" ? "Banked when billing ends" : "Runs out"}
        value={
          s.situation === "will-bank"
            ? `About ${s.bankedAtCharge ?? 0}`
            : s.runOutDate
              ? `Around ${dayLabel(s.runOutDate, today)}`
              : "Not known yet"
        }
        sub={s.nextBookingDate ? `Next booked ${dayLabel(s.nextBookingDate, today)}` : "Nothing booked"}
      />
    </div>
  );
}

export function RenewalCardDialog({ open, onClose, client, trainer, machineNames }: RenewalCardDialogProps) {
  const today = studioTodayKey();
  const { snapshot, live, loading, error } = useLiveRenewal(client, { enabled: open, machineNames });
  const studioId = client.homeStudioId;
  const { cycle } = useRenewalCycle(open ? studioId : null, snapshot?.cycleKey ?? null);
  const { touches, error: touchesError } = useRenewalTouches(studioId, snapshot?.cycleKey ?? null, open);
  const [logging, setLogging] = useState(false);

  const s = snapshot;
  const latest = latestLine(cycle, today);
  const proof = s ? proofSentence(s) : null;

  return (
    <>
      <Dialog open={open && !logging} onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black">
              <CalendarClock className="h-5 w-5 text-sky-600 dark:text-sky-400" />
              Renewal · {client.firstName} {client.lastName}
            </DialogTitle>
            <DialogDescription>
              {s?.packageLabel ?? "Package not recognized yet"}
              {" · "}
              {live ? "worked out just now" : loading ? "updating…" : "as of last night"}
            </DialogDescription>
          </DialogHeader>

          {!s ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {loading ? "Working it out…" : "Nothing to show yet. The nightly job hasn't reached this client."}
            </p>
          ) : (
            <div className="space-y-4">
              <p className={cn("rounded-xl p-3 text-[15px] font-bold", TONE_CLASS[SITUATION_TONE[s.situation]])}>
                {situationSentence(s, today)}
              </p>
              {error && <p className="text-[12px] text-amber-700 dark:text-amber-300">{error}</p>}

              <Clocks s={s} today={today} />

              {proof && (
                <p className="text-sm text-slate-700 dark:text-slate-200">
                  <span className={LABEL}>Proof · </span>
                  {proof}
                </p>
              )}

              {s.flags.length > 0 && (
                <div className="space-y-1.5">
                  <p className={LABEL}>Worth knowing</p>
                  <ul className="space-y-1">
                    {s.flags.map((f) => (
                      <li key={f.code + f.text} className="text-sm text-slate-700 dark:text-slate-200">
                        • {f.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {s.dataGaps.length > 0 && (
                <div className="space-y-1.5">
                  <p className={LABEL}>What the app can't see yet</p>
                  <ul className="space-y-1">
                    {s.dataGaps.map((g) => (
                      <li key={g} className="text-[13px] text-muted-foreground">
                        • {g}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-2">
                <p className={LABEL}>Conversations</p>
                {latest && (
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">Latest: {latest}</p>
                )}
                {touchesError && <p className="text-[12px] text-amber-700">{touchesError}</p>}
                {touches.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">Nobody has logged a conversation yet.</p>
                ) : (
                  <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {touches.map((t) => (
                      <li key={t.id} className="p-3">
                        <p className="text-[13px] font-bold text-slate-800 dark:text-slate-100">
                          {leaningLabel(t.leaning)}
                          {t.concerns.length > 0 && ` — ${t.concerns.map(concernLabel).join(", ").toLowerCase()}`}
                          {t.needsLeader && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                              Needs a leader
                            </span>
                          )}
                        </p>
                        <p className="text-[12px] text-muted-foreground">
                          {t.authorName}
                          {studioDateKey((t.at ?? null) as any) ? ` · ${dayLabel(studioDateKey(t.at as any), today)}` : ""}
                          {t.interestedIn ? ` · interested in ${interestLabel(t.interestedIn).toLowerCase()}` : ""}
                        </p>
                        {t.note && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{t.note}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-slate-300 px-5 text-[12px] font-black uppercase tracking-widest text-slate-700 dark:border-slate-700 dark:text-slate-200"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setLogging(true)}
              disabled={!s?.cycleKey}
              title={s?.cycleKey ? undefined : "No package on file to log it under"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cta-strong px-5 text-[12px] font-black uppercase tracking-widest text-white disabled:opacity-50"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Log a conversation
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LogConversationDialog
        open={open && logging}
        onClose={() => setLogging(false)}
        client={client}
        snapshot={s}
        trainer={trainer}
      />
    </>
  );
}
