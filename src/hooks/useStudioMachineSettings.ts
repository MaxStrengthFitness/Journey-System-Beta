import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { StudioMachineSetting } from "../types";

/**
 * Live per-studio machine setting overrides (settingOptions,
 * standardSettings, display order, possession) — round: Multi-Tenant
 * Machine Settings, Aug 2026. Keyed by machineId for easy lookup at each
 * call site: `settingsByMachineId[machine.id]`.
 *
 * Used by: TrainerMachineEditor (the Hub's Machine Settings editor, which
 * both reads and writes these), and any read-only consumer that needs a
 * studio's custom order/possession — currently the Client Profile Journey
 * grid and the Active Session table's unfocused view.
 */
export function useStudioMachineSettings(studioId: string | null) {
  const [settingsByMachineId, setSettingsByMachineId] = useState<
    Record<string, StudioMachineSetting>
  >({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!studioId) {
      setSettingsByMachineId({});
      return;
    }
    setLoading(true);
    const q = query(
      collection(db, "studioMachineSettings"),
      where("studioId", "==", studioId),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const map: Record<string, StudioMachineSetting> = {};
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() } as StudioMachineSetting;
          if (data.machineId) map[data.machineId] = data;
        });
        setSettingsByMachineId(map);
        setLoading(false);
      },
      (err) => {
        console.error("Error loading studio machine settings:", err);
        setLoading(false);
      },
    );
    return () => unsubscribe();
  }, [studioId]);

  return { settingsByMachineId, loading };
}
