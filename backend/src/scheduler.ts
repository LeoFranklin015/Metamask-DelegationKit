/**
 * Standalone Scheduler
 * Run with: npm run scheduler
 *
 * This can be run as a separate process or deployed as a worker
 */

import "dotenv/config";
import { connectDatabase } from "./config/database.js";
import { startScheduler, processDueAgents, getExecutionStats } from "./services/scheduler.js";

async function main() {
  console.log("🤖 Starting Delegation Agents Scheduler");
  console.log("=".repeat(50));

  try {
    // Connect to MongoDB
    await connectDatabase();

    // Show current stats
    const stats = await getExecutionStats();
    console.log("\n📊 Current Stats:");
    console.log(`   Total Agents: ${stats.agents.total}`);
    console.log(`   Active: ${stats.agents.active}`);
    console.log(`   Completed: ${stats.agents.completed}`);
    console.log(`   Failed: ${stats.agents.failed}`);
    console.log(`   Total Executions: ${stats.executions.totalExecutions}`);

    // Run immediately once
    console.log("\n🔄 Running initial check...");
    await processDueAgents();

    // Start scheduler (every minute for testing)
    // Production: use "0 * * * *" for hourly
    const cronExpression = process.env.CRON_SCHEDULE || "* * * * *";
    startScheduler(cronExpression);

    console.log("\n✅ Scheduler running. Press Ctrl+C to stop.\n");

    // Handle graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down scheduler...");
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      console.log("\n🛑 Shutting down scheduler...");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Failed to start scheduler:", error);
    process.exit(1);
  }
}

main();
