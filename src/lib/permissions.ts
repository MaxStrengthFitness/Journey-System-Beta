import { Trainer, Studio, FranchiseNetwork, Client, UserRole } from '../types';

export type PermissionAction =
  | 'view_all_studios'
  | 'manage_all_studios'
  | 'manage_studio'                // edit settings, announcement
  | 'manage_studio_settings'       // site parameters
  | 'create_trainer'
  | 'edit_trainer'
  | 'delete_trainer'
  | 'view_client'
  | 'create_client'
  | 'edit_client'
  | 'delete_client'
  | 'train_client'                 // start session/workout
  | 'view_reports'                 // progress reports
  | 'manage_networks'              // create/modify franchise networks
  | 'approve_cross_training';      // approve cross-training for clients

export interface PermissionContext {
  studioId?: string;               // Target studio ID being accessed
  targetTrainer?: Trainer | null;   // Trainer being managed
  targetClient?: Client | null;     // Client being accessed
  networks?: FranchiseNetwork[];   // Loaded networks
  studios?: Studio[];              // Loaded studios
}

/**
 * Checks if a user is an Admin (Creator/System Architect - complete access)
 */
export function isAdmin(trainer: Trainer | null, tokenRole?: string): boolean {
  if (tokenRole === 'Admin') return true;
  if (!trainer) return false;
  return trainer.role === 'Admin';
}

/**
 * Checks if a user is a Founder (formerly Overseer/Jeff - complete company-wide admin access)
 * Inherits: Admin
 */
export function isFounder(trainer: Trainer | null, tokenRole?: string): boolean {
  if (tokenRole === 'Founder' || tokenRole === 'Admin' || tokenRole === 'Overseer') return true;
  if (!trainer) return false;
  const role = trainer.role;
  return role === 'Founder' || role === 'Overseer' || role === 'Admin';
}

/**
 * Checks if a user is an Owner (admin access to their specific franchise studio)
 * Inherits: Founder, Admin
 */
export function isOwner(trainer: Trainer | null): boolean {
  if (!trainer) return false;
  const role = trainer.role;
  return role === 'Owner' || role === 'StudioOwner' || role === 'FranchiseOwner' || isFounder(trainer);
}

/**
 * Checks if a user is a StudioLeader (admin access to specific studio/staff)
 * Inherits: Owner, Founder, Admin
 */
export function isStudioLeader(trainer: Trainer | null): boolean {
  if (!trainer) return false;
  const role = trainer.role;
  return role === 'StudioLeader' || role === 'HeadTrainer' || isOwner(trainer);
}

/**
 * Checks if a user is a LifeTransformer (full edit access to clients)
 * Inherits: StudioLeader, Owner, Founder, Admin
 */
export function isLifeTransformer(trainer: Trainer | null): boolean {
  if (!trainer) return false;
  const role = trainer.role;
  return role === 'LifeTransformer' || role === 'Trainer' || isStudioLeader(trainer);
}

/**
 * Checks if a user has Super Admin privileges (backwards compatibility).
 */
export function isSuperAdmin(trainer: Trainer | null, currentUserEmail?: string): boolean {
  return isAdmin(trainer, currentUserEmail);
}

/**
 * Checks if a trainer is a Franchise Owner (backwards compatibility).
 */
export function isFranchiseOwner(trainer: Trainer | null): boolean {
  return isFounder(trainer);
}

/**
 * Checks if a target studio ID belongs to the trainer's owned/territory access
 */
export function isStudioInTerritory(
  trainer: Trainer,
  studioId: string,
  networks?: FranchiseNetwork[]
): boolean {
  if (!studioId) return false;
  
  // 1. Direct owned studio ID
  if (trainer.ownedStudioIds?.includes(studioId)) return true;

  // 2. Active primary home studio
  if (trainer.primaryHomeStudioId === studioId) return true;

  // 3. Find if studio resides in a network owned by this Studio Owner
  if (networks) {
    const ownedNetworkIds = networks
      .filter(net => net.ownerId === trainer.id)
      .map(net => net.studioIds);
    for (const studioIds of ownedNetworkIds) {
      if (studioIds.includes(studioId)) return true;
    }
  }

  return false;
}

/**
 * Determines if two studios belong to the same Franchise Network
 */
export function areStudiosInSameNetwork(
  studioIdA: string,
  studioIdB: string,
  networks?: FranchiseNetwork[]
): boolean {
  if (!studioIdA || !studioIdB) return false;
  if (studioIdA === studioIdB) return true;
  if (!networks) return false;

  return networks.some(net => net.studioIds.includes(studioIdA) && net.studioIds.includes(studioIdB));
}

/**
 * Enforces permissions across the organizational hierarchy.
 */
export function hasPermission(
  trainer: Trainer | null,
  action: PermissionAction,
  context: PermissionContext = {},
  tokenRole?: string
): boolean {
  // 1. Unauthenticated users have no permission
  if (!trainer) return false;

  // 2. Absolute Admin and Overrides bypass
  if (isAdmin(trainer, tokenRole)) {
    return true;
  }

  // 3. Founder bypass: Global Owner
  if (isFounder(trainer, tokenRole)) {
    return true;
  }

  const { studioId, targetTrainer, targetClient, networks } = context;

  // Determine current active/evaluated studio ID
  const evaluationStudioId = studioId || trainer.primaryHomeStudioId;

  switch (action) {
    case 'view_all_studios':
    case 'manage_all_studios':
    case 'manage_networks':
      // Only Admin and Founder can do global actions
      return false;

    case 'manage_studio':
    case 'manage_studio_settings':
      if (isOwner(trainer)) {
        return isStudioInTerritory(trainer, evaluationStudioId, networks);
      }
      if (isStudioLeader(trainer)) {
        return trainer.primaryHomeStudioId === evaluationStudioId;
      }
      return false;

    case 'create_trainer':
    case 'edit_trainer':
    case 'delete_trainer':
      if (!targetTrainer) return false;
      
      if (isOwner(trainer)) {
        return isStudioInTerritory(trainer, targetTrainer.primaryHomeStudioId, networks);
      }

      if (isStudioLeader(trainer)) {
        const isStandardTransformer = targetTrainer.role === 'LifeTransformer' || targetTrainer.role === 'Trainer';
        const isSameStudio = targetTrainer.primaryHomeStudioId === trainer.primaryHomeStudioId;
        return isSameStudio && isStandardTransformer;
      }
      return false;

    case 'create_client':
      if (isOwner(trainer)) {
        return isStudioInTerritory(trainer, evaluationStudioId, networks);
      }
      if (isStudioLeader(trainer)) {
        return evaluationStudioId === trainer.primaryHomeStudioId;
      }
      if (isLifeTransformer(trainer)) {
        return evaluationStudioId === trainer.primaryHomeStudioId || 
               trainer.accessibleStudioIds?.includes(evaluationStudioId);
      }
      return false;

    case 'view_client':
    case 'edit_client':
    case 'train_client':
    case 'view_reports':
      if (!targetClient) return true; // Default true if no specific client provided to check high-level access

      const clientHome = targetClient.homeStudioId;

      if (isOwner(trainer)) {
        return isStudioInTerritory(trainer, clientHome, networks);
      }

      // StudioLeader/LifeTransformer checks:
      const isHomeStudio = clientHome === trainer.primaryHomeStudioId;
      const isPermanentAccess = trainer.accessibleStudioIds?.includes(clientHome) || 
                                trainer.activeGuestStudioIds?.includes(clientHome);

      if (isHomeStudio || isPermanentAccess) {
        return true;
      }

      // Data Sharing Network access
      if (areStudiosInSameNetwork(trainer.primaryHomeStudioId, clientHome, networks)) {
        return true;
      }

      // Cross-Training Check
      if (evaluationStudioId && evaluationStudioId !== clientHome) {
        const isApprovedForCurrentStudio = targetClient.approvedCrossTrainStudioIds?.includes(evaluationStudioId);
        if (isApprovedForCurrentStudio && 
            (trainer.primaryHomeStudioId === evaluationStudioId || 
             trainer.accessibleStudioIds?.includes(evaluationStudioId))) {
          return true;
        }
      }

      return false;

    case 'delete_client':
      if (isOwner(trainer)) {
        if (targetClient) {
          return isStudioInTerritory(trainer, targetClient.homeStudioId, networks);
        }
        return true;
      }
      return false;

    case 'approve_cross_training':
      if (isOwner(trainer)) {
        if (targetClient) {
          return isStudioInTerritory(trainer, targetClient.homeStudioId, networks);
        }
        return true;
      }
      if (isStudioLeader(trainer)) {
        if (targetClient) {
          return targetClient.homeStudioId === trainer.primaryHomeStudioId;
        }
        return true;
      }
      return false;

    default:
      return false;
  }
}
