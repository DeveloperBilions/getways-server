import { sendAgentExcelReport } from "../utility/email.js";
import cron from "node-cron";

cron.schedule("0 8 15,30 * *", async () => {
  await sendAgentExcelReport();
});

cron.schedule("0 8 28 2 *", async () => {
  await sendAgentExcelReport();
});
