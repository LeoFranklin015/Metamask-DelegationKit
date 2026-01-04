import { Router, Request, Response } from "express";
import { Agent, AgentStatus } from "../models/Agent.js";
import { buildOnChainDataMap, createDelegationKey } from "../services/envio.js";

const router = Router();

// ============================================
// Types for request bodies
// ============================================

interface CreateDCAAgentBody {
  userAddress: string;
  name: string;
  permissionContext: string;
  delegationManager: string;
  sessionKeyAddress: string;
  // Permission metadata for on-chain correlation
  chainId: number;
  spendingToken: string;
  spendingLimit: string;
  spendingPeriod: number;
  startTime: number;
  config: {
    tokenIn: string;
    tokenOut: string;
    amountPerExecution: string;
    intervalSeconds: number; // Interval in seconds
    maxSlippage?: number;
    feeTier?: number;
  };
  maxExecutions?: number;
}

interface CreateLimitOrderAgentBody {
  userAddress: string;
  name: string;
  permissionContext: string;
  delegationManager: string;
  sessionKeyAddress: string;
  // Permission metadata for on-chain correlation
  chainId: number;
  spendingToken: string;
  spendingLimit: string;
  spendingPeriod: number;
  startTime: number;
  config: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    targetPrice: string;
    direction: "buy" | "sell";
    feeTier?: number;
    expiryTimestamp: number;
  };
}

interface CreateSavingsAgentBody {
  userAddress: string;
  name: string;
  permissionContext: string;
  delegationManager: string;
  sessionKeyAddress: string;
  // Permission metadata for on-chain correlation
  chainId: number;
  spendingToken: string;
  spendingLimit: string;
  spendingPeriod: number;
  startTime: number;
  config: {
    token: string;
    amountPerExecution: string;
    intervalSeconds: number;
  };
  maxExecutions?: number;
}

interface CreateRecurringPaymentAgentBody {
  userAddress: string;
  name: string;
  permissionContext: string;
  delegationManager: string;
  sessionKeyAddress: string;
  // Permission metadata for on-chain correlation
  chainId: number;
  spendingToken: string;
  spendingLimit: string;
  spendingPeriod: number;
  startTime: number;
  config: {
    token: string;
    amount: string;
    recipient: string;
    intervalSeconds: number;
  };
  maxExecutions?: number;
}

interface UpdateAgentBody {
  name?: string;
  status?: AgentStatus;
  config?: {
    maxSlippage?: number;
    feeTier?: number;
    intervalSeconds?: number;
  };
}

// ============================================
// GET /agents - List all agents (optionally filter by user)
// ============================================
router.get("/", async (req: Request, res: Response) => {
  try {
    const { userAddress, status, agentType } = req.query;

    const filter: Record<string, unknown> = {};
    if (userAddress) filter.userAddress = (userAddress as string).toLowerCase();
    if (status) filter.status = status;
    if (agentType) filter.agentType = agentType;

    const agents = await Agent.find(filter)
      .sort({ createdAt: -1 })
      .select("-executionLogs"); // Exclude logs for list view

    res.json({
      success: true,
      count: agents.length,
      agents,
    });
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agents",
    });
  }
});

// ============================================
// GET /agents/user/:address - Get all permissions for a user (optimized for dashboard)
// Returns enriched data with on-chain redemption counts from Envio
// Query params:
//   - status: "active" (default) | "completed" | "all"
// ============================================
router.get("/user/:address", async (req: Request, res: Response) => {
  try {
    const userAddress = req.params.address.toLowerCase();
    const statusFilter = req.query.status as string || "active";

    // Build status filter based on query param
    let statusQuery: Record<string, unknown>;
    if (statusFilter === "active") {
      statusQuery = { status: { $in: ["active", "paused"] } };
    } else if (statusFilter === "completed") {
      statusQuery = { status: { $in: ["completed", "cancelled", "failed"] } };
    } else {
      // "all" - fetch everything
      statusQuery = {};
    }

    // Fetch agents from MongoDB
    const agents = await Agent.find({
      userAddress,
      ...statusQuery,
    })
      .sort({ createdAt: -1 })
      .select("-executionLogs -permissionContext"); // Exclude large fields

    // Filter out agents without permission metadata (legacy agents)
    const validAgents = agents.filter(agent =>
      agent.spendingPeriod && agent.spendingLimit && agent.spendingToken
    );

    // Fetch on-chain redemption data from Envio (single request for all agents)
    let onChainDataMap: Map<string, { redemptionCount: number; totalSpent: bigint; lastRedemptionAt: number | null; lastTxHash: string | null }> = new Map();
    try {
      onChainDataMap = await buildOnChainDataMap(userAddress);
      console.log(`Fetched ${onChainDataMap.size} on-chain delegations from Envio for ${userAddress}`);
    } catch (error) {
      console.error("Failed to fetch on-chain data from Envio:", error);
      // Continue with empty map - will use off-chain data as fallback
    }

    // Calculate monthly limit for each agent
    const SECONDS_PER_MONTH = 30 * 24 * 60 * 60; // 2592000

    const permissions = validAgents.map((agent) => {
      // Calculate how many executions per month
      const executionsPerMonth = SECONDS_PER_MONTH / agent.spendingPeriod;
      // Monthly limit = limit per period * executions per month
      const monthlyLimit = BigInt(agent.spendingLimit) * BigInt(Math.floor(executionsPerMonth));

      // Try to get on-chain data using composite key
      const delegationKey = createDelegationKey({
        chainId: agent.chainId,
        delegate: agent.sessionKeyAddress, // delegate is the session key
        delegator: userAddress,
        spendingToken: agent.spendingToken,
        spendingPeriod: agent.spendingPeriod,
        startTime: agent.startTime,
      });

      const onChainData = onChainDataMap.get(delegationKey);

      // Use on-chain data if available, otherwise fall back to off-chain tracking
      let spent = BigInt(0);
      let onChainRedemptionCount = 0;
      let lastOnChainExecution: number | null = null;
      let lastTxHash: string | null = null;

      if (onChainData) {
        // Use on-chain data (source of truth)
        spent = onChainData.totalSpent;
        onChainRedemptionCount = onChainData.redemptionCount;
        lastOnChainExecution = onChainData.lastRedemptionAt;
        lastTxHash = onChainData.lastTxHash;
      } else {
        // Fallback to off-chain tracking
        if (agent.agentType === "dca" && agent.config.dca) {
          spent = BigInt(agent.config.dca.amountPerExecution) * BigInt(agent.executionCount);
        } else if (agent.agentType === "savings" && agent.config.savings) {
          spent = BigInt(agent.config.savings.totalSupplied || "0");
        } else if (agent.agentType === "recurring-payment" && agent.config.recurringPayment) {
          spent = BigInt(agent.config.recurringPayment.totalPaid || "0");
        } else if (agent.agentType === "limit-order" && agent.config.limitOrder) {
          spent = agent.executionCount > 0 ? BigInt(agent.config.limitOrder.amountIn) : BigInt(0);
        }
      }

      return {
        id: agent._id,
        name: agent.name,
        agentType: agent.agentType,
        status: agent.status,
        // Permission data for on-chain correlation
        chainId: agent.chainId,
        spendingToken: agent.spendingToken,
        spendingLimit: agent.spendingLimit,
        spendingPeriod: agent.spendingPeriod,
        startTime: agent.startTime,
        sessionKeyAddress: agent.sessionKeyAddress,
        // Calculated values
        monthlyLimit: monthlyLimit.toString(),
        spent: spent.toString(),
        // Execution info (prefer on-chain data)
        executionCount: onChainData ? onChainRedemptionCount : agent.executionCount,
        onChainRedemptionCount,
        lastExecution: lastOnChainExecution
          ? new Date(lastOnChainExecution * 1000).toISOString()
          : agent.lastExecution,
        lastTxHash,
        nextExecution: agent.nextExecution,
        // Data source indicator
        dataSource: onChainData ? "on-chain" : "off-chain",
        // Config summary
        config: agent.config,
        createdAt: agent.createdAt,
      };
    });

    res.json({
      success: true,
      count: permissions.length,
      permissions,
    });
  } catch (error) {
    console.error("Error fetching user permissions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch user permissions",
    });
  }
});

// ============================================
// GET /agents/due - Get all agents due for execution
// IMPORTANT: This must be before /:id route
// ============================================
router.get("/due", async (req: Request, res: Response) => {
  try {
    const dueAgents = await Agent.find({
      status: "active",
      nextExecution: { $lte: new Date() },
    })
      .sort({ nextExecution: 1 })
      .select("_id userAddress name agentType nextExecution");

    res.json({
      success: true,
      count: dueAgents.length,
      agents: dueAgents,
    });
  } catch (error) {
    console.error("Error fetching due agents:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch due agents",
    });
  }
});

// ============================================
// GET /agents/:id - Get single agent with full details
// ============================================
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: "Agent not found",
      });
      return;
    }

    res.json({
      success: true,
      agent,
    });
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch agent",
    });
  }
});

// ============================================
// POST /agents/dca - Create a new DCA agent
// ============================================
router.post("/dca", async (req: Request, res: Response) => {
  try {
    const body: CreateDCAAgentBody = req.body;

    // Validation
    if (!body.userAddress || !body.permissionContext || !body.delegationManager || !body.sessionKeyAddress) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: userAddress, permissionContext, delegationManager, sessionKeyAddress",
      });
      return;
    }

    // Validate permission metadata
    if (!body.chainId || !body.spendingToken || !body.spendingLimit || !body.spendingPeriod || !body.startTime) {
      res.status(400).json({
        success: false,
        error: "Missing required permission metadata: chainId, spendingToken, spendingLimit, spendingPeriod, startTime",
      });
      return;
    }

    if (!body.config || !body.config.tokenIn || !body.config.tokenOut || !body.config.amountPerExecution) {
      res.status(400).json({
        success: false,
        error: "Missing required config fields: tokenIn, tokenOut, amountPerExecution",
      });
      return;
    }

    if (!body.config.intervalSeconds || body.config.intervalSeconds < 1) {
      res.status(400).json({
        success: false,
        error: "intervalSeconds must be a positive number",
      });
      return;
    }

    // Set first execution to now (ready to execute immediately)
    const nextExecution = new Date();

    const agent = new Agent({
      userAddress: body.userAddress.toLowerCase(),
      agentType: "dca",
      name: body.name || `DCA Agent`,
      permissionContext: body.permissionContext,
      delegationManager: body.delegationManager,
      sessionKeyAddress: body.sessionKeyAddress.toLowerCase(),
      // Permission metadata
      chainId: body.chainId,
      spendingToken: body.spendingToken.toLowerCase(),
      spendingLimit: body.spendingLimit,
      spendingPeriod: body.spendingPeriod,
      startTime: body.startTime,
      config: {
        dca: {
          tokenIn: body.config.tokenIn,
          tokenOut: body.config.tokenOut,
          amountPerExecution: body.config.amountPerExecution,
          intervalSeconds: body.config.intervalSeconds,
          maxSlippage: body.config.maxSlippage || 1.0,
          feeTier: body.config.feeTier || 3000,
        },
      },
      nextExecution,
      maxExecutions: body.maxExecutions,
      status: "active",
      executionCount: 0,
      executionLogs: [],
    });

    await agent.save();

    console.log(`✅ Created DCA agent: ${agent._id} for user ${body.userAddress}`);

    res.status(201).json({
      success: true,
      agent: {
        id: agent._id,
        userAddress: agent.userAddress,
        agentType: agent.agentType,
        name: agent.name,
        status: agent.status,
        nextExecution: agent.nextExecution,
        config: agent.config,
      },
    });
  } catch (error) {
    console.error("Error creating DCA agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create DCA agent",
    });
  }
});

// ============================================
// POST /agents/limit-order - Create a new Limit Order agent
// ============================================
router.post("/limit-order", async (req: Request, res: Response) => {
  try {
    const body: CreateLimitOrderAgentBody = req.body;

    // Validation
    if (!body.userAddress || !body.permissionContext || !body.delegationManager || !body.sessionKeyAddress) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: userAddress, permissionContext, delegationManager, sessionKeyAddress",
      });
      return;
    }

    // Validate permission metadata
    if (!body.chainId || !body.spendingToken || !body.spendingLimit || !body.spendingPeriod || !body.startTime) {
      res.status(400).json({
        success: false,
        error: "Missing required permission metadata: chainId, spendingToken, spendingLimit, spendingPeriod, startTime",
      });
      return;
    }

    if (!body.config || !body.config.tokenIn || !body.config.tokenOut || !body.config.amountIn || !body.config.targetPrice) {
      res.status(400).json({
        success: false,
        error: "Missing required config fields: tokenIn, tokenOut, amountIn, targetPrice",
      });
      return;
    }

    if (!body.config.direction || !["buy", "sell"].includes(body.config.direction)) {
      res.status(400).json({
        success: false,
        error: "direction must be 'buy' or 'sell'",
      });
      return;
    }

    // For limit orders, start checking immediately
    const nextExecution = new Date();

    const agent = new Agent({
      userAddress: body.userAddress.toLowerCase(),
      agentType: "limit-order",
      name: body.name || `Limit Order`,
      permissionContext: body.permissionContext,
      delegationManager: body.delegationManager,
      sessionKeyAddress: body.sessionKeyAddress.toLowerCase(),
      // Permission metadata
      chainId: body.chainId,
      spendingToken: body.spendingToken.toLowerCase(),
      spendingLimit: body.spendingLimit,
      spendingPeriod: body.spendingPeriod,
      startTime: body.startTime,
      config: {
        limitOrder: {
          tokenIn: body.config.tokenIn,
          tokenOut: body.config.tokenOut,
          amountIn: body.config.amountIn,
          targetPrice: body.config.targetPrice,
          direction: body.config.direction,
          feeTier: body.config.feeTier || 3000,
          expiryTimestamp: body.config.expiryTimestamp,
        },
      },
      nextExecution,
      maxExecutions: 1, // Limit orders execute once
      status: "active",
      executionCount: 0,
      executionLogs: [],
    });

    await agent.save();

    console.log(`✅ Created Limit Order agent: ${agent._id} for user ${body.userAddress}`);
    console.log(`   Target: ${body.config.targetPrice} (${body.config.direction})`);

    res.status(201).json({
      success: true,
      agent: {
        id: agent._id,
        userAddress: agent.userAddress,
        agentType: agent.agentType,
        name: agent.name,
        status: agent.status,
        nextExecution: agent.nextExecution,
        config: agent.config,
      },
    });
  } catch (error) {
    console.error("Error creating Limit Order agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create Limit Order agent",
    });
  }
});

// ============================================
// POST /agents/savings - Create a new Savings agent (Aave V3)
// ============================================
router.post("/savings", async (req: Request, res: Response) => {
  try {
    const body: CreateSavingsAgentBody = req.body;

    // Validation
    if (!body.userAddress || !body.permissionContext || !body.delegationManager || !body.sessionKeyAddress) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: userAddress, permissionContext, delegationManager, sessionKeyAddress",
      });
      return;
    }

    // Validate permission metadata
    if (!body.chainId || !body.spendingToken || !body.spendingLimit || !body.spendingPeriod || !body.startTime) {
      res.status(400).json({
        success: false,
        error: "Missing required permission metadata: chainId, spendingToken, spendingLimit, spendingPeriod, startTime",
      });
      return;
    }

    if (!body.config || !body.config.token || !body.config.amountPerExecution) {
      res.status(400).json({
        success: false,
        error: "Missing required config fields: token, amountPerExecution",
      });
      return;
    }

    if (!body.config.intervalSeconds || body.config.intervalSeconds < 1) {
      res.status(400).json({
        success: false,
        error: "intervalSeconds must be a positive number",
      });
      return;
    }

    // Set first execution to now (ready to execute immediately)
    const nextExecution = new Date();

    const agent = new Agent({
      userAddress: body.userAddress.toLowerCase(),
      agentType: "savings",
      name: body.name || `Savings Agent`,
      permissionContext: body.permissionContext,
      delegationManager: body.delegationManager,
      sessionKeyAddress: body.sessionKeyAddress.toLowerCase(),
      // Permission metadata
      chainId: body.chainId,
      spendingToken: body.spendingToken.toLowerCase(),
      spendingLimit: body.spendingLimit,
      spendingPeriod: body.spendingPeriod,
      startTime: body.startTime,
      config: {
        savings: {
          token: body.config.token,
          amountPerExecution: body.config.amountPerExecution,
          intervalSeconds: body.config.intervalSeconds,
          protocol: "aave-v3",
          totalSupplied: "0",
        },
      },
      nextExecution,
      maxExecutions: body.maxExecutions,
      status: "active",
      executionCount: 0,
      executionLogs: [],
    });

    await agent.save();

    console.log(`✅ Created Savings agent: ${agent._id} for user ${body.userAddress}`);
    console.log(`   Token: ${body.config.token}, Amount: ${body.config.amountPerExecution}`);

    res.status(201).json({
      success: true,
      agent: {
        id: agent._id,
        userAddress: agent.userAddress,
        agentType: agent.agentType,
        name: agent.name,
        status: agent.status,
        nextExecution: agent.nextExecution,
        config: agent.config,
      },
    });
  } catch (error) {
    console.error("Error creating Savings agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create Savings agent",
    });
  }
});

// ============================================
// POST /agents/recurring-payment - Create a new Recurring Payment agent
// ============================================
router.post("/recurring-payment", async (req: Request, res: Response) => {
  try {
    const body: CreateRecurringPaymentAgentBody = req.body;

    // Validation
    if (!body.userAddress || !body.permissionContext || !body.delegationManager || !body.sessionKeyAddress) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: userAddress, permissionContext, delegationManager, sessionKeyAddress",
      });
      return;
    }

    // Validate permission metadata
    if (!body.chainId || !body.spendingToken || !body.spendingLimit || !body.spendingPeriod || !body.startTime) {
      res.status(400).json({
        success: false,
        error: "Missing required permission metadata: chainId, spendingToken, spendingLimit, spendingPeriod, startTime",
      });
      return;
    }

    if (!body.config || !body.config.token || !body.config.amount || !body.config.recipient) {
      res.status(400).json({
        success: false,
        error: "Missing required config fields: token, amount, recipient",
      });
      return;
    }

    if (!body.config.intervalSeconds || body.config.intervalSeconds < 1) {
      res.status(400).json({
        success: false,
        error: "intervalSeconds must be a positive number",
      });
      return;
    }

    // Set first execution to now (ready to execute immediately)
    const nextExecution = new Date();

    const agent = new Agent({
      userAddress: body.userAddress.toLowerCase(),
      agentType: "recurring-payment",
      name: body.name || `Recurring Payment`,
      permissionContext: body.permissionContext,
      delegationManager: body.delegationManager,
      sessionKeyAddress: body.sessionKeyAddress.toLowerCase(),
      // Permission metadata
      chainId: body.chainId,
      spendingToken: body.spendingToken.toLowerCase(),
      spendingLimit: body.spendingLimit,
      spendingPeriod: body.spendingPeriod,
      startTime: body.startTime,
      config: {
        recurringPayment: {
          token: body.config.token,
          amount: body.config.amount,
          recipient: body.config.recipient,
          intervalSeconds: body.config.intervalSeconds,
          totalPaid: "0",
        },
      },
      nextExecution,
      maxExecutions: body.maxExecutions,
      status: "active",
      executionCount: 0,
      executionLogs: [],
    });

    await agent.save();

    console.log(`✅ Created Recurring Payment agent: ${agent._id} for user ${body.userAddress}`);
    console.log(`   Recipient: ${body.config.recipient}, Amount: ${body.config.amount}`);

    res.status(201).json({
      success: true,
      agent: {
        id: agent._id,
        userAddress: agent.userAddress,
        agentType: agent.agentType,
        name: agent.name,
        status: agent.status,
        nextExecution: agent.nextExecution,
        config: agent.config,
      },
    });
  } catch (error) {
    console.error("Error creating Recurring Payment agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create Recurring Payment agent",
    });
  }
});

// ============================================
// PATCH /agents/:id - Update agent (pause, resume, update config)
// ============================================
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const body: UpdateAgentBody = req.body;
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: "Agent not found",
      });
      return;
    }

    // Update allowed fields
    if (body.name) agent.name = body.name;
    if (body.status) {
      // Validate status transitions
      const validTransitions: Record<AgentStatus, AgentStatus[]> = {
        active: ["paused", "cancelled"],
        paused: ["active", "cancelled"],
        completed: [],
        failed: ["active", "cancelled"],
        cancelled: [],
      };

      if (!validTransitions[agent.status].includes(body.status)) {
        res.status(400).json({
          success: false,
          error: `Cannot transition from ${agent.status} to ${body.status}`,
        });
        return;
      }

      agent.status = body.status;
    }

    // Update config if provided
    if (body.config && agent.config.dca) {
      if (body.config.maxSlippage !== undefined) {
        agent.config.dca.maxSlippage = body.config.maxSlippage;
      }
      if (body.config.feeTier !== undefined) {
        agent.config.dca.feeTier = body.config.feeTier;
      }
      if (body.config.intervalSeconds !== undefined) {
        agent.config.dca.intervalSeconds = body.config.intervalSeconds;
      }
    }

    await agent.save();

    res.json({
      success: true,
      agent: {
        id: agent._id,
        status: agent.status,
        name: agent.name,
        config: agent.config,
      },
    });
  } catch (error) {
    console.error("Error updating agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update agent",
    });
  }
});

// ============================================
// DELETE /agents/:id - Delete/cancel an agent
// ============================================
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: "Agent not found",
      });
      return;
    }

    // Soft delete - mark as cancelled
    agent.status = "cancelled";
    await agent.save();

    res.json({
      success: true,
      message: "Agent cancelled",
    });
  } catch (error) {
    console.error("Error deleting agent:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete agent",
    });
  }
});

// ============================================
// POST /agents/:id/log - Add execution log entry
// ============================================
router.post("/:id/log", async (req: Request, res: Response) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: "Agent not found",
      });
      return;
    }

    const { success, txHash, amountIn, amountOut, error } = req.body;

    // Add log entry
    agent.executionLogs.push({
      timestamp: new Date(),
      status: success ? "success" : "failed",
      txHash,
      amountIn,
      amountOut,
      error,
    });

    // Update execution metadata
    agent.lastExecution = new Date();
    agent.executionCount += 1;

    // For DCA agents, schedule next execution
    if (agent.agentType === "dca" && agent.config.dca && success) {
      const intervalMs = agent.config.dca.intervalSeconds * 1000;
      agent.nextExecution = new Date(Date.now() + intervalMs);

      // Check if max executions reached
      if (agent.maxExecutions && agent.executionCount >= agent.maxExecutions) {
        agent.status = "completed";
      }
    }

    // For limit orders, mark as completed after successful execution (one-time order)
    if (agent.agentType === "limit-order" && success) {
      agent.status = "completed";
    }

    // For savings agents, schedule next execution and track total supplied
    if (agent.agentType === "savings" && agent.config.savings && success) {
      const intervalMs = agent.config.savings.intervalSeconds * 1000;
      agent.nextExecution = new Date(Date.now() + intervalMs);

      // Update total supplied
      const currentTotal = BigInt(agent.config.savings.totalSupplied || "0");
      const amountSupplied = BigInt(amountIn || "0");
      agent.config.savings.totalSupplied = (currentTotal + amountSupplied).toString();

      // Check if max executions reached
      if (agent.maxExecutions && agent.executionCount >= agent.maxExecutions) {
        agent.status = "completed";
      }
    }

    // For recurring payment agents, schedule next execution and track total paid
    if (agent.agentType === "recurring-payment" && agent.config.recurringPayment && success) {
      const intervalMs = agent.config.recurringPayment.intervalSeconds * 1000;
      agent.nextExecution = new Date(Date.now() + intervalMs);

      // Update total paid
      const currentTotal = BigInt(agent.config.recurringPayment.totalPaid || "0");
      const amountPaid = BigInt(amountIn || "0");
      agent.config.recurringPayment.totalPaid = (currentTotal + amountPaid).toString();

      // Check if max executions reached
      if (agent.maxExecutions && agent.executionCount >= agent.maxExecutions) {
        agent.status = "completed";
      }
    }

    await agent.save();

    console.log(`📊 Logged execution for agent ${agent._id}: ${success ? "success" : "failed"}`);

    res.json({
      success: true,
      executionCount: agent.executionCount,
      nextExecution: agent.nextExecution,
    });
  } catch (error) {
    console.error("Error adding log:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add execution log",
    });
  }
});

// ============================================
// POST /agents/:id/execute - Manually trigger execution of an agent
// ============================================
router.post("/:id/execute", async (req: Request, res: Response) => {
  try {
    const agent = await Agent.findById(req.params.id);

    if (!agent) {
      res.status(404).json({
        success: false,
        error: "Agent not found",
      });
      return;
    }

    // Only allow execution of active agents
    if (agent.status !== "active") {
      res.status(400).json({
        success: false,
        error: `Cannot execute agent with status: ${agent.status}. Agent must be active.`,
      });
      return;
    }

    // Determine the appropriate agent service URL based on agent type
    const agentServiceUrl = process.env.AGENT_SERVICE_URL || "http://localhost:3002";

    // Call the agent service to execute
    const executeResponse = await fetch(`${agentServiceUrl}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: agent._id.toString(),
        agentType: agent.agentType,
      }),
    });

    if (!executeResponse.ok) {
      const errorData = await executeResponse.json().catch(() => ({}));
      res.status(500).json({
        success: false,
        error: (errorData as { error?: string }).error || "Failed to trigger agent execution",
      });
      return;
    }

    const result = await executeResponse.json();

    res.json({
      success: true,
      message: "Execution triggered",
      result,
    });
  } catch (error) {
    console.error("Error triggering agent execution:", error);
    res.status(500).json({
      success: false,
      error: "Failed to trigger agent execution",
    });
  }
});

// ============================================
// GET /agents/:id/logs - Get execution logs for an agent
// ============================================
router.get("/:id/logs", async (req: Request, res: Response) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const agent = await Agent.findById(req.params.id).select("executionLogs");

    if (!agent) {
      res.status(404).json({
        success: false,
        error: "Agent not found",
      });
      return;
    }

    // Sort logs by timestamp descending and paginate
    const logs = agent.executionLogs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(Number(offset), Number(offset) + Number(limit));

    res.json({
      success: true,
      total: agent.executionLogs.length,
      logs,
    });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch logs",
    });
  }
});

export default router;
