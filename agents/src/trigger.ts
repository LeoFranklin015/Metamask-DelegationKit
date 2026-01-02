import "dotenv/config";
import { BACKEND_URL } from "./config.js";
import { executeDCASwap, reportExecution } from "./executor.js";
import {
  checkPriceTarget,
  executeLimitOrder,
  reportLimitOrderExecution,
  markOrderCompleted,
  markOrderExpired,
} from "./limitOrderExecutor.js";
import {
  executeSavingsSupply,
  reportSavingsExecution,
} from "./savingsExecutor.js";

// ============================================
// Fetch due agents from backend
// ============================================

async function fetchDueAgents() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/agents/due`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || "Failed to fetch due agents");
    }

    return data.agents;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes("fetch")) {
      throw new Error(`Cannot connect to backend at ${BACKEND_URL}. Is the backend running?`);
    }
    throw error;
  }
}

// ============================================
// Fetch full agent details
// ============================================

async function fetchAgent(agentId: string) {
  const response = await fetch(`${BACKEND_URL}/api/agents/${agentId}`);
  const data = await response.json();

  if (!data.success) {
    throw new Error(`Failed to fetch agent ${agentId}`);
  }

  return data.agent;
}

// ============================================
// Main trigger function
// ============================================

async function trigger() {
  console.log("\n" + "=".repeat(60));
  console.log(`🚀 Agent Trigger - ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  try {
    // Fetch all due agents
    const dueAgents = await fetchDueAgents();
    console.log(`\n📋 Found ${dueAgents.length} agents due for execution`);

    if (dueAgents.length === 0) {
      console.log("✨ No agents to process");
      return;
    }

    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
    };

    // Process each agent
    for (const dueAgent of dueAgents) {
      console.log(`\n${"─".repeat(40)}`);
      console.log(`📦 Agent: ${dueAgent._id}`);
      console.log(`   Name: ${dueAgent.name}`);
      console.log(`   Type: ${dueAgent.agentType}`);

      try {
        // Fetch full agent details (with permission context)
        const agent = await fetchAgent(dueAgent._id);

        if (agent.agentType === "dca") {
          // Execute the DCA swap
          const result = await executeDCASwap(agent);

          // Report result to backend
          await reportExecution(agent._id, result);

          if (result.success) {
            results.success++;
            console.log(`   ✅ Success! TX: ${result.txHash}`);
          } else {
            results.failed++;
            console.log(`   ❌ Failed: ${result.error}`);
          }
        } else if (agent.agentType === "limit-order") {
          // First check if price target is met
          const priceCheck = await checkPriceTarget(agent);

          if (priceCheck.reason === "Order expired") {
            // Mark order as expired
            await markOrderExpired(agent._id);
            results.skipped++;
            console.log(`   ⏰ Order expired`);
          } else if (priceCheck.shouldExecute) {
            // Execute the limit order
            const result = await executeLimitOrder(agent);

            // Report result to backend
            await reportLimitOrderExecution(agent._id, result);

            if (result.success) {
              // Mark order as completed
              await markOrderCompleted(agent._id);
              results.success++;
              console.log(`   ✅ Limit Order Executed! TX: ${result.txHash}`);
            } else {
              results.failed++;
              console.log(`   ❌ Failed: ${result.error}`);
            }
          } else {
            // Price target not met, skip for now (will be checked again next cycle)
            results.skipped++;
            console.log(`   ⏳ Price target not met (current: ${priceCheck.currentPrice}, target: ${priceCheck.targetPrice})`);
          }
        } else if (agent.agentType === "savings") {
          // Execute savings supply to Aave
          const result = await executeSavingsSupply(agent);

          // Report result to backend
          await reportSavingsExecution(agent._id, result);

          if (result.success) {
            results.success++;
            console.log(`   ✅ Savings Supply Success! TX: ${result.txHash}`);
          } else {
            results.failed++;
            console.log(`   ❌ Failed: ${result.error}`);
          }
        } else {
          console.log(`   ⚠️ Unknown agent type: ${agent.agentType}`);
        }
      } catch (error) {
        results.failed++;
        console.error(`   ❌ Error: ${error}`);
      }
    }

    // Summary
    console.log(`\n${"=".repeat(60)}`);
    console.log(`📊 Summary:`);
    console.log(`   ✅ Success: ${results.success}`);
    console.log(`   ❌ Failed: ${results.failed}`);
    console.log(`   ⏳ Skipped: ${results.skipped}`);
    console.log("=".repeat(60) + "\n");
  } catch (error) {
    console.error("❌ Trigger failed:", error);
    process.exit(1);
  }
}

// Run trigger
trigger();
