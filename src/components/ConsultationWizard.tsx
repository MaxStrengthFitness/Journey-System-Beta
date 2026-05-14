import React, { useState, useEffect } from 'react';
import { calculateStartingWeight, Gender, SkillLevel, MACHINE_DICTIONARY } from '../lib/consultation-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Info, Play, Stethoscope, CheckSquare, Dumbbell, X, Trash2, Plus } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { doc, updateDoc, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Client, Machine, Trainer } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface ConsultationWizardProps {
  client: Client;
  machines: Machine[];
  authTrainer: Trainer | null;
  trainers: Trainer[];
  onComplete: (clientId: string) => void;
  onCancel: () => void;
}

export function ConsultationWizard({ client, machines, authTrainer, trainers, onComplete, onCancel }: ConsultationWizardProps) {
  // Step 1: Intake
  const [gender, setGender] = useState<Gender>(client.gender as Gender || 'Male');
  const [age, setAge] = useState<number>(40);
  const [occupation, setOccupation] = useState(client.occupation || '');
  const [medical, setMedical] = useState(client.medicalHistory || '');
  const [activity, setActivity] = useState(client.activity || '');
  const [goals, setGoals] = useState(client.goals || '');

  // Step 2: Checklist
  const [cbGum, setCbGum] = useState(false);
  const [cbBreathing, setCbBreathing] = useState(false);
  const [cbWorkout, setCbWorkout] = useState(false);

  // Step 3: Setup
  const [skillLevel, setSkillLevel] = useState<SkillLevel>('Novice');
  
  // Initialize dynamic routine
  const [routine, setRoutine] = useState<string[]>([]);
  
  useEffect(() => {
    if (routine.length === 0 && machines.length > 0) {
      setRoutine([
        'Leg Press',
        client.gender === 'Female' ? 'Seated Dip' : 'Chest Press',
        'Lumbar'
      ]);
    }
  }, [client.gender, machines, routine.length]);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canProceed = cbGum && cbBreathing && cbWorkout;

  const handleComplete = async () => {
    if (!canProceed) {
      alert("Please check all consideration boxes before proceeding.");
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // 1. Update client profile with data
      await updateDoc(doc(db, 'clients', client.id!), {
        gender,
        age,
        occupation,
        medicalHistory: medical,
        activity,
        goals,
        updatedAt: serverTimestamp()
      });

      // 2. Map routine to machine IDs
      const customMachineIds = routine.map(name => {
        const m = machines.find(mac => mac.name === name || mac.fullName === name);
        return m?.id;
      }).filter(Boolean) as string[];

      // 3. Create Demo Routine doc
      const routineRef = await addDoc(collection(db, 'routines'), {
        clientId: client.id,
        name: 'Demo Routine',
        machineIds: customMachineIds,
        createdAt: serverTimestamp()
      });

      // 4. Create Active Session
      const trainerInitials = authTrainer?.initials || trainers[0]?.initials || '??';
      const trainerName = authTrainer ? authTrainer.fullName : '';
      const trainerId = authTrainer?.id || '';
      const date = new Date().toISOString().split('T')[0];
      const sessionRef = await addDoc(collection(db, 'sessions'), {
        clientId: client.id,
        routineId: routineRef.id,
        sessionType: 'Standard',
        sessionNumber: 1,
        date,
        trainerInitials,
        trainerName,
        trainerId,
        status: 'In-Progress',
        startTime: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      // 5. Add setup note
      await addDoc(collection(db, 'sessionNotes'), {
        sessionId: sessionRef.id,
        clientId: client.id,
        trainerId: authTrainer?.id || '',
        trainerInitials: trainerInitials,
        content: `Demo Consultation. Age: ${age}, Skill: ${skillLevel}. Goals: ${goals}`,
        createdAt: serverTimestamp()
      });

      onComplete(client.id!);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'consultationWizard');
    } finally {
      setIsSubmitting(false);
    }
  };

  const addMachine = () => {
    const defaultAvailable = machines.filter(m => !routine.includes(m.name))[0];
    if (defaultAvailable) {
      setRoutine([...routine, defaultAvailable.name]);
    } else if (machines.length > 0) {
      setRoutine([...routine, machines[0].name]);
    }
  };

  const removeMachine = (idx: number) => {
    const newRoutine = [...routine];
    newRoutine.splice(idx, 1);
    setRoutine(newRoutine);
  };

  if (!client) {
    return null;
  }

  return (
    <div className="flex flex-col bg-[#0A2E46] min-h-screen text-white">
      {/* Header */}
      <div className="p-8 pt-12 mb-2 bg-gradient-to-b from-black/20 to-transparent flex justify-between items-start sticky top-0 z-50 backdrop-blur-md">
        <div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white">Initial Consultation</h1>
          <p className="text-[#38BDF8] uppercase tracking-widest text-xs font-bold mt-2">
            Client: {client.firstName} {client.lastName}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-[#94A3B8] hover:text-white hover:bg-white/10 shrink-0">
          <X className="w-8 h-8" />
        </Button>
      </div>

      <div className="px-8 pb-16 space-y-12">
        
        {/* Section 1: Intake & Discovery */}
        <section className="space-y-6">
          <label className="text-[14px] font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 border-b border-[#115E8D] pb-2">
            <Stethoscope className="w-5 h-5" />
            Phase 1: Discovery & Medical
          </label>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
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
          </div>
          
          <div className="space-y-8 flex flex-col gap-6">
            <div className="space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] ml-2">Occupation</label>
              <Textarea 
                value={occupation} 
                onChange={(e) => setOccupation(e.target.value)} 
                className="bg-black/20 border-white/10 text-lg min-h-[100px] resize-none" 
                placeholder="What do they do (or did) for a living?"
              />
            </div>
          
            <div className="space-y-3">
              <div className="bg-[#115E8D]/20 border border-[#115E8D] rounded-xl p-4">
                <p className="text-sm italic font-bold text-[#38BDF8]">
                  "With our therapeutic approach, we like to fix people rather than break them."
                </p>
              </div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] ml-2">Medical History & Orthopedic Concerns</label>
              <Textarea 
                value={medical} 
                onChange={(e) => setMedical(e.target.value)} 
                className="bg-black/20 border-white/10 text-lg min-h-[100px] resize-none" 
                placeholder="Past/current pain, joint issues, surgeries, meds..."
              />
            </div>

            <div className="space-y-3">
              <div className="bg-[#115E8D]/20 border border-[#115E8D] rounded-xl p-4">
                <p className="text-sm italic font-bold text-[#38BDF8]">
                  "Never strength trained? Good, no bad habits to undo!"
                </p>
              </div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] ml-2">Physical Activity History</label>
              <Textarea 
                value={activity} 
                onChange={(e) => setActivity(e.target.value)} 
                className="bg-black/20 border-white/10 text-lg min-h-[100px] resize-none" 
                placeholder="Hobbies, past workout experiences..."
              />
            </div>

            <div className="space-y-3">
              <div className="bg-[#115E8D]/20 border border-[#115E8D] rounded-xl p-4">
                <p className="text-sm italic font-bold text-[#38BDF8]">
                  "This is a result-driven program. We help clients with [Goal] every day."
                </p>
              </div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#94A3B8] ml-2">Primary Goals (The Deep &quot;Why&quot;)</label>
              <Textarea 
                value={goals} 
                onChange={(e) => setGoals(e.target.value)} 
                className="bg-black/20 border-white/10 text-lg min-h-[100px] resize-none" 
                placeholder="Weight loss, strength, bone density..."
              />
            </div>
          </div>
        </section>

        {/* Section 2: Checklist */}
        <section className="space-y-6">
          <label className="text-[14px] font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 border-b border-[#115E8D] pb-2">
            <CheckSquare className="w-5 h-5" />
            Phase 2: Preliminary Considerations
          </label>
          
          <div className="space-y-4 flex flex-col gap-2">
            {/* Checkbox 1 */}
            <div 
              className={`border-2 rounded-2xl p-6 flex items-start gap-6 cursor-pointer transition-colors ${cbGum ? 'bg-[#115E8D]/20 border-[#38BDF8]' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}
              onClick={() => setCbGum(!cbGum)}
            >
              <div className="mt-1 flex-shrink-0">
                <Checkbox checked={cbGum} className="w-8 h-8 rounded border-2 border-white/40 data-[state=checked]:bg-[#38BDF8] data-[state=checked]:border-[#38BDF8]" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-white mb-2">Nothing loose in mouth</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  "Gum, cough drops, etc., become a choking hazard. Please discard before training."
                </p>
              </div>
            </div>

            {/* Checkbox 2 */}
            <div 
              className={`border-2 rounded-2xl p-6 flex items-start gap-6 cursor-pointer transition-colors ${cbBreathing ? 'bg-[#115E8D]/20 border-[#38BDF8]' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}
              onClick={() => setCbBreathing(!cbBreathing)}
            >
              <div className="mt-1 flex-shrink-0">
                <Checkbox checked={cbBreathing} className="w-8 h-8 rounded border-2 border-white/40 data-[state=checked]:bg-[#38BDF8] data-[state=checked]:border-[#38BDF8]" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-white mb-2">Breathing Protocol</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  "Avoid holding your breath at all costs—your BP goes up 2-4 times its normal rate. Breathe more than you think you have to."
                </p>
              </div>
            </div>

            {/* Checkbox 3 */}
            <div 
              className={`border-2 rounded-2xl p-6 flex items-start gap-6 cursor-pointer transition-colors ${cbWorkout ? 'bg-[#115E8D]/20 border-[#38BDF8]' : 'bg-black/20 border-white/10 hover:bg-white/5'}`}
              onClick={() => setCbWorkout(!cbWorkout)}
            >
              <div className="mt-1 flex-shrink-0">
                <Checkbox checked={cbWorkout} className="w-8 h-8 rounded border-2 border-white/40 data-[state=checked]:bg-[#38BDF8] data-[state=checked]:border-[#38BDF8]" />
              </div>
              <div>
                <h3 className="text-xl font-black uppercase tracking-tighter text-white mb-2">Today's Workout</h3>
                <p className="text-sm text-[#94A3B8] leading-relaxed">
                  "Don't be concerned with a 'good workout' today. We're focusing on concepts and form."
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Demo Setup */}
        <section className="space-y-6">
          <label className="text-[14px] font-bold uppercase tracking-widest text-[#38BDF8] flex items-center gap-2 border-b border-[#115E8D] pb-2">
            <Dumbbell className="w-5 h-5" />
            Phase 3: Demo Routine Setup
          </label>

          <div className="space-y-4 mb-8">
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
          
          <div className="bg-[#115E8D]/20 border border-[#115E8D] rounded-xl p-4 mb-6">
            <p className="text-lg italic font-black uppercase tracking-tight text-[#38BDF8]">
              "Are you ready to take a look?"
            </p>
          </div>

          <div className="space-y-4 flex flex-col gap-4 mt-8">
            {routine.map((machineName, idx) => {
              const weight = calculateStartingWeight(machineName, gender, age, skillLevel);
              const machineDef = machines.find(m => m.name === machineName || m.fullName === machineName);
              const tip = machineDef?.settings || 'Setup tailored to individual client.';
              const category = MACHINE_DICTIONARY[machineName]?.category || 'General';
              
              return (
                <Card key={idx} className="bg-[#F8FAFC] border-none shadow-2xl overflow-hidden rounded-[24px]">
                  <CardContent className="p-0 flex flex-row items-stretch">
                    <div className="w-6 bg-[#115E8D] shrink-0" />
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2 gap-4">
                        <div className="flex-1 min-w-0">
                          
                          <Select
                            value={machineName}
                            onValueChange={(val) => {
                              const newRoutine = [...routine];
                              newRoutine[idx] = val;
                              setRoutine(newRoutine);
                            }}
                          >
                            <SelectTrigger className="bg-transparent border-none text-3xl font-black uppercase italic tracking-tighter text-[#0F172A] leading-none mb-1 w-full p-0 shadow-none h-auto focus:ring-0 [&>svg]:h-5 [&>svg]:w-5 [&>svg]:ml-2">
                              <SelectValue placeholder="Select Machine" />
                            </SelectTrigger>
                            <SelectContent className="max-h-[300px]">
                              {machines.map(m => {
                                const cat = MACHINE_DICTIONARY[m.name]?.category || 'General';
                                return (
                                  <SelectItem key={m.id} value={m.name} className="py-3">
                                    <div className="flex flex-col gap-1 items-start justify-start text-left">
                                      <span className="font-bold uppercase text-sm tracking-tight">{m.name}</span>
                                      <span className="text-[10px] text-muted-foreground uppercase font-semibold">{cat}</span>
                                    </div>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>

                          <div className="mt-1 mb-3">
                            <Badge variant="secondary" className="text-[9px] uppercase font-bold tracking-widest bg-slate-200 text-slate-600 rounded-md">
                              {category}
                            </Badge>
                          </div>
                          
                          <p className="text-xs font-bold text-[#68717A] tracking-wide uppercase flex items-center gap-2 mt-2 leading-relaxed">
                            <Info className="w-4 h-4 text-[#115E8D] shrink-0" />
                            {tip}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right flex flex-col items-end pl-4 border-l border-slate-200 shrink-0">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#68717A] mb-2">Starting Wt</span>
                            <div className="bg-white border-2 border-[#E2E8F0] shadow-sm px-6 py-3 rounded-xl flex items-baseline gap-1.5 min-w-[120px] justify-center">
                               <span className="text-4xl font-black tracking-tighter text-[#115E8D]">{weight}</span>
                               <span className="text-sm font-bold text-[#68717A] uppercase">lbs</span>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeMachine(idx)}
                            className="text-rose-400 hover:text-rose-600 hover:bg-rose-100/50 shrink-0 h-14 w-14 rounded-xl ml-2"
                          >
                            <Trash2 className="w-6 h-6" />
                          </Button>
                        </div>
                        
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            
            <Button 
              variant="outline" 
              onClick={addMachine}
              className="w-full mt-4 h-20 rounded-2xl border-2 border-dashed border-[#F06C22]/50 text-[#F06C22] hover:bg-[#F06C22] hover:text-white transition-all font-black uppercase tracking-widest text-sm flex items-center gap-2 bg-transparent"
            >
              <Plus className="w-6 h-6" />
              Add Machine
            </Button>
            
          </div>
        </section>

        {/* CTA Button placed safely at the bottom instead of fixed floating */}
        <div className="mt-12 flex justify-end">
          <Button 
            onClick={handleComplete}
            disabled={!canProceed || isSubmitting || routine.length === 0}
            className="bg-[#F06C22] hover:bg-[#d95d18] text-white font-black uppercase tracking-widest text-lg h-14 px-8 w-full md:w-auto rounded-2xl shadow-[0_10px_40px_rgba(240,108,34,0.4)] flex items-center gap-3 disabled:opacity-50"
          >
            {isSubmitting ? 'Starting...' : 'Begin Demo Workout'}
            <Play className="w-5 h-5 fill-current" />
          </Button>
        </div>

      </div>
    </div>
  );
}
