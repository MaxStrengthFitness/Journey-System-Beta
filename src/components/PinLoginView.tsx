import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, Loader2, Check, LogIn, LogOut, ArrowLeft, Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { Trainer } from '../types';
import { Button } from '@/components/ui/button';
import { comparePin, hashPin } from '../lib/auth-utils';
import { auth, googleProvider, signInWithPopup, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, setDoc, getDoc } from 'firebase/firestore';
import { useActiveStudio } from '../ActiveStudioContext';
import { MaxStrengthLogo } from './MaxStrengthLogo';

interface PinLoginViewProps {
  trainers: Trainer[];
  user: any;
  onLogin: (trainer: Trainer) => void;
  isLoading?: boolean;
  authTrainer?: Trainer | null;
  onBack?: () => void;
}

export function PinLoginView({ trainers, user, onLogin, isLoading: initialLoading, authTrainer, onBack }: PinLoginViewProps) {
  const { activeStudioId, setIsAuthenticated, isAuthenticated } = useActiveStudio();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [selectedTrainer, setSelectedTrainer] = useState<Trainer | null>(null);
  const [userClaims, setUserClaims] = useState<any>(null);

  useEffect(() => {
    if (user) {
      user.getIdTokenResult().then((result: any) => {
        setUserClaims(result.claims);
      }).catch((e: any) => {
        console.error("Error fetching token claims in PinLoginView", e);
      });
    } else {
      setUserClaims(null);
    }
  }, [user]);

  // Automatically focus on the active pre-selected trainer if we have one and not authenticated
  useEffect(() => {
    if (authTrainer && !isAuthenticated && !selectedTrainer) {
      setSelectedTrainer(authTrainer);
    }
  }, [authTrainer, isAuthenticated]);
  
  // Pin entry state
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Security Lockout state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  // Reset flow state
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [step, setStep] = useState<'enter' | 'confirm'>('enter');

  // Lockout effect
  useEffect(() => {
    if (lockoutTime) {
      const interval = setInterval(() => {
        const remaining = Math.ceil((lockoutTime - Date.now()) / 1000);
        if (remaining <= 0) {
          setLockoutTime(null);
          setFailedAttempts(0);
          setSecondsRemaining(0);
        } else {
          setSecondsRemaining(remaining);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [lockoutTime]);

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
    const hasPin = t.pin || t.pinHash;
    if (!hasPin) {
      setPinInput('');
      localStorage.setItem('max_strength_authenticated', 'true');
      setIsAuthenticated(true);
      onLogin(t);
      return;
    }
    setSelectedTrainer(t);
    setPinInput('');
    setNewPin('');
    setConfirmPin('');
    setStep('enter');
    setError('');
    setShowPin(false);
  };
  
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      setSelectedTrainer(null);
      setError('');
    }
  };

  const isResetMode = selectedTrainer?.requiresPinReset || false;

  const handleNextMode = () => {
    if (lockoutTime) return;
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
    if (!selectedTrainer || lockoutTime) return;
    try {
      let targetPin = selectedTrainer.pinHash || selectedTrainer.pin;
      
      // Fallback/Override: if not on main doc, read from secrets subcollection
      if (!targetPin) {
        const secretDoc = await getDoc(doc(db, 'trainers', selectedTrainer.id, 'secrets', 'account'));
        if (secretDoc.exists()) {
          targetPin = secretDoc.data().pinHash || secretDoc.data().pin;
        }
      }

      const isValid = await comparePin(pinInput, targetPin || "");
      
      if (isValid) {
        setFailedAttempts(0);
        setError('');
        localStorage.setItem('max_strength_authenticated', 'true');
        setIsAuthenticated(true);
        onLogin(selectedTrainer);
      } else {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        setPinInput('');
        
        if (nextAttempts >= 5) {
          const lockedUntil = Date.now() + 30 * 1000; // 30 seconds penalty
          setLockoutTime(lockedUntil);
          setSecondsRemaining(30);
          setError('Maximum failed attempts reached. Locked for 30s.');
        } else {
          setError(`Incorrect PIN. ${5 - nextAttempts} attempts remaining.`);
        }
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
        
        // Write pin to the protected subcollection
        await setDoc(doc(db, 'trainers', selectedTrainer.id, 'secrets', 'account'), {
          pinHash: hashed
        });

        // 1. Clear requires pin reset if it exists
        // 2. We don't write pin/pinHash to main anymore!
        if (selectedTrainer.requiresPinReset) {
          await updateDoc(doc(db, 'trainers', selectedTrainer.id), {
            requiresPinReset: false
          });
        }
        
        // Optimistically update (the UI might still reference pinHash for legacy reasons just locally)
        const updatedTrainer = { ...selectedTrainer, pin: '', pinHash: hashed, requiresPinReset: false };
        localStorage.setItem('max_strength_authenticated', 'true');
        setIsAuthenticated(true);
        onLogin(updatedTrainer);
     } catch (err: any) {
        console.error('Error updating PIN', err);
        setError('Failed to setup PIN. Please try again.');
        setIsUpdatingPin(false);
     }
  };
  
  const handleNumPad = (num: string) => {
    if (lockoutTime) return;
    setError('');
    if (isResetMode) {
      if (step === 'enter') {
        if (newPin.length < 6) setNewPin(prev => prev + num);
      } else {
        if (confirmPin.length < 6) setConfirmPin(prev => prev + num);
      }
    } else {
      if (pinInput.length < 6) setPinInput(prev => prev + num);
    }
  };
  
  const handleNumPadDelete = () => {
    if (lockoutTime) return;
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

  // Switch between current month filtering
  const filteredTrainers = React.useMemo(() => {
    const sorted = [...trainers].sort((a, b) => (a.order || 0) - (b.order || 0));
    if (activeStudioId) {
      return sorted.filter(t => 
        t.primaryHomeStudioId === activeStudioId ||
        t.accessibleStudioIds?.includes(activeStudioId) ||
        t.activeGuestStudioIds?.includes(activeStudioId) ||
        t.role === 'Admin' ||
        t.role === 'Founder' ||
        t.role === 'Overseer'
      );
    }
    return sorted;
  }, [trainers, activeStudioId]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white text-sans">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md">
        
        {!selectedTrainer && (
          <div className="text-center mb-12 flex flex-col items-center">
            <MaxStrengthLogo size="xl" className="mb-6" />
            <span className="text-zinc-500 font-bold uppercase tracking-widest text-[11px] mt-2 block animate-pulse">
              Select Profile & Access the Hub
            </span>
          </div>
        )}

        <AnimatePresence mode="wait">
          {!selectedTrainer ? (
            <motion.div key="list" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid gap-3 max-h-[460px] overflow-y-auto pr-1">
              {filteredTrainers.length > 0 ? (
                filteredTrainers.map((t) => {
                  const isSuperAdmin = userClaims?.role === 'Admin' || userClaims?.role === 'Founder' || userClaims?.role === 'Overseer';
                  const isOwner = t.role === 'Admin' || t.role === 'Founder' || t.role === 'Owner' || t.role === 'Overseer' || t.role === 'StudioOwner' || isSuperAdmin;
                  
                  return (
                    <motion.button
                      key={t.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleTrainerSelect(t)}
                      className={`group relative bg-slate-900 border ${isOwner ? 'border-amber-500/30' : 'border-slate-800'} hover:border-[#F06C22] p-5 rounded-[24px] flex items-center justify-between transition-all shadow-md`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-11 h-11 rounded-xl ${isOwner ? 'bg-amber-500/10 text-amber-400' : 'bg-orange-500/10 text-[#F06C22]'} flex items-center justify-center font-black uppercase italic text-base`}>
                          {t.initials}
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <p className="font-extrabold uppercase italic tracking-tight text-base leading-none text-white">{t.fullName}</p>
                            {isOwner && (
                              <div className="bg-amber-450/10 px-1.5 py-0.5 rounded text-[7px] font-black text-amber-400 uppercase tracking-widest leading-none">
                                {isSuperAdmin ? 'Admin' : t.role}
                              </div>
                            )}
                          </div>
                          <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                            {isOwner ? 'Operations Manager' : 'Performance Trainer'}
                          </p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-[#F06C22]/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Check className="w-4 h-4 text-[#F06C22]" />
                      </div>
                    </motion.button>
                  );
                })
              ) : (
                <div className="flex flex-col items-center gap-4 py-12 px-6 bg-slate-900 rounded-[24px] border border-dashed border-slate-800">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-650" />
                  <p className="text-[11px] font-black uppercase tracking-widest text-[#F06C22] text-center">
                    Syncing Enterprise Profiles...
                  </p>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="pin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="flex flex-col items-center">
               <div className="w-full flex justify-start mb-4">
                 <Button variant="ghost" size="sm" onClick={handleBack} className="text-zinc-500 hover:text-white transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    <span className="text-[11px] font-bold uppercase tracking-widest">Back to Profiles</span>
                 </Button>
               </div>
               
               <div className="w-full bg-slate-900 border border-slate-800 shadow-2xl rounded-[32px] p-6 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#F06C22] to-amber-500" />
                  
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 text-[#F06C22] flex items-center justify-center mx-auto mb-4 border border-slate-800">
                     <Lock className="w-6 h-6" />
                  </div>
                  
                  {isResetMode ? (
                     <>
                        <h2 className="text-xl font-black uppercase tracking-tight mb-1 italic text-white">Create Security PIN</h2>
                        <p className="text-xs font-bold text-zinc-500 mb-6">
                           {step === 'enter' ? 'Create a 4-6 digit numeric password' : 'Re-enter your custom PIN to confirm'}
                        </p>
                     </>
                  ) : (
                     <>
                        <h2 className="text-xl font-black uppercase tracking-tight mb-1 italic text-white">Security Verification</h2>
                        <p className="text-xs font-bold text-zinc-500 mb-6">
                           Enter your security PIN as <span className="text-[#F06C22]">{selectedTrainer.fullName}</span>
                        </p>
                     </>
                  )}
                  
                  <div className="flex justify-center gap-3.5 mb-6">
                     {[...Array(4)].map((_, i) => {
                       const val = isResetMode ? (step === 'enter' ? newPin : confirmPin) : pinInput;
                       const isFilled = i < val.length;
                       return (
                         <div 
                           key={i} 
                           className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                             isFilled ? 'bg-[#F06C22] ring-4 ring-[#F06C22]/20 scale-110' : 'bg-slate-800'
                           }`} 
                         />
                       );
                     })}
                  </div>
                  
                  {error && (
                    <div className="bg-rose-950/40 border border-rose-500/20 rounded-xl p-3 mb-5 flex items-center justify-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                      <p className="text-rose-400 text-[11px] font-semibold uppercase tracking-wider">{error}</p>
                    </div>
                  )}

                  {lockoutTime && (
                    <div className="bg-[#F06C22]/10 border border-[#F06C22]/20 rounded-xl p-3 mb-5">
                      <p className="text-[#F06C22] text-[11px] font-bold uppercase tracking-widest animate-pulse">
                        Terminal Locked for {secondsRemaining}s
                      </p>
                    </div>
                  )}
                  
                  {/* iPad Touch targets for rapid, mistake-free tapping */}
                  <div className="grid grid-cols-3 gap-3.5 max-w-[280px] mx-auto">
                     {[1,2,3,4,5,6,7,8,9].map(num => (
                        <button 
                          key={num} 
                          onClick={() => handleNumPad(num.toString())} 
                          disabled={!!lockoutTime}
                          className="h-14 rounded-2xl bg-slate-950 hover:bg-slate-800 text-xl font-black text-white hover:text-[#F06C22] select-none shadow border border-slate-800 active:scale-95 transition-all outline-none"
                        >
                           {num}
                        </button>
                     ))}
                     <button 
                       onClick={handleNumPadDelete} 
                       disabled={!!lockoutTime}
                       className="h-14 rounded-2xl bg-slate-950 hover:bg-slate-800 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-white select-none active:scale-95 transition-all outline-none border border-slate-800"
                     >
                        Delete
                     </button>
                     <button 
                       onClick={() => handleNumPad('0')} 
                       disabled={!!lockoutTime}
                       className="h-14 rounded-2xl bg-slate-950 hover:bg-slate-800 text-xl font-black text-white hover:text-[#F06C22] select-none active:scale-95 transition-all border border-slate-800 outline-none"
                     >
                        0
                     </button>
                     <button 
                        onClick={handleNextMode}
                        disabled={isUpdatingPin || !!lockoutTime}
                        className="h-14 rounded-2xl bg-[#F06C22] hover:bg-[#ff7b33] text-white flex items-center justify-center active:scale-95 transition-all shadow-md outline-none"
                     >
                        {isUpdatingPin ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5 stroke-[3]" />}
                     </button>
                  </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {!selectedTrainer && (
          <div className="mt-12 flex flex-col items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={user ? handleSignOut : handleGoogleLogin}
              disabled={isLoggingIn}
              className="flex flex-col items-center gap-1.5 transition-all h-auto py-3 px-6 rounded-2xl border-slate-800 text-zinc-400 bg-slate-900/60 hover:text-white hover:bg-slate-900 group"
            >
              {isLoggingIn ? (
                <Loader2 className="w-5 h-5 animate-spin text-[#F06C22]" />
              ) : user ? (
                <LogOut className="w-5 h-5 text-rose-500" />
              ) : (
                <LogIn className="w-5 h-5 text-[#F06C22]" />
              )}
              <span className="text-[11px] font-black uppercase tracking-widest">
                {isLoggingIn ? 'Connecting...' : user ? 'Sign Out of Domain' : 'Corporate Identity Link'}
              </span>
            </Button>
            
            {user && (
              <p className="text-[11px] font-bold text-zinc-650 lowercase tracking-widest select-all">{user.email}</p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
