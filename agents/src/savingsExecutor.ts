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
import { baseSepolia } from "viem/chains";
import { ERC20_ABI, BACKEND_URL } from "./config.js";

// ============================================
// Types
// ============================================

interface SavingsAgent {
  _id: string;
  userAddress: string;
  permissionContext: Hex;
  delegationManager: Address;
  sessionKeyAddress: Address;
  config: {
    savings: {
      token: Address;
      amountPerExecution: string;
      intervalSeconds: number;
      protocol: "aave-v3";
      totalSupplied: string;
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
// Aave V3 Base Sepolia Addresses
// ============================================

const AAVE_V3 = {
  POOL: "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as Address,
  POOL_ADDRESSES_PROVIDER: "0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00" as Address,
};

// Aave V3 Pool ABI (supply function)
const AAVE_POOL_ABI = [
  {
    name: "supply",
    type: "function",
    inputs: [
      { name: "asset", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "onBehalfOf", type: "address" },
      { name: "referralCode", type: "uint16" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

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
  const privateKey = process.env.SAVINGS_PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error("SAVINGS_PRIVATE_KEY not set in environment");
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
// Execute Savings Supply to Aave V3
// ============================================

export async function executeSavingsSupply(agent: SavingsAgent): Promise<ExecutionResult> {
  console.log(`\n💰 Executing Savings Supply for agent ${agent._id}`);
  console.log(`   Token: ${agent.config.savings.token}`);
  console.log(`   Amount: ${agent.config.savings.amountPerExecution}`);

  try {
    const sessionAccount = getSessionAccount();
    console.log(`   Session Account: ${sessionAccount.address}`);

    const walletClient = createWalletClient({
      account: sessionAccount,
      chain: baseSepolia,
      transport: http("https://sepolia.base.org"),
    });

    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http("https://sepolia.base.org"),
    });

    const { token, amountPerExecution } = agent.config.savings;
    const amount = BigInt(amountPerExecution);

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
      target: token,
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
    // Step 2: Approve Aave Pool to spend tokens
    // ============================================
    console.log("   📝 Step 2: Approving Aave Pool...");

    const approveCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [AAVE_V3.POOL, amount],
    });

    const approveTxHash = await walletClient.sendTransaction({
      to: token,
      data: approveCalldata,
      gas: 100000n,
    });

    console.log(`   ✅ Approve TX: ${approveTxHash}`);
    await publicClient.waitForTransactionReceipt({ hash: approveTxHash });

    // ============================================
    // Step 3: Supply to Aave V3 Pool
    // ============================================
    console.log("   🏦 Step 3: Supplying to Aave V3...");

    const supplyCalldata = encodeFunctionData({
      abi: AAVE_POOL_ABI,
      functionName: "supply",
      args: [
        token,                        // asset
        amount,                       // amount
        agent.userAddress as Address, // onBehalfOf (user receives aTokens)
        0,                            // referralCode
      ],
    });

    const supplyTxHash = await walletClient.sendTransaction({
      to: AAVE_V3.POOL,
      data: supplyCalldata,
      gas: 500000n,
    });

    console.log(`   ✅ Supply TX: ${supplyTxHash}`);

    const supplyReceipt = await publicClient.waitForTransactionReceipt({ hash: supplyTxHash });
    console.log(`   📦 Supply confirmed in block ${supplyReceipt.blockNumber}, Status: ${supplyReceipt.status}`);

    if (supplyReceipt.status === "success") {
      return {
        success: true,
        txHash: supplyTxHash,
        amountIn: amountPerExecution,
      };
    } else {
      return {
        success: false,
        txHash: supplyTxHash,
        error: "Supply transaction reverted",
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

export async function reportSavingsExecution(agentId: string, result: ExecutionResult): Promise<void> {
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
