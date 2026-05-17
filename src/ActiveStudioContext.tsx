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
    // Only perform this check if we have data and we are NOT in the middle of a trainer transition
    if (activeStudioId && studios.length > 0 && availableStudios.length > 0 && authTrainer) {
      const existsInSystem = studios.some(s => s.id === activeStudioId);
      const isAllowed = availableStudios.some(s => s.id === activeStudioId);
      
      // If it's completely gone from the system, definitely clear it
      if (!existsInSystem) {
        console.warn('Active studio no longer exists in system. Clearing.');
        setActiveStudioId(null);
        return;
      }

      // If it exists but we lost access? This is trickier.
      // We only clear if availableStudios is definitely fully loaded.
      if (!isAllowed && authTrainer.id !== 'owner-temp') {
         // Potential loss of permission. For now, let's just log it.
         // We'll only clear if we are SURE. 
         // Most "kicks to hub" happen because this triggers prematurely.
         console.log('Active studio not in available list. Potential permission change.');
      }
    }
  }, [availableStudios, activeStudioId, authTrainer, studios]);

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
