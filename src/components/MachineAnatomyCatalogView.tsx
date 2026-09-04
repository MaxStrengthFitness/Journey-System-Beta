import React, {
  useMemo,
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
} from "react";
import {
  Layers,
  MapPin,
  Activity,
  Wrench,
  ShieldAlert,
  Target,
  UserCog,
  Settings2,
  Users,
} from "lucide-react";
import { Machine } from "../types";
import {
  MACHINE_ANATOMY,
  MOVEMENT_PATTERN_ORDER,
  ANATOMICAL_REGION_ORDER,
  MachineAnatomyMap,
} from "../data/machine-anatomy-map";
import { BodyModel } from "./machines/BodyModel";
import {
  machinesForBodySlug,
  resolveMachineAnatomy,
} from "../features/catalog/anatomy";
import { MACHINE_DATABASE } from "../data/machine-database";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "../contexts/ToastContext";
import { useActiveStudio } from "../ActiveStudioContext";
import { Trainer } from "../types";
import { saveStudioMachineNotes } from "../features/catalog/mutations";
import { useStudioMachineNotes } from "../features/catalog/useStudioMachineNotes";

type GroupingMode = "movement" | "region";

interface MachineAnatomyCatalogViewProps {
  machines: Machine[];
  onViewMachineDetails?: (machineId: string) => void;
  /** For attributing studio notes. Optional so existing call sites compile. */
  authTrainer?: Trainer | null;
}

export function MachineAnatomyCatalogView({
  machines,
  onViewMachineDetails,
  authTrainer,
}: MachineAnatomyCatalogViewProps) {
  const { success: toastSuccess, error: toastError } = useToast();
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(
    null,
  );
  const [view, setView] = useState<"front" | "back">("front");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("movement");

  // ── STUDIO NOTES ──────────────────────────────────────────────────────
  // Scoped to the ACTIVE STUDIO. The previous version wrote these to
  // machines/{id} — the global catalog document every studio reads — which
  // both leaked one location's notes to all of them and silently failed under
  // the isSuperAdmin() rule on that path. See features/catalog/mutations.ts.
  const { activeStudioId, activeStudio } = useActiveStudio();
  const { notesByMachineId } = useStudioMachineNotes(activeStudioId);
  const [studioNotes, setStudioNotes] = useState<string>("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const seededForRef = useRef<string | null>(null);
  const studioLabel = activeStudio?.name ? ` \u00b7 ${activeStudio.name}` : "";

  // Carousel Refs & Syncing
  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const isProgrammaticScroll = useRef(false);
  const scrollSpyTimeoutRef = useRef<NodeJS.Timeout>();
  const programmaticScrollTimeoutRef = useRef<NodeJS.Timeout>();
  const [centerIndex, setCenterIndex] = useState<number>(() => machines.length);
  const hasInitializedScroll = useRef(false);

  const extendedMachines = useMemo(
    () => [...machines, ...machines, ...machines],
    [machines],
  );

  useLayoutEffect(() => {
    if (
      machines.length > 0 &&
      carouselRef.current &&
      !hasInitializedScroll.current
    ) {
      const container = carouselRef.current;
      const oneCopyWidth = container.scrollWidth / 3;
      if (oneCopyWidth > 0 && container.scrollLeft === 0) {
        container.scrollLeft = oneCopyWidth;
        hasInitializedScroll.current = true;
      }
    }
  }, [machines]);

  useEffect(() => {
    if (selectedMachineId && carouselRef.current) {
      const container = carouselRef.current;
      const originalIndex = machines.findIndex(
        (m) => m.id === selectedMachineId,
      );
      const targetIndex =
        originalIndex !== -1
          ? machines.length + originalIndex
          : machines.length;
      const card = cardRefs.current[`${selectedMachineId}-${targetIndex}`];

      if (card && isProgrammaticScroll.current) {
        container.style.scrollBehavior = "smooth";
        container.scrollTo({
          left:
            card.offsetLeft - container.clientWidth / 2 + card.clientWidth / 2,
        });

        if (programmaticScrollTimeoutRef.current)
          clearTimeout(programmaticScrollTimeoutRef.current);
        programmaticScrollTimeoutRef.current = setTimeout(() => {
          isProgrammaticScroll.current = false;
        }, 600);
      }
    }
  }, [selectedMachineId, machines]);

  const handleCarouselScroll = useCallback(() => {
    const container = carouselRef.current;
    if (!container) return;

    const oneCopyWidth = container.scrollWidth / 3;

    if (container.scrollLeft < oneCopyWidth) {
      container.style.scrollBehavior = "auto";
      container.scrollLeft += oneCopyWidth;
    } else if (container.scrollLeft > 2 * oneCopyWidth) {
      container.style.scrollBehavior = "auto";
      container.scrollLeft -= oneCopyWidth;
    }

    if (isProgrammaticScroll.current) return;

    if (scrollSpyTimeoutRef.current) clearTimeout(scrollSpyTimeoutRef.current);

    scrollSpyTimeoutRef.current = setTimeout(() => {
      const containerCenter = container.scrollLeft + container.clientWidth / 2;
      let closestCardId: string | null = null;
      let minDistance = Infinity;
      let closestIdx = centerIndex;

      Object.entries(cardRefs.current).forEach(([key, cardRaw]) => {
        const card = cardRaw as HTMLButtonElement | null;
        if (!card) return;
        const cardCenter = card.offsetLeft + card.clientWidth / 2;
        const distance = Math.abs(containerCenter - cardCenter);
        if (distance < minDistance) {
          minDistance = distance;
          const splitIdx = key.lastIndexOf("-");
          closestCardId = key.slice(0, splitIdx);
          closestIdx = parseInt(key.slice(splitIdx + 1), 10);
        }
      });

      if (closestIdx !== centerIndex) {
        setCenterIndex(closestIdx);
      }
      if (closestCardId && closestCardId !== selectedMachineId) {
        setSelectedMachineId(closestCardId);
      }
    }, 100);
  }, [selectedMachineId, centerIndex]);

  const selectedMap: MachineAnatomyMap | null = selectedMachineId
    ? (MACHINE_ANATOMY[selectedMachineId] ?? null)
    : null;

  const selectedMachine = selectedMachineId
    ? (machines.find((m) => m.id === selectedMachineId) ?? null)
    : null;

  const machineKnowledge = useMemo(() => {
    if (!selectedMachineId) return null;
    if (MACHINE_DATABASE[selectedMachineId])
      return MACHINE_DATABASE[selectedMachineId];

    // Attempt fallback lookup by formatting the ID
    const fallbackId = selectedMachineId.replace(/^m-/, "").replace(/-/g, "_");
    if (MACHINE_DATABASE[fallbackId]) return MACHINE_DATABASE[fallbackId];

    // Additional hardcoded fallbacks
    if (selectedMachineId === "m-neck") return MACHINE_DATABASE["4_way_neck"];
    if (selectedMachineId === "m-ext") return MACHINE_DATABASE["leg_extension"];
    if (selectedMachineId === "m-hip-abd") return MACHINE_DATABASE["abduction"];
    if (selectedMachineId === "m-hip-add") return MACHINE_DATABASE["adduction"];
    if (selectedMachineId === "m-tricep-ext")
      return MACHINE_DATABASE["triceps_extension"];
    if (selectedMachineId === "m-chest-fly")
      return MACHINE_DATABASE["chest_flye"];
    if (selectedMachineId === "m-bicep") return MACHINE_DATABASE["biceps_curl"];
    if (selectedMachineId === "m-dip") return MACHINE_DATABASE["seated_dip"];
    if (selectedMachineId === "m-abs") return MACHINE_DATABASE["abdominals"];
    if (selectedMachineId === "m-lumbar")
      return MACHINE_DATABASE["lumbar_extension"];

    const m = machines.find((m) => m.id === selectedMachineId);
    if (m) {
      const match = Object.values(MACHINE_DATABASE).find(
        (db) =>
          db.name.toLowerCase() === m.name.toLowerCase() ||
          m.name.toLowerCase().includes(db.name.toLowerCase()),
      );
      if (match) return match;
    }

    return null;
  }, [selectedMachineId, machines]);

  // Seed the box when the machine changes, and again if this studio's note
  // arrives from Firestore after the machine was already selected. Never while
  // the trainer is mid-edit — an onSnapshot echo must not eat their typing.
  useEffect(() => {
    if (!selectedMachineId) return;
    const isNewMachine = seededForRef.current !== selectedMachineId;
    if (!isNewMachine && notesDirty) return;

    seededForRef.current = selectedMachineId;
    const studioNote = notesByMachineId[selectedMachineId]?.notes;
    // Legacy fallback: machines.trainerTips is where the old global write put
    // things. Show it until it is re-saved to the studio-scoped document.
    const legacy = machines.find((m) => m.id === selectedMachineId)?.trainerTips;
    setStudioNotes(studioNote ?? legacy ?? "");

    if (isNewMachine) {
      setNotesDirty(false);
      setSaveState("idle");
    }
  }, [selectedMachineId, notesByMachineId, machines, notesDirty]);

  const handleSaveStudioNotes = async () => {
    if (!selectedMachineId) return;

    if (!activeStudioId) {
      setSaveState("error");
      toastError("No active studio selected — pick a studio before saving.");
      return;
    }

    setSaveState("saving");
    try {
      await saveStudioMachineNotes({
        studioId: activeStudioId,
        machineId: selectedMachineId,
        notes: studioNotes,
        author: authTrainer?.id
          ? { id: authTrainer.id, name: authTrainer.fullName ?? "" }
          : null,
      });
      setNotesDirty(false);
      setSaveState("saved");
      toastSuccess(`Notes saved for ${activeStudio?.name ?? "this studio"}.`);
    } catch (err) {
      // Never report success on a failed write. The previous version did.
      console.error("Failed to save studio machine notes:", err);
      setSaveState("error");
      toastError("Could not save studio notes. Check your connection.");
    }
  };

  const saveLabel =
    saveState === "saving"
      ? "Saving\u2026"
      : saveState === "saved"
        ? "Saved"
        : saveState === "error"
          ? "Retry Save"
          : "Save Notes";

  // One source of truth for the figure: the machine document's own MuscleId
  // fields when they exist, otherwise MACHINE_ANATOMY. See features/catalog/
  // anatomy.ts for why machineMuscleMap is gone.
  const anatomy = useMemo(
    () => resolveMachineAnatomy(selectedMachineId, selectedMachine ?? undefined),
    [selectedMachineId, selectedMachine],
  );

  // Turn the figure to the side that actually shows the activation.
  //
  // This lives in an effect rather than inside handleSelectMachine because a
  // machine can become selected three ways — the rail, tapping the figure, and
  // the carousel's scroll spy — and the spy called setSelectedMachineId
  // directly, so swiping to Hip Abduction left the figure on the anterior view
  // where none of its target muscles are even visible.
  useEffect(() => {
    if (!selectedMachineId) return;
    setView(anatomy.preferredView);
  }, [selectedMachineId, anatomy.preferredView]);

  // The body model reports its own region slug (e.g. 'deltoids'), which may
  // cover several of our muscle names — front and rear delts share one
  // region. Match a machine if any of its muscles land on that region.
  const handleMuscleClick = (slug: string) => {
    if (!slug) return;
    // Prefer a machine that TARGETS this region over one that merely assists
    // through it, and only offer machines this studio actually has.
    const owned = new Set(machines.map((m) => m.id));
    const target = machinesForBodySlug(slug).find((id) => owned.has(id));
    if (target) handleSelectMachine(target);
  };

  const handleSelectMachine = (machineId: string) => {
    isProgrammaticScroll.current = true;
    if (scrollSpyTimeoutRef.current) clearTimeout(scrollSpyTimeoutRef.current);
    if (programmaticScrollTimeoutRef.current)
      clearTimeout(programmaticScrollTimeoutRef.current);

    setSelectedMachineId(machineId);
    const originalIndex = machines.findIndex((m) => m.id === machineId);
    if (originalIndex !== -1) {
      setCenterIndex(machines.length + originalIndex);
    }

    // The view is set by the effect above, which covers every selection path.
  };

  const groupedMachines = useMemo(() => {
    if (groupingMode === "movement") {
      const buckets: Record<string, Machine[]> = {};
      MOVEMENT_PATTERN_ORDER.forEach((p) => (buckets[p] = []));
      machines.forEach((m) => {
        const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
        if (map) {
          buckets[map.movementPattern]?.push(m);
        }
      });
      return MOVEMENT_PATTERN_ORDER.map((p) => ({
        key: p,
        label: p,
        machines: buckets[p],
      })).filter((g) => g.machines.length > 0);
    } else {
      const buckets: Record<string, Machine[]> = {};
      ANATOMICAL_REGION_ORDER.forEach((r) => (buckets[r] = []));
      machines.forEach((m) => {
        const r = (m.anatomicalRegion as string) || "Other";
        if (!buckets[r]) buckets[r] = [];
        buckets[r].push(m);
      });
      return Object.entries(buckets)
        .filter(([, list]) => list.length > 0)
        .map(([k, list]) => ({ key: k, label: k, machines: list }));
    }
  }, [machines, groupingMode]);

  const catalogContent = (
    <>
      <div className="absolute inset-0 pointer-events-none bg-linear-to-b from-black/5 dark:from-white/5 to-transparent"></div>

      <div className="relative z-10 px-4 pt-4 pb-3 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-foreground dark:text-white">
            Database
          </h2>
          {/* Low-profile segmented control (no chunky pills). */}
          <div className="flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/60">
            {(
              [
                { key: "movement", label: "Kinematics", icon: Layers },
                { key: "region", label: "Region", icon: MapPin },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = groupingMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setGroupingMode(opt.key)}
                  className={`h-9 px-3 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? "bg-white dark:bg-slate-700 text-foreground dark:text-white"
                      : "text-muted-foreground hover:text-foreground dark:hover:text-white"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4 lg:pb-30">
        {groupedMachines.map((group) => (
          <div key={group.key}>
            <div className="flex items-center justify-between px-1 py-1 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1.5">
              <span>{group.label}</span>
              <span className="tabular-nums">{group.machines.length}</span>
            </div>
            {/* Flat tiles, two across (the sidebar is ~300px wide). */}
            <div className="grid grid-cols-2 gap-1.5 pb-1">
              {group.machines.map((m) => {
                const isSelected = selectedMachineId === m.id;
                const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
                const movement = map?.movementPattern || "";

                let colorClass = "bg-secondary";
                if (movement.includes("Push")) colorClass = "bg-cta";
                else if (movement.includes("Pull")) colorClass = "bg-cyan";
                else if (movement.includes("Quad")) colorClass = "bg-green";
                else if (movement.includes("Posterior"))
                  colorClass = "bg-yellow";
                else if (movement.includes("Core")) colorClass = "bg-amber";
                else if (movement.includes("Isolation"))
                  colorClass = "bg-brand";

                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => m.id && handleSelectMachine(m.id)}
                    title={m.name}
                    className={`relative flex items-center min-h-11 px-2.5 py-2 rounded-lg transition-colors text-left group overflow-hidden cursor-pointer ${
                      isSelected
                        ? "bg-cyan/15 ring-1 ring-inset ring-cyan/50"
                        : "bg-slate-100/70 dark:bg-slate-800/50 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                    }`}
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-0.5 ${colorClass}`}
                    />
                    <span
                      className={`pl-1.5 text-[11px] font-bold tracking-wider truncate uppercase ${isSelected ? "text-foreground dark:text-white" : "text-muted-foreground group-hover:text-foreground dark:group-hover:text-white"}`}
                    >
                      {m.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );

  return (
    <div className="relative h-[calc(100vh-5rem)] bg-background overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row w-full no-scrollbar">
      {/* ───── MOBILE STICKY HEADER & CONTROLS ───── */}
      <div className="lg:hidden sticky top-0 left-0 w-full z-50 flex items-center justify-between pt-4 pb-4 px-4 bg-linear-to-b from-background via-background/80 to-transparent pointer-events-none shrink-0">
        <div className="pointer-events-auto shrink-0 mr-4">
          <Sheet>
            <SheetTrigger className="bg-background/80 dark:bg-slate-900/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-foreground dark:text-white shadow-xl h-12 w-12 rounded-full flex items-center justify-center transition-all cursor-pointer">
              <Layers className="w-5 h-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-[320px] sm:w-95 p-0 bg-background/95 backdrop-blur-3xl border-r border-slate-200 dark:border-white/10 flex flex-col"
            >
              {catalogContent}
            </SheetContent>
          </Sheet>
        </div>

        {/* Mobile View Controls */}
        <div className="pointer-events-auto flex flex-1 bg-background/80 dark:bg-slate-900/80 backdrop-blur-xl rounded-lg p-0.5 border border-slate-200 dark:border-white/10 shadow-sm overflow-x-auto no-scrollbar justify-center">
          <button
            onClick={() => setView("front")}
            className={`flex-1 h-10 px-2 sm:px-4 rounded-md text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer ${view === "front" ? "bg-white dark:bg-slate-700 text-slate-950 dark:text-white" : "text-muted-foreground hover:text-foreground dark:hover:text-white"}`}
          >
            Anterior
          </button>
          <button
            onClick={() => setView("back")}
            className={`flex-1 h-10 px-2 sm:px-4 rounded-md text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer ${view === "back" ? "bg-white dark:bg-slate-700 text-slate-950 dark:text-white" : "text-muted-foreground hover:text-foreground dark:hover:text-white"}`}
          >
            Posterior
          </button>
          <div className="w-px bg-slate-200 dark:bg-white/10 mx-1 sm:mx-2 md:mx-3 my-1.5 shrink-0"></div>
          <button
            onClick={() => setGender("male")}
            className={`flex-1 h-10 px-2 sm:px-4 rounded-md text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer ${gender === "male" ? "bg-white dark:bg-slate-700 text-slate-950 dark:text-white" : "text-muted-foreground hover:text-foreground dark:hover:text-white"}`}
          >
            Type M
          </button>
          <button
            onClick={() => setGender("female")}
            className={`flex-1 h-10 px-2 sm:px-4 rounded-md text-[10px] sm:text-[11px] font-bold uppercase tracking-widest transition-colors whitespace-nowrap cursor-pointer ${gender === "female" ? "bg-white dark:bg-slate-700 text-slate-950 dark:text-white" : "text-muted-foreground hover:text-foreground dark:hover:text-white"}`}
          >
            Type F
          </button>
        </div>
      </div>

      {/* ───── MODEL LAYER ───── */}
      <div className="relative shrink-0 lg:absolute lg:inset-0 flex items-center justify-center z-0 pointer-events-auto min-h-[50vh] max-h-[60vh] lg:h-full lg:min-h-0 lg:max-h-none mb-4 lg:mb-0">
        {/* The figure scales to whatever is left between the sidebars; the
            padding is kept small so it never forces the row to grow. */}
        <div className="relative w-full max-w-150 h-full flex justify-center p-4 lg:p-6 lg:mt-0">
          <BodyModel
            primary={anatomy.primary}
            secondary={anatomy.secondary}
            gender={gender}
            view={view}
            onRegionClick={handleMuscleClick}
          />
        </div>
      </div>

      {/* ───── GLASS OVERLAYS (Interaction Hack) ───── */}
      <div className="absolute inset-0 z-10 pointer-events-none p-4 md:p-8 flex flex-col md:flex-row justify-between gap-4">
        {/* LEFT SIDEBAR (Catalog) Desktop */}
        <aside className="pointer-events-auto w-72 xl:w-80 bg-card/70 dark:bg-background/60 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-sm rounded-2xl hidden lg:flex flex-col overflow-hidden max-h-full shrink-0 relative">
          {catalogContent}
        </aside>

        {/* RIGHT SIDEBAR (Details HUD) Desktop */}
        {selectedMachine && machineKnowledge ? (
          <aside className="pointer-events-auto w-80 xl:w-96 bg-card/70 dark:bg-background/60 backdrop-blur-xl border border-slate-200 dark:border-white/10 shadow-sm rounded-2xl hidden lg:flex flex-col overflow-hidden max-h-full shrink-0 relative animate-in fade-in slide-in-from-right-8 duration-300">
            <div className="absolute inset-0 pointer-events-none bg-linear-to-b from-black/5 dark:from-white/5 to-transparent"></div>

            {/* Header Area */}
            <div className="relative z-10 p-6 border-b border-slate-200 dark:border-white/10">
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#0ea5e9] dark:text-cyan font-bold mb-2">
                {selectedMap?.movementPattern || "Kinematic Info"}
              </div>
              <h2 className="text-3xl font-black uppercase italic text-foreground dark:text-white tracking-tight leading-none mb-4">
                {selectedMachine.name}
              </h2>
              <div className="text-[12px] text-muted-foreground leading-relaxed font-medium bg-slate-100 dark:bg-black/40 p-4 rounded-2xl border border-slate-200 dark:border-white/5">
                {selectedMap?.clinicalNote || "Clinical details unavailable."}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-slate-100/70 dark:bg-black/40 p-3.5 rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Activity className="w-3 h-3 text-[#0ea5e9] dark:text-cyan" />{" "}
                    Class
                  </div>
                  <div className="text-[13px] text-foreground dark:text-white font-semibold">
                    {machineKnowledge.kinematicClassification || "N/A"}
                  </div>
                </div>
                <div className="bg-slate-100/70 dark:bg-black/40 p-3.5 rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Target className="w-3 h-3 text-cta" /> Posture
                  </div>
                  <div
                    className="text-[13px] text-foreground dark:text-white font-semibold truncate"
                    title={machineKnowledge.executionPosture}
                  >
                    {machineKnowledge.executionPosture || "N/A"}
                  </div>
                </div>
                <div className="bg-slate-100/70 dark:bg-black/40 p-3.5 rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Settings2 className="w-3 h-3 text-green" /> Setup
                  </div>
                  <div className="text-[13px] text-foreground dark:text-white font-semibold">
                    {machineKnowledge.setupGap || "Standard Gap"}
                  </div>
                </div>
                <div className="bg-slate-100/70 dark:bg-black/40 p-3.5 rounded-2xl border border-slate-200 dark:border-white/5">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Users className="w-3 h-3 text-brand" /> Handoff
                  </div>
                  <div className="text-[13px] text-foreground dark:text-white font-semibold">
                    {machineKnowledge.requiresHandoff ? "Required" : "None"}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground dark:text-white flex items-center gap-3">
                  <div className="h-px bg-slate-200 dark:bg-white/20 flex-1"></div>
                  Musculature
                  <div className="h-px bg-slate-200 dark:bg-white/20 flex-1"></div>
                </h3>
                <div className="flex flex-col gap-2.5">
                  {machineKnowledge.targetMuscles &&
                    machineKnowledge.targetMuscles.map((tm, idx) => (
                      <div
                        key={"t" + idx}
                        className="flex items-center gap-3 bg-slate-100/50 dark:bg-black/20 p-2.5 rounded-xl border border-slate-200 dark:border-white/5"
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-cta shadow-[0_0_8px_var(--color-cta)]/80 shrink-0"></div>
                        <div className="text-[13px] font-bold text-foreground dark:text-white leading-snug">
                          {tm}
                        </div>
                        <div className="ml-auto text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                          Primary
                        </div>
                      </div>
                    ))}
                  {machineKnowledge.synergists &&
                    machineKnowledge.synergists.map((syn, idx) => (
                      <div
                        key={"s" + idx}
                        className="flex items-center gap-3 bg-slate-50/50 dark:bg-black/10 p-2.5 rounded-xl border border-slate-200/60 dark:border-white/5"
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-cyan shadow-[0_0_8px_var(--color-cyan)]/60 shrink-0"></div>
                        <div className="text-[13px] text-muted-foreground leading-snug">
                          {syn}
                        </div>
                        <div className="ml-auto text-[10px] font-bold text-muted-foreground/70 uppercase tracking-widest">
                          Synergist
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {machineKnowledge.clinicalWarnings &&
                machineKnowledge.clinicalWarnings.length > 0 && (
                  <div className="bg-amber/10 border border-amber/30 rounded-2xl p-5 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className="w-5 h-5 text-amber" />
                      <h3 className="text-[11px] font-bold uppercase tracking-widest text-amber">
                        Clinical Warnings
                      </h3>
                    </div>
                    <ul className="space-y-2">
                      {machineKnowledge.clinicalWarnings.map((w, idx) => (
                        <li
                          key={idx}
                          className="text-[13px] text-amber/90 leading-relaxed flex items-start gap-2.5"
                        >
                          <span className="text-amber shrink-0 mt-0.5">•</span>
                          <span className="font-medium">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              <div className="space-y-5">
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-[#0ea5e9] dark:text-cyan mb-2.5 flex items-center gap-2">
                    <Wrench className="w-4 h-4" /> Setup Notes
                  </h4>
                  <p className="text-[13px] text-foreground dark:text-white leading-relaxed font-semibold bg-slate-100/70 dark:bg-black/40 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                    {machineKnowledge.setup}
                  </p>
                  {machineKnowledge.setupCues &&
                    machineKnowledge.setupCues.length > 0 && (
                      <ul className="mt-3 space-y-2 pl-1">
                        {machineKnowledge.setupCues.map((cue, idx) => (
                          <li
                            key={idx}
                            className="text-[12px] text-muted-foreground flex items-start gap-2.5"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-cyan/50 shrink-0 mt-1.5"></div>
                            <span className="font-medium">{cue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>

                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-green mb-2.5 flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Execution
                  </h4>
                  <p className="text-[13px] text-foreground dark:text-white leading-relaxed font-semibold bg-slate-100/70 dark:bg-black/40 p-4 rounded-xl border border-slate-200 dark:border-white/5">
                    {machineKnowledge.execution}
                  </p>
                </div>
              </div>

              {/* Trainer Tips */}
              <div className="pt-4 border-t border-slate-200 dark:border-white/10 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <UserCog className="w-4 h-4 text-brand" />
                  <h3 className="text-[11px] font-bold uppercase tracking-widest text-foreground dark:text-white">
                    Studio Notes{studioLabel}
                  </h3>
                </div>
                <Textarea
                  placeholder={`Quirks and workarounds for this machine at ${activeStudio?.name ?? "this studio"} \u2014 visible only here.`}
                  value={studioNotes}
                  onChange={(e) => {
                    setStudioNotes(e.target.value);
                    setNotesDirty(true);
                    if (saveState !== "idle") setSaveState("idle");
                  }}
                  className="min-h-25 bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus-visible:ring-brand text-foreground dark:text-white placeholder:text-muted-foreground/50 mb-3 resize-none text-[13px] rounded-xl p-4"
                />
                <Button
                  onClick={handleSaveStudioNotes}
                  disabled={saveState === "saving"}
                  className={`w-full font-black tracking-[0.2em] uppercase transition-all rounded-xl h-12 ${
                    saveState === "saved"
                      ? "bg-green/20 text-green border border-green/30"
                      : saveState === "error"
                        ? "bg-amber/20 text-amber border border-amber/40"
                        : "bg-brand/20 hover:bg-brand/40 text-brand border border-brand/30 shadow-[0_0_15px_rgba(var(--color-brand),0.15)]"
                  }`}
                >
                  {saveLabel}
                </Button>
              </div>
            </div>
          </aside>
        ) : (
          <aside className="pointer-events-auto w-110 hidden lg:flex items-center justify-center p-8 bg-transparent">
            <div className="text-center space-y-4 p-8 bg-card/40 dark:bg-background/40 backdrop-blur-xl border border-slate-200 dark:border-white/5 rounded-3xl w-full shadow-sm">
              <ShieldAlert className="w-10 h-10 text-muted-foreground mx-auto opacity-50" />
              <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-muted-foreground/80">
                Awaiting Selection
              </p>
              <p className="text-[11px] text-muted-foreground/60 font-medium tracking-wide">
                Target a kinematic entity to initialize profile data.
              </p>
            </div>
          </aside>
        )}
      </div>

      {/* ───── MOBILE MIDDLE BAND CAROUSEL (Lazy Susan) ───── */}
      <div className="lg:hidden relative w-full z-40 pointer-events-auto -mt-20 shrink-0">
        <div
          ref={carouselRef}
          onScroll={handleCarouselScroll}
          className="flex relative overflow-x-auto snap-x snap-mandatory gap-4 px-6 pb-6 no-scrollbar"
        >
          {extendedMachines.map((m, idx) => {
            const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
            const movement = map?.movementPattern || "";
            const distance = Math.abs(centerIndex - idx);

            let colorClass = "bg-secondary";
            if (movement.includes("Push")) colorClass = "bg-[#F06C22]";
            else if (movement.includes("Pull")) colorClass = "bg-[#38BDF8]";
            else if (movement.includes("Quad")) colorClass = "bg-emerald-500";
            else if (movement.includes("Posterior")) colorClass = "bg-amber-500";
            else if (movement.includes("Core")) colorClass = "bg-amber-600";
            else if (movement.includes("Isolation")) colorClass = "bg-purple-500";

            return (
              <button
                key={`${m.id}-${idx}`}
                ref={(el) => {
                  if (m.id) {
                    cardRefs.current[`${m.id}-${idx}`] = el;
                  }
                }}
                onClick={() => {
                  if (m.id) handleSelectMachine(m.id);
                }}
                className={`relative shrink-0 snap-center min-w-40 px-3 py-2.5 rounded-xl transition-all duration-200 text-left flex flex-col justify-end overflow-hidden ${
                  distance === 0
                    ? "scale-100 opacity-100 bg-white dark:bg-slate-800 ring-1 ring-[#F06C22]"
                    : distance <= 1
                      ? "scale-95 opacity-80 bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                      : "scale-90 opacity-60 bg-slate-100/80 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div
                  className={`absolute left-0 top-0 bottom-0 w-1 ${colorClass}`}
                />
                <div className="pl-2 w-full">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1 block truncate">
                    {map?.movementPattern || "Equipment"}
                  </span>
                  <span
                    className={`text-[13px] font-black italic uppercase tracking-tight truncate block ${
                      distance === 0
                        ? "text-slate-900 dark:text-white"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {m.name}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ───── MOBILE DETAILS OVERLAY (Tablet/Mobile) ───── */}
      <div className="lg:hidden relative w-full z-40 pointer-events-none flex flex-col justify-end px-4 pb-28 sm:pb-32 shrink-0">
        {selectedMachine && machineKnowledge && (
          <div className="pointer-events-auto w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white shadow-2xl rounded-3xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            <div className="absolute inset-0 pointer-events-none bg-linear-to-b from-slate-100/50 dark:from-white/5 to-transparent"></div>

            {/* Header Area (Sticky) */}
            <div className="z-10 p-5 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md sticky top-0">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[#0284c7] dark:text-[#38BDF8] font-bold mb-1">
                {selectedMap?.movementPattern || "Kinematic Info"}
              </div>
              <h2 className="text-xl font-black uppercase italic text-slate-900 dark:text-white tracking-tight leading-none mb-3">
                {selectedMachine.name}
              </h2>
              <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-medium bg-slate-100 dark:bg-slate-800/80 p-3 rounded-xl border border-slate-200 dark:border-slate-700 line-clamp-2">
                {selectedMap?.clinicalNote || "Clinical details unavailable."}
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="relative z-10 flex-1 p-5 space-y-5 max-h-[50vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="bg-slate-100/80 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Activity className="w-3 h-3 text-[#38BDF8]" /> Class
                  </div>
                  <div className="text-[12px] text-slate-900 dark:text-white font-semibold">
                    {machineKnowledge.kinematicClassification || "N/A"}
                  </div>
                </div>
                <div className="bg-slate-100/80 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Target className="w-3 h-3 text-[#F06C22]" /> Posture
                  </div>
                  <div
                    className="text-[12px] text-slate-900 dark:text-white font-semibold truncate"
                    title={machineKnowledge.executionPosture}
                  >
                    {machineKnowledge.executionPosture || "N/A"}
                  </div>
                </div>
                <div className="bg-slate-100/80 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Settings2 className="w-3 h-3 text-emerald-500" /> Setup
                  </div>
                  <div className="text-[12px] text-slate-900 dark:text-white font-semibold">
                    {machineKnowledge.setupGap || "Standard Gap"}
                  </div>
                </div>
                <div className="bg-slate-100/80 dark:bg-slate-800/60 p-3 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                  <div className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                    <Users className="w-3 h-3 text-purple-500" /> Handoff
                  </div>
                  <div className="text-[12px] text-slate-900 dark:text-white font-semibold">
                    {machineKnowledge.requiresHandoff ? "Required" : "None"}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-900 dark:text-white flex items-center gap-3">
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                  Musculature
                  <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
                </h3>
                <div className="flex flex-col gap-2">
                  {machineKnowledge.targetMuscles &&
                    machineKnowledge.targetMuscles.map((tm, idx) => (
                      <div
                        key={"m_t" + idx}
                        className="flex items-center gap-2.5 bg-slate-100/80 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#F06C22] shadow-[0_0_8px_rgba(240,108,34,0.8)] shrink-0"></div>
                        <div className="text-[12px] font-bold text-slate-900 dark:text-white leading-snug">
                          {tm}
                        </div>
                        <div className="ml-auto text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                          Primary
                        </div>
                      </div>
                    ))}
                  {machineKnowledge.synergists &&
                    machineKnowledge.synergists.map((syn, idx) => (
                      <div
                        key={"m_s" + idx}
                        className="flex items-center gap-2.5 bg-slate-100/50 dark:bg-slate-800/30 p-2.5 rounded-xl border border-slate-200/50 dark:border-slate-700/40"
                      >
                        <div className="w-2 h-2 rounded-full bg-[#38BDF8] shadow-[0_0_8px_rgba(56,189,248,0.6)] shrink-0"></div>
                        <div className="text-[12px] text-slate-600 dark:text-slate-400 leading-snug">
                          {syn}
                        </div>
                        <div className="ml-auto text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                          Synergist
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {machineKnowledge.clinicalWarnings &&
                machineKnowledge.clinicalWarnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 backdrop-blur-sm">
                    <div className="flex items-center gap-2 mb-2.5">
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-amber-500">
                        Clinical Warnings
                      </h3>
                    </div>
                    <ul className="space-y-1.5">
                      {machineKnowledge.clinicalWarnings.map((w, idx) => (
                        <li
                          key={idx}
                          className="text-[12px] text-amber-600 dark:text-amber-400 leading-relaxed flex items-start gap-2.5"
                        >
                          <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                          <span className="font-medium">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#0284c7] dark:text-[#38BDF8] mb-2 flex items-center gap-2">
                    <Wrench className="w-3.5 h-3.5" /> Setup Notes
                  </h4>
                  <p className="text-[12px] text-slate-800 dark:text-slate-200 leading-relaxed font-semibold bg-slate-100/80 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                    {machineKnowledge.setup}
                  </p>
                  {machineKnowledge.setupCues &&
                    machineKnowledge.setupCues.length > 0 && (
                      <ul className="mt-2.5 space-y-1.5 pl-1">
                        {machineKnowledge.setupCues.map((cue, idx) => (
                          <li
                            key={idx}
                            className="text-[11px] text-slate-600 dark:text-slate-400 flex items-start gap-2.5"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-[#38BDF8]/60 shrink-0 mt-1"></div>
                            <span className="font-medium">{cue}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                </div>

                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mb-2 flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5" /> Execution
                  </h4>
                  <p className="text-[12px] text-slate-800 dark:text-slate-200 leading-relaxed font-semibold bg-slate-100/80 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
                    {machineKnowledge.execution}
                  </p>
                </div>
              </div>

              {/* Trainer Tips */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 mt-5">
                <div className="flex items-center gap-2 mb-3">
                  <UserCog className="w-4 h-4 text-[#F06C22]" />
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 dark:text-white">
                    Studio Notes{studioLabel}
                  </h3>
                </div>
                <Textarea
                  placeholder={`Quirks and workarounds for this machine at ${activeStudio?.name ?? "this studio"} \u2014 visible only here.`}
                  value={studioNotes}
                  onChange={(e) => {
                    setStudioNotes(e.target.value);
                    setNotesDirty(true);
                    if (saveState !== "idle") setSaveState("idle");
                  }}
                  className="min-h-20 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 focus-visible:ring-[#F06C22] text-slate-900 dark:text-white placeholder:text-slate-400 mb-3 resize-none text-[12px] rounded-xl p-3"
                />
                <Button
                  onClick={handleSaveStudioNotes}
                  disabled={saveState === "saving"}
                  className={`w-full font-black tracking-[0.2em] uppercase transition-all rounded-xl h-10 text-[10px] ${
                    saveState === "saved"
                      ? "bg-green/20 text-green border border-green/30"
                      : saveState === "error"
                        ? "bg-amber/20 text-amber border border-amber/40"
                        : "bg-brand/20 hover:bg-brand/40 text-brand border border-brand/30 shadow-[0_0_15px_var(--color-brand)]/15"
                  }`}
                >
                  {saveLabel}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ───── DESKTOP BOTTOM CENTER CONTROLS ───── */}
      <div className="hidden lg:flex absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto z-50 flex-col gap-3 items-center">
        <div className="flex bg-background/80 backdrop-blur-xl rounded-lg p-0.5 border border-white/10 shadow-sm">
          <button
            onClick={() => setView("front")}
            className={`h-10 px-4 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${view === "front" ? "bg-white text-slate-950" : "text-muted-foreground hover:text-white"}`}
          >
            Anterior
          </button>
          <button
            onClick={() => setView("back")}
            className={`h-10 px-4 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${view === "back" ? "bg-white text-slate-950" : "text-muted-foreground hover:text-white"}`}
          >
            Posterior
          </button>
          <div className="w-px bg-white/10 mx-2 my-2"></div>
          <button
            onClick={() => setGender("male")}
            className={`h-10 px-4 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${gender === "male" ? "bg-white text-slate-950" : "text-muted-foreground hover:text-white"}`}
          >
            Type M
          </button>
          <button
            onClick={() => setGender("female")}
            className={`h-10 px-4 rounded-md text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${gender === "female" ? "bg-white text-slate-950" : "text-muted-foreground hover:text-white"}`}
          >
            Type F
          </button>
        </div>
      </div>
    </div>
  );
}
