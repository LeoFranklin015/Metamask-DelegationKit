"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient, usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { useState, useCallback, useEffect } from "react";
import { parseUnits, formatUnits, type Address, type Hex } from "viem";
import {
  requestExecutionPermissions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions";
import { sepolia } from "viem/chains";

// ERC20 ABI for balance check
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

// ============================================
// Constants
// ============================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// Subscription Agent address (reuse DCA agent for now)
const SUBSCRIPTION_AGENT_ADDRESS = "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address;

// Netflix merchant address (where payments go)
const NETFLIX_MERCHANT_ADDRESS = "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address;

// USDC on Sepolia for payments
const USDC = {
  symbol: "USDC",
  name: "USD Coin",
  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
  decimals: 6,
};

// Subscription price
const SUBSCRIPTION_PRICE = "0.2"; // $0.20 per month
const SUBSCRIPTION_INTERVAL = 30 * 24 * 60 * 60; // 30 days in seconds

// ============================================
// Types
// ============================================

interface Subscription {
  _id: string;
  name: string;
  status: string;
  agentType: string;
  nextExecution: string;
  executionCount: number;
  config: {
    recurringPayment?: {
      token: string;
      amount: string;
      recipient: string;
      intervalSeconds: number;
    };
  };
}

// ============================================
// Component
// ============================================

export default function NetflixSubscriptionPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  // Check if on correct chain (Sepolia)
  const isCorrectChain = chainId === sepolia.id;

  // Token balance
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // ============================================
  // Fetch USDC balance
  // ============================================

  useEffect(() => {
    const fetchBalance = async () => {
      if (!address || !publicClient || !isCorrectChain) {
        setUsdcBalance(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const balance = await publicClient.readContract({
          address: USDC.address,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [address],
        });
        setUsdcBalance(formatUnits(balance, USDC.decimals));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setUsdcBalance(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [address, publicClient, isCorrectChain]);

  // ============================================
  // Subscribe to Netflix
  // ============================================

  const subscribe = useCallback(async () => {
    if (!walletClient || !address) {
      addLog("Wallet not connected");
      return;
    }

    setIsLoading(true);
    addLog("Starting Netflix subscription...");
    addLog(`Monthly fee: $${SUBSCRIPTION_PRICE} USDC`);

    try {
      const amountInWei = parseUnits(SUBSCRIPTION_PRICE, USDC.decimals);

      // Permission expires in 1 year
      const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

      addLog("Requesting payment permission...");
      addLog(`Delegating to Agent: ${SUBSCRIPTION_AGENT_ADDRESS}`);

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: sepolia.id,
          expiry,
          signer: {
            type: "account",
            data: {
              address: SUBSCRIPTION_AGENT_ADDRESS,
            },
          },
          permission: {
            type: "erc20-token-periodic",
            data: {
              tokenAddress: USDC.address,
              periodAmount: amountInWei,
              periodDuration: SUBSCRIPTION_INTERVAL,
            },
          },
          isAdjustmentAllowed: true,
        },
      ];

      const permissions = await requestExecutionPermissions(
        walletClient as Parameters<typeof requestExecutionPermissions>[0],
        permissionParams
      );

      const granted = permissions as Array<{
        context: Hex;
        signerMeta: { delegationManager: Address };
      }>;

      const permissionContext = granted[0].context;
      const delegationManager = granted[0].signerMeta.delegationManager;

      addLog("Permission granted!");
      addLog(`Context: ${permissionContext.slice(0, 30)}...`);

      // Create subscription in backend
      addLog("Creating subscription...");

      const payload = {
        userAddress: address,
        name: "Netflix Subscription",
        permissionContext,
        delegationManager,
        sessionKeyAddress: SUBSCRIPTION_AGENT_ADDRESS,
        config: {
          token: USDC.address,
          amount: amountInWei.toString(),
          recipient: NETFLIX_MERCHANT_ADDRESS,
          intervalSeconds: SUBSCRIPTION_INTERVAL,
        },
      };

      const response = await fetch(`${BACKEND_URL}/api/agents/recurring-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create subscription");
      }

      addLog(`Subscription active! ID: ${data.agent.id}`);
      addLog("You will be charged $0.20 USDC monthly");

      fetchSubscriptions();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`Error: ${msg}`);

      if (msg.includes("User rejected")) {
        addLog("User rejected the permission request");
      }
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, addLog]);

  // ============================================
  // Fetch User's Subscriptions
  // ============================================

  const fetchSubscriptions = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/agents?userAddress=${address}&agentType=recurring-payment`
      );
      const data = await response.json();

      if (data.success) {
        setSubscriptions(data.agents);
        // Check if there's an active Netflix subscription
        const activeNetflix = data.agents.find(
          (s: Subscription) => s.status === "active" && s.name === "Netflix Subscription"
        );
        setHasActiveSubscription(!!activeNetflix);
      }
    } catch (error) {
      console.error("Failed to fetch subscriptions:", error);
    }
  }, [address]);

  // ============================================
  // Cancel Subscription
  // ============================================

  const cancelSubscription = async (subscriptionId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/agents/${subscriptionId}`, {
        method: "DELETE",
      });
      addLog(`Subscription cancelled`);
      fetchSubscriptions();
    } catch (error) {
      addLog(`Failed to cancel subscription: ${error}`);
    }
  };

  // ============================================
  // Effects
  // ============================================

  useEffect(() => {
    if (isConnected && address) {
      fetchSubscriptions();
    }
  }, [isConnected, address, fetchSubscriptions]);

  // ============================================
  // Render
  // ============================================

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-red-900/20 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Netflix Subscription</h1>
            <p className="text-gray-400 text-sm">
              Automated monthly payments via MetaMask delegation
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Netflix Card */}
        <div className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-8 mb-6 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div className="text-4xl font-bold tracking-tight">NETFLIX</div>
            <div className="bg-white/20 px-3 py-1 rounded-full text-sm">
              Premium
            </div>
          </div>

          <div className="mb-6">
            <p className="text-red-200 text-sm mb-1">Monthly subscription</p>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">$0.20</span>
              <span className="text-red-200">/month</span>
            </div>
          </div>

          <div className="space-y-2 text-sm text-red-100 mb-6">
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Unlimited movies & TV shows</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Watch on any device</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Cancel anytime</span>
            </div>
            <div className="flex items-center gap-2">
              <span>✓</span>
              <span>Paid automatically via USDC</span>
            </div>
          </div>

          {isConnected && isCorrectChain && (
            <div className="bg-black/20 rounded-lg p-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-red-200">Your USDC Balance:</span>
                <span className="font-mono">
                  {isLoadingBalance ? (
                    "Loading..."
                  ) : usdcBalance !== null ? (
                    `${parseFloat(usdcBalance).toFixed(2)} USDC`
                  ) : (
                    "--"
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Wrong Chain Warning */}
        {isConnected && !isCorrectChain && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-orange-400">Wrong Network</h3>
                <p className="text-sm text-orange-200">
                  Please switch to Sepolia to subscribe
                </p>
              </div>
              <button
                onClick={() => switchChain({ chainId: sepolia.id })}
                disabled={isSwitchingChain}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                {isSwitchingChain ? "Switching..." : "Switch to Sepolia"}
              </button>
            </div>
          </div>
        )}

        {isConnected && isCorrectChain ? (
          <div className="space-y-6">
            {/* Subscribe Button */}
            {!hasActiveSubscription ? (
              <button
                onClick={subscribe}
                disabled={isLoading}
                className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-xl font-bold text-lg transition-colors"
              >
                {isLoading ? "Processing..." : "Subscribe Now - $0.20/month"}
              </button>
            ) : (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-center">
                <p className="text-green-400 font-semibold">You&apos;re subscribed!</p>
                <p className="text-green-300 text-sm">Your subscription is active</p>
              </div>
            )}

            {/* Active Subscriptions */}
            {subscriptions.length > 0 && (
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <h2 className="text-lg font-semibold mb-4">Your Subscriptions</h2>
                <div className="space-y-3">
                  {subscriptions.map((sub) => (
                    <div
                      key={sub._id}
                      className="p-4 bg-gray-900/50 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{sub.name}</span>
                        <span
                          className={`px-2 py-1 rounded text-xs ${
                            sub.status === "active"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-gray-500/20 text-gray-400"
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <p>Amount: $0.20 USDC/month</p>
                        <p>Payments made: {sub.executionCount}</p>
                        <p>
                          Next payment:{" "}
                          {new Date(sub.nextExecution).toLocaleDateString()}
                        </p>
                      </div>
                      {sub.status === "active" && (
                        <button
                          onClick={() => cancelSubscription(sub._id)}
                          className="mt-3 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs"
                        >
                          Cancel Subscription
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* How it works */}
            <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
              <h2 className="text-lg font-semibold mb-3">How it works</h2>
              <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
                <li>Click &quot;Subscribe Now&quot; and approve the permission</li>
                <li>The agent will charge $0.20 USDC monthly</li>
                <li>Payments are sent to the merchant automatically</li>
                <li>Cancel anytime - no questions asked</li>
              </ol>
              <div className="mt-4 p-3 bg-gray-900/50 rounded-lg text-xs text-gray-400">
                <p>Agent: <code>{SUBSCRIPTION_AGENT_ADDRESS}</code></p>
                <p className="mt-1">Payment Token: USDC on Sepolia</p>
              </div>
            </div>

            {/* Logs */}
            <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Activity Log</h2>
                <button
                  onClick={() => setLogs([])}
                  className="text-xs text-gray-400 hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black/50 rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500">No activity yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <p key={i} className="text-gray-300 mb-1">
                      {log}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : !isConnected ? (
          <div className="bg-gray-800/80 rounded-2xl p-12 text-center border border-gray-700/50">
            <div className="text-6xl mb-4">🎬</div>
            <p className="text-gray-400 mb-6">
              Connect your wallet to subscribe to Netflix
            </p>
            <ConnectButton />
          </div>
        ) : null}
      </div>
    </main>
  );
}
