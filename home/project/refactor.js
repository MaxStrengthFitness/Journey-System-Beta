const fs = require('fs');
const filepath = 'src/components/TrainerControlHubView.tsx';
let content = fs.readFileSync(filepath, 'utf8');

// Replace imports
if (!content.includes("import { hasPermission")) {
  content = content.replace("import { findMatchingTrainer, normalizeName, cleanAlphanumeric } from '../lib/sync-utils';", "import { findMatchingTrainer, normalizeName, cleanAlphanumeric } from '../lib/sync-utils';\nimport { isAdmin as checkIsAdmin, isFounder as checkIsFounder, isOwner as checkIsOwner, isStudioLeader as checkIsStudioLeader, hasPermission } from '../lib/permissions';\nimport { ROLE_LABELS } from '../types';");
}

// Replace the specific legacy conditions:
// (t.role === 'StudioOwner' || t.role === 'Admin' || t.role === 'Overseer') || (t.fullName === 'Austin Jurgens' && isAdmin)
content = content.replace(/\(t\.role === 'StudioOwner' \|\| t\.role === 'Admin' \|\| t\.role === 'Overseer'\) \|\| \(t\.fullName === 'Austin Jurgens' && isAdmin\)/g, "(checkIsOwner(t) || checkIsAdmin(t, authTrainer?.email))");

// (currentSelectedTrainer.role === 'StudioOwner' || currentSelectedTrainer.role === 'Admin' || currentSelectedTrainer.role === 'Overseer') || (currentSelectedTrainer.fullName === 'Austin Jurgens' && isAdmin)
content = content.replace(/\(currentSelectedTrainer\.role === 'StudioOwner' \|\| currentSelectedTrainer\.role === 'Admin' \|\| currentSelectedTrainer\.role === 'Overseer'\) \|\| \(currentSelectedTrainer\.fullName === 'Austin Jurgens' && isAdmin\)/g, "(checkIsOwner(currentSelectedTrainer) || checkIsAdmin(currentSelectedTrainer, authTrainer?.email))");

// isAdmin || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer' || authTrainer?.role === 'StudioOwner'
content = content.replace(/isAdmin \|\| authTrainer\?\.role === 'Admin' \|\| authTrainer\?\.role === 'Overseer' \|\| authTrainer\?\.role === 'StudioOwner'/g, "(isAdmin || checkIsOwner(authTrainer))");

// isAdmin || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer'
content = content.replace(/isAdmin \|\| authTrainer\?\.role === 'Admin' \|\| authTrainer\?\.role === 'Overseer'/g, "(isAdmin || checkIsFounder(authTrainer))");

// isAdmin || (authTrainer?.role === 'StudioOwner' || authTrainer?.role === 'Admin' || authTrainer?.role === 'Overseer')
content = content.replace(/isAdmin \|\| \(authTrainer\?\.role === 'StudioOwner' \|\| authTrainer\?\.role === 'Admin' \|\| authTrainer\?\.role === 'Overseer'\)/g, "(isAdmin || checkIsOwner(authTrainer))");

// ['Admin', 'Overseer', 'StudioOwner', 'HeadTrainer'].includes(authTrainer.role || '')
content = content.replace(/\['Admin', 'Overseer', 'StudioOwner', 'HeadTrainer'\]\.includes\(authTrainer\.role \|\| ''\)/g, "checkIsStudioLeader(authTrainer)");

// ? 'System Admin' : 'Performance Trainer' -> can be mapped using ROLE_LABELS if we want, but let's just leave it since the code is simplified: 
content = content.replace(/\{(\(checkIsOwner\(t\) \|\| checkIsAdmin\(t, authTrainer\?\.email\)\)) \? 'System Admin' : 'Performance Trainer'\}/g, "{$1 ? 'System Admin' : (ROLE_LABELS[t.role] || 'Performance Trainer')}");

content = content.replace(/\{(\(checkIsOwner\(currentSelectedTrainer\) \|\| checkIsAdmin\(currentSelectedTrainer, authTrainer\?\.email\)\)) \? 'System Admin' : 'Performance Trainer'\}/g, "{$1 ? 'System Admin' : (ROLE_LABELS[currentSelectedTrainer.role] || 'Performance Trainer')}");


fs.writeFileSync(filepath, content, 'utf8');
console.log('Refactoring complete.');
