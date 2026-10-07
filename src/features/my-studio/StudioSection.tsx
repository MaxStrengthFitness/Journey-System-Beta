import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { CalendarClock, Clock, Megaphone, Zap } from "lucide-react";
import { auth, db } from "../../firebase";
import { useActiveStudio } from "../../contexts/ActiveStudioContext";
import { useToast } from "../../contexts/ToastContext";
import { OperationType, handleFirestoreError } from "../../lib/firestore-errors";
import type { HubAnnouncement, Trainer } from "../../types";
import { AdminBadge, AdminEmpty, AdminField, AdminGrid, AdminInput, AdminNotice, AdminPanel, SaveBar } from "../admin/primitives";
import { useDirtyForm } from "../admin/useDirtyForm";
import { StudioDetailsForm, type StudioForm } from "../admin/studios/StudioDetailsForm";
import { studioPatchPayload } from "../admin/studios/studio-writes";
import { auditStudios, formatAge } from "../admin/mindbody/diagnostics";
import { useSyncLease, withLease } from "../admin/sync-lease";
import { RenewalSettingsPanel } from "../admin/renewals/RenewalSettingsPanel";
import { InBodyVariationPanel } from "./InBodyVariationPanel";
import { AnnouncementComposer } from "../admin/announcements/AnnouncementComposer";
import { DEFAULT_SESSION_MINUTES, MAX_SESSION_MINUTES, MIN_SESSION_MINUTES, sessionMinutesOf } from "../admin/hours/hours";
import { useRenewalNamesSeen, useRenewalSettings } from "../renewals/useRenewalSettings";
import { DEFAULT_SHIFT_HOURS, clockToMinutes, minutesToClock, shiftHoursOf } from "../relay/board/now-context";
import { mayOpenOperations } from "../admin/operations-access";
import { leadsHere } from "../relay/leads";
import { mayReadWeeks } from "../standing-week/present";
import { StudioSettingsPanel } from "../studio-settings/StudioSettingsPanel";
import { StudioActivityPanel } from "./StudioActivityPanel";
import "../admin/admin.css";
import "./my-studio.css";

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
 *   InBody            the scanner's normal variation: how big a change has
 *                     to be before any screen calls it one (client codex,
 *                     Sep 2026 — InBodyVariationPanel, features/inbody/
 *                     variation.ts)
 *   Renewals          the studio's thresholds and packages (the one editor —
 *                     Operations → Renewals only points here since the
 *                     Operations round)
 *   Announcements     the studio's own notices, pinned to this studio
 *   Activity          what head office changed here from the Admins
 *                     dashboard, read-only, the studio tier only (the
 *                     Admins room's third wave, Sep 29 2026 —
 *                     StudioActivityPanel over features/admins/activity)
 *
 * Everything writes only the diff to studios/{id} (or the renewal config /
 * hub_announcements), and firestore.rules scopes each write to the studio
 * tier at this studio.
 *
 * READ ONLY FOR EVERYONE ELSE WHO WORKS HERE (AJ's voice review, notes of
 * Sep 28 2026): "Leaders edit it; trainers can view it read-only. Studio
 * settings are edited here and nowhere else." Until then the section was
 * hidden from trainers. Now `canEdit` (leadsHere, the rules' own answer)
 * decides, panel by panel: the fields are drawn locked, no save bar or
 * Publish is offered, and each panel says who changes it. The rules already
 * let everyone who works here read all of it, and refuse their writes, so
 * nothing changed there. Two things a reader must not cost: the Mindbody
 * location lookup (a Mindbody call each time the form opens) is skipped
 * for them (StudioDetailsForm), and the locked fields stay in full ink,
 * since reading them is the whole point (`ms__readonly`, my-studio.css).
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

  // The studio tier changes it; everyone else who works here reads it. The
  // shell asks the same two questions, but a menu is not a gate.
  const canEdit = leadsHere(authTrainer, studioId);
  if (!canEdit && !mayReadWeeks(authTrainer, studioId)) {
    return (
      <div className="adm ms__page">
        <AdminNotice tone="info">{studio.name}'s settings are for the people who work there.</AdminNotice>
      </div>
    );
  }

  return (
    <div className={canEdit ? "adm ms__page" : "adm ms__page ms__readonly"}>
      <StudioDetailsForm
        studio={studio}
        studios={studios ?? NONE}
        onSave={saveDetails}
        canEdit={canEdit}
        subtitle="Your studio's own record. The name, the time zone, the Mindbody link and when you moved onto Journey."
      />

      <SyncPanel trainers={trainers ?? NONE} opensOperations={mayOpenOperations(authTrainer, studioId)} />

      <HoursPanel canEdit={canEdit} />

      {/* The studio's own numbers, each with Max Strength's default beneath it
          (AJ, Sep 28 2026: "let the admins assign the default within the
          app"). The deep clean moved here from The studio's day. */}
      <StudioSettingsPanel studioId={studioId} studio={studio} canEdit={canEdit} />

      <InBodyVariationPanel studioId={studioId} studio={studio} trainers={trainers ?? NONE} canEdit={canEdit} />

      <RenewalsPanel studioId={studioId} studioName={studio.name} canEdit={canEdit} />

      <StudioAnnouncements authTrainer={authTrainer ?? null} studioId={studioId} studioName={studio.name} canEdit={canEdit} />

      {/* What head office changed here, for the studio tier only: the rules
          let a studio's leaders read their own studio's Activity record and
          refuse everyone else (the Admins room's third wave, Sep 29 2026). */}
      {canEdit ? <StudioActivityPanel studioId={studioId} studioName={studio.name} /> : null}
    </div>
  );
}

/** Under a locked panel: who changes it, in the words the details form uses. */
function ReadOnlyFoot({ children }: { children: string }) {
  return (
    <div className="px-4 py-3 text-sm" style={{ color: "var(--adm-ink-muted)" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Mindbody: one sentence a leader can act on
 * ------------------------------------------------------------------ */

/**
 * `opensOperations`: whether this person may open Operations, where pulling
 * the schedule by hand and the event log live (Operations → Mindbody shows a
 * studio leader their own studio). A trainer with the grant runs My Studio
 * but not Operations, so they are told to ask their studio leader.
 */
function SyncPanel({ trainers, opensOperations }: { trainers: Trainer[]; opensOperations: boolean }) {
  const { activeStudio } = useActiveStudio();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  // The sync lease lives on its own document since the cost plan (Sep 26
  // 2026, features/admin/sync-lease.ts); the studio's own fields go stale.
  const lease = useSyncLease(activeStudio?.id);
  const row = useMemo(
    () => (activeStudio ? auditStudios([withLease(activeStudio, lease)], trainers, now)[0] : null),
    [activeStudio, lease, trainers, now],
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
      <p className="ms__line">{line}</p>
      {row.problem && row.link !== "offline" && (
        <p className="ms__note">
          {opensOperations
            ? "To pull the schedule by hand, or read the event log, open Operations → Mindbody."
            : "Pulling the schedule by hand and the event log are on Operations → Mindbody, which your studio leader can open. Ask them."}
        </p>
      )}
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ *
 * The studio's day: shift hours and the session's length. The deep-clean
 * interval moved to This studio's settings (Sep 28 2026), where it has
 * Max Strength's default beneath it.
 * ------------------------------------------------------------------ */

interface HoursForm {
  open: string;
  mid: string;
  closing: string;
  close: string;
  /** The booked length of a session — what Operations → Team → Hours counts (Operations round). */
  sessionMinutes: string;
}

const toClock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

function HoursPanel({ canEdit }: { canEdit: boolean }) {
  const { activeStudio, activeStudioId } = useActiveStudio();
  const { success: toastSuccess } = useToast();
  const current = shiftHoursOf(activeStudio?.shiftHours ?? null);
  const external = useMemo<HoursForm>(
    () => ({
      open: toClock(current.open),
      mid: toClock(current.mid),
      closing: toClock(current.closing),
      close: toClock(current.close),
      sessionMinutes: String(sessionMinutesOf(activeStudio)),
    }),
    [current.open, current.mid, current.closing, current.close, activeStudio?.sessionMinutes],
  );

  const form = useDirtyForm(external, async () => {
    if (!activeStudioId) return;
    const v = form.value;
    const slot = sessionMinutesOf({ sessionMinutes: Number(v.sessionMinutes) });
    // The four are written together, whichever changed: the Now Bar reads
    // them as one day, and shiftHoursOf forces them into order on read.
    await updateDoc(doc(db, "studios", activeStudioId), {
      shiftHours: { open: v.open, mid: v.mid, closing: v.closing, close: v.close },
      sessionMinutes: slot,
    });
    toastSuccess("Saved — the Now Bar, the rings and Operations → Team → Hours follow it.");
  }, { label: "the studio's day" });

  const bad = [form.value.open, form.value.mid, form.value.closing, form.value.close].some(
    (v) => clockToMinutes(v) === null,
  );

  return (
    <AdminPanel
      title="The studio's day"
      icon={<Clock className="w-3.5 h-3.5" />}
      subtitle={`Opening until ${minutesToClock(current.mid)}, Mid until ${minutesToClock(current.closing)}, then Closing. The Now Bar names the phase and the shift rings group work by it.`}
      footer={
        canEdit ? (
          <SaveBar
            status={bad && form.dirty ? "error" : form.status}
            error={bad ? "Every time needs to be a clock time, like 05:30." : form.error}
            onSave={() => {
              if (bad) return;
              void form.save();
            }}
            onDiscard={form.discard}
          />
        ) : (
          <ReadOnlyFoot>Only this studio's leaders can change the studio's day.</ReadOnlyFoot>
        )
      }
    >
      <fieldset disabled={!canEdit} className="contents">
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
            label="A session is"
            hint={`Minutes per booked session — the slot Operations → Team → Hours counts. Default ${DEFAULT_SESSION_MINUTES}.`}
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
      </fieldset>
      <p className="ms__note">
        Defaults are {minutesToClock(DEFAULT_SHIFT_HOURS.open)} / {minutesToClock(DEFAULT_SHIFT_HOURS.mid)} /{" "}
        {minutesToClock(DEFAULT_SHIFT_HOURS.closing)} / {minutesToClock(DEFAULT_SHIFT_HOURS.close)}.
      </p>
    </AdminPanel>
  );
}

/* ------------------------------------------------------------------ *
 * Renewals: the studio's own thresholds and packages
 * ------------------------------------------------------------------ */

function RenewalsPanel({ studioId, studioName, canEdit }: { studioId: string; studioName: string; canEdit: boolean }) {
  const { settings, saved, ownPackageTable, loading, error } = useRenewalSettings(studioId);
  const namesSeen = useRenewalNamesSeen(studioId);
  if (loading) {
    return (
      <AdminPanel title="Renewals" icon={<CalendarClock className="w-3.5 h-3.5" />}>
        <p className="ms__line ms__line--muted">Loading this studio's renewal settings…</p>
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
      ownPackageTable={ownPackageTable}
      namesSeen={namesSeen}
      canEdit={canEdit}
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
  canEdit,
}: {
  authTrainer: Trainer | null;
  studioId: string;
  studioName: string;
  /** A leader gets the composer; anyone else the live notices, read only. */
  canEdit: boolean;
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

  if (!canEdit) {
    return (
      <AdminPanel
        title="Announcements"
        icon={<Megaphone className="w-3.5 h-3.5" />}
        subtitle={`What ${studioName}'s leaders have posted to everyone here. A new one reaches you in the alerts bell.`}
        flush
      >
        {live.length === 0 ? (
          <AdminEmpty title="Nothing posted right now">
            When {studioName}'s leaders post a notice, it shows here until it expires.
          </AdminEmpty>
        ) : (
          <ul className="adm-ann-list">
            {live.map((a) => (
              <li key={a.id} className="adm-ann">
                <div className="adm-ann-head">
                  <span className="adm-ann-title">{a.title}</span>
                  {a.priority === "high" && <AdminBadge tone="alert">Urgent</AdminBadge>}
                  <AdminBadge>{a.type ?? "news"}</AdminBadge>
                </div>
                {a.shortContent && <p className="adm-ann-short">{a.shortContent}</p>}
                {a.authorName && (
                  <div className="adm-ann-foot">
                    <span>By {a.authorName}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </AdminPanel>
    );
  }

  return (
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
  );
}
