/**
 * TRAINER SETTINGS — what is left after the RBAC teardown.
 *
 * Round: Settings tiers & Task Board, Sep 2026.
 *
 * WHY THIS IS NOT JUST THE BUG FORM
 * ---------------------------------
 * Strip A/B2/B4/C/D/E/F/G out of the old Hub Settings and exactly one card
 * survives: Report a Bug. A settings screen containing a single form does not
 * read as "streamlined", it reads as failed to load — and a trainer who thinks
 * a screen is broken files a bug about the bug reporter.
 *
 * So the screen stops being about SETTINGS, which a trainer now has none of by
 * design, and becomes about the two things they do have: a voice (what is
 * broken) and an identity (who am I, where do I work). The account block is
 * deliberately READ-ONLY — home studio, cross-training access and the Mindbody
 * link are leaders' writes — but showing them still answers the questions
 * trainers actually raise ("am I linked to Mindbody?", "why can't I see Solon's
 * clients?") without a support message.
 *
 * Voice-review round, Sep 27 2026 (AJ: Settings "needs a visual rework to
 * match the upgraded app", handled lightly until the whole design is
 * settled): the calm card of My Profile instead of italic capitals; the role
 * by its name (ROLE_LABELS), never its key ("HeadTrainer"); status words
 * in inks readable on white; no machine count (it was the whole catalog's,
 * not the studio's floor); and the Operations door asks the app's one rule
 * (`mayOpenOperations`) and switches the app mode, as the menu does.
 */

import {
  Bug,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Lightbulb,
  LogOut,
  Palette,
  ShieldCheck,
  UserCircle,
} from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ROLE_LABELS, type Studio, type Trainer } from "../../types";
import { mayOpenOperations } from "../admin/operations-access";
import { whoWorksHere } from "../../lib/who-works-here";
import { useFeedback, useMyFeedback, FEEDBACK_KIND_SHORT } from "../feedback";
import type { FeedbackKind } from "../feedback";
import "./settings.css";

export interface TrainerSettingsViewProps {
  authTrainer: Trainer | null;
  studios: Studio[];
  trainers: Trainer[];
  activeStudioId: string | null;
  onLogout?: () => void;
  setView?: (view: string) => void;
  /** Operations, in Operations mode — what the menu's App Mode switch does. */
  onOpenOperations?: () => void;
}

const KIND_BUTTONS: { kind: FeedbackKind; icon: typeof Bug }[] = [
  { kind: "bug", icon: Bug },
  { kind: "ui", icon: Palette },
  { kind: "idea", icon: Lightbulb },
];

const STATUS: Record<string, { label: string; tone: "ok" | "open" | "closed" }> = {
  open: { label: "Open", tone: "open" },
  investigating: { label: "Looking at it", tone: "open" },
  fixed: { label: "Fixed", tone: "ok" },
  "wont-fix": { label: "Closed", tone: "closed" },
};

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
  accent,
}: {
  icon: typeof Bug;
  title: string;
  subtitle?: string;
  children: ReactNode;
  accent?: boolean;
}) {
  return (
    <section className={accent ? "stg-card stg-card--accent" : "stg-card"} aria-label={title}>
      <header className="stg-card__head">
        <Icon className="stg-card__icon" size={18} aria-hidden />
        <div>
          <h3 className="stg-card__title">{title}</h3>
          {subtitle && <p className="stg-card__sub">{subtitle}</p>}
        </div>
      </header>
      <div className="stg-card__body">{children}</div>
    </section>
  );
}

/** A read-only fact. Not an input — that is the point. */
function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stg-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LinkRow({ icon: Icon, label, hint, onClick }: { icon: typeof Bug; label: string; hint?: string; onClick?: () => void }) {
  return (
    <button type="button" className="stg-link" onClick={onClick} disabled={!onClick}>
      <Icon className="stg-link__icon" size={18} aria-hidden />
      <span className="stg-link__text">
        <span className="stg-link__label">{label}</span>
        {hint && <span className="stg-link__hint">{hint}</span>}
      </span>
      <ChevronRight className="stg-link__go" size={18} aria-hidden />
    </button>
  );
}

export function TrainerSettingsView({
  authTrainer,
  studios,
  trainers,
  activeStudioId,
  onLogout,
  setView,
  onOpenOperations,
}: TrainerSettingsViewProps) {
  const { open } = useFeedback();
  // By the signed-in Auth uid, which the read rule compares to (the hook says why).
  const { reports, counts, error: reportsError } = useMyFeedback();

  const studioName = (id?: string | null) => studios.find((s) => s.id === id)?.name || "—";
  const activeStudio = studios.find((s) => s.id === activeStudioId);

  // Cross-training locations, minus the home studio it already shows above.
  const otherStudios = (authTrainer?.accessibleStudioIds || [])
    .filter((id) => id && id !== authTrainer?.primaryHomeStudioId)
    .map(studioName);

  // Team's own rule for who works here, so this count and My Studio -> Team
  // never disagree (voice review follow-up, Sep 27 2026).
  const teamCount = whoWorksHere(trainers, activeStudioId).length;

  const role = authTrainer?.role ? (ROLE_LABELS[authTrainer.role] ?? authTrainer.role) : "Life Transformer";
  // The menu, the route and the Operations shell ask the same question.
  const operations = mayOpenOperations(authTrainer, activeStudioId);

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="stg">
      <header className="stg-head">
        <h2 className="stg-head__title">Trainer Settings</h2>
        <p className="stg-head__lede">Your account, your feedback, and where things are.</p>
      </header>

      {/* ── HERO: feedback ───────────────────────────────────────────── */}
      <Card icon={Bug} title="Help us build this" subtitle="You are in beta — nothing is too small" accent>
        <p className="stg-text">
          Tell us what is broken, what feels wrong, and what is missing. We attach the screen you were on automatically,
          so you only have to describe it in your own words.
        </p>

        <div className="stg-kinds">
          {KIND_BUTTONS.map(({ kind, icon: Icon }) => (
            <button key={kind} type="button" className="stg-kind" onClick={() => open(kind)}>
              <Icon size={22} aria-hidden />
              {FEEDBACK_KIND_SHORT[kind]}
            </button>
          ))}
        </div>

        {/* A trainer who never sees what happened to a report stops filing
            them. This is the loop, and it is why the hero is not just a form.
            A read that failed says so: it is not the same as "no reports". */}
        {reportsError ? (
          <p className="stg-problem" role="status">
            Couldn't load your reports. Try again in a moment.
          </p>
        ) : counts.total > 0 && (
          <>
            <p className="stg-label">
              Your reports · {counts.open} open · {counts.resolved} closed
            </p>
            <ul className="stg-reports">
              {reports.slice(0, 3).map((r) => {
                const status = STATUS[r.status] ?? { label: r.status, tone: "open" as const };
                return (
                  <li key={r.id} className="stg-report">
                    <span className="stg-report__text">{r.description}</span>
                    <span className={`stg-status stg-status--${status.tone}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {/* ── My account (read-only by design) ─────────────────────────── */}
      <Card icon={UserCircle} title="My account" subtitle="Set by your studio's leaders">
        <dl className="stg-facts">
          <Fact label="Name" value={authTrainer?.fullName || "—"} />
          <Fact label="Role" value={role} />
          <Fact label="Home studio" value={studioName(authTrainer?.primaryHomeStudioId)} />
          {otherStudios.length > 0 && <Fact label="Also works at" value={otherStudios.join(" · ")} />}
          <Fact
            label="Mindbody"
            value={
              authTrainer?.mindbodyStaffId ? (
                <span className="stg-ok">Linked · {authTrainer.mindbodyStaffId}</span>
              ) : (
                <span className="stg-warn">Not linked — a studio leader links you on My Studio → Team</span>
              )
            }
          />
        </dl>

        {onLogout && (
          <button type="button" className="stg-signout" onClick={onLogout}>
            <LogOut size={16} aria-hidden />
            Sign out
          </button>
        )}
      </Card>

      {/* ── My studio: two links, not a module ───────────────────────── */}
      <Card
        icon={Dumbbell}
        title={activeStudio?.name ? `My studio — ${activeStudio.name}` : "My studio"}
        subtitle={`${teamCount} ${teamCount === 1 ? "person" : "people"} on the team`}
      >
        <div className="stg-links">
          <LinkRow
            icon={Dumbbell}
            label="Learning → Catalog"
            hint="Every machine: set-up, settings, cleaning and upkeep"
            onClick={setView ? () => setView("machine-anatomy") : undefined}
          />
          <LinkRow
            icon={ClipboardList}
            label="My Studio"
            hint="Relay, the floor, the team and the studio's own record"
            onClick={setView ? () => setView("studio-tasks") : undefined}
          />
        </div>
      </Card>

      {/* ── Leaders: the door to Operations ──────────────────────────── */}
      {operations && (
        <Card icon={ShieldCheck} title="Operations" subtitle="Where are we going wrong, and where are we going right?">
          <p className="stg-text">
            The Overview, renewals and the Delight queue, the floor, staff and roles, insights, announcements, Mindbody
            and the studio's data.
            Running the studio day to day stays on My Studio.
          </p>
          <LinkRow icon={ShieldCheck} label="Open Operations" onClick={onOpenOperations} />
        </Card>
      )}
    </motion.div>
  );
}
