/**
 * THE ADMINS DASHBOARD — where the app is managed.
 *
 * Operations overhaul, Sep 2026. AJ (Sep 19): Operations is split in two.
 * Operations is the studio-management area, always one studio; this is
 * everything corporate-only — the standard template, the master catalog,
 * cross-location views, system tooling — "and this will not be accessed by
 * anyone other than admins access accounts and the owner of MSF."
 *
 * Who admins are: corporate staff of Max Strength — people assisting
 * studios with start-up or supporting existing studios. They may not be
 * trainers, and they are not studio owners (franchisees); admins sit above
 * them. Full access, not scoped, not time-limited; admins can promote
 * other admins; a new studio — the Mindbody id and the machines — is set
 * up here before it is handed to its leader.
 *
 * THE COMMAND CENTER (the Admins room of the redesign, Sep 28 2026 — AJ's
 * pick). One shell instead of a strip of seven tabs:
 *
 *   - four PLACES (nav.ts): Home · Studios · Standard · Machinery. A sidebar
 *     in landscape, two levels at most, and a bar of places in portrait with
 *     the place's pages as chips under it — nothing runs off the side of a
 *     portrait iPad;
 *   - Home first: what needs you, from conditions that clear themselves
 *     (home/needs.ts), the network and the standard in a sentence each;
 *   - Studios: every studio grouped by what Journey knows, and a page per
 *     studio (studios/); The machinery adds the Mindbody sync check across
 *     every studio (machinery/);
 *   - one header: the app's own. Each page's title sits in the page;
 *   - a search across every studio, the machine catalog and everyone with
 *     an account (search.ts), opened at the top of the page so the page
 *     underneath keeps any typing;
 *   - every screen that was a tab is still here, moved not rewritten.
 *
 * What it reads of its own, once when it opens and again on Check again:
 * each real studio's sync lease, Limbo, the newest hundred bug reports and
 * the machines studios offered the catalog — the reads its pages already
 * make. No listener of its own but the machine catalog, no timer, and no
 * Mindbody call.
 *
 * Moving between pages asks the leave question first (features/
 * unsaved-changes): a catalog machine mid-edit or a studio's half-typed
 * details unmount when the page changes. The third position on the app-mode
 * switch (Trainer · Operations · Admin); administrators and the founder only
 * (`isAdmin`), refused in words for anyone else — the route asks too.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bug,
  Building2,
  ClipboardList,
  Cog,
  Database,
  Download,
  Dumbbell,
  GitPullRequest,
  House,
  Inbox,
  Network,
  RefreshCw,
  Search,
  BookOpenCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Client, FranchiseNetwork, Machine, Studio, Trainer } from "../../types";
import { useMachineCatalog } from "../../hooks/useMachineCatalog";
import { useScrollerPad } from "../client-profile/use-scroller-pad";
import { AdminMachinesTab } from "../admin/machines/AdminMachinesTab";
import { UnsavedChangesScope, useLeaveScope } from "../unsaved-changes";
import { AdminLimboQueue } from "../admin/limbo/AdminLimboQueue";
import { AdminSystemToolsTab } from "../admin/system/AdminSystemToolsTab";
import { AdminBugReportsTab } from "../admin/bugs/AdminBugReportsTab";
import { AdminButton, AdminNotice, AdminScreen } from "../admin/primitives";
import { StandardTemplateTab } from "./StandardTemplateTab";
import { ReviewQueuePage } from "./ReviewQueuePage";
import { AdminsDataPage } from "./AdminsDataPage";
import { CatalogMachineHost } from "./CatalogMachineHost";
import { SearchPanel } from "./SearchPanel";
import { buildSearchIndex, type SearchEntry } from "./search";
import { StudiosRoom } from "./studios/StudiosRoom";
import { StudioPage, type StudioTab } from "./studios/StudioPage";
import { FranchisesPage } from "./studios/FranchisesPage";
import { SyncCheck } from "./machinery/SyncCheck";
import { useStudioLeases } from "./machinery/useStudioLeases";
import { syncRowOf, syncRows } from "./machinery/sync-check";
import { AdminsHome } from "./home/AdminsHome";
import { useHomeSignals } from "./home/useHomeSignals";
import { needItems, type NeedDoor } from "./home/needs";
import { networkSentence, standardSentence } from "./home/sentences";
import { StudioDefaultsCard } from "./standard/StudioDefaultsCard";
import { HqStatus } from "./kit";
import { isDemoStudio } from "../demo-mode/is-demo";
import {
  ADMINS_NAV,
  ADMINS_PLACES,
  ADMINS_START,
  navKeyOf,
  pagesOf,
  placeOf,
  type AdminsNavPage,
  type AdminsPage,
  type AdminsPlace,
} from "./nav";
import "../admin/admin.css";
import "./admins.css";

export interface AdminsDashboardViewProps {
  authTrainer: Trainer;
  studios: Studio[];
  networks: FranchiseNetwork[];
  trainers: Trainer[];
  clients: Client[];
  machines: Machine[];
  isAdmin: boolean;
  activeStudioId: string | null;
  onRefresh?: (collectionName: "studios" | "networks" | "trainers") => Promise<void>;
  onRestoreMachines?: () => void;
  onReorderTrainers?: () => void;
}

const PAGE_ICON: Record<AdminsNavPage, ReactNode> = {
  home: <House aria-hidden="true" />,
  studios: <Building2 aria-hidden="true" />,
  franchises: <Network aria-hidden="true" />,
  machines: <Dumbbell aria-hidden="true" />,
  template: <ClipboardList aria-hidden="true" />,
  review: <GitPullRequest aria-hidden="true" />,
  limbo: <Inbox aria-hidden="true" />,
  sync: <RefreshCw aria-hidden="true" />,
  bugs: <Bug aria-hidden="true" />,
  data: <Download aria-hidden="true" />,
  system: <Database aria-hidden="true" />,
};

const PLACE_ICON: Record<AdminsPlace, ReactNode> = {
  home: <House aria-hidden="true" />,
  studios: <Building2 aria-hidden="true" />,
  standard: <BookOpenCheck aria-hidden="true" />,
  machinery: <Cog aria-hidden="true" />,
};

export function AdminsDashboardView(props: AdminsDashboardViewProps) {
  if (!props.isAdmin) {
    return (
      <div className="adm hq hq-shell">
        <div className="hq-main">
          <AdminNotice tone="warn">The Admins dashboard is for administrators and the founder. Operations is where a studio is run.</AdminNotice>
        </div>
      </div>
    );
  }
  return <AdminsShell {...props} />;
}

/** Where a move is going: a page, and for some pages what to open on it. */
interface Destination {
  page: AdminsPage;
  studioId?: string | null;
  machineId?: string | null;
  /** A studio's page opens on this tab (a person found by the search opens on Team). */
  tab?: StudioTab | null;
}

interface Focus {
  studioId: string | null;
  machineId: string | null;
  tab: StudioTab | null;
  seq: number;
}

function AdminsShell({
  authTrainer,
  studios,
  networks,
  trainers,
  clients,
  isAdmin,
  activeStudioId,
  onRefresh,
  onRestoreMachines,
  onReorderTrainers,
}: AdminsDashboardViewProps) {
  const [page, setPage] = useState<AdminsPage>(ADMINS_START);
  // Which studio's page is open, or which machine a search pick opened. The
  // number keys the page so opening another studio starts it fresh (the
  // leave question has already been asked by then).
  const [focus, setFocus] = useState<Focus>({ studioId: null, machineId: null, tab: null, seq: 0 });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pagesScope = useLeaveScope();
  const shellRef = useRef<HTMLDivElement | null>(null);
  useScrollerPad(shellRef);

  const catalog = useMachineCatalog();
  const index = useMemo(
    () => buildSearchIndex({ studios, networks, machines: catalog.catalog, trainers }),
    [studios, networks, catalog.catalog, trainers],
  );

  // Every real studio's sync lease, read once when the dashboard opens and
  // again on "Check again" (machinery/useStudioLeases.ts): the sync check,
  // a studio's Mindbody tab and All studios' rows all say what it says.
  const [checkSeq, setCheckSeq] = useState(0);
  const realStudioIds = useMemo(
    () => studios.filter((s) => s.id && !isDemoStudio(s) && s.mindbodyMode !== "offline").map((s) => s.id!),
    [studios],
  );
  const { leases, checkedAt } = useStudioLeases(realStudioIds, checkSeq);
  const syncOf = useCallback(
    (studio: Studio) => syncRowOf(studio, studios, leases[studio.id ?? ""], checkedAt ?? Date.now()),
    [studios, leases, checkedAt],
  );

  // What Home reads besides the leases — Limbo, the bug reports, the machines
  // studios offered the catalog — once when the dashboard opens, again on
  // Check again, and again when Limbo or Bug reports changes something
  // (home/useHomeSignals.ts). The sidebar's counts come from the same reads.
  const [signalsSeq, setSignalsSeq] = useState(0);
  const signals = useHomeSignals(signalsSeq);
  const recount = useCallback(() => setSignalsSeq((n) => n + 1), []);
  const checkAgain = useCallback(() => {
    setCheckSeq((n) => n + 1);
    setSignalsSeq((n) => n + 1);
  }, []);
  const counts: Partial<Record<AdminsNavPage, number>> = {
    ...(signals.limbo.state === "ok" && signals.limbo.entries.length ? { limbo: signals.limbo.entries.length } : {}),
    ...(signals.bugs.state === "ok" ? { bugs: signals.bugs.reports.filter((r) => r.status === "open").length || undefined } : {}),
  };

  /** Every move between pages asks first: the page it leaves may hold typing. */
  const go = useCallback(
    (to: Destination) => {
      const sameThing =
        to.page === page &&
        (to.studioId ?? null) === focus.studioId &&
        (to.machineId ?? null) === focus.machineId &&
        (to.tab ?? null) === focus.tab;
      if (sameThing) {
        setSearchOpen(false);
        setQuery("");
        return;
      }
      pagesScope.guard(() => {
        // A move from the sidebar or the bar while the search is open lands
        // on the page, not behind the search.
        setSearchOpen(false);
        setQuery("");
        setPage(to.page);
        setFocus((f) => ({ studioId: to.studioId ?? null, machineId: to.machineId ?? null, tab: to.tab ?? null, seq: f.seq + 1 }));
      });
    },
    [page, focus.studioId, focus.machineId, focus.tab, pagesScope],
  );

  /** After a delete there is nothing left to ask about: straight back to the list. */
  const backToStudios = useCallback(() => {
    setPage("studios");
    setFocus((f) => ({ studioId: null, machineId: null, tab: null, seq: f.seq + 1 }));
  }, []);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
  }, []);

  // Ctrl K / Cmd K opens the search on a PC, as the consoles admins know do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (entry: SearchEntry) => {
    closeSearch();
    const t = entry.target;
    if (t.kind === "machine") go({ page: "machines", machineId: t.machineId });
    else if (t.kind === "studio") go({ page: "studio", studioId: t.studioId });
    else if (t.studioId) go({ page: "studio", studioId: t.studioId, tab: "team" });
    else go({ page: "studios" });
  };

  const openStudio = studios.find((s) => s.id === focus.studioId) ?? null;

  // Home: what needs you, the network and the standard, all from the reads above.
  const now = checkedAt ?? Date.now();
  const allSync = useMemo(() => syncRows(studios, leases, now), [studios, leases, now]);
  const needs = useMemo(
    () => needItems({ studios, networks, sync: allSync, limbo: signals.limbo, bugs: signals.bugs, offers: signals.offers, now }),
    [studios, networks, allSync, signals, now],
  );
  const openDoor = (door: NeedDoor) => {
    if ("action" in door) checkAgain();
    else go({ page: door.page, studioId: door.studioId ?? null, tab: door.tab ?? null });
  };

  const current = navKeyOf(page);
  const place = placeOf(page);
  const placePages = pagesOf(place);

  const navButton = (item: { page: AdminsNavPage; label: string }) => (
    <button
      key={item.page}
      type="button"
      className={cn("hq-nav__item", current === item.page && "hq-nav__item--on")}
      aria-current={current === item.page ? "page" : undefined}
      onClick={() => go({ page: item.page })}
    >
      {PAGE_ICON[item.page]}
      <span className="hq-nav__label">{item.label}</span>
      {counts[item.page] ? (
        <span className="hq-nav__count" aria-label={`${counts[item.page]} waiting`}>
          {counts[item.page]}
        </span>
      ) : null}
    </button>
  );

  const findButton = (
    <button type="button" className="hq-find" onClick={openSearch} aria-expanded={searchOpen}>
      <Search aria-hidden="true" />
      <span>Search</span>
      <span className="hq-find__keys" aria-hidden="true">
        Ctrl K
      </span>
    </button>
  );

  return (
    <div ref={shellRef} className="adm hq hq-shell" data-testid="admins-dashboard">
      <aside className="hq-side" aria-label="Admins pages">
        {findButton}
        {ADMINS_NAV.map((group) => (
          <nav key={group.place} aria-label={group.label ?? "Home"}>
            {group.label ? <div className="hq-nav__group">{group.label}</div> : null}
            {group.items.map(navButton)}
          </nav>
        ))}
      </aside>

      <div className="hq-main">
        <div className="hq-bar">
          <nav className="hq-bar__places" aria-label="Admins places">
            {ADMINS_PLACES.map((p) => (
              <button
                key={p.place}
                type="button"
                className={cn("hq-place", place === p.place && "hq-place--on")}
                aria-current={place === p.place ? "true" : undefined}
                onClick={() => go({ page: p.opens })}
              >
                {PLACE_ICON[p.place]}
                <span>{p.label}</span>
              </button>
            ))}
            {findButton}
          </nav>
          {placePages.length > 1 ? (
            <div className="hq-chips" role="group" aria-label="Pages here">
              {placePages.map((item) => (
                <button
                  key={item.page}
                  type="button"
                  className={cn("hq-chip", current === item.page && "hq-chip--on")}
                  aria-pressed={current === item.page}
                  onClick={() => go({ page: item.page })}
                >
                  {item.label}
                  {counts[item.page] ? <span className="hq-chip__count">{counts[item.page]}</span> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {searchOpen ? (
          <SearchPanel
            query={query}
            onQuery={setQuery}
            onClose={closeSearch}
            onPick={pick}
            index={index}
            machinesLoading={catalog.loading}
          />
        ) : null}

        <div className="hq-page" hidden={searchOpen}>
          <UnsavedChangesScope scope={pagesScope}>
            {page === "home" && (
              <AdminsHome
                items={needs.items}
                more={needs.more}
                checkedAt={checkedAt}
                network={networkSentence(studios, networks, allSync, new Date(now))}
                standard={standardSentence({ loading: catalog.loading, failed: catalog.failed, machines: catalog.catalog }, signals.offers)}
                onDoor={openDoor}
                onCheckAgain={checkAgain}
                onOpenStudios={() => go({ page: "studios" })}
                onOpenMachines={() => go({ page: "machines" })}
              />
            )}
            {page === "studios" && (
              <StudiosRoom
                authTrainer={authTrainer}
                studios={studios}
                networks={networks}
                isAdmin={isAdmin}
                onRefresh={onRefresh}
                onOpenStudio={(studioId) => go({ page: "studio", studioId })}
                extraSay={(studioId) => {
                  const studio = studios.find((s) => s.id === studioId);
                  if (!studio || isDemoStudio(studio)) return null;
                  const row = syncOf(studio);
                  // The link's own words already say offline or what is missing.
                  if (row.kind === "offline" || row.kind === "no-site" || row.kind === "no-location") return null;
                  return <HqStatus tone={row.tone}>{row.word}</HqStatus>;
                }}
              />
            )}
            {page === "studio" &&
              (openStudio ? (
                <StudioPage
                  key={`${openStudio.id}-${focus.seq}`}
                  studio={openStudio}
                  studios={studios}
                  networks={networks}
                  trainers={trainers}
                  clients={clients}
                  authTrainer={authTrainer}
                  isAdmin={isAdmin}
                  initialTab={focus.tab ?? "setup"}
                  onBack={() => go({ page: "studios" })}
                  onDeleted={backToStudios}
                  onRefresh={onRefresh}
                  sync={(() => {
                    const row = syncOf(openStudio);
                    if (row.kind === "offline" || row.kind === "no-site" || row.kind === "no-location") return undefined;
                    return (
                      <>
                        <HqStatus tone={row.tone}>{row.word}</HqStatus>
                        <p className="hq-standing">{row.detail}</p>
                      </>
                    );
                  })()}
                  onOpenSync={() => go({ page: "sync" })}
                />
              ) : (
                <AdminScreen>
                  <AdminNotice tone="info">That studio isn&apos;t in the list any more.</AdminNotice>
                  <div>
                    <AdminButton onClick={backToStudios}>All studios</AdminButton>
                  </div>
                </AdminScreen>
              ))}
            {page === "franchises" && (
              <FranchisesPage studios={studios} networks={networks} trainers={trainers} isAdmin={isAdmin} onRefresh={onRefresh} />
            )}
            {page === "machines" &&
              (focus.machineId ? (
                <CatalogMachineHost
                  key={`machine-${focus.seq}`}
                  machineId={focus.machineId}
                  catalog={catalog.catalog}
                  loading={catalog.loading}
                  failed={catalog.failed}
                  onBack={() => go({ page: "machines" })}
                />
              ) : (
                <div className="flex flex-col gap-4">
                  <StudioDefaultsCard studios={studios} catalog={catalog.catalog} />
                  <AdminMachinesTab isAdmin={isAdmin} />
                </div>
              ))}
            {page === "template" && (
              <StandardTemplateTab authTrainer={authTrainer} studios={studios} activeStudioId={activeStudioId} isAdmin={isAdmin} />
            )}
            {/* The review queue (features/machine-db/ShareReviewPanel): what
                studios offer to every MSF studio, read by an administrator
                first (AJ, Sep 28 2026). */}
            {page === "review" && (
              <ReviewQueuePage studios={studios} trainers={trainers} onOpenMachines={() => go({ page: "machines" })} />
            )}
            {page === "limbo" && <AdminLimboQueue studios={studios} clients={clients} onChanged={recount} />}
            {page === "sync" && (
              <SyncCheck
                studios={studios}
                leases={leases}
                checkedAt={checkedAt}
                onCheckAgain={checkAgain}
                onOpenStudio={(studioId) => go({ page: "studio", studioId, tab: "mindbody" })}
              />
            )}
            {page === "bugs" && <AdminBugReportsTab studios={studios} onChanged={recount} />}
            {page === "data" && (
              <AdminsDataPage studios={studios} trainers={trainers} clients={clients} activeStudioId={activeStudioId} />
            )}
            {page === "system" && <AdminSystemToolsTab onRestoreMachines={onRestoreMachines} onReorderTrainers={onReorderTrainers} />}
          </UnsavedChangesScope>
        </div>
      </div>
    </div>
  );
}
