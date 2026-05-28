import React, { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Layers, MapPin } from 'lucide-react';
import { Machine } from '../types';
import {
  MACHINE_ANATOMY,
  MOVEMENT_PATTERN_ORDER,
  ANATOMICAL_REGION_ORDER,
  AnatomyView,
  MachineAnatomyMap,
} from '../data/machine-anatomy-map';
import { AnatomyFigure } from './AnatomyFigure';

type GroupingMode = 'movement' | 'region';

interface MachineAnatomyCatalogViewProps {
  machines: Machine[];
  /** Called when the trainer taps "View Machine Details →" */
  onViewMachineDetails?: (machineId: string) => void;
}

export function MachineAnatomyCatalogView({
  machines,
  onViewMachineDetails,
}: MachineAnatomyCatalogViewProps) {
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [view, setView] = useState<AnatomyView>('front');
  const [groupingMode, setGroupingMode] = useState<GroupingMode>('movement');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());

  const selectedMap: MachineAnatomyMap | null = selectedMachineId
    ? MACHINE_ANATOMY[selectedMachineId] ?? null
    : null;

  const selectedMachine = selectedMachineId
    ? machines.find((m) => m.id === selectedMachineId) ?? null
    : null;

  const handleSelectMachine = (machineId: string) => {
    setSelectedMachineId(machineId);
    const map = MACHINE_ANATOMY[machineId];
    if (map) setView(map.preferredView);
  };

  const toggleGroup = (groupKey: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  };

  /* ── Group machines based on the current grouping mode ───── */
  const groupedMachines = useMemo(() => {
    if (groupingMode === 'movement') {
      const buckets: Record<string, Machine[]> = {};
      MOVEMENT_PATTERN_ORDER.forEach((p) => (buckets[p] = []));
      machines.forEach((m) => {
        const map = m.id ? MACHINE_ANATOMY[m.id] : undefined;
        if (map) {
          buckets[map.movementPattern]?.push(m);
        }
      });
      return MOVEMENT_PATTERN_ORDER
        .map((p) => ({ key: p, label: p, machines: buckets[p] }))
        .filter((g) => g.machines.length > 0);
    } else {
      const buckets: Record<string, Machine[]> = {};
      ANATOMICAL_REGION_ORDER.forEach((r) => (buckets[r] = []));
      machines.forEach((m) => {
        const r = (m.anatomicalRegion as string) || 'Other';
        if (!buckets[r]) buckets[r] = [];
        buckets[r].push(m);
      });
      return Object.entries(buckets)
        .filter(([, list]) => list.length > 0)
        .map(([k, list]) => ({ key: k, label: k, machines: list }));
    }
  }, [machines, groupingMode]);

  return (
    <div className="grid md:grid-cols-[288px_1fr] flex flex-col h-full min-h-0 bg-bg-dark text-ink-d1">
      {/* ───── LEFT MENU ───── */}
      <aside className="md:border-r md:border-div-d md:overflow-y-auto md:bg-surface-1 md:h-full
                        border-b border-div-d max-h-[35vh] md:max-h-none overflow-y-auto bg-surface-1 flex flex-col">
        {/* Grouping toggle (sticky) */}
        <div className="sticky top-0 z-10 bg-surface-1 border-b border-div-d p-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setGroupingMode('movement')}
              className={`flex-1 min-h-[44px] rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan flex items-center justify-center gap-1.5 ${
                groupingMode === 'movement'
                  ? 'bg-cyan text-bg-dark'
                  : 'bg-surface-2 text-ink-d2 border border-div-d hover:bg-bg-dark-3 hover:text-white'
              }`}
              aria-pressed={groupingMode === 'movement'}
            >
              <Layers className="w-3.5 h-3.5" />
              Movement
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode('region')}
              className={`flex-1 min-h-[44px] rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan flex items-center justify-center gap-1.5 ${
                groupingMode === 'region'
                  ? 'bg-cyan text-bg-dark'
                  : 'bg-surface-2 text-ink-d2 border border-div-d hover:bg-bg-dark-3 hover:text-white'
              }`}
              aria-pressed={groupingMode === 'region'}
            >
              <MapPin className="w-3.5 h-3.5" />
              Region
            </button>
          </div>
        </div>

        {/* Group accordion */}
        <div className="flex-1 py-2">
          {groupedMachines.map((group) => {
            const isOpen = openGroups.has(group.key);
            return (
              <div key={group.key} className="border-b border-div-d/40 last:border-b-0">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex items-center justify-between w-full min-h-[44px] px-4 text-left text-[12px] font-bold uppercase tracking-widest text-ink-d2 hover:bg-bg-dark-3 hover:text-white transition-colors focus-visible:outline-none focus-visible:bg-bg-dark-3"
                  aria-expanded={isOpen}
                >
                  <span>{group.label}</span>
                  <span className="flex items-center gap-2 text-ink-d3 text-[11px] tabular-nums">
                    {group.machines.length}
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                </button>
                {isOpen && (
                  <div className="pb-2">
                    {group.machines.map((m) => {
                      const isSelected = selectedMachineId === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => m.id && handleSelectMachine(m.id)}
                          className={`flex items-center justify-between w-full min-h-[44px] pl-6 pr-4 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:bg-bg-dark-3 ${
                            isSelected
                              ? 'bg-bg-dark-3 text-white border-l-2 border-cta'
                              : 'text-ink-d2 hover:bg-bg-dark-3 hover:text-white border-l-2 border-transparent'
                          }`}
                          aria-pressed={isSelected}
                        >
                          <span className="truncate">{m.name}</span>
                          {isSelected && (
                            <span className="text-[11px] uppercase tracking-widest text-cta font-bold">
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>

      {/* ───── STAGE ───── */}
      <main className="grid grid-rows-[auto_1fr_auto] min-h-0 p-4 md:p-6 gap-4">
        {/* View toggle */}
        <div className="flex gap-2 w-full">
          {(['front', 'side', 'back'] as AnatomyView[]).map((v) => {
            const isActive = view === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`flex-1 min-h-[44px] rounded-xl text-[12px] font-bold uppercase tracking-widest transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${
                  isActive
                    ? 'bg-cta text-white shadow-lg'
                    : 'bg-surface-2 text-ink-d2 border border-div-d hover:bg-bg-dark-3 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {v}
              </button>
            );
          })}
        </div>

        {/* Figure stage */}
        <div className="min-h-0 flex items-center justify-center bg-surface-1 rounded-2xl border border-div-d relative overflow-hidden">
          <AnatomyFigure
            view={view}
            primary={selectedMap?.primary ?? []}
            secondary={selectedMap?.secondary ?? []}
          />
          {!selectedMap && (
            <div className="absolute inset-x-0 bottom-4 text-center pointer-events-none">
              <span className="text-[11px] uppercase tracking-widest text-ink-d3 font-bold">
                Select a machine to activate the targeting chart
              </span>
            </div>
          )}
        </div>

        {/* Details card */}
        <div className="bg-surface-1 border border-div-d rounded-2xl p-4 flex items-center gap-4 min-h-[96px]">
          <div className="flex-1 min-w-0">
            {selectedMachine && selectedMap ? (
              <>
                <div className="text-[11px] uppercase tracking-widest text-cta font-bold mb-1">
                  {selectedMap.movementPattern}
                </div>
                <div className="text-[18px] font-bold uppercase italic text-white tracking-tight leading-none mb-2 truncate">
                  {selectedMachine.name}
                </div>
                <div className="text-[11px] text-ink-d2 leading-snug">
                  {selectedMap.clinicalNote}
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] uppercase tracking-widest text-ink-d3 font-bold mb-1">
                  Dynamic Anatomical Targeting
                </div>
                <div className="text-[14px] text-ink-d2 leading-snug">
                  Tap a machine on the left to visualize its primary and synergist musculature.
                </div>
              </>
            )}
          </div>
          {selectedMachine && (
            <button
              type="button"
              onClick={() =>
                selectedMachine.id && onViewMachineDetails?.(selectedMachine.id)
              }
              className="shrink-0 min-h-[48px] px-5 rounded-xl bg-cta text-white text-[12px] font-bold uppercase tracking-widest shadow-lg hover:bg-cta-strong active:scale-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan flex items-center gap-2"
            >
              View Machine Details
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
