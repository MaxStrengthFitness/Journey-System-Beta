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
 * Checks if a user has Super Admin privileges.
 * Austin Jurgens with jurgensaj@gmail.com or role 'Admin' is the Super Admin.
 */
export function isSuperAdmin(trainer: Trainer | null, currentUserEmail?: string): boolean {
  if (!trainer) return false;
  const matchEmail = currentUserEmail?.toLowerCase() === 'jurgensaj@gmail.com';
  return trainer.role === 'Admin' || matchEmail || trainer.fullName === 'Austin Jurgens';
}

/**
 * Checks if a trainer is a Franchise Owner.
 */
export function isFranchiseOwner(trainer: Trainer | null): boolean {
  if (!trainer) return false;
  // Role matches FranchiseOwner or is Jeff Tomaszewski
  return (
    trainer.role === 'FranchiseOwner' ||
    trainer.role === 'Overseer' || // Keep Overseer as backward compatibility mapping to owner level
    trainer.fullName?.toLowerCase().includes('jeff tomaszewski') ||
    trainer.fullName?.toLowerCase() === 'jeff tomaszewski'
  );
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
  currentUserEmail?: string
): boolean {
  // 1. Unauthenticated users have no permission
  if (!trainer) return false;

  // 2. Super Admin bypass: Absolute God-Mode
  if (isSuperAdmin(trainer, currentUserEmail)) {
    return true;
  }

  // 3. Franchise Owner bypass: Global Owner
  if (isFranchiseOwner(trainer)) {
    // Can do everything except possibly absolute DB bypasses block reserved for Super Admin,
    // but the spec says "Has full access to all studios, global app settings..."
    return true;
  }

  const role = trainer.role;
  const { studioId, targetTrainer, targetClient, networks } = context;

  // Determine current active/evaluated studio ID
  const evaluationStudioId = studioId || trainer.primaryHomeStudioId;

  switch (action) {
    case 'view_all_studios':
    case 'manage_all_studios':
    case 'manage_networks':
      // Only Super Admin and Franchise Owner can do global actions
      return false;

    case 'manage_studio':
    case 'manage_studio_settings':
      // Studio Owners can manage any studio in their territory
      if (role === 'StudioOwner') {
        return isStudioInTerritory(trainer, evaluationStudioId, networks);
      }
      // Head Trainer can manage their primary home studio settings
      if (role === 'HeadTrainer') {
        return trainer.primaryHomeStudioId === evaluationStudioId;
      }
      return false;

    case 'create_trainer':
    case 'edit_trainer':
    case 'delete_trainer':
      if (!targetTrainer) return false;
      
      // Studio Owners can manage trainers in their territory
      if (role === 'StudioOwner') {
        return isStudioInTerritory(trainer, targetTrainer.primaryHomeStudioId, networks);
      }

      // Head Trainers can only manage standard Trainers in their primaryHomeStudioId
      if (role === 'HeadTrainer') {
        const isStandardTrainer = targetTrainer.role === 'Trainer';
        const isSameStudio = targetTrainer.primaryHomeStudioId === trainer.primaryHomeStudioId;
        return isSameStudio && isStandardTrainer;
      }
      return false;

    case 'create_client':
      // Trainers can create clients for their primary studio or cross-training studio
      if (role === 'Trainer') {
        return evaluationStudioId === trainer.primaryHomeStudioId || 
               trainer.accessibleStudioIds?.includes(evaluationStudioId);
      }
      // Head Trainers can create clients in their primary home studio
      if (role === 'HeadTrainer') {
        return evaluationStudioId === trainer.primaryHomeStudioId;
      }
      // Studio Owners can create clients in their territory
      if (role === 'StudioOwner') {
        return isStudioInTerritory(trainer, evaluationStudioId, networks);
      }
      return false;

    case 'view_client':
    case 'edit_client':
    case 'train_client':
    case 'view_reports':
      if (!targetClient) return true; // Default true if no specific client provided to check high-level access

      const clientHome = targetClient.homeStudioId;

      // Studio Owner territory check
      if (role === 'StudioOwner') {
        return isStudioInTerritory(trainer, clientHome, networks);
      }

      // Head Trainer/Trainer checks:
      // A. Client belongs to their home studio or permanent accessible list
      const isHomeStudio = clientHome === trainer.primaryHomeStudioId;
      const isPermanentAccess = trainer.accessibleStudioIds?.includes(clientHome) || 
                                trainer.activeGuestStudioIds?.includes(clientHome);

      if (isHomeStudio || isPermanentAccess) {
        return true;
      }

      // B. Data Sharing Network: Frictionless access if client belongs to a studio in the same network
      if (areStudiosInSameNetwork(trainer.primaryHomeStudioId, clientHome, networks)) {
        return true;
      }

      // C. Cross-Training Check: Active studio being viewed has explicit client approval or is shared
      if (evaluationStudioId && evaluationStudioId !== clientHome) {
        // If client approved this studio ortrainer has home studio access
        const isApprovedForCurrentStudio = targetClient.approvedCrossTrainStudioIds?.includes(evaluationStudioId);
        if (isApprovedForCurrentStudio && 
            (trainer.primaryHomeStudioId === evaluationStudioId || 
             trainer.accessibleStudioIds?.includes(evaluationStudioId))) {
          return true;
        }
      }

      return false;

    case 'delete_client':
      // Only Studio Owners or above can delete clients from their territory
      if (role === 'StudioOwner') {
        if (targetClient) {
          return isStudioInTerritory(trainer, targetClient.homeStudioId, networks);
        }
        return true;
      }
      return false;

    case 'approve_cross_training':
      // Studio Owners and Head Trainers can approve cross training for clients in their studio
      if (role === 'StudioOwner') {
        if (targetClient) {
          return isStudioInTerritory(trainer, targetClient.homeStudioId, networks);
        }
        return true;
      }
      if (role === 'HeadTrainer') {
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
