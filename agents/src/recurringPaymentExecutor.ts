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
import { sepolia } from "viem/chains";
import { ERC20_ABI, BACKEND_URL } from "./config.js";

// RPC URL from environment or default to public Sepolia RPC
const RPC_URL = process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

// ============================================
// Types
// ============================================

interface RecurringPaymentAgent {
  _id: string;
  userAddress: string;
  permissionContext: Hex;
  delegationManager: Address;
  sessionKeyAddress: Address;
  config: {
    recurringPayment: {
      token: Address;
      amount: string;
      recipient: Address;
      intervalSeconds: number;
      totalPaid: string;
    };
  };
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  error?: string;
  amountIn?: string;
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
  const privateKey = process.env.RECURRING_PAYMENT_PRIVATE_KEY as Hex;
  if (!privateKey) {
    throw new Error("RECURRING_PAYMENT_PRIVATE_KEY not set in environment");
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
// Execute Recurring Payment via Delegation
// ============================================

export async function executeRecurringPayment(agent: RecurringPaymentAgent): Promise<ExecutionResult> {
  console.log(`\n💳 Executing Recurring Payment for agent ${agent._id}`);
  console.log(`   Token: ${agent.config.recurringPayment.token}`);
  console.log(`   Amount: ${agent.config.recurringPayment.amount}`);
  console.log(`   Recipient: ${agent.config.recurringPayment.recipient}`);

  try {
    const sessionAccount = getSessionAccount();
    console.log(`   Session Account: ${sessionAccount.address}`);

    const walletClient = createWalletClient({
      account: sessionAccount,
      chain: sepolia,
      transport: http(RPC_URL),
    });

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL),
    });

    const { token, amount, recipient } = agent.config.recurringPayment;
    const paymentAmount = BigInt(amount);

    // ============================================
    // Execute transfer via delegation
    // The delegation allows the agent to call transfer on behalf of the user
    // ============================================
    console.log("   📤 Executing payment via delegation...");

    const transferCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [recipient, paymentAmount],
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

    const txHash = await walletClient.sendTransaction({
      to: agent.delegationManager,
      data: redeemCalldata,
      gas: 300000n,
    });

    console.log(`   ✅ Payment TX: ${txHash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log(`   📦 Confirmed in block ${receipt.blockNumber}, Status: ${receipt.status}`);

    if (receipt.status === "success") {
      return {
        success: true,
        txHash,
        amountIn: amount,
      };
    } else {
      return {
        success: false,
        txHash,
        error: "Payment transaction reverted",
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

export async function reportRecurringPaymentExecution(agentId: string, result: ExecutionResult): Promise<void> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/agents/${agentId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: result.success,
        txHash: result.txHash,
        amountIn: result.amountIn,
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
