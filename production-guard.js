/**
 * Shared production safety check for the root-level utility scripts.
 *
 * Added Sep 2, 2026. Background: these scripts hardcode the live project
 * (gen-lang-client-0731527386) and always have. Until now they were protected
 * only by the fact that a local .env pointed somewhere harmless -- which was
 * an accident of misconfiguration, not a safeguard. .env now points at
 * production on purpose (UI work against real data), so the protection has to
 * be explicit.
 *
 * Each script says out loud what it is about to touch, then refuses unless
 * the operator passes the confirmation flag.
 *
 * Usage:
 *   import { confirmProduction } from './production-guard.js';
 *   confirmProduction({
 *     script: 'deactivate-webhook.js',
 *     target: 'Mindbody webhook subscription -> production',
 *     action: 'STOPS all live Mindbody sync until re-registered',
 *   });
 */

export const PRODUCTION_PROJECT_ID = 'gen-lang-client-0731527386';
export const CONFIRM_FLAG = '--yes-affect-production';

export function confirmProduction({ script, target, action }) {
  console.log('');
  console.log(`  ${script}`);
  console.log(`  target : ${target}`);
  console.log(`  effect : ${action}`);
  console.log('');

  if (process.argv.includes(CONFIRM_FLAG)) {
    console.log(`  Confirmed with ${CONFIRM_FLAG}. Proceeding.`);
    console.log('');
    return;
  }

  console.error('  REFUSING TO RUN.');
  console.error('');
  console.error(`  This acts on PRODUCTION (${PRODUCTION_PROJECT_ID}) and affects`);
  console.error('  real studios, trainers and clients. There is no undo.');
  console.error('');
  console.error('  If you mean it, re-run with:');
  console.error(`      node ${script} ${CONFIRM_FLAG}`);
  console.error('');
  process.exit(1);
}
