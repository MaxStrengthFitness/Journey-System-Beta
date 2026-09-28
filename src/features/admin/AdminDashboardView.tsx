import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Trainer, Studio, FranchiseNetwork, Client, WorkoutSession, Machine, ScheduleEntry } from "../../types";
import { ChevronLeft } from "lucide-react";
import "./admin.css";
import "./shell/ops.css";
import { auth } from "../../firebase";

import { AdminDataReportsTab } from "./data";
import { OverviewPage, type OverviewLink } from "./overview/OverviewPage";
import { AdminStaffTab } from "./staff/AdminStaffTab";
import { AdminAnnouncementsTab } from "./announcements/AdminAnnouncementsTab";
import { AdminMindbodyTab } from "./mindbody/AdminMindbodyTab";
import { AdminInsightsTab } from "./insights/AdminInsightsTab";
import { AdminHoursTab } from "./hours/AdminHoursTab";
import { AdminRenewalsTab } from "./renewals/AdminRenewalsTab";
import { AdminFloorTab } from "./floor/AdminFloorTab";
import { WeekPage } from "./week/WeekPage";
import { OperationsScopeProvider, PickOneStudio, scopeKey, useOperationsScope } from "./scope-context";
import { DelightQueue } from "../ford/DelightQueue";
import { rememberMyStudioSection } from "../my-studio/section-memory";
import { mayOpenOperations } from "./operations-access";
import { leadsHere } from "../relay/leads";
import { isEveryStudioRole } from "../renewals/permissions";
import { AdminEmpty, AdminNotice } from "./primitives";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { DOOR_PLACE, defaultSub, placeKey, placeLabel, resolvePlace, samePlace, type OpsPage, type OpsPlace } from "./shell/places";
import {
  rememberClient,
  rememberPlace,
  rememberScroll,
  rememberSetupOpen,
  rememberedClient,
  rememberedPlace,
  rememberedScroll,
  rememberedSetupOpen,
  rememberedSub,
} from "./shell/place-memory";
import { LookingAt, OpsSidebar, OpsSubs, OpsTabs, SetupHome, type NavBadges } from "./shell/OperationsNav";
import { ClientPage } from "./shell/ClientPage";

interface Props {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  isAdmin: boolean;
  onRefresh?: (
    collectionName: "studios" | "networks" | "trainers",
  ) => Promise<void>;
  clients?: Client[];
  sessions?: WorkoutSession[];
  machines?: Machine[];
  /**
   * Everything the live schedule hook has loaded for the active studio —
   * yesterday through about a week ahead. The client page reads it for her
   * next booking; the Overview reads its own week.
   */
  schedules?: ScheduleEntry[];
  newClientsCount?: number;
  onShowNewClients?: () => void;
  onUpdateStudio?: (id: string, updates: Partial<Studio>) => Promise<void>;
  onUpdateClient?: (id: string, updates: Partial<Client>) => Promise<void>;
  /** The client's full profile, in the app. Operations opens a client inside itself first. */
  onNavigateProfile?: (clientId: string) => void;
  /**
   * The studio the admin is currently working in. Data & Reports and Alerts
   * both act on ONE studio, so they need it explicitly rather than inferring
   * a home studio: a payroll export for the wrong location is a quiet mistake
   * that only shows up on a pay run.
   */
  activeStudioId?: string | null;
  /**
   * System tools that used to hang off the trainer hub. Passed in rather than
   * implemented here because they act on the app as a whole and their
   * confirmation modals already live in AppContent.
   */
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
  /** Opens My Studio, in trainer mode (the doors to Team, Studio and Openings). */
  onOpenStudioTasks?: () => void;
}

/**
 * The Operations screen. The scope — "this studio" (the studio the app is
 * in) or "all my studios" — is decided once here and read by every page
 * (Operations round, Sep 2026; features/admin/scope-context.tsx). The
 * provider needs the active-studio context, so the shell is a child of it.
 */
export function AdminDashboardView(props: Props) {
  /*
   * The shell holds itself to the same rule as the menu and the route
   * (sign-out round, Sep 24 2026): studio leaders and above, or anyone inside
   * Demo Mode. AppContent already sends everyone else to the Hub; this is so
   * no other door — a link, a future screen — can open it for them, and so
   * none of the pages starts reading a studio it should not.
   */
  if (!mayOpenOperations(props.authTrainer, props.activeStudioId ?? null)) {
    return (
      <div className="adm ops-shell" data-testid="operations-closed">
        <div className="ops-body">
          <AdminNotice tone="warn">
            Operations is for a studio's leaders. Everything a trainer needs is on the Hub, a client's profile and My Studio — and anyone can try
            Operations in Demo Mode.
          </AdminNotice>
        </div>
      </div>
    );
  }
  return (
    <OperationsScopeProvider
      authTrainer={props.authTrainer}
      studios={props.studios}
      networks={props.networks}
      isAdmin={props.isAdmin}
      activeStudioId={props.activeStudioId ?? null}
    >
      <OperationsShell {...props} />
    </OperationsScopeProvider>
  );
}

/** The element that scrolls the page: AppContent's <main>, else the document. */
function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  return (el.closest("main") as HTMLElement | null) ?? (typeof document !== "undefined" ? (document.scrollingElement as HTMLElement | null) : null);
}

/**
 * FIVE DESTINATIONS (the redesign's Operations room, Sep 28 2026 — the pick
 * "Brief + Journey"; shell/places.ts has the list and the why). Today ·
 * Week · Clients · Team · Setup, each tab's screen mounted as it was:
 *
 *   Overview        → Today
 *   (its Changes)   → Week → This week
 *   Renewals        → Clients → Renewals
 *   Delight queue   → Clients → Moments
 *   Insights        → Clients → Trends
 *   Hours           → Team → Hours
 *   Floor           → Setup → Floor
 *   Staff & Roles   → Setup → People & access
 *   Announcements   → Setup → Announcements
 *   Mindbody        → Setup → Mindbody
 *   Data            → Setup → Data
 *
 * A client tapped anywhere opens INSIDE Operations (shell/ClientPage), with
 * the page behind kept mounted and hidden, so Back is instant and exact.
 * Where a leader was — the place, each destination's page, the client, the
 * scroll — is remembered for the session and forgotten at sign-out
 * (shell/place-memory.ts). Every move that would unmount a page asks the
 * leave question first (`tabsScope`), as the nine tabs did.
 *
 * AJ, Sep 18: "anyone head trainer and above has pretty much all access to
 * everything; restrict more later." So nothing on this side is gated beyond
 * opening Operations at all; the one-studio pages still say so under "All my
 * studios" (PickOneStudio).
 */
function OperationsShell({
  authTrainer,
  studios,
  networks,
  trainers,
  isAdmin,
  onRefresh,
  clients = [],
  sessions = [],
  machines = [],
  schedules = [],
  newClientsCount = 0,
  onShowNewClients,
  onUpdateStudio,
  onUpdateClient,
  onNavigateProfile,
  onRestoreMachines,
  onReorderTrainers,
  onOpenStudioTasks,
  // The studio the APP is in: where My Studio opens (ops.studioId is null
  // under "All my studios").
  activeStudioId: appStudioId,
}: Props) {
  void newClientsCount;
  void onShowNewClients;
  void onUpdateStudio;
  void onUpdateClient;
  // The system tools moved to the Admins dashboard (features/admins); the
  // callbacks stay on the props so AppContent's call site needs no change.
  void onRestoreMachines;
  void onReorderTrainers;
  const ops = useOperationsScope();
  const activeStudioId = ops.studioId;
  const tabKey = scopeKey(ops.scope);
  const studio = studios.find((s) => s.id === activeStudioId) ?? null;

  const [place, setPlace] = useState<OpsPlace>(() => rememberedPlace());
  const [clientId, setClientId] = useState<string | null>(() => rememberedClient());
  const [setupOpen, setSetupOpen] = useState(() => rememberedSetupOpen() || rememberedPlace().page === "setup");
  const [floorView, setFloorView] = useState<"machines" | "fit" | "routines">("machines");
  // Pressing Today while on it brings the page home from one of its views.
  const [homeSignal, setHomeSignal] = useState(0);
  // What Today's "Needs you" counts, while Today is mounted; null otherwise
  // (a count from an earlier visit could be wrong, so none is shown).
  const [needsCount, setNeedsCount] = useState<number | null>(null);
  const badges: NavBadges = needsCount ? { today: { count: needsCount, hot: true } } : {};
  /*
   * A page unmounts when another is opened, and a Save bar's edits (a studio
   * machine on Floor) went with it. Every move now asks first about the
   * typing inside `tabsScope` (unsaved changes, Sep 24 2026).
   */
  const tabsScope = useLeaveScope();

  /* ---- the scroll, per page ---- */
  const shellRef = useRef<HTMLDivElement>(null);
  const viewKey = clientId ? `client:${clientId}` : placeKey(place);
  const viewKeyRef = useRef(viewKey);
  const saveScroll = useCallback(() => {
    const s = scrollerOf(shellRef.current);
    if (s) rememberScroll(viewKeyRef.current, s.scrollTop);
  }, []);
  useLayoutEffect(() => {
    viewKeyRef.current = viewKey;
    const s = scrollerOf(shellRef.current);
    if (!s) return;
    const top = rememberedScroll(viewKey);
    s.scrollTop = top;
    if (top <= 0) return;
    // A page still reading its data is shorter than it was; once it has, try
    // once more — unless the leader has already scrolled.
    const first = s.scrollTop;
    const t = setTimeout(() => {
      if (s.scrollTop === first && first < top) s.scrollTop = top;
    }, 400);
    return () => clearTimeout(t);
  }, [viewKey]);
  // Leaving Operations (her full profile, the Hub): remember how far down.
  useLayoutEffect(() => () => saveScroll(), [saveScroll]);

  /* ---- a change of studio or scope closes the client: she may not be this studio's ---- */
  const lastTabKey = useRef(tabKey);
  useEffect(() => {
    if (lastTabKey.current === tabKey) return;
    lastTabKey.current = tabKey;
    setClientId(null);
    rememberClient(null);
  }, [tabKey]);

  /* ---- moving ---- */
  const go = useCallback(
    (next: OpsPlace, then?: () => void) => {
      const to = resolvePlace(next);
      if (!clientId && samePlace(to, place) && !then) {
        if (to.page === "today") setHomeSignal((n) => n + 1);
        return;
      }
      tabsScope.guard(() => {
        saveScroll();
        then?.();
        setClientId(null);
        rememberClient(null);
        setPlace(to);
        rememberPlace(to);
        if (to.page === "setup" && to.sub) {
          setSetupOpen(true);
          rememberSetupOpen(true);
        }
      });
    },
    [clientId, place, tabsScope, saveScroll],
  );
  const subOf = useCallback((page: OpsPage) => {
    const remembered = rememberedSub(page);
    return remembered === undefined ? defaultSub(page) : remembered;
  }, []);
  const toggleSetup = () => {
    setSetupOpen((v) => {
      rememberSetupOpen(!v);
      return !v;
    });
  };

  /** A client tapped anywhere in Operations opens here; the page behind stays mounted. */
  const openClient = useCallback(
    (id: string) => {
      if (!id) return;
      const show = () => {
        saveScroll();
        setClientId(id);
        rememberClient(id);
      };
      // Replacing one open client with another unmounts her page: ask first.
      if (clientId && clientId !== id) tabsScope.guard(show);
      else if (clientId !== id) show();
    },
    [clientId, tabsScope, saveScroll],
  );
  const backFromClient = useCallback(() => {
    tabsScope.guard(() => {
      saveScroll();
      setClientId(null);
      rememberClient(null);
    });
  }, [tabsScope, saveScroll]);

  /** Today's doors: each opens the page its screen moved to (the old tab ids still answer). */
  const openFromOverview = (link: OverviewLink) => {
    if (link === "floor") {
      go(DOOR_PLACE.floor, () => setFloorView("fit"));
      return;
    }
    go(DOOR_PLACE[link]);
  };

  const openMyStudio = onOpenStudioTasks
    ? () => {
        rememberMyStudioSection("studio");
        onOpenStudioTasks();
      }
    : undefined;

  const isOwnerTier = isAdmin || authTrainer?.role === "FranchiseOwner" || authTrainer?.role === "Owner";
  const me = { id: auth.currentUser?.uid ?? authTrainer.authUid ?? authTrainer.id ?? "", name: authTrainer.fullName };
  const noStudio = <AdminEmpty title="No studio">Switch the app to a studio to read this page.</AdminEmpty>;

  const renderPage = () => {
    switch (place.page) {
      case "today":
        return (
          <OverviewPage
            key={tabKey}
            homeSignal={homeSignal}
            authTrainer={authTrainer}
            studios={studios}
            trainers={trainers}
            machines={machines}
            clients={clients}
            schedules={schedules}
            activeStudioId={activeStudioId}
            onNavigateProfile={openClient}
            onOpen={openFromOverview}
            networks={networks}
            // Openings' line opens My Studio → Openings in trainer mode; the
            // page remembers the section first, as Staff & Roles does for Team.
            onOpenMyStudio={onOpenStudioTasks}
            onNeedsCount={setNeedsCount}
          />
        );
      case "week":
        if (ops.scope.kind === "all") return <PickOneStudio what="The week" />;
        return studio ? <WeekPage key={tabKey} studio={studio} onOpenClient={openClient} /> : noStudio;
      case "clients":
        if (place.sub === "moments") {
          return (
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="font-display text-xl font-black uppercase italic tracking-tight text-foreground">Moments</h2>
                <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">
                  The Delight queue: what the team has promised itself it would do something about, for every client at this studio, soonest first. A
                  detail becomes a gesture on a client's FORD page: Add an idea under Going above and beyond, or open a detail and choose Do something
                  about it.
                </p>
              </div>
              {ops.scope.kind === "all" ? (
                <PickOneStudio what="The Delight queue" />
              ) : (
                <DelightQueue key={tabKey} studioId={activeStudioId ?? null} clients={clients} trainers={trainers} me={me} onOpenClient={openClient} />
              )}
            </div>
          );
        }
        if (place.sub === "trends") return <AdminInsightsTab key={tabKey} studios={studios} trainers={trainers} activeStudioId={activeStudioId ?? null} />;
        return (
          <AdminRenewalsTab key={tabKey} authTrainer={authTrainer} studios={studios} activeStudioId={activeStudioId ?? null} trainers={trainers} machines={machines} onOpenMyStudio={openMyStudio} />
        );
      case "team":
        return <AdminHoursTab key={tabKey} trainers={trainers} />;
      case "setup":
        switch (place.sub) {
          case "floor":
            return (
              <AdminFloorTab
                key={`${tabKey}:${floorView}`}
                authTrainer={authTrainer}
                studios={studios}
                trainers={trainers}
                machines={machines}
                clients={clients}
                activeStudioId={activeStudioId ?? null}
                isAdmin={isAdmin}
                // Machine fit's Check hands the profile a place to land
                // (Programming → Setup) before it navigates, so it goes
                // straight to the profile, never through the client page.
                onNavigateProfile={onNavigateProfile}
                initialView={floorView}
              />
            );
          case "people":
            // One editor for a studio's own team (voice review follow-up,
            // Sep 27 2026): owners and administrators edit here; the studio
            // tier reads, with a door to My Studio → Team.
            return (
              <AdminStaffTab
                key={tabKey}
                trainers={trainers}
                studios={studios}
                activeStudioId={activeStudioId}
                isAdmin={isAdmin}
                canEdit={isOwnerTier || isEveryStudioRole(authTrainer)}
                // Only for someone who runs the studio My Studio opens: a head
                // trainer visiting another studio would land on Relay, since
                // Team is its leaders'.
                onOpenTeam={
                  onOpenStudioTasks && leadsHere(authTrainer, appStudioId ?? null)
                    ? () => {
                        rememberMyStudioSection("team");
                        onOpenStudioTasks();
                      }
                    : undefined
                }
                onRefresh={onRefresh}
              />
            );
          case "announcements":
            return (
              <AdminAnnouncementsTab
                authTrainer={authTrainer}
                // A studio's leader addresses the studios they run; an owner adds
                // their network; administrators everyone.
                studios={isAdmin ? studios : ops.readable}
                networks={networks}
                scopes={isAdmin ? ["universal", "network", "studio"] : isOwnerTier ? ["network", "studio"] : ["studio"]}
              />
            );
          case "mindbody":
            return ops.scope.kind === "all" && !isAdmin ? (
              <PickOneStudio what="Mindbody" />
            ) : (
              <AdminMindbodyTab key={tabKey} studios={studios} trainers={trainers} clients={clients ?? []} activeStudioId={activeStudioId ?? null} company={isAdmin} />
            );
          case "data":
            return ops.scope.kind === "all" ? (
              <PickOneStudio what="Data" />
            ) : (
              <AdminDataReportsTab key={tabKey} trainers={trainers} clients={clients} studios={studios} activeStudioId={activeStudioId} />
            );
          default:
            return <SetupHome onGo={go} />;
        }
    }
    return null;
  };

  return (
    /*
     * `adm` on the ROOT (Sep 2026): the shell and its pages are one screen,
     * on one palette. The two shapes of the menu are both in the page; CSS
     * shows the sidebar when wide and the tabs when upright (shell/ops.css).
     */
    <div className="adm ops-shell" ref={shellRef}>
      <OpsSidebar place={place} subOf={subOf} onGo={go} badges={badges} setupOpen={setupOpen} onToggleSetup={toggleSetup} />

      <div className="ops-body">
        <div className="ops-top">
          <LookingAt variant="top" />
        </div>
        <OpsTabs place={place} subOf={subOf} onGo={go} badges={badges} />
        {!clientId && <OpsSubs place={place} onGo={go} />}

        <UnsavedChangesScope scope={tabsScope}>
          <div className="ops-page" hidden={Boolean(clientId)}>
            {place.page === "setup" && place.sub && (
              <button type="button" className="ops-back" onClick={() => go({ page: "setup", sub: null })}>
                <ChevronLeft className="w-4 h-4" aria-hidden /> Setup
              </button>
            )}
            {renderPage()}
          </div>
          {clientId && (
            <ClientPage
              key={clientId}
              clientId={clientId}
              clients={clients}
              studios={studios}
              schedules={schedules}
              sessions={sessions}
              trainers={trainers}
              authTrainer={authTrainer}
              activeStudioId={appStudioId ?? null}
              backLabel={placeLabel(place)}
              onBack={backFromClient}
              onOpenProfile={onNavigateProfile}
            />
          )}
        </UnsavedChangesScope>
      </div>
    </div>
  );
}
