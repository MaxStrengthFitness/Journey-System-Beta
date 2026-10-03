/**
 * THE GREETING AND THE STUDIO PICKER: the last two rooms of the front door
 * (Oct 3 2026, direction A; features/front-door/README.md).
 *
 * After a sign-in, someone with a studio to go to (the one this iPad is set
 * to, else their home studio, else their only one) is GREETED rather than
 * asked: their name, today at that studio (your next client, the studio's
 * sessions, the open team jobs: useTodayGlance), and one orange button. Other
 * studios are small buttons underneath. AJ, Oct 3 2026: one studio gets "a
 * greeting"; leaders go "through the same as trainers because honestly they
 * will probably want to look at the daily schedule", so Operations is a link
 * at the foot, not a fork in the road.
 *
 * iPads change hands at the start of the day, so whose iPad it is sits at the
 * top of every screen here, with the way out ("Not you? Sign out").
 *
 * The PICKER ("Where are you today?") is for someone with no studio to greet
 * them with, for "All my studios", and for Change studio from inside the app:
 * the first studio is a full card with today, the rest are rows with their
 * counts, then Demo Mode, then the studios you don't work at (ask for access).
 *
 * Going in, the M and the X part and the A opens like a door (under a
 * second; at once when the iPad asks for less motion).
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import { Studio, FranchiseNetwork, Trainer } from "../types";
import { useToast } from "../contexts/ToastContext";
import { getStudioClientCount } from "../lib/studio-roster-count";
import { getDefaultStudioId, rememberDeviceStudio, setDefaultStudioId } from "../lib/default-studio";
import { releaseUiScrollLock } from "../lib/scroll-lock";
import { formatStudioDate, studioHour } from "../lib/studio-time";
import { canEnterDemo, splitOutDemo } from "../features/demo-mode/access";
import { isDemoStudioId } from "../features/demo-mode/is-demo";
import { SetUpDemoCard } from "../features/demo-mode/SetUpDemoCard";
import { DEMO_STUDIO_TAGLINE } from "../features/demo-mode/constants";
import { studioAccessRequest } from "../features/admin/staff/studio-access-request";
import { mayOpenOperations } from "../features/admin/operations-access";
import {
  ArrowIcon,
  FrontDoorPane,
  Tiles,
  WhoChip,
  greetingFor,
  prefersReducedMotion,
} from "../features/front-door/kit";
import { glanceLines } from "../features/front-door/today-glance";
import { useTodayGlance } from "../features/front-door/useTodayGlance";

interface StudioSelectionViewProps {
  studios: Studio[];
  networks?: FranchiseNetwork[];
  trainers?: Trainer[];
  authTrainer?: Trainer;
  onSelectTrainer: (trainer: Trainer, studioId: string) => void;
  onGoToAdmin?: () => void;
  /** Signs out when no studio is open yet; otherwise back to the studio. */
  onBack: () => void;
  /** Signs the person out (the "Not you?" chip), whichever way they came. */
  onSignOut?: () => void;
  /** Straight after a sign-in: greet them with their studio when there is one. */
  greet?: boolean;
  /** The studio already open, when this is Change studio from inside the app. */
  currentStudioId?: string | null;
}

/**
 * Ceiling on how many studios get a roster count on this screen.
 *
 * Administrators can enter EVERY studio, so on a large franchise "your
 * studios" is the whole estate, and an uncapped Promise.all would fire one
 * aggregation per studio here. The first N are the ones a trainer looks at:
 * home first, then this iPad's, then by name. Rows past the cap say the team
 * size alone.
 */
const MAX_COUNTED_STUDIOS = 12;
/** How many other studios the greeting offers as buttons before "All my studios". */
const GREETING_OTHERS = 4;
/** How long the door takes to open, in ms. */
const DOOR_MS = 650;

const PinIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6z" />
  </svg>
);

export function StudioSelectionView({
  studios,
  networks = [],
  trainers = [],
  authTrainer,
  onSelectTrainer,
  onGoToAdmin,
  onBack,
  onSignOut,
  greet = false,
  currentStudioId = null,
}: StudioSelectionViewProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [pinnedStudioId, setPinnedStudioId] = useState<string | null>(() => getDefaultStudioId());
  const [showAll, setShowAll] = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [opening, setOpening] = useState<Studio | null>(null);
  const [requestingStudioId, setRequestingStudioId] = useState<string | null>(null);
  const [requestedStudios, setRequestedStudios] = useState<Set<string>>(new Set());
  const [clientCounts, setClientCounts] = useState<Record<string, number | null>>({});
  const doorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * This screen is reached from a Radix menu item, and AppContent answers that
   * with an early return, so the menu can be unmounted while still open and
   * leave `pointer-events: none` on <body>: invisible with a mouse, a frozen
   * iPad. The belt to AppContent's braces; idempotent, so it costs nothing.
   */
  useEffect(() => {
    releaseUiScrollLock();
    return () => {
      if (doorTimer.current) clearTimeout(doorTimer.current);
    };
  }, []);

  const hasAccessToStudio = React.useCallback(
    (studioId: string) => {
      if (!authTrainer) return false;
      // Demo Mode is open to every signed-in trainer, by the studio's id
      // (features/demo-mode/access.ts).
      if (canEnterDemo(authTrainer) && isDemoStudioId(studioId)) return true;
      return (
        authTrainer.primaryHomeStudioId === studioId ||
        authTrainer.accessibleStudioIds?.includes(studioId) ||
        authTrainer.activeGuestStudioIds?.includes(studioId) ||
        authTrainer.role === "Admin" ||
        authTrainer.role === "Founder" ||
        authTrainer.role === "Overseer"
      );
    },
    [authTrainer],
  );

  const { demo, mine, others } = useMemo(() => {
    const mine: Studio[] = [];
    const others: Studio[] = [];
    const { demo, rest } = splitOutDemo(studios);
    rest.forEach((s) => (hasAccessToStudio(s.id || "") ? mine : others).push(s));
    // Home first, then this iPad's, then by name.
    const rank = (s: Studio) => (s.id === authTrainer?.primaryHomeStudioId ? 0 : s.id === pinnedStudioId ? 1 : 2);
    mine.sort((a, b) => rank(a) - rank(b) || (a.name || "").localeCompare(b.name || ""));
    others.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { demo, mine, others };
  }, [studios, hasAccessToStudio, authTrainer?.primaryHomeStudioId, pinnedStudioId]);

  /** The studio the greeting greets you with: this iPad's, else home, else your only one. */
  const greetStudio = useMemo(() => {
    if (!greet || showAll) return null;
    return (
      mine.find((s) => s.id === pinnedStudioId) ??
      mine.find((s) => s.id === authTrainer?.primaryHomeStudioId) ??
      (mine.length === 1 ? mine[0] : null)
    );
  }, [greet, showAll, mine, pinnedStudioId, authTrainer?.primaryHomeStudioId]);

  /** The one studio whose day is read: the greeted one, or the picker's first. */
  const featured = greetStudio ?? (currentStudioId ? null : mine[0] ?? null);
  const today = useTodayGlance(featured, authTrainer ?? null, trainers);

  /** Trainers per studio, from data already in memory: costs nothing. */
  const teamSizes = useMemo(() => {
    const counts: Record<string, number> = {};
    trainers.forEach((t) => {
      new Set([t.primaryHomeStudioId, ...(t.accessibleStudioIds || []), ...(t.activeGuestStudioIds || [])].filter(Boolean) as string[]).forEach(
        (id) => (counts[id] = (counts[id] || 0) + 1),
      );
    });
    return counts;
  }, [trainers]);

  /*
   * Roster sizes for the studios this person can enter, only on the picker
   * (the greeting doesn't show them), keyed on the sorted ids so a re-render
   * costs no read. Studios you can't enter are never counted.
   */
  const countIdsKey = greetStudio
    ? ""
    : mine
        .map((s) => s.id)
        .filter(Boolean)
        .slice(0, MAX_COUNTED_STUDIOS)
        .sort()
        .join(",");
  useEffect(() => {
    const ids = countIdsKey ? countIdsKey.split(",") : [];
    if (ids.length === 0) return;
    let cancelled = false;
    void Promise.all(ids.map(async (id) => [id, await getStudioClientCount(id)] as const)).then((entries) => {
      if (cancelled) return;
      setClientCounts((prev) => {
        const next = { ...prev };
        entries.forEach(([id, count]) => (next[id] = count));
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [countIdsKey]);

  // A request is keyed on the Auth uid, which on older accounts is not the
  // trainer document id; the rules pin trainerId to it.
  const myUid = auth.currentUser?.uid ?? authTrainer?.authUid ?? authTrainer?.id ?? "";

  // Which studios has this person already asked for? Only once they look.
  useEffect(() => {
    if (!myUid || !showOthers) return;
    let cancelled = false;
    void getDocs(
      query(
        collection(db, "access_requests"),
        where("trainerId", "==", myUid),
        where("type", "==", "studio_access"),
        where("status", "==", "Pending"),
      ),
    )
      .then((snap) => {
        if (cancelled) return;
        const requested = new Set<string>();
        snap.forEach((d) => {
          if (d.data().studioId) requested.add(d.data().studioId);
        });
        setRequestedStudios(requested);
      })
      .catch((err) => console.error("Error fetching access requests:", err));
    return () => {
      cancelled = true;
    };
  }, [myUid, showOthers]);

  const networkNameFor = (studio: Studio) =>
    (networks.find((n) => n.studioIds.includes(studio.id || "")) || networks.find((n) => n.id === studio.networkId))?.name;

  const enter = (studio: Studio) => {
    if (!authTrainer || !studio.id || opening) return;
    if (!isDemoStudioId(studio.id)) rememberDeviceStudio({ id: studio.id, name: studio.name || "" });
    if (prefersReducedMotion()) {
      onSelectTrainer(authTrainer, studio.id);
      return;
    }
    setOpening(studio);
    doorTimer.current = setTimeout(() => onSelectTrainer(authTrainer, studio.id!), DOOR_MS);
  };

  const handleRequestAccess = async (studio: Studio) => {
    if (!authTrainer || !studio.id || !myUid) return;
    setRequestingStudioId(studio.id);
    try {
      await addDoc(collection(db, "access_requests"), {
        ...studioAccessRequest({
          uid: myUid,
          authUser: auth.currentUser,
          trainer: authTrainer,
          studio: { id: studio.id, name: studio.name },
        }),
        createdAt: serverTimestamp(),
      });
      setRequestedStudios((prev) => new Set(prev).add(studio.id!));
      toastSuccess(`Asked ${studio.name}'s leaders to let you in.`);
    } catch (err) {
      console.error("Failed to request access:", err);
      toastError("The request didn't send. Check the Wi-Fi and try again.");
    } finally {
      setRequestingStudioId(null);
    }
  };

  const togglePin = (studio: Studio) => {
    if (!studio.id) return;
    const next = pinnedStudioId === studio.id ? null : studio.id;
    setPinnedStudioId(next);
    setDefaultStudioId(next);
    if (next) rememberDeviceStudio({ id: studio.id, name: studio.name || "" });
    toastSuccess(next ? `This iPad will greet everyone with ${studio.name}.` : "This iPad has no studio of its own now.");
  };

  const mayOpenOps = Boolean(onGoToAdmin) && mayOpenOperations(authTrainer, null);
  const name = (authTrainer?.fullName || "").trim();
  const first = ((authTrainer as any)?.nickname || "").trim() || name.split(/\s+/)[0] || "there";
  const whoChip = name ? <WhoChip name={name} photoUrl={(authTrainer as any)?.photoURL || (authTrainer as any)?.photoUrl} onSignOut={onSignOut ?? onBack} /> : null;
  const current = currentStudioId ? studios.find((s) => s.id === currentStudioId) : null;

  // ---- going in --------------------------------------------------------------
  if (opening) {
    return (
      <FrontDoorPane label={`Opening ${opening.name}`}>
        <main className="fd-page fd-page--center" style={{ overflow: "hidden" }} aria-busy="true">
          <Tiles mode="open" />
          <p className="fd-small fd-center" style={{ marginTop: 30 }} role="status">
            Opening {opening.name}…
          </p>
        </main>
      </FrontDoorPane>
    );
  }

  const lines = glanceLines(today.glance, today.openJobs, featured?.timezone || undefined);
  const todayList = (
    <ul className={`fd-today${today.loading ? " fd-today--quiet" : ""}`} aria-live="polite">
      {today.loading ? (
        <li>
          <span>Reading today at {featured?.name}…</span>
        </li>
      ) : lines.length === 0 ? (
        <li>
          <span>Journey couldn't read today here just now. The Hub will have it.</span>
        </li>
      ) : (
        lines.map((l, i) => (
          <li key={i} className={l.yours ? "is-yours" : undefined}>
            <b>{l.figure}</b>
            <span>{l.words}</span>
          </li>
        ))
      )}
    </ul>
  );

  const operationsLink = mayOpenOps ? (
    <button type="button" className="fd-link" onClick={onGoToAdmin}>
      Open Operations instead
    </button>
  ) : null;

  // ---- the greeting ------------------------------------------------------------
  if (greetStudio) {
    const tz = greetStudio.timezone || undefined;
    const hour = studioHour(new Date(), tz) ?? new Date().getHours();
    const otherMine = mine.filter((s) => s.id !== greetStudio.id);
    const why =
      greetStudio.id === pinnedStudioId
        ? "This iPad's studio"
        : greetStudio.id === authTrainer?.primaryHomeStudioId
          ? "Your home studio"
          : "Your studio";
    return (
      <FrontDoorPane label="Welcome">
        <main className="fd-page">
          <div className="fd-top">
            <Tiles small />
            {whoChip}
          </div>
          <div className="fd-rise fd-rise--1" style={{ marginTop: 44 }}>
            <div className="fd-eyebrow">
              {formatStudioDate(new Date(), { weekday: "long", month: "long", day: "numeric" }, tz)}
            </div>
            <h1 className="fd-display fd-display--xl" style={{ marginTop: 10 }}>
              {greetingFor(hour)},
              <br />
              {first}.
            </h1>
          </div>

          <section className="fd-card fd-rise fd-rise--2" style={{ marginTop: 30 }} aria-label={`Today at ${greetStudio.name}`}>
            <div className="fd-eyebrow fd-eyebrow--action">{why}</div>
            <h2 className="fd-display fd-display--m" style={{ marginTop: 6 }}>
              {greetStudio.name}
            </h2>
            {todayList}
            <button type="button" className="fd-btn fd-btn--primary" style={{ marginTop: 18 }} onClick={() => enter(greetStudio)}>
              Start at {greetStudio.name} <ArrowIcon />
            </button>
          </section>

          {otherMine.length > 0 && (
            <div className="fd-rise fd-rise--3" style={{ marginTop: 22 }}>
              <p className="fd-small" style={{ marginBottom: 8 }}>
                Somewhere else today?
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                {otherMine.slice(0, GREETING_OTHERS).map((s) => (
                  <button key={s.id} type="button" className="fd-chip" onClick={() => enter(s)}>
                    {s.name}
                  </button>
                ))}
                <button type="button" className="fd-link" onClick={() => setShowAll(true)}>
                  All my studios
                </button>
              </div>
            </div>
          )}

          <footer className="fd-foot fd-rise fd-rise--4">
            {operationsLink}
            {demo && (
              <button type="button" className="fd-link" onClick={() => enter(demo)}>
                Practise in Demo Mode
              </button>
            )}
            {otherMine.length === 0 && (
              <button type="button" className="fd-link" onClick={() => setShowAll(true)}>
                All studios
              </button>
            )}
          </footer>
        </main>
      </FrontDoorPane>
    );
  }

  // ---- the picker ----------------------------------------------------------------
  const countLine = (s: Studio) => {
    const team = teamSizes[s.id || ""] || 0;
    const clients = clientCounts[s.id || ""];
    const teamWords = `${team} on the team`;
    return typeof clients === "number" ? `${clients} active clients · ${teamWords}` : teamWords;
  };
  const pinButton = (s: Studio) => {
    const pinned = s.id === pinnedStudioId;
    return (
      <button
        type="button"
        className="fd-pin"
        aria-pressed={pinned}
        onClick={() => togglePin(s)}
        aria-label={pinned ? `${s.name} is this iPad's studio. Tap to stop.` : `Make ${s.name} this iPad's studio`}
      >
        <PinIcon />
        {pinned ? "This iPad" : "Set"}
      </button>
    );
  };
  const rest = featured ? mine.filter((s) => s.id !== featured.id) : mine;

  return (
    <FrontDoorPane label="Where are you today?">
      <main className="fd-page fd-page--wide">
        <div className="fd-top">
          {current ? (
            <button type="button" className="fd-link" onClick={onBack}>
              ← Back to {current.name}
            </button>
          ) : (
            <Tiles small />
          )}
          {whoChip}
        </div>

        <div className="fd-rise fd-rise--1" style={{ marginTop: 36 }}>
          <h1 className="fd-display fd-display--l">Where are you today?</h1>
          {mine.length > 0 && (
            <p className="fd-lede">
              {mine.length === 1 ? "The studio you work at." : `${mine.length} studios you work at.`} The pin makes one this
              iPad's studio, so it greets everyone with it.
            </p>
          )}
        </div>

        {featured && (
          <section className="fd-card fd-rise fd-rise--2" style={{ marginTop: 24 }} aria-label={featured.name}>
            <div className="fd-top" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
              <div style={{ minWidth: 0 }}>
                {featured.id === authTrainer?.primaryHomeStudioId && <div className="fd-eyebrow fd-eyebrow--action">Home</div>}
                <h2 className="fd-display fd-display--m" style={{ marginTop: 6 }}>
                  {featured.name}
                </h2>
                <p className="fd-small" style={{ marginTop: 6 }}>
                  {countLine(featured)}
                  {networkNameFor(featured) ? ` · ${networkNameFor(featured)}` : ""}
                </p>
              </div>
              {pinButton(featured)}
            </div>
            {todayList}
            <button type="button" className="fd-btn fd-btn--primary" style={{ marginTop: 16 }} onClick={() => enter(featured)}>
              Start at {featured.name} <ArrowIcon />
            </button>
          </section>
        )}

        {rest.length > 0 && (
          <div className="fd-stack fd-rise fd-rise--3" style={{ marginTop: 14 }}>
            {rest.map((s) => (
              <div key={s.id} className="fd-row-wrap">
                <button type="button" className="fd-row" onClick={() => enter(s)} aria-current={s.id === currentStudioId ? "true" : undefined}>
                  <div style={{ minWidth: 0 }}>
                    <div className="fd-row__name">
                      {s.name}
                      {s.id === currentStudioId ? <span className="fd-chip__muted"> · open now</span> : null}
                    </div>
                    <div className="fd-row__meta">
                      {countLine(s)}
                      {networkNameFor(s) ? ` · ${networkNameFor(s)}` : ""}
                    </div>
                  </div>
                  <span className="fd-row__go">
                    <ArrowIcon />
                  </span>
                </button>
                {pinButton(s)}
              </div>
            ))}
          </div>
        )}

        {/* ---- practice ---- */}
        {authTrainer && (
          <section className="fd-rise fd-rise--4" aria-label="Practice">
            <div className="fd-eyebrow fd-section-title">Practice</div>
            {demo ? (
              <div className="fd-stack">
                <button type="button" className="fd-row" onClick={() => enter(demo)}>
                  <div>
                    <div className="fd-row__name">Demo Mode</div>
                    <div className="fd-row__meta">{DEMO_STUDIO_TAGLINE}. Nothing here touches a live record.</div>
                  </div>
                  <span className="fd-row__go">
                    <ArrowIcon />
                  </span>
                </button>
                <SetUpDemoCard seededBy={{ id: authTrainer.id || "", name: authTrainer.fullName || "" }} existing />
              </div>
            ) : (
              // Until the seeder has run there is no studio to enter and no
              // Operations to open, so this screen is the only one that can
              // offer the button.
              <SetUpDemoCard seededBy={{ id: authTrainer.id || "", name: authTrainer.fullName || "" }} />
            )}
          </section>
        )}

        {/* ---- nothing to enter ---- */}
        {studios.length === 0 && (
          <div className="fd-card" style={{ marginTop: 24 }}>
            <h2 className="fd-display fd-display--m">No studios yet</h2>
            <p className="fd-lede">
              {mayOpenOps
                ? "Journey has no studios set up. Open Operations to add one and link it to Mindbody."
                : "Journey couldn't find any studios. Check the Wi-Fi, or ask head office."}
            </p>
          </div>
        )}
        {studios.length > 0 && mine.length === 0 && (
          <div className="fd-card" style={{ marginTop: 24 }}>
            <h2 className="fd-display fd-display--m">Not on a studio's team yet</h2>
            <p className="fd-lede">
              Ask the studio you work at to let you in, below. A leader there lets you in from My Studio → Team.
              {demo ? " In the meantime, Demo Mode is open to you." : ""}
            </p>
          </div>
        )}

        {/* ---- studios you don't work at ---- */}
        {others.length > 0 && (
          <section style={{ marginTop: 8 }}>
            <button
              type="button"
              className="fd-link"
              aria-expanded={showOthers || mine.length === 0}
              onClick={() => setShowOthers((v) => !v)}
              style={{ marginTop: 16 }}
            >
              {showOthers || mine.length === 0 ? "Hide" : "Show"} the {others.length} studio{others.length === 1 ? "" : "s"} you
              don't work at
            </button>
            {(showOthers || mine.length === 0) && (
              <div className="fd-stack" style={{ marginTop: 8 }}>
                {others.map((s) => {
                  const asked = requestedStudios.has(s.id || "");
                  return (
                    <div key={s.id} className="fd-row" style={{ cursor: "default" }}>
                      <div style={{ minWidth: 0 }}>
                        <div className="fd-row__name">{s.name}</div>
                        <div className="fd-row__meta">{asked ? "Asked. Its leaders will let you in." : "Ask its leaders to let you in"}</div>
                      </div>
                      {!asked && (
                        <button
                          type="button"
                          className="fd-chip"
                          style={{ marginLeft: "auto", flex: "none" }}
                          disabled={requestingStudioId === s.id}
                          onClick={() => void handleRequestAccess(s)}
                        >
                          {requestingStudioId === s.id ? "Asking…" : "Ask to join"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <footer className="fd-foot">{operationsLink && React.cloneElement(operationsLink, {}, "Open Operations")}</footer>
      </main>
    </FrontDoorPane>
  );
}
