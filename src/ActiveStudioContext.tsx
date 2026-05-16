import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Studio, Trainer } from './types';

interface ActiveStudioContextType {
  activeStudioId: string | null;
  activeStudio: Studio | null;
  setActiveStudioId: (id: string | null) => void;
  availableStudios: Studio[];
  isChangingStudio: boolean;
  setIsChangingStudio: (val: boolean) => void;
  isAdmin: boolean;
}

const ActiveStudioContext = createContext<ActiveStudioContextType | undefined>(undefined);

export function ActiveStudioProvider({ 
  children, 
  studios, 
  authTrainer,
  isAdmin = false
}: { 
  children: ReactNode; 
  studios: Studio[]; 
  authTrainer: Trainer | null;
  isAdmin?: boolean;
}) {
  const [activeStudioId, setActiveStudioIdState] = useState<string | null>(() => {
    return localStorage.getItem('max_strength_active_studio_id');
  });
  const [isChangingStudio, setIsChangingStudio] = useState(false);

  const availableStudios = React.useMemo(() => {
    // If not logged in as a trainer, no studios available
    if (!authTrainer) return [];
    
    // Admin Override: System admins see all studios
    if (isAdmin || authTrainer.role === 'Owner') return studios;

    // Union of accessible, guest, and owned studios
    const allowedIds = new Set([
      authTrainer.primaryHomeStudioId,
      ...(authTrainer.accessibleStudioIds || []),
      ...(authTrainer.activeGuestStudioIds || []),
      ...(authTrainer.ownedStudioIds || [])
    ]);
    
    return studios.filter(s => s.id && allowedIds.has(s.id));
  }, [authTrainer, studios, isAdmin]);

  const activeStudio = React.useMemo(() => {
    return studios.find(s => s.id === activeStudioId) || null;
  }, [activeStudioId, studios]);

  const setActiveStudioId = (id: string | null) => {
    setActiveStudioIdState(id);
    if (id) {
      localStorage.setItem('max_strength_active_studio_id', id);
    } else {
      localStorage.removeItem('max_strength_active_studio_id');
    }
  };

  // If the active studio is no longer in the available list, clear it
  useEffect(() => {
    if (activeStudioId && availableStudios.length > 0) {
      const isValid = availableStudios.some(s => s.id === activeStudioId);
      if (!isValid && authTrainer) {
        setActiveStudioId(null);
      }
    }
  }, [availableStudios, activeStudioId, authTrainer]);

  return (
    <ActiveStudioContext.Provider value={{ 
      activeStudioId, 
      activeStudio, 
      setActiveStudioId, 
      availableStudios,
      isChangingStudio,
      setIsChangingStudio,
      isAdmin
    }}>
      {children}
    </ActiveStudioContext.Provider>
  );
}

export function useActiveStudio() {
  const context = useContext(ActiveStudioContext);
  if (context === undefined) {
    throw new Error('useActiveStudio must be used within an ActiveStudioProvider');
  }
  return context;
}
