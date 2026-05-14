
import { masterSync } from '../server/sync-logic.ts';
masterSync().then(() => {
  console.log('Cron Sync Success');
  process.exit(0);
}).catch(err => {
  console.error('Cron Sync Error:', err);
  process.exit(1);
});
