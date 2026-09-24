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
 */
import {
  Calendar,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  NotebookPen,
  PlayCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
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
}) {
  const isLearningView =
    currentView === "learning" ||
    currentView === "machine-anatomy" ||
    currentView === "academy";

  return appMode === "trainer" ? (
    <nav className="flex-none bg-white dark:bg-bg-dark border-t border-[#68717A]/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-2 sm:px-6 min-h-14 sm:min-h-20 pb-[env(safe-area-inset-bottom,0px)] flex items-center justify-around z-30">
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
        activeColor={liveSession ? "text-orange-500" : undefined}
        activeBg={
          liveSession
            ? "bg-orange-500/10 dark:bg-orange-600/10"
            : undefined
        }
        activeIndicator={
          liveSession
            ? "bg-orange-500 dark:bg-orange-600"
            : undefined
        }
        attention={!!liveSession && currentView !== "workouts"}
      />
      {/*
        LEARNING — the Catalog and the Academy in one slot (Sep 10
        2026). Six buttons again. NavButton takes `flex-1 min-w-0` so
        they divide the bar evenly and the labels truncate rather than
        overflowing on a narrow phone; do not shorten the labels, they
        are how people find the tab. Which of the two it opens is
        whichever was open last — see lastLearningView in AppContent.
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
        icon={<NotebookPen className="w-5 h-5 sm:w-6 sm:h-6" />}
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
    <nav className="flex-none bg-white dark:bg-bg-dark border-t border-orange-500/20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] px-2 sm:px-6 min-h-14 sm:min-h-20 pb-[env(safe-area-inset-bottom,0px)] flex items-center justify-around z-30">
      <NavButton
        active={currentView === "admin-dashboard"}
        onClick={() => onNavigate("admin-dashboard")}
        icon={<LayoutDashboard className="w-5 h-5 sm:w-6 sm:h-6" />}
        label="Operations"
        activeColor="text-orange-500"
        activeBg="bg-orange-500/10 dark:bg-orange-600/10"
        activeIndicator="bg-orange-500 dark:bg-orange-600"
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
          activeColor="text-orange-500"
          activeBg="bg-orange-500/10 dark:bg-orange-600/10"
          activeIndicator="bg-orange-500 dark:bg-orange-600"
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
