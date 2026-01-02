import mongoose, { Document, Schema } from "mongoose";

// Agent types
export type AgentType = "dca" | "limit-order" | "stop-loss" | "recurring-payment";

// Agent status
export type AgentStatus = "active" | "paused" | "completed" | "failed" | "cancelled";

// DCA specific config
export interface DCAConfig {
  tokenIn: string; // Token to spend (e.g., USDC address)
  tokenOut: string; // Token to buy (e.g., WETH address)
  amountPerExecution: string; // Amount in wei/smallest unit
  intervalSeconds: number; // Interval between executions in seconds
  maxSlippage: number; // e.g., 1.0 for 1%
  feeTier: number; // Uniswap fee tier (500, 3000, 10000)
}

// Limit Order specific config
export interface LimitOrderConfig {
  tokenIn: string; // Token to spend
  tokenOut: string; // Token to receive
  amountIn: string; // Amount to swap in wei/smallest unit
  targetPrice: string; // Target price (tokenOut/tokenIn ratio)
  direction: "buy" | "sell"; // buy = execute when price drops, sell = execute when price rises
  feeTier: number; // Uniswap fee tier
  expiryTimestamp: number; // When the order expires
}

// Generic agent config (can be extended for other agent types)
export interface AgentConfig {
  dca?: DCAConfig;
  limitOrder?: LimitOrderConfig;
  // Future: stopLoss?: StopLossConfig;
}

// Execution log entry
export interface ExecutionLog {
  timestamp: Date;
  status: "success" | "failed" | "pending";
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
  gasUsed?: string;
}

// Main Agent document interface
export interface IAgent extends Document {
  // Identification
  userAddress: string; // User's wallet address
  agentType: AgentType;
  name: string; // User-friendly name

  // Permission data from MetaMask delegation
  permissionContext: string; // The delegation context (hex)
  delegationManager: string; // Delegation manager contract address
  sessionKeyAddress: string; // The session key that can execute

  // Configuration
  config: AgentConfig;

  // Scheduling
  nextExecution: Date;
  lastExecution?: Date;
  executionCount: number;
  maxExecutions?: number; // Optional limit

  // Status
  status: AgentStatus;

  // Execution history
  executionLogs: ExecutionLog[];

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

// Execution log schema
const ExecutionLogSchema = new Schema<ExecutionLog>({
  timestamp: { type: Date, required: true },
  status: { type: String, enum: ["success", "failed", "pending"], required: true },
  txHash: { type: String },
  amountIn: { type: String },
  amountOut: { type: String },
  error: { type: String },
  gasUsed: { type: String },
});

// DCA config schema
const DCAConfigSchema = new Schema<DCAConfig>({
  tokenIn: { type: String, required: true },
  tokenOut: { type: String, required: true },
  amountPerExecution: { type: String, required: true },
  intervalSeconds: { type: Number, required: true },
  maxSlippage: { type: Number, default: 1.0 },
  feeTier: { type: Number, default: 3000 },
});

// Limit Order config schema
const LimitOrderConfigSchema = new Schema<LimitOrderConfig>({
  tokenIn: { type: String, required: true },
  tokenOut: { type: String, required: true },
  amountIn: { type: String, required: true },
  targetPrice: { type: String, required: true },
  direction: { type: String, enum: ["buy", "sell"], required: true },
  feeTier: { type: Number, default: 3000 },
  expiryTimestamp: { type: Number, required: true },
});

// Agent config schema
const AgentConfigSchema = new Schema<AgentConfig>({
  dca: { type: DCAConfigSchema },
  limitOrder: { type: LimitOrderConfigSchema },
});

// Main Agent schema
const AgentSchema = new Schema<IAgent>(
  {
    userAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true
    },
    agentType: {
      type: String,
      enum: ["dca", "limit-order", "stop-loss", "recurring-payment"],
      required: true
    },
    name: {
      type: String,
      required: true
    },

    // Permission data
    permissionContext: {
      type: String,
      required: true
    },
    delegationManager: {
      type: String,
      required: true
    },
    sessionKeyAddress: {
      type: String,
      required: true,
      lowercase: true
    },

    // Configuration
    config: {
      type: AgentConfigSchema,
      required: true
    },

    // Scheduling
    nextExecution: {
      type: Date,
      required: true,
      index: true
    },
    lastExecution: {
      type: Date
    },
    executionCount: {
      type: Number,
      default: 0
    },
    maxExecutions: {
      type: Number
    },

    // Status
    status: {
      type: String,
      enum: ["active", "paused", "completed", "failed", "cancelled"],
      default: "active",
      index: true
    },

    // Execution history
    executionLogs: [ExecutionLogSchema],
  },
  {
    timestamps: true,
  }
);

// Compound index for scheduler queries
AgentSchema.index({ status: 1, nextExecution: 1 });

// Index for user queries
AgentSchema.index({ userAddress: 1, status: 1 });

export const Agent = mongoose.model<IAgent>("Agent", AgentSchema);
