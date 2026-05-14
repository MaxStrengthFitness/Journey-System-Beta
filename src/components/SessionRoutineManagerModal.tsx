import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Machine } from '../types';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  currentMachineIds: string[];
  machines: Machine[];
  onSave: (machineIds: string[]) => void;
}

export function SessionRoutineManagerModal({ isOpen, onOpenChange, currentMachineIds, machines, onSave }: Props) {
  const [localIds, setLocalIds] = useState<string[]>([]);
  useEffect(() => {
    if (isOpen) setLocalIds(currentMachineIds);
  }, [isOpen, currentMachineIds]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-slate-900 border-slate-700 text-white rounded-xl">
        <DialogHeader>
          <DialogTitle>Edit Routine Sequence</DialogTitle>
          <DialogDescription>Add or remove machines.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto">
          {localIds.map((id, index) => {
            const m = machines.find(mac => mac.id === id);
            return (
              <div key={id + index} className="flex justify-between items-center p-2 bg-slate-800 rounded">
                <span>{m?.name || id}</span>
                <Button size="sm" variant="destructive" onClick={() => setLocalIds(localIds.filter((_, i) => i !== index))}>Remove</Button>
              </div>
            );
          })}
          <div className="mt-4">
            <p className="text-sm font-bold mb-2">Available Machines</p>
            <div className="flex flex-wrap gap-2">
              {machines.filter(m => !localIds.includes(m.id!)).map(m => (
                <Button key={m.id} size="sm" variant="outline" onClick={() => setLocalIds([...localIds, m.id!])}>+ {m.name}</Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => { onSave(localIds); onOpenChange(false); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
