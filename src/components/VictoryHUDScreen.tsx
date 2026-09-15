import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { AppHeader } from "./AppHeader";
import { FeelToggle } from "./FeelToggle";
import type { ClientFeel } from "../types";
import {
  Client,
  WorkoutSession,
  ExerciseLog,
  Trainer,
  ScheduleEntry,
  Machine,
} from "../types";
import { safeToDate } from "../lib/utils";
import { QuickCheckInDialog } from "../features/subjective-report";
import { FordSweep } from "../features/ford/FordSweep";
import { useClientFord } from "../features/ford/useClientFord";
import { ArrowLeft, CalendarCheck2, CalendarX2, Check, HeartPulse, MessageSquareText, Star } from "lucide-react";
import {
  LogConversationDialog,
  promptText,
  renewalPromptDue,
} from "../features/renewals";
import { getBroadMuscleGroup } from "../lib/clinical-review-utils";
import { performedOnly, SKIP_REASON_SHORT } from "../lib/set-outcome";
import {
  formatNextBooking,
  journeySentence,
  nextBookingFor,
  todayHeadline,
  type JourneyRead,
  type TodayLine,
} from "../lib/post-session";

import { clientFirstName } from "../lib/client-name";
/**
 * THE POST-SESSION SCREEN (rebuilt in the tracker round, Sep 2026).
 *
 * Thirty seconds, walking the client out. AJ's order of business:
 *   1. TODAY — "here's how they did": one line per machine, today against
 *      last time, the max-strength stars, and where the work went.
 *   2. THE JOURNEY — one sentence a trainer can say out loud: "your loads
 *      are up 21% since July across four machines — strongest on lower
 *      body". Says "not enough history yet" below the bar, never a number
 *      it cannot stand behind.
 *   3. NEXT — are they booked? Then how they feel (saves as it is tapped),
 *      a closing note (saved when the trainer leaves), the check-in and
 *      the renewal conversation when one is due.
 *   3b. WHAT THEY TOLD YOU — anything caught with "Remember this" during the
 *      session that has no FORD letter on it yet, with four buttons to file
 *      it. Renders NOTHING when there is nothing outstanding, which is most
 *      sessions. It sits here, after Next and before Lifetime, because
 *      filing three sentences is seconds and the assessment is minutes —
 *      short thing first is what gets both done. Like everything else on
 *      this screen it blocks nothing: walking away costs the trainer
 *      nothing, the captures simply wait in the profile's Life section.
 *   4. LIFETIME — small, at the bottom. Not the thing to go over every
 *      time, but nice to have.
 *
 * There is NO save button. The session was submitted when End Session was
 * confirmed (commitEndSession in the tracker). "Back to Hub" only leaves.
 */

export interface VictoryHUDScreenProps {
  client: Client;
  session: WorkoutSession;
  /** Today's logs as they were committed (outcomes stamped). */
  logs: ExerciseLog[];
  allLogs?: ExerciseLog[];
  lines: TodayLine[];
  journey: JourneyRead;
  schedules?: ScheduleEntry[];
  authTrainer: Trainer | null;
  /** Writes sessions.clientFeel the moment it is tapped. */
  onFeel: (feel: ClientFeel) => void | Promise<void>;
  /** Leaves the screen; the closing note (if any) is filed on the way out. */
  onLeave: (closing: { noteContent: string; notePriority: "High" | "Medium" | "Low" }) => void | Promise<void>;
  machines?: Machine[];
  rightControls?: React.ReactNode;
  trainerDropdown?: React.ReactNode;
  onStudioClick?: () => void;
}

type Priority = "High" | "Medium" | "Low";

const GROUP_TONE: Record<string, string> = {
  "Lower Body": "bg-emerald-500",
  "Upper Body": "bg-cyan",
  "Core & Spine": "bg-orange-500",
  Other: "bg-indigo-500",
};

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-display italic text-cyan text-[11px] uppercase tracking-[0.16em]">{children}</div>
  );
}

function Card({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`mx-5 p-4 bg-bg-dark-2 border border-div-d rounded-[14px] flex flex-col gap-3 ${className}`}
    >
      {children}
    </motion.section>
  );
}

function fmtLb(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function TodayRow({ line }: { line: TodayLine }) {
  const performed = line.outcome === "performed";
  const word =
    line.outcome === "practice"
      ? "Practice"
      : line.outcome === "skipped"
        ? `Skipped${line.skipReason && SKIP_REASON_SHORT[line.skipReason as keyof typeof SKIP_REASON_SHORT] ? " · " + SKIP_REASON_SHORT[line.skipReason as keyof typeof SKIP_REASON_SHORT] : ""}`
        : line.outcome === "not_reached"
          ? "Not reached"
          : "";
  const delta: { text: string; tone: string } | null = (() => {
    if (!performed) return null;
    if (line.first) return { text: "First time", tone: "text-cyan" };
    if (line.loadDelta === null) return null;
    if (line.loadDelta > 0) return { text: `▲ +${fmtLb(line.loadDelta)} lb`, tone: "text-cyan" };
    if (line.loadDelta < 0) return { text: `▼ ${fmtLb(line.loadDelta)} lb`, tone: "text-ink-d2" };
    if ((line.countDelta ?? 0) > 0) return { text: `▲ +${line.countDelta} ${line.isTSC ? "s" : "rep" + (line.countDelta === 1 ? "" : "s")}`, tone: "text-cyan" };
    if ((line.countDelta ?? 0) < 0) return { text: `▼ ${line.countDelta} ${line.isTSC ? "s" : "rep" + (line.countDelta === -1 ? "" : "s")}`, tone: "text-ink-d2" };
    return { text: "Held", tone: "text-ink-d3" };
  })();
  return (
    <li className={`flex items-center gap-3 min-h-11 py-1 border-b border-div-d last:border-b-0 ${performed ? "" : "opacity-60"}`}>
      <span className="flex-1 min-w-0 text-[14px] font-semibold text-ink-d1 truncate">{line.name}</span>
      {performed ? (
        <>
          <span className="font-mono tabular-nums text-[15px] font-bold text-ink-d1 whitespace-nowrap">
            {line.weight !== null ? fmtLb(line.weight) : "–"}
            <span className="text-[10px] font-semibold text-ink-d3 ml-0.5">lb</span>
            <span className="text-ink-d3 mx-1">×</span>
            {line.count ?? "–"}
            {line.isTSC && <span className="text-[10px] font-semibold text-ink-d3 ml-0.5">s</span>}
          </span>
          {line.quality === 3 && <Star size={14} className="text-amber-400 fill-current shrink-0" aria-label="Max-strength set" />}
          {delta && <span className={`w-20 text-right text-[11px] font-bold whitespace-nowrap ${delta.tone}`}>{delta.text}</span>}
        </>
      ) : (
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-d3 whitespace-nowrap">{word}</span>
      )}
    </li>
  );
}

export function VictoryHUDScreen({
  client,
  session,
  logs,
  allLogs = [],
  lines,
  journey,
  schedules = [],
  authTrainer,
  onFeel,
  onLeave,
  machines = [],
  rightControls,
  trainerDropdown,
  onStudioClick,
}: VictoryHUDScreenProps) {
  const [feel, setFeel] = useState<ClientFeel | null>(null);
  const [feelSaved, setFeelSaved] = useState(false);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<Priority>("Medium");
  const [showCheckIn, setShowCheckIn] = useState(false);

  // Anything caught with "Remember this" during the session and not yet filed.
  // `client: null` because the legacy client.events adapter has nothing to add
  // here — this list is only ever about captures from the floor.
  const { untagged: fordUntagged } = useClientFord({
    clientId: client.id,
    client: null,
  });
  const [checkInSavedId, setCheckInSavedId] = useState<string | null>(null);
  const [showRenewal, setShowRenewal] = useState(false);
  const [renewalLogged, setRenewalLogged] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const renewalDue = renewalPromptDue(client.renewal);

  // A short burst, then quiet — the numbers are the celebration.
  const [particles] = useState(() =>
    Array.from({ length: 36 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 360,
      y: (Math.random() - 0.6) * 300 - 40,
      tone: ["bg-cta", "bg-cyan", "bg-emerald-400", "bg-amber-300", "bg-white"][i % 5],
      size: Math.random() * 7 + 4,
      delay: Math.random() * 0.15,
    })),
  );

  /* The closing note is filed when the trainer leaves — by the button, or by
     closing the tab. Keep the latest text in a ref so an unload can read it. */
  const notesRef = useRef({ notes, priority });
  notesRef.current = { notes, priority };
  const leftRef = useRef(false);
  const leave = () => {
    if (leftRef.current) return;
    leftRef.current = true;
    setLeaving(true);
    void onLeave({ noteContent: notesRef.current.notes, notePriority: notesRef.current.priority });
  };
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && notesRef.current.notes.trim() && !leftRef.current) leave();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFeel = (v: ClientFeel) => {
    setFeel(v);
    setFeelSaved(false);
    Promise.resolve(onFeel(v)).then(() => setFeelSaved(true));
  };

  /* --- today ------------------------------------------------------------ */
  const performed = useMemo(() => performedOnly(logs), [logs]);
  const load = (l: ExerciseLog) => parseFloat(l.loadLb || l.weight || "0") || 0;
  const reps = (l: ExerciseLog) => {
    if (l.isTSC || l.isStaticHold) return ((parseFloat(l.seconds || "0") || 0) / 30) * 2;
    return parseFloat(l.outcomeReps || l.reps || "0") || 0;
  };
  const tonnage = useMemo(() => performed.reduce((s, l) => s + load(l) * reps(l), 0), [performed]);
  const byRegion = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const l of performed) {
      const m = machines.find((x) => x.id === l.machineId);
      const g = getBroadMuscleGroup(m?.anatomicalRegion || "Unknown", m?.name || "");
      acc[g] = (acc[g] ?? 0) + load(l) * reps(l);
    }
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [performed, machines]);

  const startD = safeToDate(session.startTime) || safeToDate(session.createdAt);
  const endD = safeToDate(session.endTime) || new Date();
  const minutes = startD ? Math.max(0, Math.round((endD.getTime() - startD.getTime()) / 60000)) : null;
  const maxSets = performed.filter((l) => (l.repQuality || 0) >= 3).length;

  /* --- next ------------------------------------------------------------- */
  const next = useMemo(() => nextBookingFor(client.id, schedules), [client.id, schedules]);

  /* --- lifetime (the client's own running counters; allLogs is the fallback) */
  const lifetime = useMemo(() => {
    const sessions = client.sessionCount ?? new Set(allLogs.map((l) => l.sessionId)).size;
    const lifetimeReps = client.lifetimeReps ?? performedOnly(allLogs).reduce((s, l) => s + (parseFloat(l.reps || "0") || 0), 0);
    const volume = client.lifetimeWeight ?? performedOnly(allLogs).reduce((s, l) => s + load(l) * reps(l), 0);
    return { sessions, reps: lifetimeReps, volume };
  }, [client, allLogs]);

  const fmtBig = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString());

  return (
    <div className="w-full h-full min-h-screen bg-bg-dark font-sans flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 pointer-events-none z-50 flex items-center justify-center overflow-hidden">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{ scale: [0, 1.2, 1, 0], x: p.x, y: p.y, opacity: [1, 1, 0.7, 0], rotate: 220 }}
            transition={{ duration: 1.3, delay: p.delay, ease: [0.1, 0.8, 0.3, 1] }}
            className={`absolute rounded-xs ${p.tone}`}
            style={{ width: p.size, height: p.size }}
          />
        ))}
      </div>

      <div className="max-w-205 mx-auto w-full h-full relative flex flex-col border-x border-div-d shadow-2xl">
        <AppHeader
          variant="dark"
          trainerInitials={authTrainer?.initials || "AJ"}
          rightControls={rightControls}
          trainerDropdown={trainerDropdown}
          onStudioClick={onStudioClick}
        />

        <div className="flex-1 overflow-y-auto no-scrollbar relative z-10 flex flex-col gap-3 pb-6">
          {/* title */}
          <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="px-6 pt-4 pb-1">
            <Kicker>Session complete · saved</Kicker>
            <h1 className="font-display italic text-ink-d1 text-[34px] uppercase tracking-[-0.01em] leading-none mt-2 mb-2">
              {clientFirstName(client)}, {maxSets > 0 ? "strong work." : "good work."}
            </h1>
            <div className="text-ink-d2 text-[13px]">
              {todayHeadline(lines)}
              {minutes !== null ? ` · ${minutes} min` : ""}
              {session.sessionNumber ? ` · session #${session.sessionNumber}` : ""}
            </div>
          </motion.div>

          {/* 1 · today */}
          <Card delay={0.05}>
            <div className="flex items-baseline justify-between gap-3">
              <Kicker>Today</Kicker>
              <span className="text-[11px] text-ink-d3 font-semibold">vs last time on each machine</span>
            </div>
            <ol className="flex flex-col">
              {lines.map((l) => (
                <TodayRow key={l.machineId} line={l} />
              ))}
            </ol>
            {byRegion.length > 0 && (
              <div className="pt-2 border-t border-div-d">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-ink-d3">Where the work went</span>
                  <span className="font-mono text-[12px] text-ink-d2">{Math.round(tonnage).toLocaleString()} lb moved</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {byRegion.map(([g, v]) => (
                    <div key={g} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${GROUP_TONE[g] ?? "bg-indigo-500"}`} />
                      <span className="w-24 text-[12px] text-ink-d2">{g}</span>
                      <span className="flex-1 h-1.5 rounded-full bg-bg-dark-3 overflow-hidden">
                        <span className={`block h-full ${GROUP_TONE[g] ?? "bg-indigo-500"}`} style={{ width: `${Math.round((100 * v) / tonnage)}%` }} />
                      </span>
                      <span className="w-10 text-right font-mono text-[11px] text-ink-d3">{Math.round((100 * v) / tonnage)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* 2 · the journey */}
          <Card delay={0.12}>
            <Kicker>The journey</Kicker>
            <p className={`text-[15px] leading-snug ${journey.enough ? "text-ink-d1 font-semibold" : "text-ink-d3"}`}>
              {journeySentence(journey, clientFirstName(client))}
            </p>
            {journey.standout && (
              <p className="text-[12.5px] text-ink-d2">
                Biggest gain: <b className="text-ink-d1">{journey.standout.name}</b>, {fmtLb(journey.standout.startWeight)} → {fmtLb(journey.standout.nowWeight)} lb (+{journey.standout.pct}%).
              </p>
            )}
            {journey.byGroup.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {journey.byGroup.map((g) => (
                  <span key={g.group} className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-bg-dark-3 border border-div-d text-ink-d2">
                    {g.group} <span className={g.pct > 0 ? "text-cyan" : "text-ink-d3"}>{g.pct > 0 ? "+" : ""}{g.pct}%</span>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* 3 · next */}
          <Card delay={0.18}>
            <Kicker>Next</Kicker>
            <div className={`flex items-center gap-3 min-h-11 px-3 rounded-xl border ${next ? "border-emerald-500/30 bg-emerald-500/10" : "border-orange-500/40 bg-orange-500/10"}`}>
              {next ? <CalendarCheck2 size={18} className="text-emerald-400 shrink-0" /> : <CalendarX2 size={18} className="text-orange-400 shrink-0" />}
              <span className="text-[13.5px] font-semibold text-ink-d1">
                {next ? `Next session: ${formatNextBooking(next.at)}` : "Nothing booked yet — book the next one before they leave."}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-1">
              <span className="font-display italic text-ink-d1 text-[15px] uppercase">How does {clientFirstName(client)} feel?</span>
              {feelSaved && (
                <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                  <Check size={12} strokeWidth={3} /> Saved
                </span>
              )}
            </div>
            <FeelToggle value={feel} onChange={pickFeel} />

            <textarea
              className="w-full bg-bg-dark-3 border border-div-d rounded-[10px] p-2.5 px-3 min-h-16 text-[13px] text-ink-d1 placeholder:text-ink-d3 placeholder:italic resize-none outline-none focus:border-cyan transition-colors"
              placeholder="Closing note — files to the journal when you leave this screen."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              aria-label="Closing note"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-ink-d3 uppercase tracking-wider font-bold">Priority for next time</span>
              <div className="flex gap-1" role="group" aria-label="Priority">
                {(["Low", "Medium", "High"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={priority === p}
                    onClick={() => setPriority(p)}
                    className={`min-h-10 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-colors ${
                      priority === p
                        ? p === "High"
                          ? "bg-orange-500/20 border-orange-500/40 text-orange-300"
                          : "bg-cyan/15 border-cyan/40 text-cyan"
                        : "bg-bg-dark-3 border-div-d text-ink-d2"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowCheckIn(true)}
                className="min-h-11 rounded-xl border border-div-d bg-bg-dark-3 px-4 font-display italic text-[12px] uppercase tracking-wider text-ink-d1 hover:opacity-90 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              >
                <HeartPulse className="w-4 h-4 text-cyan" />
                {checkInSavedId ? "Assessment saved ✓" : "Quick assessment question"}
              </button>
              {/* Always reachable while a package is on file ("there's not
                  really a good way to open it"); loud only when due. */}
              {client.renewal?.cycleKey && (
                <button
                  type="button"
                  onClick={() => setShowRenewal(true)}
                  className={`min-h-11 rounded-xl border px-4 py-2 font-display italic text-[12px] uppercase tracking-wider hover:opacity-90 flex items-center justify-center gap-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                    renewalDue && !renewalLogged
                      ? "border-cta/50 bg-cta/10 text-ink-d1"
                      : "border-div-d bg-bg-dark-3 text-ink-d1"
                  }`}
                >
                  <MessageSquareText className={`w-4 h-4 shrink-0 ${renewalDue && !renewalLogged ? "text-cta" : "text-cyan"}`} />
                  {renewalLogged
                    ? "Renewal conversation saved ✓"
                    : renewalDue
                      ? promptText(client.renewal)
                      : "Renewal conversation"}
                </button>
              )}
            </div>
          </Card>

          {/* 3b · what they told you — see the header. Silent when empty. */}
          {fordUntagged.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.24 }}
              className="mx-5"
              /* This screen is dark whatever the app theme is, so the FORD
                 tokens are pinned to their dark values rather than resolving
                 against the document. */
              data-theme="dark"
            >
              <FordSweep
                clientId={client.id}
                clientFirstName={clientFirstName(client, "them")}
                untagged={fordUntagged}
                sessionId={session.id ?? null}
              />
            </motion.div>
          )}

          {/* 4 · lifetime — quiet, at the bottom */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mx-5 grid grid-cols-3 gap-2">
            {[
              { label: "Sessions", value: lifetime.sessions.toLocaleString() },
              { label: "Lifetime volume", value: `${fmtBig(lifetime.volume)} lb` },
              { label: "Lifetime reps", value: fmtBig(lifetime.reps) },
            ].map((t) => (
              <div key={t.label} className="rounded-xl border border-div-d bg-bg-dark-2 px-3 py-2">
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-ink-d3">{t.label}</div>
                <div className="font-mono text-[15px] font-bold text-ink-d2">{t.value}</div>
              </div>
            ))}
          </motion.div>

          {/* leave */}
          <div className="mx-5 mt-2 flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={leave}
              disabled={leaving}
              className="w-full min-h-[52px] rounded-2xl bg-bg-dark-2 border border-div-d text-ink-d1 font-display italic text-[14px] uppercase tracking-wider flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            >
              <ArrowLeft size={16} />
              {leaving ? "Leaving…" : "Back to Hub"}
            </button>
            <span className="text-[11px] text-ink-d3">The session is saved. Anything you add here saves on its own.</span>
          </div>
        </div>
      </div>

      <LogConversationDialog
        open={showRenewal}
        onClose={() => setShowRenewal(false)}
        client={client}
        snapshot={client.renewal ?? null}
        trainer={authTrainer}
        onSaved={() => setRenewalLogged(true)}
      />

      <QuickCheckInDialog
        open={showCheckIn}
        onClose={() => setShowCheckIn(false)}
        client={client}
        trainer={authTrainer}
        machines={machines}
        origin="post_session"
        sessionId={session.id}
        onSaved={setCheckInSavedId}
      />
    </div>
  );
}
