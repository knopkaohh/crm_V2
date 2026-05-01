import cron from 'node-cron';
import { getColdCallsSyncConfigError, syncColdCallsFromGoogleSheets } from './cold-calls-sync';

let started = false;

export const startColdCallsSyncCron = () => {
  if (started) return;
  started = true;

  const cronExpr = process.env.COLD_CALLS_SYNC_CRON || '*/2 * * * *';
  cron.schedule(cronExpr, async () => {
    try {
      const configError = getColdCallsSyncConfigError();
      if (configError) {
        return;
      }

      const result = await syncColdCallsFromGoogleSheets();
      if (result.imported || result.skipped) {
        console.log(
          `[cold-calls-sync] imported=${result.imported}, skipped=${result.skipped}, lastRow=${result.lastProcessedRow}`
        );
      }
    } catch (error) {
      console.error('[cold-calls-sync] failed:', error);
    }
  });

  console.log(`[cold-calls-sync] cron started: ${cronExpr}`);
  const configError = getColdCallsSyncConfigError();
  if (configError) {
    console.warn(`[cold-calls-sync] ${configError}`);
  }
};
