import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Dumbbell, GraduationCap, LayoutGrid } from "lucide-react";
import type { Machine, Trainer } from "../../types";
import { useActiveStudio } from "../../ActiveStudioContext";
import { WikiSectionsProvider, type WikiSectionsValue } from "../wiki";
import { CatalogView } from "../catalog";
import {
  AcademyWikiView,
  type AcademyGroupKey,
  type AcademyJump,
} from "../academy/AcademyWikiView";
import type { CatalogScope } from "../machine-db/ScopeSwitch";
import { LearningHome } from "./LearningHome";
import { LearningSearch } from "./LearningSearch";
import { canWriteStudioPages } from "./permissions";
import type { LearningRef } from "./ref";
import "./learning.css";

/**
 * LEARNING — the tab, as one screen with three sections.
 *
 * Round: Learning + Planner, Sep 2026. Replaces the block in AppContent that
 * wired the Catalog and the Academy together.
 *
 *   Overview  ("learning")         the front page — LearningHome
 *   Catalog   ("machine-anatomy")  this studio's machines — CatalogWikiView
 *   Academy   ("academy")          the MSF method — AcademyWikiView
 *
 * The view ids are the app's, unchanged: stored notifications and the
 * settings shortcut already point at "machine-anatomy", and they keep working.
 *
 * WHAT THIS OWNS
 * --------------
 *   - the masthead (via the sections context WikiShell reads),
 *   - the one search, which hides the page rather than unmounting it,
 *   - every way into a page from outside: a Learning ref from the bell, a
 *     note or an announcement arrives as `jump`, and a tap on the front page
 *     or in search goes through the same openRef.
 * Each section still owns its own route inside itself — the reason recorded
 * in CatalogWikiView's header still holds: one back button, one meaning.
 */

export type LearningViewId = "learning" | "machine-anatomy" | "academy";

export interface LearningViewProps {
  view: LearningViewId;
  onViewChange: (view: LearningViewId) => void;
  /** The global machine list. The Catalog uses it until a roster exists. */
  machines: Machine[];
  authTrainer: Trainer | null;
  /** A page to open, from outside the tab. Cleared once honoured. */
  jump: LearningRef | null;
  onJumpHandled: () => void;
}

export function LearningView({
  view,
  onViewChange,
  machines,
  authTrainer,
  jump,
  onJumpHandled,
}: LearningViewProps) {
  const { activeStudioId } = useActiveStudio();

  const [catalogJump, setCatalogJump] = useState<string | null>(null);
  const [catalogGroup, setCatalogGroup] = useState<string | null>(null);
  const [catalogScope, setCatalogScope] = useState<CatalogScope | null>(null);
  const [academyJump, setAcademyJump] = useState<AcademyJump | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const canWritePages = canWriteStudioPages(authTrainer, activeStudioId);
  const author = useMemo(
    () =>
      authTrainer?.id ? { id: authTrainer.id, name: authTrainer.fullName ?? "" } : null,
    [authTrainer?.id, authTrainer?.fullName],
  );

  /** The one door into a page. */
  const openRef = useCallback(
    (ref: LearningRef) => {
      setSearchOpen(false);
      if (ref.kind === "machine") {
        setCatalogJump(ref.id);
        onViewChange("machine-anatomy");
      } else {
        setAcademyJump({ ref });
        onViewChange("academy");
      }
    },
    [onViewChange],
  );

  useEffect(() => {
    if (!jump) return;
    openRef(jump);
    onJumpHandled();
  }, [jump, openRef, onJumpHandled]);

  const openCatalog = useCallback(
    (groupKey?: string) => {
      setSearchOpen(false);
      if (groupKey) setCatalogGroup(groupKey);
      onViewChange("machine-anatomy");
    },
    [onViewChange],
  );

  const openAcademy = useCallback(
    (group?: AcademyGroupKey) => {
      setSearchOpen(false);
      if (group) setAcademyJump({ group });
      onViewChange("academy");
    },
    [onViewChange],
  );

  const sections = useMemo<WikiSectionsValue>(
    () => ({
      title: "Learning",
      titleIcon: <BookOpen size={19} aria-hidden />,
      sections: [
        { id: "learning", label: "Overview", icon: <LayoutGrid size={14} aria-hidden /> },
        { id: "machine-anatomy", label: "Catalog", icon: <Dumbbell size={14} aria-hidden /> },
        { id: "academy", label: "Academy", icon: <GraduationCap size={14} aria-hidden /> },
      ],
      active: view,
      onSelect: (id) => {
        setSearchOpen(false);
        onViewChange(id as LearningViewId);
      },
      onHome: () => {
        setSearchOpen(false);
        onViewChange("learning");
      },
      onSearch: () => setSearchOpen(true),
      searchLabel: "Search Learning",
    }),
    [view, onViewChange],
  );

  return (
    <WikiSectionsProvider value={sections}>
      {/* Hidden, not unmounted, while search is open: closing search returns
          the trainer to the page they left, not to its section's index. */}
      <div className={searchOpen ? "lv__stash" : "lv__pass"}>
        {view === "learning" && (
          <LearningHome
            machines={machines}
            canWritePages={canWritePages && Boolean(author)}
            onOpen={openRef}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenCatalog={openCatalog}
            onOpenDatabase={() => {
              setSearchOpen(false);
              setCatalogScope("msf");
              onViewChange("machine-anatomy");
            }}
            onOpenAcademy={openAcademy}
            onNewPage={() => {
              setAcademyJump({ newPage: true });
              onViewChange("academy");
            }}
          />
        )}
        {view === "machine-anatomy" && (
          <CatalogView
            machines={machines}
            authTrainer={authTrainer}
            openMachineId={catalogJump}
            onOpenedMachine={() => setCatalogJump(null)}
            openGroupKey={catalogGroup}
            onOpenedGroup={() => setCatalogGroup(null)}
            openScope={catalogScope}
            onOpenedScope={() => setCatalogScope(null)}
            onOpenAcademy={(machineId, focus, machineName) => {
              setAcademyJump({ machineId, focus, fromLabel: machineName });
              onViewChange("academy");
            }}
          />
        )}
        {view === "academy" && (
          <AcademyWikiView
            jump={academyJump}
            onClearJump={() => setAcademyJump(null)}
            canManagePages={canWritePages}
            author={author}
            onOpenMachine={(machineId) => {
              setCatalogJump(machineId);
              onViewChange("machine-anatomy");
            }}
          />
        )}
      </div>

      {searchOpen && (
        <LearningSearch
          machines={machines}
          onClose={() => setSearchOpen(false)}
          onOpen={openRef}
        />
      )}
    </WikiSectionsProvider>
  );
}
