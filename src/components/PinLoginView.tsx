
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, UserCircle, Loader2, Check, LogIn, LogOut, ArrowLeft } from 'lucide-react';
import { Trainer } from '../types';
import { Button } from '@/components/ui/button';
import { comparePin, hashPin } from '../lib/auth-utils';
import { auth, googleProvider, signInWithPopup, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';

import { MaxStrengthLogo } from './MaxStrengthLogo';

interface PinLoginViewProps {
  trainers: Trainer[];
  user: any;
  onLogin: (trainer: Trainer) => void;
  isLoading?: boolean;
}

export function PinLoginView({ trainers, user, onLogin, isLoading: initialLoading }: PinLoginViewProps) {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  
  // Pin entry state
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  
  // Reset flow state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  const handleGoogleLogin = async () => {
    setIsLoggingIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error('Google login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign out failed:', err);
    }
  };

  const handleTrainerSelect = (t: Trainer) => {
    if (!t.pin && !t.pinHash) {
      onLogin(t);
      return;
    }
    setSelectedTrainer(t);
    setPinInput('');
    setNewPin('');
    setConfirmPin('');
    setStep('enter');
    setError('');
  };
  
  const handleBack = () => {
    setSelectedTrainer(null);
  };

  const isResetMode = selectedTrainer?.requiresPinReset || false;

  const handleNextMode = () => {
    setError('');
    const targetLength = 4;
    
    if (isResetMode) {
      if (step === 'enter') {
         if (newPin.length < targetLength) {
           setError('PIN must be at least 4 digits');
           return;
         }
         setStep('confirm');
      } else {
         if (confirmPin !== newPin) {
           setError('PINs do not match');
           setConfirmPin('');
           setStep('enter');
           setNewPin('');
           return;
         }
         handleSaveNewPin();
      }
    } else {
       handleVerifyPin();
    }
  };
  
  const handleVerifyPin = async () => {
    if (!selectedTrainer) return;
    try {
      const isSuperAdmin = selectedTrainer.fullName === 'Austin Jurgens' && user?.email === 'jurgensaj@gmail.com';
      if (isSuperAdmin) {
         // Optionally bypass PIN for super admin if they don't have one, or just check it normally.
         // Let's just check normally.
      }
      
      const targetPin = selectedTrainer.pinHash || selectedTrainer.pin;
      const isValid = await comparePin(pinInput, targetPin);
      
      if (isValid) {
        onLogin(selectedTrainer);
      } else {
        setError('Incorrect PIN');
        setPinInput('');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred verifying PIN');
    }
  };
  
  const handleSaveNewPin = async () => {
     if (!selectedTrainer || !selectedTrainer.id) return;
     setIsUpdatingPin(true);
     try {
        const hashed = await hashPin(newPin);
        
        const ref = doc(db, 'trainers', selectedTrainer.id);
        await updateDoc(ref, {
          pin: '', // Clear plaintext PIN for security
          pinHash: hashed,
          requiresPinReset: false
        });
        
        // Optimistically update
        const updatedTrainer = { ...selectedTrainer, pin: '', pinHash: hashed, requiresPinReset: false };
        onLogin(updatedTrainer);
     } catch (err: any) {
        console.error('Error updating PIN', err);
        setError('Failed to setup PIN. Please try again.');
        setIsUpdatingPin(false);
     }
  };
  
  const handleNumPad = (num: string) => {
    setError('');
    if (isResetMode) {
      if (step === 'enter') {
        if (newPin.length < 4) setNewPin(prev => prev + num);
      } else {
        if (confirmPin.length < 4) setConfirmPin(prev => prev + num);
      }
    } else {
      if (pinInput.length < 4) setPinInput(prev => prev + num);
    }
  };
  
  const handleNumPadDelete = () => {
    setError('');
    if (isResetMode) {
      if (step === 'enter') {
        setNewPin(prev => prev.slice(0, -1));
      } else {
        setConfirmPin(prev => prev.slice(0, -1));
      }
    } else {
      setPinInput(prev => prev.slice(0, -1));
    }
  };

  const sortedTrainers = [...trainers].sort((a, b) => (a.order || 0) - (b.order || 0));

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-background to-background focus:outline-none">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
        
        {!selectedTrainer && (
          <div className="text-center mb-12 flex flex-col items-center">
            <MaxStrengthLogo size="xl" className="mb-8" />
            <p className="text-muted-foreground font-bold uppercase tracking-widest text-[10px] mt-2 opacity-50">
              Select your name to start training
            </p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!selectedTrainer ? (
            <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-3">
              {trainers.length > 0 ? (
                sortedTrainers.map((t) => {
                  const isSuperAdmin = t.fullName === 'Austin Jurgens' && user?.email === 'jurgensaj@gmail.com';
                  const isOwner = t.role === 'Admin' || t.role === 'Overseer' || t.role === 'StudioOwner' || isSuperAdmin;
                  
                  return (
                    <motion.button
                      key={t.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleTrainerSelect(t)}
                      className={`group relative bg-card/40 backdrop-blur-xl border-2 ${isOwner ? 'border-amber-500/20' : 'border-border/10'} hover:border-primary/50 p-6 rounded-[32px] flex items-center justify-between transition-all shadow-sm`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl ${isOwner ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'} flex items-center justify-center font-black uppercase italic text-lg`}>
                          {t.initials}
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className="font-black uppercase italic tracking-tight text-lg leading-none">{t.fullName}</p>
                            {isOwner && (
                              <div className="bg-amber-500/10 px-1.5 py-0.5 rounded text-[8px] font-black text-amber-600 uppercase tracking-widest">
                                {isSuperAdmin ? 'Admin' : t.role}
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                            {isOwner ? 'System Administrator' : 'Performance Trainer'}
                          </p>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Check className="w-5 h-5 text-primary" />
                      </div>
                    </motion.button>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-4 py-12 px-6 bg-muted/20 rounded-[32px] border-2 border-dashed">
                  <Loader2 className="w-8 h-8 animate-spin text-muted-foreground/30" />
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60 text-center">
                    Syncing Team Data...
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="pin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
               <div className="mb-8">
                 <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 text-muted-foreground hover:text-foreground group px-0">
                    <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Back</span>
                 </Button>
               </div>
               
               <div className="bg-card border border-border shadow-md rounded-[32px] p-8 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 to-amber-500/50" />
                  
                  <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                     <Lock className="w-8 h-8" />
                  </div>
                  
                  {isResetMode ? (
                     <>
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Setup Secure PIN</h2>
                        <p className="text-sm font-bold text-muted-foreground mb-6">
                           {step === 'enter' ? 'Create a 4-6 digit PIN for your account' : 'Confirm your new PIN'}
                        </p>
                     </>
                  ) : (
                     <>
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Welcome Back</h2>
                        <p className="text-sm font-bold text-muted-foreground mb-6">
                           Enter your PIN to continue as {selectedTrainer.fullName}
                        </p>
                     </>
                  )}
                  
                  <div className="flex justify-center gap-3 mb-8">
                     {[...Array(4)].map((_, i) => {
                       const val = isResetMode ? (step === 'enter' ? newPin : confirmPin) : pinInput;
                       const isFilled = i < val.length;
                       return (
                         <div key={i} className={`w-4 h-4 rounded-full ${isFilled ? 'bg-primary' : 'bg-primary/20'} transition-all`} />
                       );
                     })}
                  </div>
                  
                  {error && (
                    <p className="text-rose-500 text-xs font-bold mb-4 uppercase tracking-widest">{error}</p>
                  )}
                  
                  <div className="grid grid-cols-3 gap-3 max-w-[280px] mx-auto">
                     {[1,2,3,4,5,6,7,8,9].map(num => (
                        <button key={num} onClick={() => handleNumPad(num.toString())} className="h-14 rounded-2xl bg-muted/50 hover:bg-muted text-xl font-bold transition-colors">
                           {num}
                        </button>
                     ))}
                     <button onClick={handleNumPadDelete} className="h-14 rounded-2xl bg-muted/50 hover:bg-muted text-sm font-bold uppercase tracking-widest transition-colors">
                        DEL
                     </button>
                     <button onClick={() => handleNumPad('0')} className="h-14 rounded-2xl bg-muted/50 hover:bg-muted text-xl font-bold transition-colors">
                        0
                     </button>
                     <button 
                        onClick={handleNextMode}
                        disabled={isUpdatingPin}
                        className="h-14 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-bold flex items-center justify-center transition-colors"
                     >
                        {isUpdatingPin ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                     </button>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!selectedTrainer && (
          <div className="mt-12 flex flex-col items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={user ? handleSignOut : handleGoogleLogin}
              disabled={isLoggingIn}
              className="flex flex-col items-center gap-1 transition-all h-auto py-2 group"
            >
              {isLoggingIn ? (
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              ) : user ? (
                <LogOut className="w-6 h-6 text-rose-500" />
              ) : (
                <LogIn className="w-6 h-6 text-primary" />
              )}
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {isLoggingIn ? 'Connecting...' : user ? 'Sign Out' : 'Google Admin Sign In'}
              </span>
            </Button>
            
            {user && (
              <p className="text-[8px] font-bold text-zinc-400 lowercase tracking-widest">{user.email}</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}

