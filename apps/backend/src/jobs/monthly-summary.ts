import cron from "node-cron";
import { db } from "../db/connection.js";
import { getSettingValue, upsertSetting } from "../db/settings.js";
import { settings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { generateMonthlySummary } from "../ai/monthly-summary.js";
import { sendBotMessageToAll } from "../hub/bot-api.js";
import { APP_TIME_ZONE, getBusinessToday, getDateTimePartsInTimeZone, getPreviousMonth } from "../utils/date.js";

export function setupMonthlySummaryJob() {
  // Check every hour if it's time to send the monthly summary
  cron.schedule("0 * * * *", async () => {
    try {
      const enabled = db.select().from(settings).where(eq(settings.key, "monthly_summary.enabled")).get();
      if (enabled?.value !== "true") return;

      const daySetting = db.select().from(settings).where(eq(settings.key, "monthly_summary.day")).get();
      const hourSetting = db.select().from(settings).where(eq(settings.key, "monthly_summary.hour")).get();

      const targetDay = Number(daySetting?.value || 1);
      const targetHour = Number(hourSetting?.value || 9);

      const now = getDateTimePartsInTimeZone();
      if (now.day !== targetDay || now.hour !== targetHour) return;

      // Generate summary for previous month
      const { year, month } = getPreviousMonth(getBusinessToday());
      const summaryMonth = `${year}-${String(month).padStart(2, "0")}`;

      if (getSettingValue("monthly_summary.last_sent_month") === summaryMonth) {
        console.log(`Monthly summary already sent for ${summaryMonth}, skipping duplicate run`);
        return;
      }

      console.log(`Generating monthly summary for ${year}-${month}`);
      const summary = await generateMonthlySummary(year, month);

      if (summary) {
        const successCount = await sendBotMessageToAll(`📊 ${year}年${month}月 家庭财务月报\n\n${summary}`);
        if (successCount > 0) {
          upsertSetting("monthly_summary.last_sent_month", summaryMonth);
          console.log(`Monthly summary sent successfully to ${successCount} member(s)`);
        } else {
          console.warn("Monthly summary generated but not sent because no recipients were available");
        }
      }
    } catch (error) {
      console.error("Monthly summary job error:", error);
    }
  }, { timezone: APP_TIME_ZONE });

  console.log(`Monthly summary cron job scheduled in ${APP_TIME_ZONE}`);
}
