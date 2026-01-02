"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient, usePublicClient, useSwitchChain, useChainId } from "wagmi";
import { useState, useCallback, useEffect } from "react";
import { parseUnits, formatUnits, type Address, type Hex } from "viem";
import {
  requestExecutionPermissions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions";
import { baseSepolia } from "viem/chains";

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

// Savings Agent address (on Base Sepolia)
const SAVINGS_AGENT_ADDRESS = "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address;

// Aave V3 Base Sepolia Pool
const AAVE_V3_POOL = "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27" as Address;

// Tokens supported by Aave V3 on Base Sepolia
const AAVE_SUPPORTED_TOKENS = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" as Address, // Aave's USDC on Base Sepolia
    decimals: 6,
    logo: "💵",
    apy: "~3.5%",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a" as Address, // Aave's USDT on Base Sepolia
    decimals: 6,
    logo: "💲",
    apy: "~3.2%",
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x4200000000000000000000000000000000000006" as Address, // WETH on Base Sepolia
    decimals: 18,
    logo: "⟠",
    apy: "~1.2%",
  },
} as const;

type TokenSymbol = keyof typeof AAVE_SUPPORTED_TOKENS;

// Interval options
const INTERVAL_OPTIONS = [
  { label: "Every minute", seconds: 60 },
  { label: "Every hour", seconds: 3600 },
  { label: "Every day", seconds: 86400 },
  { label: "Every week", seconds: 604800 },
  { label: "Every month", seconds: 2592000 },
];

// ============================================
// Types
// ============================================

interface Agent {
  _id: string;
  name: string;
  status: string;
  agentType: string;
  nextExecution: string;
  executionCount: number;
  config: {
    savings?: {
      token: string;
      amountPerExecution: string;
      intervalSeconds: number;
      totalSupplied: string;
    };
  };
}

// ============================================
// Component
// ============================================

export default function SavingsPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  // Check if on correct chain
  const isCorrectChain = chainId === baseSepolia.id;

  // Form state
  const [agentName, setAgentName] = useState("My Savings Agent");
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [amount, setAmount] = useState("10");
  const [intervalSeconds, setIntervalSeconds] = useState(86400); // Daily
  const [maxExecutions, setMaxExecutions] = useState<number | undefined>(undefined);

  // Token balance
  const [tokenBalance, setTokenBalance] = useState<string | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // ============================================
  // Fetch token balance
  // ============================================

  useEffect(() => {
    const fetchBalance = async () => {
      if (!address || !publicClient) {
        setTokenBalance(null);
        return;
      }

      const tokenData = AAVE_SUPPORTED_TOKENS[token];
      setIsLoadingBalance(true);
      try {
        const balance = await publicClient.readContract({
          address: tokenData.address,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [address],
        });
        setTokenBalance(formatUnits(balance, tokenData.decimals));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setTokenBalance(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [address, token, publicClient]);

  // ============================================
  // Request Permission & Create Agent
  // ============================================

  const requestPermissionsAndCreateAgent = useCallback(async () => {
    if (!walletClient || !address) {
      addLog("Wallet not connected");
      return;
    }

    const tokenData = AAVE_SUPPORTED_TOKENS[token];

    setIsLoading(true);
    addLog("Requesting ERC-20 permission for savings...");
    addLog(`Delegating to Savings Agent: ${SAVINGS_AGENT_ADDRESS}`);

    try {
      const amountInWei = parseUnits(amount, tokenData.decimals);

      // Calculate total permission needed (amount per execution * estimated executions)
      // For recurring, we'll request a larger permission window
      const totalAmount = maxExecutions
        ? amountInWei * BigInt(maxExecutions)
        : amountInWei * 100n; // Default to 100 executions worth

      // Permission expires in 1 year
      const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;

      addLog(`Token: ${tokenData.symbol} (${tokenData.address})`);
      addLog(`Amount per supply: ${amount} ${tokenData.symbol}`);
      addLog(`Interval: ${INTERVAL_OPTIONS.find(i => i.seconds === intervalSeconds)?.label}`);

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: baseSepolia.id,
          expiry,
          signer: {
            type: "account",
            data: {
              address: SAVINGS_AGENT_ADDRESS,
            },
          },
          permission: {
            type: "erc20-token-periodic",
            data: {
              tokenAddress: tokenData.address,
              periodAmount: amountInWei,
              periodDuration: intervalSeconds,
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

      // Create agent in backend
      addLog("Creating savings agent in backend...");

      const payload = {
        userAddress: address,
        name: agentName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: SAVINGS_AGENT_ADDRESS,
        config: {
          token: tokenData.address,
          amountPerExecution: amountInWei.toString(),
          intervalSeconds,
        },
        maxExecutions,
      };

      const response = await fetch(`${BACKEND_URL}/api/agents/savings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create agent");
      }

      addLog(`Savings agent created! ID: ${data.agent.id}`);
      addLog(`Will supply ${amount} ${tokenData.symbol} to Aave V3 every ${INTERVAL_OPTIONS.find(i => i.seconds === intervalSeconds)?.label}`);

      setCreatedAgentId(data.agent.id);
      fetchAgents();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`Error: ${msg}`);

      if (msg.includes("User rejected")) {
        addLog("User rejected the permission request");
      }
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, address, token, amount, intervalSeconds, maxExecutions, agentName, addLog]);

  // ============================================
  // Fetch User's Agents
  // ============================================

  const fetchAgents = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/agents?userAddress=${address}&agentType=savings`
      );
      const data = await response.json();

      if (data.success) {
        setAgents(data.agents);
      }
    } catch (error) {
      console.error("Failed to fetch agents:", error);
    }
  }, [address]);

  // ============================================
  // Agent Actions
  // ============================================

  const pauseAgent = async (agentId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      addLog(`Agent ${agentId} paused`);
      fetchAgents();
    } catch (error) {
      addLog(`Failed to pause agent: ${error}`);
    }
  };

  const resumeAgent = async (agentId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      addLog(`Agent ${agentId} resumed`);
      fetchAgents();
    } catch (error) {
      addLog(`Failed to resume agent: ${error}`);
    }
  };

  const cancelAgent = async (agentId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
        method: "DELETE",
      });
      addLog(`Agent ${agentId} cancelled`);
      fetchAgents();
    } catch (error) {
      addLog(`Failed to cancel agent: ${error}`);
    }
  };

  // Reset form
  const resetForm = () => {
    setCreatedAgentId(null);
    setAgentName("My Savings Agent");
    setAmount("10");
  };

  // Get token symbol from address
  const getTokenSymbol = (addr: string) => {
    for (const [symbol, tokenData] of Object.entries(AAVE_SUPPORTED_TOKENS)) {
      if (tokenData.address.toLowerCase() === addr.toLowerCase()) {
        return symbol;
      }
    }
    return addr.slice(0, 6) + "...";
  };

  // Format interval
  const formatInterval = (seconds: number) => {
    const option = INTERVAL_OPTIONS.find(i => i.seconds === seconds);
    return option?.label || `${seconds}s`;
  };

  // ============================================
  // Effects
  // ============================================

  useEffect(() => {
    if (isConnected && address) {
      fetchAgents();
    }
  }, [isConnected, address, fetchAgents]);

  // ============================================
  // Render
  // ============================================

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900/20 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">🏦 Savings Agent</h1>
            <p className="text-gray-400 text-sm">
              Automatically supply tokens to Aave V3 to earn yield
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Info Banner */}
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-green-400 mb-2">How it works (Base Sepolia)</h3>
          <ol className="text-sm text-green-200 space-y-1 list-decimal list-inside">
            <li>Choose a token and amount to save periodically</li>
            <li>Grant permission - the agent will supply to Aave V3 on Base Sepolia</li>
            <li>Earn yield automatically - aTokens are sent to your wallet</li>
          </ol>
          <p className="text-xs text-green-300 mt-2">
            Agent: <code className="bg-green-900/50 px-1 rounded">{SAVINGS_AGENT_ADDRESS}</code>
          </p>
          <p className="text-xs text-green-300 mt-1">
            Aave Pool (Base Sepolia): <code className="bg-green-900/50 px-1 rounded">{AAVE_V3_POOL}</code>
          </p>
        </div>

        {/* Wrong Chain Warning */}
        {isConnected && !isCorrectChain && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-orange-400">Wrong Network</h3>
                <p className="text-sm text-orange-200">
                  Please switch to Base Sepolia to use the Savings Agent
                </p>
              </div>
              <button
                onClick={() => switchChain({ chainId: baseSepolia.id })}
                disabled={isSwitchingChain}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:bg-orange-600 disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
              >
                {isSwitchingChain ? "Switching..." : "Switch to Base Sepolia"}
              </button>
            </div>
          </div>
        )}

        {isConnected && isCorrectChain ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column - Setup */}
            <div className="space-y-6">
              {/* Configuration */}
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <h2 className="text-lg font-semibold mb-4">Configure Savings</h2>

                <div className="space-y-4">
                  {/* Agent Name */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Agent Name
                    </label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                    />
                  </div>

                  {/* Token Selection */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Token to Save
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(AAVE_SUPPORTED_TOKENS) as TokenSymbol[]).map((sym) => (
                        <button
                          key={sym}
                          onClick={() => setToken(sym)}
                          className={`p-3 rounded-lg text-center transition-colors ${
                            token === sym
                              ? "bg-green-500 text-white"
                              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                          }`}
                        >
                          <div className="text-xl">{AAVE_SUPPORTED_TOKENS[sym].logo}</div>
                          <div className="text-sm font-medium">{sym}</div>
                          <div className="text-xs text-gray-400">{AAVE_SUPPORTED_TOKENS[sym].apy}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm text-gray-400">
                        Amount per supply
                      </label>
                      <div className="text-xs text-gray-400">
                        Balance:{" "}
                        {isLoadingBalance ? (
                          <span className="text-gray-500">Loading...</span>
                        ) : tokenBalance !== null ? (
                          <button
                            onClick={() => setAmount(tokenBalance)}
                            className="text-green-400 hover:text-green-300"
                          >
                            {parseFloat(tokenBalance).toFixed(6)} {AAVE_SUPPORTED_TOKENS[token].symbol}
                          </button>
                        ) : (
                          <span className="text-gray-500">--</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="flex-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                      />
                      <button
                        onClick={() => tokenBalance && setAmount(tokenBalance)}
                        disabled={!tokenBalance}
                        className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-medium transition-colors"
                      >
                        MAX
                      </button>
                      <span className="px-3 py-2 bg-gray-600 rounded-lg">
                        {AAVE_SUPPORTED_TOKENS[token].symbol}
                      </span>
                    </div>
                  </div>

                  {/* Interval */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Supply Frequency
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {INTERVAL_OPTIONS.slice(0, 3).map((option) => (
                        <button
                          key={option.seconds}
                          onClick={() => setIntervalSeconds(option.seconds)}
                          className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                            intervalSeconds === option.seconds
                              ? "bg-green-500 text-white"
                              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {INTERVAL_OPTIONS.slice(3).map((option) => (
                        <button
                          key={option.seconds}
                          onClick={() => setIntervalSeconds(option.seconds)}
                          className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                            intervalSeconds === option.seconds
                              ? "bg-green-500 text-white"
                              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Executions (Optional) */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Max Supplies (optional)
                    </label>
                    <input
                      type="number"
                      value={maxExecutions || ""}
                      onChange={(e) => setMaxExecutions(e.target.value ? parseInt(e.target.value) : undefined)}
                      placeholder="Unlimited"
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-green-500 outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Leave empty for unlimited recurring supplies
                    </p>
                  </div>

                  {/* Summary */}
                  <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-sm text-green-300">
                      Will supply <span className="font-bold">{amount} {AAVE_SUPPORTED_TOKENS[token].symbol}</span> to Aave V3{" "}
                      <span className="font-bold">{INTERVAL_OPTIONS.find(i => i.seconds === intervalSeconds)?.label.toLowerCase()}</span>
                      {maxExecutions ? ` for ${maxExecutions} times` : " indefinitely"}
                    </p>
                  </div>

                  {/* Create Button */}
                  {createdAgentId ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <p className="text-green-400 font-medium">
                          Savings Agent Created!
                        </p>
                        <p className="text-green-300 text-sm mt-1">
                          ID: {createdAgentId}
                        </p>
                      </div>
                      <button
                        onClick={resetForm}
                        className="w-full py-2 bg-green-500 hover:bg-green-400 rounded-lg font-medium transition-colors"
                      >
                        Create Another Agent
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={requestPermissionsAndCreateAgent}
                      disabled={isLoading || !amount || parseFloat(amount) <= 0}
                      className="w-full py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-400 hover:to-emerald-400 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 rounded-lg font-medium transition-colors"
                    >
                      {isLoading ? "Processing..." :
                       !amount || parseFloat(amount) <= 0 ? "Enter amount" :
                       "Grant Permission & Create Agent"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Agents & Logs */}
            <div className="space-y-6">
              {/* Your Agents */}
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Your Savings Agents</h2>
                  <button
                    onClick={fetchAgents}
                    className="text-xs text-green-400 hover:text-green-300"
                  >
                    Refresh
                  </button>
                </div>

                {agents.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No savings agents yet. Create one to start earning yield!
                  </p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {agents.map((agent) => (
                      <div
                        key={agent._id}
                        className="p-3 bg-gray-900/50 rounded-lg"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium">{agent.name}</span>
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              agent.status === "active"
                                ? "bg-green-500/20 text-green-400"
                                : agent.status === "paused"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {agent.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 space-y-1">
                          {agent.config.savings && (
                            <>
                              <p>Token: {getTokenSymbol(agent.config.savings.token)}</p>
                              <p>
                                Amount: {formatUnits(BigInt(agent.config.savings.amountPerExecution), AAVE_SUPPORTED_TOKENS[getTokenSymbol(agent.config.savings.token) as TokenSymbol]?.decimals || 18)}
                              </p>
                              <p>Frequency: {formatInterval(agent.config.savings.intervalSeconds)}</p>
                              <p>
                                Total Supplied: {formatUnits(BigInt(agent.config.savings.totalSupplied || "0"), AAVE_SUPPORTED_TOKENS[getTokenSymbol(agent.config.savings.token) as TokenSymbol]?.decimals || 18)}
                              </p>
                              <p>Executions: {agent.executionCount}</p>
                            </>
                          )}
                        </div>
                        {agent.status !== "cancelled" && agent.status !== "completed" && (
                          <div className="flex gap-2 mt-2">
                            {agent.status === "active" ? (
                              <button
                                onClick={() => pauseAgent(agent._id)}
                                className="px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded text-xs"
                              >
                                Pause
                              </button>
                            ) : (
                              <button
                                onClick={() => resumeAgent(agent._id)}
                                className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-xs"
                              >
                                Resume
                              </button>
                            )}
                            <button
                              onClick={() => cancelAgent(agent._id)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Logs */}
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Logs</h2>
                  <button
                    onClick={() => setLogs([])}
                    className="text-xs text-gray-400 hover:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
                <div className="bg-black/50 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
                  {logs.length === 0 ? (
                    <p className="text-gray-500">No logs yet...</p>
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
          </div>
        ) : !isConnected ? (
          <div className="bg-gray-800/80 rounded-2xl p-12 text-center border border-gray-700/50">
            <div className="text-6xl mb-4">🏦</div>
            <p className="text-gray-400 mb-6">
              Connect your wallet to start saving with Aave V3 on Base Sepolia
            </p>
            <ConnectButton />
          </div>
        ) : null}
      </div>
    </main>
  );
}
