import { Router, Request, Response } from "express";
import { Agent, AgentStatus } from "../models/Agent.js";

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

    // Calculate first execution time based on interval
    const intervalMs = body.config.intervalSeconds * 1000;
    const nextExecution = new Date(Date.now() + intervalMs);

    const agent = new Agent({
      userAddress: body.userAddress.toLowerCase(),
      agentType: "dca",
      name: body.name || `DCA Agent`,
      permissionContext: body.permissionContext,
      delegationManager: body.delegationManager,
      sessionKeyAddress: body.sessionKeyAddress.toLowerCase(),
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
