import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { CalendarClock, Clock, Zap } from "lucide-react";
import { auth, db } from "../../firebase";
import { useActiveStudio } from "../../ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { HubAnnouncement, Trainer } from "../../types";
import { AdminBadge, AdminField, AdminGrid, AdminInput, AdminNotice, AdminPanel, SaveBar } from "../admin/primitives";
import { useDirtyForm } from "../admin/useDirtyForm";
import { StudioDetailsForm, type StudioForm } from "../admin/studios/StudioDetailsForm";
import { studioPatchPayload } from "../admin/studios/studio-writes";
import { auditStudios, formatAge } from "../admin/mindbody/diagnostics";
import { RenewalSettingsPanel } from "../admin/renewals/RenewalSettingsPanel";
import { AnnouncementComposer } from "../admin/announcements/AnnouncementComposer";
import { DEFAULT_SESSION_MINUTES, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES, sessionMinutesOf } from "../admin/hours/hours";
import { useRenewalNamesSeen, useRenewalSettings } from "../renewals/useRenewalSettings";
import { DEFAULT_DEEP_CLEAN_DAYS } from "../planner/relay/machine-care";
import { DEFAULT_SHIFT_HOURS, clockToMinutes, minutesToClock, shiftHoursOf } from "../planner/relay/now-context";
import "../admin/admin.css";

/**
 * MY STUDIO → STUDIO — the studio's own record, in one place.
 *
 * Round: My Studio, Sep 2026. Before this the studio's own settings lived in
 * three screens under three vocabularies: its details on Operations →
 * Studios (listed to every leader, every studio), its hours and deep-clean
 * interval under Relay → Team → Standards, its renewal settings under
 * Operations → Renewals → Settings — and the Journey cutover date, the one
 * field that decides how every client's history is worded, had no editor at
 * all. AJ (Sep 18): the head trainer, studio leader and studio owner change
 * their studio's name, time zone, Mindbody link, accent colour "and so
 * forth"; studios adjust "any package stuff" themselves; a studio gets its
 * own announcements.
 *
 *   Studio details    StudioDetailsForm — the same form Operations uses, so
 *                     the two doors can never disagree; the Site ID waits
 *                     for Mindbody's answer before it is saved
 *   Mindbody          one sentence: is this studio syncing, and when it last
 *                     did — so "why isn't she on the Hub" no longer needs an
 *                     administrator
 *   The studio's day  shift hours and the deep-clean interval (from Relay's
 *                     Standards), on the dirty-tracked save bar
 *   Renewals          the studio's thresholds and packages (the one editor —
 *                     Operations → Renewals only points here since the
 *                     Operations round)
 *   Announcements     the studio's own notices, pinned to this studio
 *
 * Everything writes only the diff to studios/{id} (or the renewal config /
 * hub_announcements), and firestore.rules scopes each write to the studio
 * tier at this studio.
 */

export interface StudioSectionProps {
  authTrainer?: Trainer | null;
  trainers?: Trainer[];
}

const NONE: never[] = [];

export function StudioSection({ authTrainer, trainers }: StudioSectionProps) {
  // Every studio, not just the ones this person may enter: the shared-site
  // and location-conflict checks have to see a sibling on the same Mindbody
  // site even when this leader cannot open it.
  const { activeStudio, activeStudioId, studios } = useActiveStudio();
  const studio = activeStudio ?? null;
  const studioId = activeStudioId ?? null;

  const saveDetails = async (patch: Partial<StudioForm>) => {
    if (!studioId) return;
    await updateDoc(doc(db, "studios", studioId), studioPatchPayload(patch));
  };

  if (!studio || !studioId) {
    return (
      <div className="adm ms__page">
        <AdminNotice tone="info">Choose a studio to see its record.</AdminNotice>
      </div>
    );
  }

  return (
    <div className="adm ms__page">
      <StudioDetailsForm
        studio={studio}
        studios={studios ?? NONE}
        onSave={saveDetails}
        subtitle="Your studio's own record. The name, the time zone, the Mindbody link and when you moved onto Journey."
      />

      <SyncPanel trainers={trainers ?? NONE} />

      <HoursPanel />

      <RenewalsPanel studioId={studioId} studioName={studio.name} />

      <StudioAnnouncements authTrainer={authTrainer ?? null} studioId={studioId} studioName={studio.name} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Mindbody: one sentence a leader can act on
 * ------------------------------------------------------------------ */

function SyncPanel({ trainers }: { trainers: Trainer[] }) {
  const { activeStudio } = useActiveStudio();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const row = useMemo(
    () => (activeStudio ? auditStudios([activeStudio], trainers, now)[0] : null),
    [activeStudio, trainers, now],
  );
  if (!row) return null;

  const line =
    row.link === "offline"
      ? "This studio runs offline by choice. Nothing syncs from Mindbody."
      : row.problem
        ? row.problem
        : row.sync === "manual"
          ? `Automatic sync is off; the schedule was last pulled ${formatAge(row.minutesSinceSync)} ago.`
          : `Synced ${formatAge(row.minutesSinceSync)} ago, every ${row.intervalMinutes} minutes.`;
  const tone: "ok" | "warn" | "alert" | "neutral" =
    row.link === "offline" ? "neutral" : row.problem ? (row.sync === "stalled" || row.link === "misconfigured" ? "alert" : "warn") : "ok";

  return (
    <AdminPanel
      title="Mindbody"
      icon={<Zap className="w-3.5 h-3.5" />}
      subtitle="Is the schedule arriving? If a client is missing from the Hub, this is the first thing to check."
      actions={
        <AdminBadge tone={tone}>
          {row.link === "offline" ? "Offline" : row.problem ? "Needs attention" : "Syncing"}
        </AdminBadge>
      }
    >
      <p className="text-sm" style={{ color: "var(--adm-ink)" }}>{line}</p>
      {row.problem && row.link !== "offline" && (
        <p className="mt-2 text-xs" style={{ color: "var(--adm-ink-muted)" }}>
          Pulling the schedule by hand and the event log live on Operations → Mindbody, which is an administrator's screen — tell one.
        </p>
      )}
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ *
 * The studio's day: shift hours and the deep-clean interval
 * ------------------------------------------------------------------ */

interface HoursForm {
  open: string;
  mid: string;
  closing: string;
  close: string;
  deepCleanDays: string;
  /** The booked length of a session — what Operations → Hours counts (Operations round). */
  sessionMinutes: string;
}

const toClock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function HoursPanel() {
  const { activeStudio, activeStudioId } = useActiveStudio();
  const { success: toastSuccess } = useToast();
  const current = shiftHoursOf(activeStudio?.shiftHours ?? null);
  const external = useMemo<HoursForm>(
    () => ({
      open: toClock(current.open),
      mid: toClock(current.mid),
      closing: toClock(current.closing),
      close: toClock(current.close),
      deepCleanDays: String(activeStudio?.deepCleanIntervalDays ?? DEFAULT_DEEP_CLEAN_DAYS),
      sessionMinutes: String(sessionMinutesOf(activeStudio)),
    }),
    [current.open, current.mid, current.closing, current.close, activeStudio?.deepCleanIntervalDays, activeStudio?.sessionMinutes],
  );

  const form = useDirtyForm(external, async () => {
    if (!activeStudioId) return;
    const v = form.value;
    const days = Math.max(1, Math.min(365, Math.round(Number(v.deepCleanDays) || DEFAULT_DEEP_CLEAN_DAYS)));
    const slot = sessionMinutesOf({ sessionMinutes: Number(v.sessionMinutes) });
    // The four are written together, whichever changed: the Now Bar reads
    // them as one day, and shiftHoursOf forces them into order on read.
    await updateDoc(doc(db, "studios", activeStudioId), {
      shiftHours: { open: v.open, mid: v.mid, closing: v.closing, close: v.close },
      deepCleanIntervalDays: days,
      sessionMinutes: slot,
    });
    toastSuccess("Saved — the Now Bar, the rings and Operations → Hours follow it.");
  });

  const bad = [form.value.open, form.value.mid, form.value.closing, form.value.close].some(
    (v) => clockToMinutes(v) === null,
  );

  return (
    <AdminPanel
      title="The studio's day"
      icon={<Clock className="w-3.5 h-3.5" />}
      subtitle={`Opening until ${minutesToClock(current.mid)}, Mid until ${minutesToClock(current.closing)}, then Closing. The Now Bar names the phase and the shift rings group work by it.`}
      footer={
        <SaveBar
          status={bad && form.dirty ? "error" : form.status}
          error={bad ? "Every time needs to be a clock time, like 05:30." : form.error}
          onSave={() => {
            if (bad) return;
            void form.save();
          }}
          onDiscard={form.discard}
        />
      }
    >
      <AdminGrid>
        {(
          [
            ["Opens", "open"],
            ["Mid shift from", "mid"],
            ["Closing from", "closing"],
            ["Closes", "close"],
          ] as const
        ).map(([label, key]) => (
          <AdminField key={key} label={label} htmlFor={`ms-hours-${key}`}>
            <AdminInput
              id={`ms-hours-${key}`}
              type="time"
              value={form.value[key]}
              onChange={(e) => form.setField(key, e.target.value)}
            />
          </AdminField>
        ))}
        <AdminField
          label="Deep clean every"
          hint={`Days between required deep cleans on the Floor Map. Default ${DEFAULT_DEEP_CLEAN_DAYS}.`}
          htmlFor="ms-deep-clean"
        >
          <AdminInput
            id="ms-deep-clean"
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            value={form.value.deepCleanDays}
            onChange={(e) => form.setField("deepCleanDays", e.target.value)}
          />
        </AdminField>
        <AdminField
          label="A session is"
          hint={`Minutes per booked session — the slot Operations → Hours counts. Default ${DEFAULT_SESSION_MINUTES}.`}
          htmlFor="ms-session-minutes"
        >
          <AdminInput
            id="ms-session-minutes"
            type="number"
            inputMode="numeric"
            min={MIN_SESSION_MINUTES}
            max={MAX_SESSION_MINUTES}
            value={form.value.sessionMinutes}
            onChange={(e) => form.setField("sessionMinutes", e.target.value)}
          />
        </AdminField>
      </AdminGrid>
      <p className="mt-3 text-xs" style={{ color: "var(--adm-ink-muted)" }}>
        Defaults are {minutesToClock(DEFAULT_SHIFT_HOURS.open)} / {minutesToClock(DEFAULT_SHIFT_HOURS.mid)} /{" "}
        {minutesToClock(DEFAULT_SHIFT_HOURS.closing)} / {minutesToClock(DEFAULT_SHIFT_HOURS.close)}.
      </p>
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ *
 * Renewals: the studio's own thresholds and packages
 * ------------------------------------------------------------------ */

function RenewalsPanel({ studioId, studioName }: { studioId: string; studioName: string }) {
  const { settings, saved, loading, error } = useRenewalSettings(studioId);
  const namesSeen = useRenewalNamesSeen(studioId);
  if (loading) {
    return (
      <AdminPanel title="Renewals" icon={<CalendarClock className="w-3.5 h-3.5" />}>
        <p className="text-sm" style={{ color: "var(--adm-ink-muted)" }}>Loading this studio's renewal settings…</p>
      </AdminPanel>
    );
  }
  if (error) {
    return (
      <AdminPanel title="Renewals" icon={<CalendarClock className="w-3.5 h-3.5" />}>
        <AdminNotice tone="alert">Could not load this studio's renewal settings. {error}</AdminNotice>
      </AdminPanel>
    );
  }
  return (
    <RenewalSettingsPanel
      studioId={studioId}
      studioName={studioName}
      settings={settings}
      saved={saved}
      namesSeen={namesSeen}
      canEdit
    />
  );
}

/* ------------------------------------------------------------------ *
 * Announcements: the studio's own, and nothing wider
 * ------------------------------------------------------------------ */

function millis(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number; seconds?: number };
  if (typeof maybe.toMillis === "function") return maybe.toMillis();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}

function StudioAnnouncements({
  authTrainer,
  studioId,
  studioName,
}: {
  authTrainer: Trainer | null;
  studioId: string;
  studioName: string;
}) {
  const [all, setAll] = useState<HubAnnouncement[]>([]);
  useEffect(() => {
    // Only this studio's notices: a network or company notice is not the
    // studio's to take down, and is not read here.
    const unsub = onSnapshot(
      query(collection(db, "hub_announcements"), where("studioId", "==", studioId)),
      (snap) => setAll(snap.docs.map((d) => ({ ...(d.data() as HubAnnouncement), id: d.id }))),
      (err) => handleFirestoreError(err, OperationType.GET, "hub_announcements"),
    );
    return () => unsub();
  }, [studioId]);

  const live = useMemo(() => {
    const now = Date.now();
    return all
      .filter((a) => a.isActive !== false)
      .filter((a) => {
        const expires = millis(a.expiresAt);
        return expires === 0 || expires >= now;
      })
      .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
  }, [all]);

  // The rules pin the author to the signed-in person (authorId ==
  // request.auth.uid), and authTrainer.id differs from the uid on older
  // accounts (CLAUDE.md) -- so the uid first.
  const authorId = auth.currentUser?.uid || authTrainer?.id;
  if (!authTrainer || !authorId) return null;

  return (
    <div className="ms__announce">
      <AnnouncementComposer
        author={{ id: authorId, fullName: authTrainer.fullName }}
        studios={[{ id: studioId, name: studioName }]}
        networks={[]}
        scopes={["studio"]}
        fixedStudioId={studioId}
        published={live}
        title="Announcements"
        subtitle={`To everyone at ${studioName}, in the alerts bell. Company-wide notices are posted from Operations.`}
      />
    </div>
  );
}
