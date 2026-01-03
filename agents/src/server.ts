import "dotenv/config";
import express from "express";
import cors from "cors";
import { BACKEND_URL } from "./config.js";
import { executeDCASwap, reportExecution } from "./executor.js";
import {
  checkPriceTarget,
  executeLimitOrder,
  reportLimitOrderExecution,
  markOrderExpired,
} from "./limitOrderExecutor.js";
import {
  executeSavingsSupply,
  reportSavingsExecution,
} from "./savingsExecutor.js";
import {
  executeRecurringPayment,
  reportRecurringPaymentExecution,
} from "./recurringPaymentExecutor.js";

const app = express();
const PORT = process.env.AGENT_SERVICE_PORT || 3002;

app.use(cors());
app.use(express.json());

// ============================================
// Fetch full agent details from backend
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
// Execute a single agent by ID
// ============================================

async function executeAgent(agentId: string, agentType: string) {
  console.log(`\n🚀 Manual execution triggered for agent ${agentId} (${agentType})`);

  // Fetch full agent details
  const agent = await fetchAgent(agentId);

  if (agentType === "dca") {
    const result = await executeDCASwap(agent);
    await reportExecution(agent._id, result);
    return result;
  } else if (agentType === "limit-order") {
    // For limit orders, check price first
    const priceCheck = await checkPriceTarget(agent);

    if (priceCheck.reason === "Order expired") {
      await markOrderExpired(agent._id);
      return { success: false, error: "Order expired" };
    }

    if (!priceCheck.shouldExecute) {
      return {
        success: false,
        error: `Price target not met (current: ${priceCheck.currentPrice}, target: ${priceCheck.targetPrice})`,
        priceCheck,
      };
    }

    const result = await executeLimitOrder(agent);
    await reportLimitOrderExecution(agent._id, result);

    return result;
  } else if (agentType === "savings") {
    const result = await executeSavingsSupply(agent);
    await reportSavingsExecution(agent._id, result);
    return result;
  } else if (agentType === "recurring-payment") {
    const result = await executeRecurringPayment(agent);
    await reportRecurringPaymentExecution(agent._id, result);
    return result;
  }

  throw new Error(`Unknown agent type: ${agentType}`);
}

// ============================================
// Health check endpoint
// ============================================

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================
// Execute endpoint - manually trigger agent execution
// ============================================

app.post("/execute", async (req, res) => {
  try {
    const { agentId, agentType } = req.body;

    if (!agentId || !agentType) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: agentId, agentType",
      });
      return;
    }

    const result = await executeAgent(agentId, agentType);

    res.json({
      success: result.success,
      txHash: result.txHash,
      error: result.error,
      amountIn: result.amountIn,
      amountOut: result.amountOut,
    });
  } catch (error) {
    console.error("Execution error:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Execution failed",
    });
  }
});

// ============================================
// Start server
// ============================================

app.listen(PORT, () => {
  console.log(`\n🤖 Agent Service running on port ${PORT}`);
  console.log(`   Backend URL: ${BACKEND_URL}`);
  console.log(`   Health check: http://localhost:${PORT}/health`);
  console.log(`   Execute: POST http://localhost:${PORT}/execute`);
});
