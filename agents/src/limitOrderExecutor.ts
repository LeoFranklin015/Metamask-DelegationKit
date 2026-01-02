import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  encodePacked,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, ERC20_ABI, BACKEND_URL, UNISWAP, SWAP_ROUTER_ABI, QUOTER_V2_ABI } from "./config.js";

// ============================================
// Types
// ============================================

interface LimitOrderAgent {
  _id: string;
  userAddress: string;
  permissionContext: Hex;
  delegationManager: Address;
  sessionKeyAddress: Address;
  config: {
    limitOrder: {
      tokenIn: Address;
      tokenOut: Address;
      amountIn: string;
      targetPrice: string;
      direction: "buy" | "sell";
      feeTier: number;
      expiryTimestamp: number;
    };
  };
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  amountIn?: string;
  amountOut?: string;
  priceAtExecution?: string;
}

interface PriceCheckResult {
  shouldExecute: boolean;
  currentPrice: string;
  targetPrice: string;
  reason?: string;
}

// ============================================
// DelegationManager ABI for redeemDelegations
// ============================================

const DELEGATION_MANAGER_ABI = [
  {
    name: "redeemDelegations",
    type: "function",
    inputs: [
      { name: "permissionContexts", type: "bytes[]" },
      { name: "modes", type: "bytes32[]" },
      { name: "executionCallDatas", type: "bytes[]" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

const SINGLE_DEFAULT_MODE = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

// ============================================
// Get Session Account from Private Key
// ============================================

function getSessionAccount() {
  const privateKey = process.env.DCA_PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error("DCA_PRIVATE_KEY not set in environment");
  }
  return privateKeyToAccount(privateKey);
}

// ============================================
// Encode single execution calldata (packed encoding)
// ============================================

function encodeSingleExecution(execution: { target: Address; value: bigint; callData: Hex }): Hex {
  return encodePacked(
    ["address", "uint256", "bytes"],
    [execution.target, execution.value, execution.callData]
  );
}

// ============================================
// Get Current Price from Uniswap Quoter
// ============================================

async function getCurrentPrice(
  tokenIn: Address,
  tokenOut: Address,
  feeTier: number,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<{ price: number; amountOut: bigint }> {
  // Use 1 token as reference for price
  const decimalsIn = await publicClient.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  const oneToken = BigInt(10 ** decimalsIn);

  try {
    // Simulate the quote call
    const result = await publicClient.simulateContract({
      address: UNISWAP.QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn: oneToken,
          fee: feeTier,
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const amountOut = result.result[0];
    const decimalsOut = await publicClient.readContract({
      address: tokenOut,
      abi: ERC20_ABI,
      functionName: "decimals",
    });

    // Price = amountOut / amountIn (normalized by decimals)
    const price = Number(formatUnits(amountOut, decimalsOut)) / Number(formatUnits(oneToken, decimalsIn));

    return { price, amountOut };
  } catch (error) {
    console.error("Error getting price from quoter:", error);
    throw error;
  }
}

// ============================================
// Check if price target is met
// ============================================

export async function checkPriceTarget(agent: LimitOrderAgent): Promise<PriceCheckResult> {
  console.log(`\n📊 Checking price for limit order ${agent._id}`);

  const publicClient = createPublicClient({
    chain: CHAIN,
    transport: http("https://eth-sepolia.g.alchemy.com/v2/Ofk6JzIo12fA2DpAck3Zq"),
  });

  const { tokenIn, tokenOut, targetPrice, direction, feeTier, expiryTimestamp } = agent.config.limitOrder;

  // Check if order has expired
  if (Date.now() / 1000 > expiryTimestamp) {
    return {
      shouldExecute: false,
      currentPrice: "N/A",
      targetPrice,
      reason: "Order expired",
    };
  }

  try {
    const { price: currentPrice } = await getCurrentPrice(tokenIn, tokenOut, feeTier, publicClient);

    console.log(`   Current price: ${currentPrice.toFixed(8)} ${tokenOut}/${tokenIn}`);
    console.log(`   Target price: ${targetPrice} ${tokenOut}/${tokenIn}`);
    console.log(`   Direction: ${direction}`);

    const target = parseFloat(targetPrice);

    // For "buy" orders: execute when price drops to or below target
    // For "sell" orders: execute when price rises to or above target
    const shouldExecute = direction === "buy"
      ? currentPrice >= target  // Buy when you get MORE tokenOut per tokenIn
      : currentPrice >= target; // Sell when price is above target

    if (shouldExecute) {
      console.log(`   ✅ Price target met! Will execute.`);
    } else {
      console.log(`   ⏳ Price target not met yet.`);
    }

    return {
      shouldExecute,
      currentPrice: currentPrice.toFixed(8),
      targetPrice,
      reason: shouldExecute ? "Price target reached" : "Waiting for target price",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Error checking price: ${msg}`);
    return {
      shouldExecute: false,
      currentPrice: "Error",
      targetPrice,
      reason: `Price check failed: ${msg}`,
    };
  }
}

// ============================================
// Execute Limit Order
// ============================================

export async function executeLimitOrder(agent: LimitOrderAgent): Promise<ExecutionResult> {
  console.log(`\n🎯 Executing Limit Order for agent ${agent._id}`);
  console.log(`   ${agent.config.limitOrder.tokenIn} → ${agent.config.limitOrder.tokenOut}`);
  console.log(`   Amount: ${agent.config.limitOrder.amountIn}`);

  try {
    const sessionAccount = getSessionAccount();
    console.log(`   Session Account: ${sessionAccount.address}`);

    const walletClient = createWalletClient({
      account: sessionAccount,
      chain: CHAIN,
      transport: http("https://eth-sepolia.g.alchemy.com/v2/Ofk6JzIo12fA2DpAck3Zq"),
    });

    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http("https://eth-sepolia.g.alchemy.com/v2/Ofk6JzIo12fA2DpAck3Zq"),
    });

    const { tokenIn, tokenOut, amountIn, feeTier } = agent.config.limitOrder;
    const amount = BigInt(amountIn);

    // ============================================
    // Step 1: Transfer tokens from user to agent via delegation
    // ============================================
    console.log("   📤 Step 1: Transferring tokens from user via delegation...");

    const transferCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [sessionAccount.address, amount],
    });

    const execution = {
      target: tokenIn,
      value: 0n,
      callData: transferCalldata,
    };

    const executionCalldata = encodeSingleExecution(execution);

    const redeemCalldata = encodeFunctionData({
      abi: DELEGATION_MANAGER_ABI,
      functionName: "redeemDelegations",
      args: [
        [agent.permissionContext],
        [SINGLE_DEFAULT_MODE],
        [executionCalldata],
      ],
    });

    const transferTxHash = await walletClient.sendTransaction({
      to: agent.delegationManager,
      data: redeemCalldata,
      gas: 500000n,
    });

    console.log(`   ✅ Transfer TX: ${transferTxHash}`);

    const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferTxHash });
    if (transferReceipt.status !== "success") {
      return {
        success: false,
        txHash: transferTxHash,
        error: "Transfer via delegation failed",
      };
    }
    console.log(`   📦 Transfer confirmed in block ${transferReceipt.blockNumber}`);

    // ============================================
    // Step 2: Approve Uniswap router to spend tokens
    // ============================================
    console.log("   📝 Step 2: Approving Uniswap router...");

    const approveCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [UNISWAP.SWAP_ROUTER, amount],
    });

    const approveTxHash = await walletClient.sendTransaction({
      to: tokenIn,
      data: approveCalldata,
      gas: 100000n,
    });

    console.log(`   ✅ Approve TX: ${approveTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    // ============================================
    // Step 3: Execute swap on Uniswap
    // ============================================
    console.log("   🔄 Step 3: Executing Uniswap swap...");

    const swapCalldata = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee: feeTier,
          recipient: agent.userAddress as Address,
          amountIn: amount,
          amountOutMinimum: 0n, // In production, calculate based on target price
          sqrtPriceLimitX96: 0n,
        },
      ],
    });

    const swapTxHash = await walletClient.sendTransaction({
      to: UNISWAP.SWAP_ROUTER,
      data: swapCalldata,
      gas: 500000n,
    });

    console.log(`   ✅ Swap TX: ${swapTxHash}`);

    const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapTxHash });
    console.log(`   📦 Swap confirmed in block ${swapReceipt.blockNumber}, Status: ${swapReceipt.status}`);

    if (swapReceipt.status === "success") {
      return {
        success: true,
        txHash: swapTxHash,
        amountIn,
      };
    } else {
      return {
        success: false,
        txHash: swapTxHash,
        error: "Swap transaction reverted",
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Execution error: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Report execution result to backend
// ============================================

export async function reportLimitOrderExecution(agentId: string, result: ExecutionResult): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/agents/${agentId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: result.success,
        txHash: result.txHash,
        amountIn: result.amountIn,
        amountOut: result.amountOut,
        error: result.error,
      }),
    });

    if (!response.ok) {
      console.error(`Failed to report execution: ${response.statusText}`);
    } else {
      console.log(`   📊 Reported to backend`);
    }
  } catch (error) {
    console.error(`Failed to report execution: ${error}`);
  }
}

// ============================================
// Update agent status after execution
// ============================================

export async function markOrderCompleted(agentId: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    console.log(`   ✅ Order marked as completed`);
  } catch (error) {
    console.error(`Failed to mark order as completed: ${error}`);
  }
}

export async function markOrderExpired(agentId: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    console.log(`   ⏰ Order marked as expired`);
  } catch (error) {
    console.error(`Failed to mark order as expired: ${error}`);
  }
}
