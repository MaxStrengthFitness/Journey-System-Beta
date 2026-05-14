import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Server } from 'lucide-react';
import { Machine } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function TrainerMachineEditor({ machines }: { machines: Machine[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempOptions, setTempOptions] = useState<string[]>([]);
  const [tempStandardSettings, setTempStandardSettings] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Use a sorted copy of machines based on 'order'
  const sortedMachines = [...machines].sort((a, b) => (a.order || 999) - (b.order || 999));

  const startEditing = (machine: Machine) => {
    setEditingId(machine.id!);
    setTempOptions([...(machine.settingOptions || [])]);
    setTempStandardSettings({ ...(machine.standardSettings || {}) });
  };

  const handleAddOption = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      e.preventDefault();
      setTempOptions([...tempOptions, e.currentTarget.value.trim()]);
      e.currentTarget.value = '';
    }
  };

  const handleRemoveOption = (optionToRemove: string, index: number) => {
    setTempOptions(tempOptions.filter((_, i) => i !== index));
    const newSettings = { ...tempStandardSettings };
    delete newSettings[optionToRemove];
    setTempStandardSettings(newSettings);
  };

  const handleUpdateStandardSetting = (option: string, value: string) => {
    setTempStandardSettings(prev => ({ ...prev, [option]: value }));
  };

  const handleSave = async (machine: Machine) => {
    if (!machine.id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'machines', machine.id), {
        settingOptions: tempOptions,
        standardSettings: tempStandardSettings
      });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save machine settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border border-slate-700 bg-slate-800 shadow-2xl rounded-[32px] overflow-hidden w-full">
      <CardHeader className="bg-slate-900/50 pb-8 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 shadow-inner">
            <Server className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black text-white italic tracking-tight">Equipment Settings Setup</CardTitle>
            <CardDescription className="text-slate-400 font-medium uppercase text-[10px] tracking-widest">Customize the standard adjustable settings recorded per machine.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
          {sortedMachines.map((m, idx) => (
            <div key={m.id || idx} className="p-4 bg-slate-900/50 border border-slate-700 rounded-xl space-y-3">
              <h3 className="text-sm font-black text-white uppercase tracking-wider">{m.name}</h3>
              {editingId === m.id ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3">
                    {tempOptions.map((opt, idx2) => (
                      <div key={idx2} className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-600">
                        <span className="flex-1 text-xs font-bold text-slate-300 py-1">
                          {opt}
                        </span>
                        <Input
                          placeholder="Standard Value"
                          value={tempStandardSettings[opt] || ''}
                          onChange={(e) => handleUpdateStandardSetting(opt, e.target.value)}
                          className="w-28 bg-slate-900 border-slate-600 text-xs h-7 text-white text-center"
                        />
                        <button onClick={() => handleRemoveOption(opt, idx2)} className="text-rose-400 hover:text-rose-300 p-1">
                           <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Input 
                    placeholder="Type new setting option & press Enter..." 
                    onKeyDown={handleAddOption}
                    className="bg-slate-800 border-slate-600 text-xs h-9 focus:border-[#F06C22] text-white"
                  />
                  <div className="flex gap-2 justify-end mt-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-8 text-xs text-slate-400 hover:text-white">Cancel</Button>
                    <Button size="sm" disabled={isSaving} onClick={() => handleSave(m)} className="h-8 text-xs bg-[#10B981] hover:bg-[#059669] text-white">Save Defaults</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5 min-h-[24px]">
                    {m.settingOptions?.map((opt, idx2) => (
                      <div key={idx2} className="inline-flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 px-2 py-0.5 rounded">
                        <span className="text-[10px] font-bold text-[#F06C22] uppercase tracking-wider">
                          {opt}
                        </span>
                        {m.standardSettings?.[opt] && (
                          <span className="text-[10px] font-semibold text-slate-300 bg-slate-900 px-1.5 rounded-sm">
                            {m.standardSettings[opt]}
                          </span>
                        )}
                      </div>
                    ))}
                    {(!m.settingOptions || m.settingOptions.length === 0) && (
                      <span className="text-[10px] text-slate-500 italic uppercase font-medium tracking-widest mt-1">No settings configured.</span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => startEditing(m)} className="w-full h-8 text-[10px] uppercase font-bold tracking-widest border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-white">
                    Edit Setting Options
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
