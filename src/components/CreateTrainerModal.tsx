import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface Props {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (trainerData: any) => void;
}

export function CreateTrainerModal({ isOpen, onOpenChange, onSubmit }: Props) {
  const [fullName, setFullName] = useState('');
  const [initials, setInitials] = useState('');
  const [pin, setPin] = useState('');
  const [isOwner, setIsOwner] = useState(false);

  const handleSubmit = () => {
    if (!fullName || !initials || !pin) return;
    
    onSubmit({
      fullName,
      initials,
      pin,
      isOwner,
      isVisibleOnCalendar: true
    });
    
    setFullName('');
    setInitials('');
    setPin('');
    setIsOwner(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-800 text-white shadow-2xl rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black italic uppercase text-white tracking-widest">Add New Trainer</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Full Name</Label>
            <Input 
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                const parts = e.target.value.split(' ');
                if (parts.length > 1) {
                  setInitials((parts[0][0] + parts[parts.length-1][0]).toUpperCase());
                } else if (parts[0]) {
                  setInitials(parts[0].substring(0, 2).toUpperCase());
                } else {
                  setInitials('');
                }
              }}
              className="bg-slate-800 border-slate-700 text-white rounded-xl h-12"
              placeholder="e.g. John Doe"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Initials</Label>
            <Input 
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              className="bg-slate-800 border-slate-700 text-white rounded-xl h-12 uppercase"
              placeholder="JD"
              maxLength={3}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">4-Digit PIN</Label>
            <Input 
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length <= 4) setPin(val);
              }}
              className="bg-slate-800 border-slate-700 text-white rounded-xl h-12"
              placeholder="1234"
              maxLength={4}
              type="password"
            />
          </div>
          
          <div className="flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700">
            <div className="space-y-0.5">
              <Label className="text-sm font-bold text-white">System Admin</Label>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Grant full hub access</p>
            </div>
            <Switch checked={isOwner} onCheckedChange={setIsOwner} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!fullName || !initials || pin.length !== 4} className="w-full bg-[#F06C22] hover:bg-[#d95b16] text-white font-black uppercase text-xs h-12 rounded-xl transition-all shadow-[0_0_20px_rgba(240,108,34,0.3)]">
            Create Trainer Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
