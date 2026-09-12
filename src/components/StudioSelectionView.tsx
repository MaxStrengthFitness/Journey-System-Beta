import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Building2,
  ChevronLeft,
  ChevronDown,
  MapPin,
  CheckCircle2,
  Lock,
  ArrowRight,
  Loader2,
  Pin,
  PinOff,
  Users,
  UserCog,
  Shield,
  Home,
} from "lucide-react";
import { Studio, FranchiseNetwork, Trainer } from "../types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MaxStrengthLogo } from "./MaxStrengthLogo";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { useToast } from "../contexts/ToastContext";
import { isStudioLeader } from "../lib/permissions";
import { getStudioClientCount } from "../lib/studio-roster-count";
import { getDefaultStudioId, setDefaultStudioId } from "../lib/default-studio";
import { releaseUiScrollLock } from "../lib/scroll-lock";

interface StudioSelectionViewProps {
  studios: Studio[];
  networks?: FranchiseNetwork[];
  trainers?: Trainer[];
  authTrainer?: Trainer;
  onSelectTrainer: (trainer: Trainer, studioId: string) => void;
  onGoToAdmin?: () => void;
  onBack: () => void;
}

/**
 * Ceiling on how many studios get a roster count on this screen.
 *
 * hasAccessToStudio returns true for EVERY studio when the signed-in user is an
 * Admin, Founder or Overseer -- so on a large franchise "Your studios" is the
 * whole estate, and an uncapped Promise.all would fire one aggregation query
 * per studio on the login screen. The cache's dedupe and TTL bound how OFTEN
 * counts are fetched; only this bounds how MANY at once. Cards past the cap
 * show "-" for clients, which the card already renders for "not known".
 *
 * The first N are the ones a trainer actually looks at: `mine` is sorted home
 * studio, then pinned, then alphabetically, before this slice is taken.
 */
const MAX_COUNTED_STUDIOS = 12;

type StudioStats = {
  /** Active clients whose home studio this is. Null = not known yet. */
  clients: number | null;
  /** Trainers who can work here. Derived locally, costs nothing. */
  team: number;
};

/**
 * One studio. Extracted because the previous version rendered this markup
 * twice — once for networked studios and once for independents — and the two
 * copies had already started to drift.
 */
function StudioCard({
  studio,
  networkName,
  hasAccess,
  isHome,
  isPinned,
  isRequested,
  isRequesting,
  stats,
  onEnter,
  onTogglePin,
  onRequestAccess,
}: {
  studio: Studio;
  networkName?: string;
  hasAccess: boolean;
  isHome: boolean;
  isPinned: boolean;
  isRequested: boolean;
  isRequesting: boolean;
  stats?: StudioStats;
  onEnter: () => void;
  onTogglePin: () => void;
  onRequestAccess: () => void;
}) {
  return (
    <div
      className={cn(
        "bg-bg-dark-2 border rounded-[28px] p-6 shadow-xl flex flex-col relative overflow-hidden transition-colors",
        hasAccess
          ? "border-div-d hover:border-action/50"
          : "border-div-d/70",
      )}
    >
      <div
        className={cn(
          "absolute top-0 left-0 w-full h-1",
          isPinned
            ? "bg-action"
            : hasAccess
              ? "bg-linear-to-r from-action/40 to-transparent"
              : "bg-linear-to-r from-ink-d3/30 to-transparent",
        )}
      />

      <div className="flex items-start justify-between mb-4 gap-2">
        <span
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center border shrink-0",
            hasAccess
              ? "bg-bg-dark-3 border-div-d text-ink-d3"
              : "bg-bg-dark-3 border-div-d text-ink-d3",
          )}
        >
          {hasAccess ? (
            <Building2 className="w-4 h-4" />
          ) : (
            <Lock className="w-3.5 h-3.5" />
          )}
        </span>

        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {isHome && (
            <span className="text-[10px] font-black uppercase tracking-widest bg-action/10 text-action px-2 py-0.5 rounded-full border border-action/20 flex items-center gap-1">
              <Home className="w-2.5 h-2.5" /> Home
            </span>
          )}
          {/* Pinning is only meaningful for a studio you can actually enter. */}
          {hasAccess && (
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={isPinned}
              title={
                isPinned
                  ? "Entered automatically at login on this device. Click to stop."
                  : "Enter this studio automatically at login on this device."
              }
              className={cn(
                "h-7 px-2 rounded-full border flex items-center gap-1 text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer",
                isPinned
                  ? "bg-action border-action text-white hover:bg-action/85"
                  : "bg-transparent border-div-d text-ink-d3 hover:text-ink-d1 hover:border-ink-d3",
              )}
            >
              {isPinned ? (
                <>
                  <Pin className="w-3 h-3" /> Default
                </>
              ) : (
                <>
                  <PinOff className="w-3 h-3" /> Set default
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Full studio names, never truncated — a trainer has to be able to tell
          two locations apart at a glance. */}
      <h4 className="font-extrabold uppercase italic tracking-tight text-lg text-ink-d1 mb-1 leading-tight break-words">
        {studio.name}
      </h4>
      <div className="flex items-start gap-1 text-ink-d3 mb-4">
        <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
        <span className="text-[11px] font-bold uppercase tracking-wider break-words">
          {studio.address || (hasAccess ? "Active territory" : "Location")}
        </span>
      </div>
      {networkName && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-ink-d3 -mt-2 mb-4">
          {networkName}
        </p>
      )}

      {/* Quick stats. Only for studios you can enter — a locked card showing
          another location's roster size would be leaking it. */}
      {hasAccess && (
        <div className="grid grid-cols-2 gap-2 mb-5 mt-auto">
          <div className="bg-bg-dark-3 border border-div-d rounded-2xl px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-ink-d3 mb-1">
              <Users className="w-3 h-3" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                Active clients
              </span>
            </div>
            <p className="text-xl font-black text-ink-d1 leading-none tabular-nums">
              {stats?.clients === null || stats?.clients === undefined ? (
                <span className="text-ink-d3 text-sm">—</span>
              ) : (
                stats.clients
              )}
            </p>
          </div>
          <div className="bg-bg-dark-3 border border-div-d rounded-2xl px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-ink-d3 mb-1">
              <UserCog className="w-3 h-3" />
              <span className="text-[9px] font-black uppercase tracking-widest">
                Team
              </span>
            </div>
            <p className="text-xl font-black text-ink-d1 leading-none tabular-nums">
              {stats?.team ?? 0}
            </p>
          </div>
        </div>
      )}

      <div className={cn("border-t border-div-d pt-4", !hasAccess && "mt-auto")}>
        {hasAccess ? (
          <Button
            onClick={onEnter}
            className="w-full bg-cta-strong hover:bg-[#a02400] text-white font-black uppercase tracking-widest text-xs h-11 rounded-xl flex items-center justify-center gap-2 cursor-pointer"
          >
            Enter Studio <ArrowRight className="w-4 h-4" />
          </Button>
        ) : isRequested ? (
          <Button
            disabled
            className="w-full bg-muted text-ink-d3 font-black uppercase tracking-widest text-xs h-11 rounded-xl flex items-center justify-center gap-2 cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" /> Access Requested
          </Button>
        ) : (
          <Button
            onClick={onRequestAccess}
            disabled={isRequesting}
            className="w-full bg-bg-dark-3 hover:bg-muted text-ink-d2 font-bold uppercase tracking-widest text-[11px] h-11 rounded-xl flex items-center justify-center gap-2 border border-div-d cursor-pointer"
          >
            {isRequesting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lock className="w-3 h-3" />
            )}
            Request Access
          </Button>
        )}
      </div>
    </div>
  );
}

export function StudioSelectionView({
  studios,
  networks = [],
  trainers = [],
  authTrainer,
  onSelectTrainer,
  onGoToAdmin,
  onBack,
}: StudioSelectionViewProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [requestingStudioId, setRequestingStudioId] = useState<string | null>(
    null,
  );
  const [requestedStudios, setRequestedStudios] = useState<Set<string>>(
    new Set(),
  );
  const [pinnedStudioId, setPinnedStudioId] = useState<string | null>(() =>
    getDefaultStudioId(),
  );
  const [showOthers, setShowOthers] = useState(false);
  const [clientCounts, setClientCounts] = useState<Record<string, number | null>>(
    {},
  );

  /*
   * This screen is reached from a Radix menu item, and AppContent answers that
   * with an early return — so the menu can be unmounted while still open and
   * leave `pointer-events: none` on <body>. That is invisible with a mouse and
   * completely freezes an iPad, which is why "can't scroll the studio list"
   * only ever reproduced on tablets.
   *
   * AppContent now closes the menu before navigating; this is the belt to that
   * pair of braces, and it is idempotent, so it costs nothing when nothing is
   * stuck. It runs on EVERY mount because the leak can come from any overlay
   * that was open when the switch happened, not just the trainer menu.
   */
  useEffect(() => {
    releaseUiScrollLock();
  }, []);

  const isAdminUser =
    isStudioLeader(authTrainer || null) ||
    authTrainer?.role === "Admin" ||
    authTrainer?.role === "Founder" ||
    authTrainer?.role === "Overseer" ||
    authTrainer?.email === "jurgensaj@gmail.com";

  const hasAccessToStudio = React.useCallback(
    (studioId: string) => {
      if (!authTrainer) return false;
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

  const { mine, others } = useMemo(() => {
    const mine: Studio[] = [];
    const others: Studio[] = [];
    studios.forEach((s) => {
      (hasAccessToStudio(s.id || "") ? mine : others).push(s);
    });
    /* Home studio first, then pinned, then alphabetical — the order a trainer
       scanning this screen would put them in themselves. */
    mine.sort((a, b) => {
      const rank = (s: Studio) =>
        s.id === authTrainer?.primaryHomeStudioId
          ? 0
          : s.id === pinnedStudioId
            ? 1
            : 2;
      return rank(a) - rank(b) || (a.name || "").localeCompare(b.name || "");
    });
    others.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return { mine, others };
  }, [studios, hasAccessToStudio, authTrainer?.primaryHomeStudioId, pinnedStudioId]);

  /** Trainers per studio — from data already in memory, so it costs nothing. */
  const teamSizes = useMemo(() => {
    const counts: Record<string, number> = {};
    trainers.forEach((t) => {
      const ids = new Set(
        [
          t.primaryHomeStudioId,
          ...(t.accessibleStudioIds || []),
          ...(t.activeGuestStudioIds || []),
        ].filter(Boolean) as string[],
      );
      ids.forEach((id) => {
        counts[id] = (counts[id] || 0) + 1;
      });
    });
    return counts;
  }, [trainers]);

  /*
   * Roster sizes for the studios this trainer can enter — and only those.
   * Keyed on the sorted id list rather than the array so a re-render with the
   * same studios does not re-query (the Aug 30 lesson). Locked studios are
   * deliberately not counted: nothing on this screen should read another
   * location's roster before access is granted.
   */
  const mineIdsKey = mine
    .map((s) => s.id)
    .filter(Boolean)
    .slice(0, MAX_COUNTED_STUDIOS)
    .sort()
    .join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = mineIdsKey ? mineIdsKey.split(",") : [];
    if (ids.length === 0) return;

    (async () => {
      const entries = await Promise.all(
        ids.map(async (id) => [id, await getStudioClientCount(id)] as const),
      );
      if (cancelled) return;
      setClientCounts((prev) => {
        const next = { ...prev };
        entries.forEach(([id, count]) => {
          next[id] = count;
        });
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mineIdsKey]);

  // Which studios has this trainer already asked for?
  useEffect(() => {
    if (!authTrainer?.id) return;
    let cancelled = false;

    const checkRequests = async () => {
      try {
        const q = query(
          collection(db, "access_requests"),
          where("trainerId", "==", authTrainer.id),
          where("type", "==", "studio_access"),
          where("status", "==", "Pending"),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const requested = new Set<string>();
        snap.forEach((d) => {
          if (d.data().studioId) requested.add(d.data().studioId);
        });
        setRequestedStudios(requested);
      } catch (err) {
        console.error("Error fetching access requests:", err);
      }
    };
    checkRequests();

    return () => {
      cancelled = true;
    };
  }, [authTrainer?.id]);

  const networkNameFor = React.useCallback(
    (studio: Studio) => {
      const parent =
        networks.find((n) => n.studioIds.includes(studio.id || "")) ||
        networks.find((n) => n.id === studio.networkId);
      return parent?.name;
    },
    [networks],
  );

  const handleRequestAccess = async (studio: Studio) => {
    if (!authTrainer || !studio.id) return;
    setRequestingStudioId(studio.id);
    try {
      await addDoc(collection(db, "access_requests"), {
        type: "studio_access",
        trainerId: authTrainer.id,
        trainerName: authTrainer.fullName,
        studioId: studio.id,
        studioName: studio.name,
        status: "Pending",
        createdAt: serverTimestamp(),
      });
      setRequestedStudios((prev) => new Set(prev).add(studio.id!));
      toastSuccess(`Access request to ${studio.name} sent successfully.`);
    } catch (err) {
      console.error("Failed to request access:", err);
      toastError("Failed to send access request. Please try again.");
    } finally {
      setRequestingStudioId(null);
    }
  };

  const handleTogglePin = (studioId: string) => {
    const next = pinnedStudioId === studioId ? null : studioId;
    setPinnedStudioId(next);
    setDefaultStudioId(next);
    toastSuccess(
      next
        ? `${studios.find((s) => s.id === next)?.name || "This studio"} will open automatically on this device.`
        : "Default studio cleared — you'll be asked each time.",
    );
  };

  const renderCard = (studio: Studio, hasAccess: boolean) => (
    <StudioCard
      key={studio.id}
      studio={studio}
      networkName={networkNameFor(studio)}
      hasAccess={hasAccess}
      isHome={studio.id === authTrainer?.primaryHomeStudioId}
      isPinned={!!studio.id && studio.id === pinnedStudioId}
      isRequested={requestedStudios.has(studio.id || "")}
      isRequesting={requestingStudioId === studio.id}
      stats={{
        clients: clientCounts[studio.id || ""] ?? null,
        team: teamSizes[studio.id || ""] || 0,
      }}
      onEnter={() => {
        if (authTrainer && studio.id) onSelectTrainer(authTrainer, studio.id);
      }}
      onTogglePin={() => studio.id && handleTogglePin(studio.id)}
      onRequestAccess={() => handleRequestAccess(studio)}
    />
  );

  return (
    /*
     * Its own scroll container. index.css pins html/body to height:100% with
     * overflow:hidden because the main app shell is a bounded 100dvh column
     * that scrolls internally — but this screen returns EARLY, before that
     * shell exists, so a `min-h-screen` page here simply grew past the viewport
     * with nothing able to scroll it. That was the "can't scroll this page" bug.
     *
     * `touch-pane` (index.css) is what makes the pane behave under a FINGER:
     * an explicit `touch-action: pan-y` so iPadOS commits to vertical panning
     * instead of waiting to see whether the gesture becomes something else,
     * momentum scrolling for older iPadOS, and a 100vh height that `dvh`
     * upgrades where it is supported rather than depending on it.
     */
    <div className="touch-pane overflow-y-auto overscroll-contain bg-background text-ink-d1">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-5xl mx-auto p-6 md:p-12"
      >
        <div className="text-center mb-10 flex flex-col items-center">
          <MaxStrengthLogo size="xl" className="mb-6" />
          <h2 className="text-3xl font-black uppercase italic tracking-tight text-ink-d1 mb-2 leading-none">
            Choose Your Studio
          </h2>
          <p className="text-ink-d3 font-bold uppercase tracking-widest text-[11px] max-w-md mt-1">
            {authTrainer?.fullName
              ? `Welcome back, ${authTrainer.fullName.split(" ")[0]}`
              : "Where are you working today?"}
          </p>
          {isAdminUser && onGoToAdmin && (
            <Button
              onClick={onGoToAdmin}
              className="mt-4 bg-bg-dark-3 hover:bg-muted text-ink-d1 font-bold uppercase text-[11px] tracking-widest px-4 h-9 rounded-xl border border-div-d flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Shield className="w-3.5 h-3.5 text-action" /> Go to Operations
            </Button>
          )}
        </div>

        {/* ---- Your studios ---------------------------------------------- */}
        {mine.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-3 border-b border-div-d pb-2 mb-5">
              <div className="w-1.5 h-6 bg-action rounded-full" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-action italic">
                  Your Studios
                </h3>
                <p className="text-[11px] font-bold text-ink-d3 uppercase tracking-widest leading-none mt-0.5">
                  {mine.length} location{mine.length === 1 ? "" : "s"} you can
                  enter
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {mine.map((s) => renderCard(s, true))}
            </div>
          </section>
        )}

        {/* ---- Other locations ------------------------------------------- */}
        {others.length > 0 && (
          <section className="mb-12">
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              aria-expanded={showOthers}
              className="w-full flex items-center gap-3 border-b border-div-d pb-2 mb-5 text-left cursor-pointer group"
            >
              <div className="w-1.5 h-6 bg-ink-d3 rounded-full" />
              <div className="flex-1">
                <h3 className="text-xs font-black uppercase tracking-widest text-ink-d3 italic group-hover:text-ink-d2 transition-colors">
                  Other Locations
                </h3>
                <p className="text-[11px] font-bold text-ink-d3 uppercase tracking-widest leading-none mt-0.5">
                  {others.length} you don't have access to
                </p>
              </div>
              <ChevronDown
                className={cn(
                  "w-4 h-4 text-ink-d3 transition-transform shrink-0",
                  showOthers && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {showOthers && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-1">
                    {others.map((s) => renderCard(s, false))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        )}

        {studios.length === 0 && (
          <div className="py-20 px-6 text-center bg-bg-dark-2 rounded-[40px] border border-dashed border-div-d flex flex-col items-center justify-center gap-4">
            <Building2 className="w-12 h-12 text-action mx-auto" />
            <div>
              <p className="text-base font-black uppercase tracking-widest text-ink-d1">
                No Authorized Studios Configuration Found
              </p>
              <p className="text-xs uppercase tracking-wider text-ink-d3 mt-1 max-w-md">
                Database clean start complete. Open Operations to manage
                studios, create location entries, configure Mindbody Site IDs,
                and manage staff.
              </p>
            </div>
            {isAdminUser && onGoToAdmin && (
              <Button
                onClick={onGoToAdmin}
                className="mt-2 bg-cta-strong hover:bg-[#a02400] text-white font-black uppercase tracking-widest text-xs h-12 px-8 rounded-xl shadow-lg shadow-action/20 flex items-center gap-2.5 cursor-pointer"
              >
                <Shield className="w-4 h-4" /> Go to Operations
              </Button>
            )}
          </div>
        )}

        {/* A trainer with no access at all should not just see an empty page. */}
        {studios.length > 0 && mine.length === 0 && (
          <div className="py-14 px-6 text-center bg-bg-dark-2 rounded-[40px] border border-dashed border-div-d flex flex-col items-center gap-3 mb-12">
            <Lock className="w-9 h-9 text-ink-d3" />
            <p className="text-sm font-black uppercase tracking-widest text-ink-d1">
              No studio access yet
            </p>
            <p className="text-xs uppercase tracking-wider text-ink-d3 max-w-md">
              Open "Other locations" above and request access to the studio you
              work from. A manager approves it from the Admin panel.
            </p>
            {!showOthers && (
              <Button
                onClick={() => setShowOthers(true)}
                className="mt-1 bg-cta-strong hover:bg-[#a02400] text-white font-black uppercase tracking-widest text-[11px] h-10 px-6 rounded-xl cursor-pointer"
              >
                Request Access
              </Button>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-center pb-4">
          <Button
            variant="ghost"
            onClick={onBack}
            className="text-ink-d3 hover:text-ink-d1 font-black uppercase text-[11px] tracking-widest gap-2 bg-transparent cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Clear active session
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
