import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { IAgent } from "../models/Agent.js";
import {
  UNISWAP,
  SWAP_ROUTER_ABI,
  QUOTER_V2_ABI,
  ERC20_ABI,
  TOKEN_DECIMALS,
} from "../config/constants.js";

// ============================================
// Types
// ============================================

export interface ExecutionResult {
  success: boolean;
  txHash?: string;
  amountIn?: string;
  amountOut?: string;
  error?: string;
}

// ============================================
// Create Viem Clients
// ============================================

const rpcUrl = process.env.RPC_URL || "https://sepolia.drpc.org";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});

function getWalletClient() {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("AGENT_PRIVATE_KEY not set in environment");
  }

  const account = privateKeyToAccount(privateKey as Hex);

  return createWalletClient({
    account,
    chain: sepolia,
    transport: http(rpcUrl),
  });
}

// ============================================
// Get Quote from Uniswap
// ============================================

async function getQuote(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  feeTier: number
): Promise<bigint> {
  try {
    const { result } = await publicClient.simulateContract({
      address: UNISWAP.QUOTER_V2,
      abi: QUOTER_V2_ABI,
      functionName: "quoteExactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          amountIn,
          fee: feeTier,
          sqrtPriceLimitX96: BigInt(0),
        },
      ],
    });

    return result[0];
  } catch (error) {
    console.error("Quote error:", error);
    throw new Error("Failed to get quote from Uniswap");
  }
}

// ============================================
// Check Token Balance
// ============================================

async function checkBalance(tokenAddress: Address, userAddress: Address): Promise<bigint> {
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [userAddress],
  });

  return balance;
}

// ============================================
// Execute DCA Swap
// ============================================

export async function executeDCAAgent(agent: IAgent): Promise<ExecutionResult> {
  const startTime = Date.now();
  console.log(`\n🚀 Executing DCA agent: ${agent._id}`);
  console.log(`   User: ${agent.userAddress}`);

  const dcaConfig = agent.config.dca;
  if (!dcaConfig) {
    return { success: false, error: "No DCA config found" };
  }

  try {
    const tokenIn = dcaConfig.tokenIn as Address;
    const tokenOut = dcaConfig.tokenOut as Address;
    const amountIn = BigInt(dcaConfig.amountPerExecution);
    const feeTier = dcaConfig.feeTier;
    const maxSlippage = dcaConfig.maxSlippage;

    console.log(`   Token In: ${tokenIn}`);
    console.log(`   Token Out: ${tokenOut}`);
    console.log(`   Amount: ${formatUnits(amountIn, TOKEN_DECIMALS[tokenIn] || 18)}`);

    // Step 1: Get quote
    console.log("   📊 Getting quote...");
    const expectedOut = await getQuote(tokenIn, tokenOut, amountIn, feeTier);
    const minAmountOut = (expectedOut * BigInt(Math.floor((100 - maxSlippage) * 100))) / BigInt(10000);

    console.log(`   Expected out: ${formatUnits(expectedOut, TOKEN_DECIMALS[tokenOut] || 18)}`);
    console.log(`   Min out (${maxSlippage}% slippage): ${formatUnits(minAmountOut, TOKEN_DECIMALS[tokenOut] || 18)}`);

    // Step 2: Check user balance
    console.log("   💰 Checking user balance...");
    const userBalance = await checkBalance(tokenIn, agent.userAddress as Address);
    if (userBalance < amountIn) {
      throw new Error(`Insufficient balance: ${formatUnits(userBalance, TOKEN_DECIMALS[tokenIn] || 18)} < ${formatUnits(amountIn, TOKEN_DECIMALS[tokenIn] || 18)}`);
    }

    // Step 3: Execute swap using delegation
    // For now, this is a simplified version. In production, you'd use the
    // delegation/permission context to execute on behalf of the user.
    console.log("   🔄 Executing swap...");

    // Build swap calldata
    const swapData = encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [
        {
          tokenIn,
          tokenOut,
          fee: feeTier,
          recipient: agent.userAddress as Address,
          amountIn,
          amountOutMinimum: minAmountOut,
          sqrtPriceLimitX96: BigInt(0),
        },
      ],
    });

    // In a real implementation with delegation:
    // 1. Use the permissionContext and delegationManager
    // 2. Create a UserOperation with the delegation
    // 3. Send via bundler
    //
    // For testing/demo, we'll simulate success:

    const walletClient = getWalletClient();

    // NOTE: This is where you would use the MetaMask delegation SDK
    // to execute the swap using the granted permissions.
    // For now, we're doing a direct swap from the agent wallet as a demo.

    // In production with delegation:
    // const bundlerClient = createBundlerClient({...}).extend(erc7710BundlerActions());
    // const userOpHash = await bundlerClient.sendUserOperationWithDelegation({
    //   account: smartAccount,
    //   calls: [{
    //     to: UNISWAP.SWAP_ROUTER,
    //     data: swapData,
    //     permissionsContext: agent.permissionContext,
    //     delegationManager: agent.delegationManager,
    //   }],
    // });

    // DEMO: Direct execution (would need agent to have funds)
    // In production, remove this and use delegation instead
    console.log("   ⚠️ Demo mode: Simulating execution");
    console.log(`   Permission Context: ${agent.permissionContext.slice(0, 20)}...`);
    console.log(`   Delegation Manager: ${agent.delegationManager}`);

    // For demo purposes, we'll just log what would happen
    // and return a simulated success
    const simulatedTxHash = `0x${Date.now().toString(16)}${"0".repeat(48)}`;

    // Update agent state
    const intervalMs = dcaConfig.intervalSeconds * 1000;
    agent.lastExecution = new Date();
    agent.nextExecution = new Date(Date.now() + intervalMs);
    agent.executionCount += 1;

    // Add execution log
    agent.executionLogs.push({
      timestamp: new Date(),
      status: "success",
      txHash: simulatedTxHash,
      amountIn: amountIn.toString(),
      amountOut: expectedOut.toString(),
    });

    // Check if max executions reached
    if (agent.maxExecutions && agent.executionCount >= agent.maxExecutions) {
      agent.status = "completed";
      console.log("   ✅ Agent completed (max executions reached)");
    }

    await agent.save();

    const duration = Date.now() - startTime;
    console.log(`   ✅ Execution complete in ${duration}ms`);
    console.log(`   Next execution: ${agent.nextExecution.toISOString()}`);

    return {
      success: true,
      txHash: simulatedTxHash,
      amountIn: amountIn.toString(),
      amountOut: expectedOut.toString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`   ❌ Execution failed: ${errorMessage}`);

    // Log the failure
    agent.executionLogs.push({
      timestamp: new Date(),
      status: "failed",
      error: errorMessage,
    });

    // Don't update nextExecution on failure - retry at same time
    // Optionally: implement exponential backoff

    // Mark as failed after too many failures
    const recentFailures = agent.executionLogs
      .slice(-5)
      .filter((log) => log.status === "failed").length;

    if (recentFailures >= 5) {
      agent.status = "failed";
      console.log("   ⛔ Agent marked as failed (too many consecutive failures)");
    }

    await agent.save();

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Execute with Real Delegation (Production)
// ============================================

// This would be the production implementation using MetaMask delegation
export async function executeDCAWithDelegation(agent: IAgent): Promise<ExecutionResult> {
  // This requires:
  // 1. @metamask/smart-accounts-kit
  // 2. Session key that matches sessionKeyAddress
  // 3. Bundler endpoint
  //
  // Example implementation:
  //
  // const sessionAccount = privateKeyToAccount(process.env.SESSION_PRIVATE_KEY);
  // const smartAccount = await toMetaMaskSmartAccount({
  //   client: publicClient,
  //   implementation: Implementation.Hybrid,
  //   signer: { account: sessionAccount },
  // });
  //
  // const bundlerClient = createBundlerClient({
  //   client: publicClient,
  //   transport: http(process.env.BUNDLER_URL),
  //   paymaster: true,
  // }).extend(erc7710BundlerActions());
  //
  // const userOpHash = await bundlerClient.sendUserOperationWithDelegation({
  //   account: smartAccount,
  //   calls: [{
  //     to: UNISWAP.SWAP_ROUTER,
  //     data: swapData,
  //     permissionsContext: agent.permissionContext,
  //     delegationManager: agent.delegationManager,
  //   }],
  // });
  //
  // const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });

  throw new Error("Delegation execution not yet implemented - use executeDCAAgent for demo");
}
