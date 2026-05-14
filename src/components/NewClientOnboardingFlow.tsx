import React, { useState } from 'react';
import { calculateStartingWeight, Gender, SkillLevel, MachineSelection } from '../lib/consultation-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info, Play, FileText, ChevronRight, User, Stethoscope, Mail, Phone, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface NewClientOnboardingFlowProps {
  initialName?: string;
  onComplete: (clientData: any, routineData: any) => void;
  onCancel: () => void;
}

export function NewClientOnboardingFlow({ initialName = '', onComplete, onCancel }: NewClientOnboardingFlowProps) {
  // Parsing initial name if provided (e.g., from Calendar)
  const nameParts = initialName.trim().split(' ');
  const initialFirstName = nameParts[0] || '';
  const initialLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  // Step 1: Contact
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  // Step 2: Clinical Intake
  const [gender, setGender] = useState<Gender>('Male');
  const [age, setAge] = useState<number>(40);
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Novice');
  const [concerns, setConcerns] = useState('');

  const getMachine2 = (): { name: MachineSelection, tip: string } => {
    if (gender === 'Male') {
      return { name: 'Chest Press', tip: 'Stool required, elbows slightly lower than hands' };
    }
    return { name: 'Seated Dip', tip: 'Stool required, upper arms abducted 45-60 degrees' };
  };

  const machine2 = getMachine2();
  const routine = [
    { name: 'Leg Press' as MachineSelection, tip: 'Standard setup: P2 Seat, Gap 2' },
    machine2,
    { name: 'Lumbar' as MachineSelection, tip: 'Conservative start, Gap 4, align iliac crest' }
  ];

  const handleComplete = () => {
    if (!firstName || !lastName) {
      alert("First and Last name are required.");
      return;
    }
    
    const clientData = {
      firstName,
      lastName,
      email,
      phone,
      gender,
      concerns,
      isActive: true,
      remainingSessions: 0,
      completedSessions: 0,
      sessionCount: 0,
      consultationCompleted: true,
      medicalHistory: concerns,
    };
    
    const routineData = {
      gender,
      age,
      skillLevel,
      routine
    };
    
    onComplete(clientData, routineData);
  };

  return (
    <div className="flex flex-col bg-[#0A2E46] min-h-screen text-white pb-32">
      {/* Header */}
      <div className="p-8 pt-12 mb-2 bg-gradient-to-b from-black/20 to-transparent flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white">New Client Intake & Setup</h1>
          <p className="text-[#38BDF8] uppercase tracking-widest text-xs font-bold mt-2">Clinical Consultation Wizard</p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-[#94A3B8] hover:text-white hover:bg-white/10">
          <X className="w-8 h-8" />
        </Button>
      </div>

      <div className="px-8 space-y-16">
        
        {/* Step 1: Contact & Demographics */}
        <section className="space-y-6">
          <label className="text-[14px] font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 border-b border-[#115E8D] pb-2">
            <User className="w-5 h-5" />
            Step 1: Identity & Contact
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">First Name</label>
              <Input 
                value={firstName} 
                onChange={(e) => setFirstName(e.target.value)} 
                className="bg-black/20 border-white/10 text-xl font-bold h-14" 
                placeholder="Jane"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Last Name</label>
              <Input 
                value={lastName} 
                onChange={(e) => setLastName(e.target.value)} 
                className="bg-black/20 border-white/10 text-xl font-bold h-14" 
                placeholder="Doe"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] flex items-center gap-1"><Mail className="w-3 h-3"/> Email (Optional)</label>
              <Input 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                className="bg-black/20 border-white/10 text-xl font-bold h-14" 
                type="email"
                placeholder="jane@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] flex items-center gap-1"><Phone className="w-3 h-3"/> Phone (Optional)</label>
              <Input 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)} 
                className="bg-black/20 border-white/10 text-xl font-bold h-14" 
                type="tel"
                placeholder="555-0123"
              />
            </div>
          </div>
        </section>

        {/* Step 2: Clinical Intake */}
        <section className="space-y-6">
          <label className="text-[14px] font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 border-b border-[#115E8D] pb-2">
            <Stethoscope className="w-5 h-5" />
            Step 2: Clinical Intake
          </label>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-4">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Biological Gender</label>
              <div className="flex gap-3">
                {(['Male', 'Female'] as Gender[]).map(g => (
                  <button
                    key={g}
                    onClick={() => setGender(g)}
                    className={`flex-1 py-5 px-3 rounded-2xl font-black uppercase tracking-tight transition-all duration-200 border-2 ${
                      gender === g 
                        ? 'bg-[#115E8D] text-white border-[#115E8D] shadow-[0_0_20px_rgba(17,94,141,0.4)] scale-105' 
                        : 'bg-transparent text-[#94A3B8] border-white/10 hover:border-white/30 hover:bg-white/5'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">How old are you?</label>
              <div className="flex bg-black/20 border-2 border-white/10 rounded-2xl items-center focus-within:border-[#38BDF8] transition-colors relative h-[68px]">
                <input 
                  type="number" 
                  value={age || ''} 
                  onChange={e => setAge(parseInt(e.target.value) || 0)} 
                  className="bg-transparent w-full h-full text-white text-2xl font-black px-6 outline-none"
                  placeholder="e.g. 45"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Prior Experience</label>
              <div className="flex gap-3">
                {(['Novice', 'Intermediate', 'Advanced'] as SkillLevel[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSkillLevel(s)}
                    className={`flex-1 py-5 px-1 rounded-2xl font-black uppercase tracking-tight transition-all duration-200 border-2 text-sm ${
                      skillLevel === s 
                        ? 'bg-[#115E8D] text-white border-[#115E8D] shadow-[0_0_20px_rgba(17,94,141,0.4)] scale-105' 
                        : 'bg-transparent text-[#94A3B8] border-white/10 hover:border-white/30 hover:bg-white/5'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-6">
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8]">Orthopedic Concerns, Pain & Primary Goals</label>
            <Textarea 
              value={concerns} 
              onChange={(e) => setConcerns(e.target.value)} 
              className="bg-black/20 border-white/10 text-lg min-h-[100px] resize-none" 
              placeholder="e.g. Lower back pain, right shoulder mobility limits. Wants to build overall strength."
            />
          </div>
        </section>

        {/* Step 3: The Routine */}
        <section className="space-y-6">
          <label className="text-[14px] font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 border-b border-[#115E8D] pb-2">
            <FileText className="w-5 h-5" />
            Step 3: Prescribed Demo Protocol
          </label>

          <div className="space-y-4">
            {routine.map((machine, idx) => {
              const weight = calculateStartingWeight(machine.name, gender, age, skillLevel);
              
              return (
                <Card key={idx} className="bg-[#F8FAFC] border-none shadow-2xl overflow-hidden rounded-[24px]">
                  <CardContent className="p-0 flex flex-row items-stretch">
                    <div className="w-6 bg-[#115E8D] shrink-0" />
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2">
                        <div className="pr-4">
                          <h3 className="text-3xl font-black uppercase italic tracking-tighter text-[#0F172A] leading-none mb-2">
                            {machine.name}
                          </h3>
                          <p className="text-xs font-bold text-[#68717A] tracking-wide uppercase flex items-center gap-2 mt-2 leading-relaxed">
                            <Info className="w-4 h-4 text-[#115E8D] shrink-0" />
                            {machine.tip}
                          </p>
                        </div>
                        
                        <div className="text-right flex flex-col items-end pl-4 border-l border-slate-200">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-[#68717A] mb-2">Starting Wt</span>
                          <div className="bg-white border-2 border-[#E2E8F0] shadow-sm px-6 py-3 rounded-xl flex items-baseline gap-1.5">
                             <span className="text-4xl font-black tracking-tighter text-[#115E8D]">{weight}</span>
                             <span className="text-sm font-bold text-[#68717A] uppercase">lbs</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
                         <button className="bg-[#F1F5F9] hover:bg-[#E2E8F0] transition-colors py-2.5 px-4 rounded-lg text-[11px] font-black uppercase tracking-widest text-[#115E8D] flex items-center gap-2">
                           Setup Info
                           <ChevronRight className="w-4 h-4" />
                         </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      </div>
      
      {/* Bottom Fixed Action */}
      <div className="fixed bottom-0 left-0 right-0 p-8 pt-16 bg-gradient-to-t from-[#0A2E46] via-[#0A2E46] to-transparent pointer-events-none flex justify-end items-end z-50">
        <Button 
          onClick={handleComplete}
          disabled={!firstName || !lastName}
          className="bg-[#F06C22] hover:bg-[#d95d18] text-white font-black uppercase tracking-widest text-lg h-24 px-12 rounded-2xl shadow-[0_10px_40px_rgba(240,108,34,0.4)] pointer-events-auto items-center flex gap-3 disabled:opacity-50"
        >
          Create Profile & Begin Demo Workout
          <Play className="w-7 h-7 fill-current" />
        </Button>
      </div>

    </div>
  );
}
