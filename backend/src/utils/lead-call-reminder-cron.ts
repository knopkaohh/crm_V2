import cron from 'node-cron'
import { processLeadCallRemindersForToday } from './lead-call-notifications'

let started = false

export const startLeadCallReminderCron = () => {
  if (started) return
  started = true

  const cronExpr = process.env.LEAD_CALL_REMINDER_CRON || '0 9 * * *'

  cron.schedule(cronExpr, async () => {
    try {
      const { sent } = await processLeadCallRemindersForToday()
      if (sent > 0) {
        console.log(`[lead-call-reminder] sent=${sent}`)
      }
    } catch (error) {
      console.error('[lead-call-reminder] failed:', error)
    }
  })

  console.log(`[lead-call-reminder] cron started: ${cronExpr}`)
}
