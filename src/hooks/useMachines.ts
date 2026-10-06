import { useState, useEffect } from "react";
import { Machine } from "../types";
import { subscribeMachines, type MachineDoc } from "../lib/machines-store";

/**
 * The machines AppContent hands round, merged over the built-in defaults.
 *
 * It used to open its own `orderBy("order")` listener beside
 * useMachineCatalog's unordered one: two live reads of the same documents.
 * Since the speed round (Oct 5 2026) it shares the one unordered listener
 * (lib/machines-store.ts) and does its old query's work in memory: only the
 * documents that HAVE an `order` (what orderBy kept), sorted by it.
 */
export function machinesFromDocs(docs: readonly MachineDoc[], defaultMachines: Machine[]): Machine[] {
  const machinesData = docs
    .filter((d) => Object.prototype.hasOwnProperty.call(d.data, "order"))
    .map((d) => ({ id: d.id, ...d.data }) as Machine);
  const mergedMachines = defaultMachines.map((dm) => {
    const remote = machinesData.find((r) => r.id === dm.id);
    return remote ? { ...dm, ...remote } : dm;
  });
  const customMachines = machinesData.filter((r) => !defaultMachines.find((dm) => dm.id === r.id));
  return [...mergedMachines, ...customMachines].sort((a, b) => (a.order || 0) - (b.order || 0));
}

export function useMachines(isReady: boolean, defaultMachines: Machine[]) {
  const [machines, setMachines] = useState<Machine[]>(defaultMachines);

  useEffect(() => {
    if (!isReady) return;
    return subscribeMachines((read) => {
      // Nothing read yet, or a failed read with nothing before it: keep what
      // is on screen (the defaults), as the old listener did.
      if (read.loading || (read.failed && read.docs.length === 0)) return;
      setMachines(machinesFromDocs(read.docs, defaultMachines));
    });
  }, [isReady, defaultMachines]);

  return { machines };
}
