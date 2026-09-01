import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { X, Server, MoveVertical, PowerOff } from "lucide-react";
import { Machine } from "../types";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useToast } from "../contexts/ToastContext";
import { useStudioMachineSettings } from "../hooks/useStudioMachineSettings";
import { resolveMachineOrder } from "../data/machine-display-order";

/**
 * Hub → Machine Settings editor (round: Multi-Tenant Machine Settings,
 * Aug 2026). Used to write directly to the shared, global `machines`
 * collection — meaning one studio editing a machine's settings silently
 * changed what every other studio saw. It now writes to a per-studio
 * `studioMachineSettings` doc instead (id `${studioId}_${machineId}`), so
 * each studio's setting options, standard values, display order, and
 * whether they even have that piece of equipment are theirs alone. The
 * shared `machines` doc (name, anatomy mapping, etc.) is never touched
 * here anymore — its settingOptions/standardSettings/order only remain as
 * the fallback for a studio that hasn't customized a machine yet.
 */
export function TrainerMachineEditor({
  machines,
  activeStudioId,
  studioName,
}: {
  machines: Machine[];
  activeStudioId: string | null;
  studioName?: string;
}) {
  const { success: toastSuccess, error: toastError } = useToast();
  const { settingsByMachineId } = useStudioMachineSettings(activeStudioId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempOptions, setTempOptions] = useState<string[]>([]);
  const [tempStandardSettings, setTempStandardSettings] = useState<
    Record<string, string>
  >({});
  const [tempOrder, setTempOrder] = useState<number>(999);
  const [tempIsActive, setTempIsActive] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState(false);

  // Effective (studio-override-aware) view of each machine: falls back to
  // the shared machine doc's own settingOptions/standardSettings/order for
  // any studio that hasn't customized that machine yet.
  const effectiveMachines = machines.map((m) => {
    const override = m.id ? settingsByMachineId[m.id] : undefined;
    return {
      machine: m,
      settingOptions: override?.settingOptions ?? m.settingOptions ?? [],
      standardSettings: override?.standardSettings ?? m.standardSettings ?? {},
      order: resolveMachineOrder(m.id, m.order, override?.order),
      isActive: override?.isActive ?? true,
      hasOverride: !!override,
    };
  });

  const sortedMachines = [...effectiveMachines].sort(
    (a, b) => a.order - b.order,
  );

  const startEditing = (entry: (typeof effectiveMachines)[number]) => {
    setEditingId(entry.machine.id!);
    setTempOptions([...entry.settingOptions]);
    setTempStandardSettings({ ...entry.standardSettings });
    setTempOrder(entry.order);
    setTempIsActive(entry.isActive);
  };

  const handleAddOption = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.currentTarget.value.trim() !== "") {
      e.preventDefault();
      setTempOptions([...tempOptions, e.currentTarget.value.trim()]);
      e.currentTarget.value = "";
    }
  };

  const handleRemoveOption = (optionToRemove: string, index: number) => {
    setTempOptions(tempOptions.filter((_, i) => i !== index));
    const newSettings = { ...tempStandardSettings };
    delete newSettings[optionToRemove];
    setTempStandardSettings(newSettings);
  };

  const handleUpdateStandardSetting = (option: string, value: string) => {
    setTempStandardSettings((prev) => ({ ...prev, [option]: value }));
  };

  const handleSave = async (machine: Machine) => {
    if (!machine.id) return;
    if (!activeStudioId) {
      toastError("Select a studio before saving machine settings.");
      return;
    }
    setIsSaving(true);
    try {
      await setDoc(
        doc(db, "studioMachineSettings", `${activeStudioId}_${machine.id}`),
        {
          studioId: activeStudioId,
          machineId: machine.id,
          settingOptions: tempOptions,
          standardSettings: tempStandardSettings,
          order: tempOrder,
          isActive: tempIsActive,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setEditingId(null);
      toastSuccess(
        `Machine settings for ${machine.name} saved for ${studioName || "this studio"}.`,
      );
    } catch (err) {
      console.error(err);
      toastError("Failed to save machine settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (!activeStudioId) {
    return (
      <Card className="border border-border bg-card shadow-2xl rounded-[32px] overflow-hidden w-full">
        <CardContent className="p-8 text-center">
          <p className="text-sm text-muted-foreground font-medium">
            Select a studio to configure that studio's machine settings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-2xl rounded-[32px] overflow-hidden w-full">
      <CardHeader className="bg-muted pb-8 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
            <Server className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black text-card-foreground italic tracking-tight">
              Equipment Settings Setup
            </CardTitle>
            <CardDescription className="text-muted-foreground font-medium uppercase text-[11px] tracking-widest">
              Customize the standard adjustable settings, display order, and
              equipment possession for {studioName || "this studio"} — other
              studios are unaffected.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-150 pr-2 custom-scrollbar">
          {sortedMachines.map((entry, idx) => {
            const m = entry.machine;
            return (
              <div
                key={m.id || idx}
                className={`p-4 bg-muted border border-border rounded-xl space-y-3 ${
                  entry.isActive ? "" : "opacity-60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-card-foreground uppercase tracking-wider">
                    {m.name}
                  </h3>
                  {!entry.isActive && (
                    <span className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-rose-500 bg-rose-500/10 px-1.5 py-0.5 rounded shrink-0">
                      <PowerOff className="w-3 h-3" /> Not Owned
                    </span>
                  )}
                </div>
                {editingId === m.id ? (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3">
                      {tempOptions.map((opt, idx2) => (
                        <div
                          key={idx2}
                          className="flex items-center gap-2 bg-card p-2 rounded border border-border"
                        >
                          <span className="flex-1 text-xs font-bold text-muted-foreground py-1">
                            {opt}
                          </span>
                          <Input
                            placeholder="Standard Value"
                            value={tempStandardSettings[opt] || ""}
                            onChange={(e) =>
                              handleUpdateStandardSetting(opt, e.target.value)
                            }
                            className="w-28 bg-card border-border text-xs h-7 text-card-foreground text-center"
                          />
                          <button
                            onClick={() => handleRemoveOption(opt, idx2)}
                            className="text-rose-600 hover:text-rose-300 p-1"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Input
                      placeholder="Type new setting option & press Enter..."
                      onKeyDown={handleAddOption}
                      className="bg-card border-border text-xs h-9 focus:border-[#F06C22] text-card-foreground"
                    />

                    {/* Studio-specific display order + possession (round:
                        multi-tenant machine settings) */}
                    <div className="flex items-center gap-2 bg-card p-2 rounded border border-border">
                      <MoveVertical className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1 text-xs font-bold text-muted-foreground">
                        Display Order
                      </span>
                      <Input
                        type="number"
                        value={tempOrder}
                        onChange={(e) =>
                          setTempOrder(
                            parseInt(e.target.value, 10) || 999,
                          )
                        }
                        className="w-20 bg-card border-border text-xs h-7 text-card-foreground text-center"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-card p-2 rounded border border-border">
                      <span className="flex-1 text-xs font-bold text-muted-foreground">
                        {studioName || "This studio"} has this machine
                      </span>
                      <Switch
                        checked={tempIsActive}
                        onCheckedChange={setTempIsActive}
                      />
                    </div>

                    <div className="flex gap-2 justify-end mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingId(null)}
                        className="h-8 text-xs text-muted-foreground hover:text-card-foreground"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={isSaving}
                        onClick={() => handleSave(m)}
                        className="h-8 text-xs bg-[#10B981] hover:bg-[#059669] text-white"
                      >
                        {isSaving ? "Saving..." : "Save for This Studio"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5 min-h-6">
                      {entry.settingOptions.map((opt, idx2) => (
                        <div
                          key={idx2}
                          className="inline-flex items-center gap-1.5 bg-muted border border-border px-2 py-0.5 rounded"
                        >
                          <span className="text-[11px] font-bold text-[#F06C22] uppercase tracking-wider">
                            {opt}
                          </span>
                          {entry.standardSettings[opt] && (
                            <span className="text-[11px] font-semibold text-muted-foreground bg-card px-1.5 rounded-sm">
                              {entry.standardSettings[opt]}
                            </span>
                          )}
                        </div>
                      ))}
                      {entry.settingOptions.length === 0 && (
                        <span className="text-[11px] text-muted-foreground italic uppercase font-medium tracking-widest mt-1">
                          No settings configured.
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
                      <span>Order: {entry.order}</span>
                      {entry.hasOverride && (
                        <span className="text-indigo-400 font-bold">
                          Customized
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(entry)}
                      className="w-full h-8 text-[11px] uppercase font-bold tracking-widest border-border text-muted-foreground hover:bg-card hover:text-card-foreground"
                    >
                      Edit Setting Options
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
