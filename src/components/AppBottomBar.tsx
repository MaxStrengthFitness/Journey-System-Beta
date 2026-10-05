/**
 * The app's bottom navigation bar — the trainer bar (Hub · Client · Session ·
 * Learning · My Studio · Calendar) or, in Operations mode, Operations and
 * Admin.
 *
 * Moved out of AppContent.tsx, unchanged, in the unsaved-changes round (Sep
 * 24 2026), so a render test can mount the REAL bar: every tap here that
 * changes the screen goes through `onNavigate`, which AppContent wires to its
 * guarded `setCurrentView` — a screen holding unsaved typing is asked about
 * before the bar can tear it down. See features/unsaved-changes.
 *
 * The bar is the bottom of the frame (the Navy Frame, Oct 4 2026; AJ's
 * answer 1A): the logo's navy (--chrome) in both themes, like the header and
 * the iPad's status bar. Orange keeps its two meanings here, "a session is
 * running, come back" and "you're in Operations", in the exact logo orange
 * (--chrome-go) with a navy icon on its solid box. Until then the bar was
 * white in the light theme and its orange Tailwind's orange-500 (2.8:1).
 *
 * Its top edge is a CAST (type and depth, Oct 4 2026): the frame's
 * --frame-up, a line in the deepest navy and a navy shadow up onto the page
 * (a faint rim and the deepest navy in dark), where a black 5% shadow was
 * invisible on the navy and a white hairline drew a second edge. The
 * Operations bar keeps its orange hairline: it says which mode you are in.
 * z-30 keeps the bar over everything a room pins near its foot, so the cast
 * falls on it.
 */
import {
  Building2,
  Calendar,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  PlayCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { AppMode } from "../features/admin/operations-access";
import type { View } from "../types";
import { liveSessionTabLabel, type LiveSessionLike } from "../lib/live-session";
import { NavButton } from "./NavButton";

export function AppBottomBar({
  appMode,
  currentView,
  isAdmin,
  hasClient,
  liveSession,
  lastLearningView,
  onNavigate,
  onResumeSession,
  phone = false,
  canOpenOperations = false,
  onSwitchMode,
}: {
  appMode: "trainer" | "admin";
  currentView: View;
  isAdmin: boolean;
  /** A client is selected, so Client opens the profile rather than the directory. */
  hasClient: boolean;
  /** The session the Session tab resumes, if one is running. */
  liveSession: LiveSessionLike | undefined;
  lastLearningView: "learning" | "machine-anatomy" | "academy";
  onNavigate: (view: View) => void;
  onResumeSession: () => void;
  /**
   * On a phone (Journey Lite, Oct 1 2026) the bar leads with the schedule
   * and Operations: Schedule · Operations · Clients · My Studio, and Session
   * while one is running. Learning and Calendar are in the avatar menu.
   */
  phone?: boolean;
  /** `mayOpenOperations`: whether the phone bar offers Operations. */
  canOpenOperations?: boolean;
  /** Changes mode and screen in one guarded step (AppContent's switchAppMode). */
  onSwitchMode?: (mode: AppMode, view: View) => void;
}) {
  const isLearningView =
    currentView === "learning" ||
    currentView === "machine-anatomy" ||
    currentView === "academy";

  if (phone) {
    const go = (mode: AppMode, view: View) => {
      if (mode === appMode) onNavigate(view);
      else if (onSwitchMode) onSwitchMode(mode, view);
      else onNavigate(view);
    };
    const opsOn = appMode === "admin";
    return (
      <nav
        aria-label="Journey"
        className="relative flex-none bg-chrome shadow-(--frame-up) px-1 min-h-14 pb-safe flex items-center justify-around z-30"
      >
        <NavButton
          active={!opsOn && currentView === "clients"}
          onClick={() => go("trainer", "clients")}
          icon={<Calendar className="w-5 h-5" />}
          label="Schedule"
        />
        {canOpenOperations && (
          <NavButton
            active={opsOn}
            onClick={() => go("admin", currentView === "admins-dashboard" ? "admins-dashboard" : "admin-dashboard")}
            icon={<LayoutDashboard className="w-5 h-5" />}
            label="Operations"
            activeColor="text-chrome-go"
            activeBg="bg-chrome-go text-chrome"
            activeIndicator="bg-chrome-go"
          />
        )}
        <NavButton
          active={!opsOn && ["profile", "progress-report", "client-directory"].includes(currentView)}
          onClick={() => go("trainer", hasClient ? "profile" : "client-directory")}
          icon={<Users className="w-5 h-5" />}
          label="Clients"
        />
        {liveSession && (
          <NavButton
            active={currentView === "workouts"}
            onClick={onResumeSession}
            icon={<PlayCircle className="w-5 h-5" />}
            // "Session", not "Session · Frodo": five tabs leave no room for
            // her name, and a name is never cut short.
            label="Session"
            activeColor="text-chrome-go"
            activeBg="bg-chrome-go text-chrome"
            activeIndicator="bg-chrome-go"
            attention={currentView !== "workouts"}
          />
        )}
        <NavButton
          active={!opsOn && currentView === "studio-tasks"}
          onClick={() => go("trainer", "studio-tasks")}
          icon={<Building2 className="w-5 h-5" />}
          label="My Studio"
        />
      </nav>
    );
  }

  return appMode === "trainer" ? (
    <nav className="relative flex-none bg-chrome shadow-(--frame-up) px-2 sm:px-6 min-h-14 sm:min-h-20 pb-safe flex items-center justify-around z-30">
      <NavButton
        active={currentView === "clients"}
        onClick={() => onNavigate("clients")}
        icon={<Users className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="Hub"
      />
      <NavButton
        active={[
          "profile",
          "progress-report",
          "client-directory",
        ].includes(currentView)}
        onClick={() => {
          if (hasClient) {
            onNavigate("profile");
          } else {
            onNavigate("client-directory");
          }
        }}
        icon={<ClipboardList className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="Client"
      />
      <NavButton
        active={currentView === "workouts"}
        onClick={onResumeSession}
        icon={<PlayCircle className="w-5 h-5 sm:w-6 sm:h-6" />}
        label={liveSessionTabLabel(liveSession)}
        activeColor={liveSession ? "text-chrome-go" : undefined}
        activeBg={
          liveSession
            ? "bg-chrome-go text-chrome"
            : undefined
        }
        activeIndicator={
          liveSession
            ? "bg-chrome-go"
            : undefined
        }
        attention={!!liveSession && currentView !== "workouts"}
      />
      {/*
        LEARNING — the Catalog and the Academy in one slot (Sep 10
        2026). Six buttons again. NavButton takes `flex-1 min-w-0` so
        they divide the bar evenly, and a label too long for its share
        wraps (it truncated until Oct 4 2026; names are never cut short,
        and the session's tab carries the client's first name); do not
        shorten the labels, they are how people find the tab. Which of
        the two it opens is whichever was open last — see
        lastLearningView in AppContent.
      */}
      <NavButton
        active={isLearningView}
        onClick={() => onNavigate(lastLearningView)}
        icon={<GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="Learning"
      />
      <NavButton
        active={currentView === "studio-tasks"}
        onClick={() => onNavigate("studio-tasks")}
        // The building, as on My Studio's own masthead (MyStudioView). It was
        // the Planner's notebook until Sep 27 2026, and the notebook is the
        // notes icon everywhere else.
        icon={<Building2 className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="My Studio"
      />
      <NavButton
        active={currentView === "calendar"}
        onClick={() => onNavigate("calendar")}
        icon={<Calendar className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="Calendar"
      />
    </nav>
  ) : (
    <nav className="relative flex-none bg-chrome border-t border-chrome-go/30 shadow-(--frame-up) px-2 sm:px-6 min-h-14 sm:min-h-20 pb-safe flex items-center justify-around z-30">
      <NavButton
        active={currentView === "admin-dashboard"}
        onClick={() => onNavigate("admin-dashboard")}
        icon={<LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="Operations"
        activeColor="text-chrome-go"
        activeBg="bg-chrome-go text-chrome"
        activeIndicator="bg-chrome-go"
      />
      {/*
        The Admins dashboard (Operations overhaul, Sep 2026): where the
        app is managed — the standard template, the master catalog,
        every location, the machinery. Administrators and the founder.
      */}
      {isAdmin && (
        <NavButton
          active={currentView === "admins-dashboard"}
          onClick={() => onNavigate("admins-dashboard")}
          icon={<ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />}
          label="Admin"
          activeColor="text-chrome-go"
          activeBg="bg-chrome-go text-chrome"
          activeIndicator="bg-chrome-go"
        />
      )}
      {/*
        The Franchise screen that sat here (owners and admins) folded
        into Operations on Sep 19 2026: its tiles and locations are the
        Overview under "All my studios", its team editor was a second
        Staff & Roles, its composer a second Announcements. One
        dashboard, one scope.
      */}
      {/*
        "Customize Studio" used to be a third NavButton here. It went to
        `trainer-hub` - the same place the gear in the header goes, from
        every screen in the app - under a different name and a different
        icon. Two routes to one screen is a wrong guess waiting to
        happen; two routes with different NAMES teaches people the app
        has two settings screens and they picked the wrong one. The gear
        stays, because it is reachable from everywhere. Section 16.
      */}
    </nav>
  );
}
