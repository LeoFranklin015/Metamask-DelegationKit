import "dotenv/config";
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  encodePacked,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN, ERC20_ABI, BACKEND_URL, UNISWAP, SWAP_ROUTER_ABI } from "./config.js";
import dotenv from "dotenv";
dotenv.config();

// ============================================
// Types
// ============================================

interface Agent {
  _id: string;
  userAddress: string;
  permissionContext: Hex;
  delegationManager: Address;
  sessionKeyAddress: Address;
  config: {
    dca: {
      tokenIn: Address;
      tokenOut: Address;
      amountPerExecution: string;
      intervalSeconds: number;
      maxSlippage: number;
      feeTier: number;
    };
  };
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  amountIn?: string;
  amountOut?: string;
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

// Single execution mode (ModeCode.SingleDefault)
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
// Matches SDK's encodeSingleExecution
// ============================================

function encodeSingleExecution(execution: { target: Address; value: bigint; callData: Hex }): Hex {
  // For single execution, use packed encoding: (address, uint256, bytes)
  return encodePacked(
    ["address", "uint256", "bytes"],
    [execution.target, execution.value, execution.callData]
  );
}

// ============================================
// Execute DCA: Transfer via delegation, then swap via Uniswap
// ============================================

export async function executeDCASwap(agent: Agent): Promise<ExecutionResult> {
  console.log(`\n🔄 Executing DCA for agent ${agent._id}`);
  console.log(`   Token: ${agent.config.dca.tokenIn} → ${agent.config.dca.tokenOut}`);
  console.log(`   Amount: ${agent.config.dca.amountPerExecution}`);

  try {
    const sessionAccount = getSessionAccount();
    console.log(`   Session Account: ${sessionAccount.address}`);

    // Create wallet client WITH the account - this enables signing
    const walletClient = createWalletClient({
      account: sessionAccount,
      chain: CHAIN,
      transport: http("https://eth-sepolia.g.alchemy.com/v2/Ofk6JzIo12fA2DpAck3Zq"),
    });

    // Public client for reading state
    const publicClient = createPublicClient({
      chain: CHAIN,
      transport: http("https://eth-sepolia.g.alchemy.com/v2/Ofk6JzIo12fA2DpAck3Zq"),
    });

    const { tokenIn, tokenOut, amountPerExecution, feeTier } = agent.config.dca;
    const amountIn = BigInt(amountPerExecution);

    // ============================================
    // Step 1: Transfer tokens from user to agent via delegation
    // ============================================
    console.log("   📤 Step 1: Transferring tokens from user via delegation...");

    const transferCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [sessionAccount.address, amountIn],
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
      args: [UNISWAP.SWAP_ROUTER, amountIn],
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
          recipient: agent.userAddress as Address, // Send output tokens back to user
          amountIn,
          amountOutMinimum: 0n, // In production, get a quote first
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
        amountIn: amountPerExecution,
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

export async function reportExecution(agentId: string, result: ExecutionResult): Promise<void> {
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
