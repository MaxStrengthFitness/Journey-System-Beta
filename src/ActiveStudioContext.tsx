import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Studio, Trainer, FranchiseNetwork } from './types';
import { hasPermission as hasPermissionHelper, PermissionAction, PermissionContext } from './lib/permissions';

interface ActiveStudioContextType {
  activeStudioId: string | null;
  activeStudio: Studio | null;
  setActiveStudioId: (id: string | null) => void;
  availableStudios: Studio[];
  isChangingStudio: boolean;
  setIsChangingStudio: (val: boolean) => void;
  isAdmin: boolean;
  logout: () => Promise<void>;
  hasPermission: (action: PermissionAction, context?: PermissionContext) => boolean;
}

const ActiveStudioContext = createContext<ActiveStudioContextType | undefined>(undefined);

export function ActiveStudioProvider({ 
  children, 
  studios, 
  networks = [],
  authTrainer,
  isAdmin = false,
  userEmail,
  onLogout
}: { 
  children: ReactNode; 
  studios: Studio[]; 
  networks?: FranchiseNetwork[];
  authTrainer: Trainer | null;
  isAdmin?: boolean;
  userEmail?: string;
  onLogout: () => Promise<void>;
}) {
  const [activeStudioId, setActiveStudioIdState] = useState<string | null>(() => {
    return localStorage.getItem('max_strength_active_studio_id');
  });
  const [isChangingStudio, setIsChangingStudio] = useState(false);

  // Expose centralized permission checker using the active trainer, studio, and loaded networks
  const hasPermission = React.useCallback((action: PermissionAction, context: PermissionContext = {}) => {
    const mergedContext = {
      networks,
      studios,
      studioId: activeStudioId || undefined,
      ...context
    };
    return hasPermissionHelper(authTrainer, action, mergedContext, userEmail);
  }, [authTrainer, activeStudioId, networks, studios, userEmail]);

  // Restrict available studios based on centralized permissions
  const availableStudios = React.useMemo(() => {
    // If not logged in as a trainer, no studios available
    if (!authTrainer) return [];
    
    // Super Admin or Franchise Owner/Overseer see all studios
    const isGlobalUser = isAdmin || 
      authTrainer.role === 'Admin' || 
      authTrainer.role === 'FranchiseOwner' || 
      authTrainer.role === 'Overseer';
      
    if (isGlobalUser) return studios;

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

  const logout = async () => {
    setActiveStudioId(null);
    localStorage.clear();
    await onLogout();
  };

  // If the active studio is no longer in the available list, clear it
  useEffect(() => {
    if (activeStudioId && studios.length > 0 && availableStudios.length > 0 && authTrainer) {
      const existsInSystem = studios.some(s => s.id === activeStudioId);
      const isAllowed = availableStudios.some(s => s.id === activeStudioId);
      
      if (!existsInSystem) {
        console.warn('Active studio no longer exists in system. Clearing.');
        setActiveStudioId(null);
        return;
      }

      if (!isAllowed && authTrainer.id !== 'owner-temp') {
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
      isAdmin,
      logout,
      hasPermission
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
