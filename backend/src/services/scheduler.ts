import cron from "node-cron";
import { Agent, IAgent } from "../models/Agent.js";
import { executeDCAAgent } from "./executor.js";

// ============================================
// Scheduler Service
// ============================================

let isProcessing = false;

/**
 * Process all due agents
 * Called by cron job or manually
 */
export async function processDueAgents(): Promise<void> {
  // Prevent concurrent processing
  if (isProcessing) {
    console.log("⏳ Scheduler already processing, skipping...");
    return;
  }

  isProcessing = true;
  const startTime = Date.now();

  try {
    console.log("\n" + "=".repeat(50));
    console.log(`🕐 Scheduler run at ${new Date().toISOString()}`);
    console.log("=".repeat(50));

    // Find all active agents that are due for execution
    const dueAgents = await Agent.find({
      status: "active",
      nextExecution: { $lte: new Date() },
    }).sort({ nextExecution: 1 });

    console.log(`📋 Found ${dueAgents.length} agents due for execution`);

    if (dueAgents.length === 0) {
      console.log("✨ No agents to process");
      return;
    }

    // Process each agent
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
    };

    for (const agent of dueAgents) {
      try {
        console.log(`\n📦 Processing agent ${agent._id} (${agent.agentType})`);

        // Route to appropriate executor based on agent type
        switch (agent.agentType) {
          case "dca":
            const result = await executeDCAAgent(agent);
            if (result.success) {
              results.success++;
            } else {
              results.failed++;
            }
            break;

          // Future agent types:
          // case "limit-order":
          //   await executeLimitOrder(agent);
          //   break;
          // case "stop-loss":
          //   await executeStopLoss(agent);
          //   break;

          default:
            console.log(`   ⚠️ Unknown agent type: ${agent.agentType}`);
            results.skipped++;
        }
      } catch (error) {
        console.error(`   ❌ Error processing agent ${agent._id}:`, error);
        results.failed++;
      }

      // Small delay between executions to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const duration = Date.now() - startTime;
    console.log("\n" + "-".repeat(50));
    console.log(`📊 Scheduler Summary:`);
    console.log(`   ✅ Success: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   ⏭️ Skipped: ${results.skipped}`);
    console.log(`   ⏱️ Duration: ${duration}ms`);
    console.log("=".repeat(50) + "\n");
  } catch (error) {
    console.error("❌ Scheduler error:", error);
  } finally {
    isProcessing = false;
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus() {
  return {
    isProcessing,
    isRunning: schedulerTask !== null,
  };
}

// ============================================
// Cron Job Setup
// ============================================

let schedulerTask: cron.ScheduledTask | null = null;

/**
 * Start the scheduler cron job
 * Default: runs every minute for testing, change to hourly for production
 */
export function startScheduler(cronExpression: string = "* * * * *"): void {
  if (schedulerTask) {
    console.log("⚠️ Scheduler already running");
    return;
  }

  console.log(`🚀 Starting scheduler with cron: "${cronExpression}"`);

  schedulerTask = cron.schedule(cronExpression, async () => {
    await processDueAgents();
  });

  console.log("✅ Scheduler started");
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    console.log("🛑 Scheduler stopped");
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get upcoming scheduled executions
 */
export async function getUpcomingExecutions(limit: number = 10) {
  return Agent.find({
    status: "active",
  })
    .sort({ nextExecution: 1 })
    .limit(limit)
    .select("_id userAddress agentType name nextExecution");
}

/**
 * Get execution statistics
 */
export async function getExecutionStats() {
  const [totalAgents, activeAgents, pausedAgents, completedAgents, failedAgents] =
    await Promise.all([
      Agent.countDocuments(),
      Agent.countDocuments({ status: "active" }),
      Agent.countDocuments({ status: "paused" }),
      Agent.countDocuments({ status: "completed" }),
      Agent.countDocuments({ status: "failed" }),
    ]);

  // Get total executions
  const executionStats = await Agent.aggregate([
    {
      $group: {
        _id: null,
        totalExecutions: { $sum: "$executionCount" },
        avgExecutions: { $avg: "$executionCount" },
      },
    },
  ]);

  return {
    agents: {
      total: totalAgents,
      active: activeAgents,
      paused: pausedAgents,
      completed: completedAgents,
      failed: failedAgents,
    },
    executions: executionStats[0] || { totalExecutions: 0, avgExecutions: 0 },
  };
}
