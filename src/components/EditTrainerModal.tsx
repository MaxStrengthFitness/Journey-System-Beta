import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { X, Plus } from 'lucide-react';
import { Trainer } from '../types';

interface EditTrainerModalProps {
  trainer: Trainer;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (updates: Partial<Trainer>) => void;
}

export function EditTrainerModal({ trainer, isOpen, onOpenChange, onSave }: EditTrainerModalProps) {
  const [fullName, setFullName] = useState(trainer.fullName);
  const [initials, setInitials] = useState(trainer.initials);
  const [pin, setPin] = useState(trainer.pin);
  const [bio, setBio] = useState(trainer.bio || '');
  const [certifications, setCertifications] = useState<string[]>(trainer.certifications || []);
  const [newCert, setNewCert] = useState('');

  // Update state when trainer changes
  useEffect(() => {
    if (isOpen) {
      setFullName(trainer.fullName);
      setInitials(trainer.initials);
      setPin(trainer.pin);
      setBio(trainer.bio || '');
      setCertifications(trainer.certifications || []);
      setNewCert('');
    }
  }, [trainer, isOpen]);

  const handleAddCert = () => {
    if (newCert.trim() && !certifications.includes(newCert.trim())) {
      setCertifications([...certifications, newCert.trim()]);
      setNewCert('');
    }
  };

  const handleRemoveCert = (cert: string) => {
    setCertifications(certifications.filter(c => c !== cert));
  };

  const handleSubmit = () => {
    if (!fullName || !initials || !pin) return;
    
    onSave({
      fullName,
      initials,
      pin,
      bio,
      certifications
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#0A2E46] border-slate-700 text-white shadow-2xl rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black italic uppercase text-white tracking-widest">Edit Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">Full Name</Label>
            <Input 
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white rounded-xl h-12"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">Initials</Label>
            <Input 
              value={initials}
              onChange={(e) => setInitials(e.target.value.toUpperCase())}
              className="bg-slate-800/50 border-slate-700 text-white rounded-xl h-12 uppercase"
              maxLength={3}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">4-Digit PIN</Label>
            <Input 
              value={pin}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9]/g, '');
                if (val.length <= 4) setPin(val);
              }}
              className="bg-slate-800/50 border-slate-700 text-white rounded-xl h-12"
              maxLength={4}
              type="password"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">Intelligence Summary (Bio)</Label>
            <Textarea 
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="bg-slate-800/50 border-slate-700 text-white rounded-xl min-h-[100px] resize-none"
              placeholder="Field experience and specialized training..."
            />
          </div>

          <div className="space-y-3">
            <Label className="text-[10px] font-black uppercase text-[#38BDF8] tracking-widest">Combat Grade Certifications</Label>
            <div className="flex flex-wrap gap-2">
              {certifications.map((cert) => (
                <Badge key={cert} variant="outline" className="rounded-xl border-slate-700 bg-slate-800/80 text-white font-bold px-3 py-1.5 flex items-center gap-1">
                  {cert}
                  <button onClick={() => handleRemoveCert(cert)} className="text-slate-400 hover:text-red-400">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input 
                value={newCert}
                onChange={(e) => setNewCert(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCert(); } }}
                className="bg-slate-800/50 border-slate-700 text-white rounded-xl h-10 flex-1"
                placeholder="e.g. CPT, NSCA"
              />
              <Button type="button" onClick={handleAddCert} variant="outline" className="rounded-xl h-10 border-slate-700 bg-slate-800 shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={!fullName || !initials || pin.length !== 4} className="w-full bg-[#38BDF8] hover:bg-sky-500 text-slate-900 font-black uppercase text-xs h-12 rounded-xl transition-all shadow-[0_0_20px_rgba(56,189,248,0.3)]">
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
