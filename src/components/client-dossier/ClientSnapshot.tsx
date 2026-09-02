/**
 * The snapshot bar — the answer to "who am I about to train, and is there
 * anything that should stop me".
 *
 * Pinned above the dossier and never scrolled away, because the facts that
 * matter most are exactly the ones that used to be buried three tabs deep. Its
 * chips are jump links: tapping the critical-notes chip lands you in Medical.
 */
import React from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileWarning,
  Image as ImageIcon,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { relativeDay, toDate, type DossierSection, type JournalEntry } from "../../types/journal";
import type { Client, ClientEvent, MindbodyContract } from "../../types";

/** Years, from a yyyy-mm-dd string or a Timestamp. Null when unparseable. */
export function ageFrom(dob: any): number | null {
  const d = toDate(dob);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/**
 * The contract a coach means when they say "her contract": active, and of
 * those the one running longest. Mindbody can hold several at once.
 */
export function activeContract(client: Client | null): MindbodyContract | null {
  const all = Object.values(client?.mindbodyContracts || {});
  const active = all.filter((c) => c.status === "Active");
  if (active.length === 0) return null;
  return active.sort(
    (a, b) => (toDate(b.endDate)?.getTime() ?? 0) - (toDate(a.endDate)?.getTime() ?? 0),
  )[0];
}

/** The soonest event that has not happened yet. */
export function nextEvent(client: Client | null): ClientEvent | null {
  const now = Date.now();
  const upcoming = (client?.events || [])
    .map((e) => ({ e, t: toDate(e.date)?.getTime() ?? 0 }))
    .filter((x) => x.t >= now - 86400000)
    .sort((a, b) => a.t - b.t);
  return upcoming[0]?.e ?? null;
}

function Chip({
  tone,
  icon,
  label,
  value,
  onClick,
  title,
}: {
  tone: "ok" | "warn" | "bad" | "neutral";
  icon: React.ReactNode;
  label: string;
  value: string;
  onClick?: () => void;
  title?: string;
}) {
  const tones = {
    ok: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    bad: "border-rose-500/35 bg-rose-500/12 text-rose-700 dark:text-rose-300",
    neutral:
      "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300",
  } as const;

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      title={title}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors",
        tones[tone],
        onClick && "cursor-pointer hover:brightness-110",
      )}
    >
      <span className="shrink-0 opacity-80">{icon}</span>
      <span className="min-w-0">
        <span className="block font-mono text-[9px] font-bold uppercase tracking-[0.14em] opacity-70">
          {label}
        </span>
        <span className="block truncate text-[12.5px] font-bold leading-tight">{value}</span>
      </span>
    </Tag>
  );
}

export function ClientSnapshot({
  client,
  criticalEntries,
  onJump,
}: {
  client: Client;
  criticalEntries: JournalEntry[];
  onJump: (section: DossierSection) => void;
}) {
  const age = ageFrom(client.dateOfBirth);
  const contract = activeContract(client);
  const upcoming = nextEvent(client);
  const liabilityDate = toDate(client.liabilityAgreementDate);
  const contractEnd = toDate(contract?.endDate);

  const identity = [
    age !== null ? `${age} yrs` : null,
    client.gender || null,
    client.mindbodyId ? `MBO ${client.mindbodyId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="border-b border-slate-200 bg-slate-50/90 px-5 py-3.5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center">
        {/* identity */}
        <div className="flex min-w-0 shrink-0 items-center gap-3 lg:w-64">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-slate-200 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
            {client.photoUrl ? (
              <img
                src={client.photoUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <ImageIcon strokeWidth={1.4} size={20} />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-black uppercase italic tracking-tight text-slate-900 dark:text-white">
              {client.firstName} {client.lastName}
            </p>
            <p className="truncate font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {identity || "No demographics on file"}
            </p>
          </div>
        </div>

        {/* status chips */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {criticalEntries.length > 0 && (
            <Chip
              tone="bad"
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Flagged"
              value={`${criticalEntries.length} critical note${criticalEntries.length === 1 ? "" : "s"}`}
              onClick={() => onJump("medical")}
              title="Jump to Medical"
            />
          )}

          <Chip
            tone={client.isLiabilityReleased ? "ok" : "warn"}
            icon={
              client.isLiabilityReleased ? (
                <ShieldCheck className="h-4 w-4" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )
            }
            label="Liability"
            value={
              client.isLiabilityReleased
                ? liabilityDate
                  ? `Signed ${liabilityDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                  : "Released"
                : "Not on file"
            }
            onClick={() => onJump("general")}
            title={
              client.isLiabilityReleased
                ? "Waiver released in Mindbody"
                : "Mindbody has no liability release for this client"
            }
          />

          <Chip
            tone={contract ? "ok" : "neutral"}
            icon={contract ? <CheckCircle2 className="h-4 w-4" /> : <FileWarning className="h-4 w-4" />}
            label={contract?.isAutoRenewing ? "Contract · auto" : "Contract"}
            value={
              contract
                ? contractEnd
                  ? `${contract.contractName || "Active"} · ends ${contractEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : contract.contractName || "Active"
                : client.mindbodyStatus || "None active"
            }
            onClick={() => onJump("admin")}
            title="Jump to Admin"
          />

          {upcoming && (
            <Chip
              tone={upcoming.priority === "High" ? "warn" : "neutral"}
              icon={<CalendarClock className="h-4 w-4" />}
              label="Next up"
              value={`${upcoming.title} · ${relativeDay(toDate(upcoming.date))}`}
              onClick={() => onJump("events")}
              title="Jump to Events"
            />
          )}
        </div>
      </div>
    </div>
  );
}
