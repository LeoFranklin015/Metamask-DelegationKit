"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient } from "wagmi";
import { useState, useCallback, useEffect } from "react";
import { parseUnits, type Address, type Hex } from "viem";
import {
  requestExecutionPermissions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions";
import { sepolia } from "viem/chains";

// ============================================
// Constants
// ============================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// Fixed DCA Agent address - this is the address that will execute swaps on behalf of users
const DCA_AGENT_ADDRESS = "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address;

const TOKENS = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    decimals: 6,
    logo: "💵",
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address,
    decimals: 18,
    logo: "⟠",
  },
  UNI: {
    symbol: "UNI",
    name: "Uniswap",
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as Address,
    decimals: 18,
    logo: "🦄",
  },
  DAI: {
    symbol: "DAI",
    name: "Dai",
    address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357" as Address,
    decimals: 18,
    logo: "◈",
  },
} as const;

type TokenSymbol = keyof typeof TOKENS;

// Interval presets (in seconds)
const INTERVAL_PRESETS = [
  { value: 60, label: "1 min", description: "For testing" },
  { value: 3600, label: "1 hour", description: "Every hour" },
  { value: 86400, label: "1 day", description: "Once per day" },
  { value: 604800, label: "1 week", description: "Once per week" },
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
    dca?: {
      tokenIn: string;
      tokenOut: string;
      amountPerExecution: string;
      intervalSeconds: number;
    };
  };
}

// ============================================
// Component
// ============================================

export default function DCAAgentPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // Form state
  const [agentName, setAgentName] = useState("My DCA Bot");
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC");
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("WETH");
  const [amount, setAmount] = useState("10");
  const [intervalSeconds, setIntervalSeconds] = useState(86400); // Default 1 day
  const [maxExecutions, setMaxExecutions] = useState("");

  // Permission state
  const [permissionContext, setPermissionContext] = useState<Hex | null>(null);
  const [delegationManager, setDelegationManager] = useState<Address | null>(null);

  // UI state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  // ============================================
  // Step 1: Configure & Grant Permission
  // ============================================

  const requestPermissions = useCallback(async () => {
    if (!walletClient) {
      addLog("Wallet not connected");
      return;
    }

    setIsLoading(true);
    addLog("Requesting ERC-20 periodic permission...");
    addLog(`Delegating to DCA Agent: ${DCA_AGENT_ADDRESS}`);

    try {
      const tokenData = TOKENS[tokenIn];
      const amountInWei = parseUnits(amount, tokenData.decimals);

      // Calculate expiry (30 days from now)
      const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      addLog(`Token: ${tokenData.symbol} (${tokenData.address})`);
      addLog(`Amount per period: ${amount} ${tokenData.symbol}`);
      addLog(`Interval: ${intervalSeconds} seconds`);

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: sepolia.id,
          expiry,
          signer: {
            type: "account",
            data: {
              address: DCA_AGENT_ADDRESS,
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

      setPermissionContext(granted[0].context);
      setDelegationManager(granted[0].signerMeta.delegationManager);

      addLog("✅ Permission granted!");
      addLog(`Context: ${granted[0].context.slice(0, 30)}...`);
      setStep(2);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`❌ Permission error: ${msg}`);

      if (msg.includes("User rejected")) {
        addLog("User rejected the permission request");
      }
    } finally {
      setIsLoading(false);
    }
  }, [walletClient, tokenIn, amount, intervalSeconds, addLog]);

  // ============================================
  // Step 2: Create Agent in Backend
  // ============================================

  const createAgent = useCallback(async () => {
    if (!permissionContext || !delegationManager || !address) {
      addLog("Missing permission data");
      return;
    }

    setIsLoading(true);
    addLog("Creating agent in backend...");

    try {
      const tokenInData = TOKENS[tokenIn];
      const tokenOutData = TOKENS[tokenOut];

      const payload = {
        userAddress: address,
        name: agentName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: DCA_AGENT_ADDRESS,
        config: {
          tokenIn: tokenInData.address,
          tokenOut: tokenOutData.address,
          amountPerExecution: parseUnits(amount, tokenInData.decimals).toString(),
          intervalSeconds,
          maxSlippage: 1.0,
          feeTier: 3000,
        },
        maxExecutions: maxExecutions ? parseInt(maxExecutions) : undefined,
      };

      addLog(`Sending to backend: ${BACKEND_URL}/api/agents/dca`);

      const response = await fetch(`${BACKEND_URL}/api/agents/dca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create agent");
      }

      addLog(`✅ Agent created! ID: ${data.agent.id}`);
      addLog(`Next execution: ${new Date(data.agent.nextExecution).toLocaleString()}`);

      setCreatedAgentId(data.agent.id);
      setStep(3);
      fetchAgents();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      addLog(`❌ Error creating agent: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [
    permissionContext,
    delegationManager,
    address,
    agentName,
    tokenIn,
    tokenOut,
    amount,
    intervalSeconds,
    maxExecutions,
    addLog,
  ]);

  // ============================================
  // Fetch User's Agents
  // ============================================

  const fetchAgents = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/agents?userAddress=${address}`
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

  // Reset to create new agent
  const resetForm = () => {
    setStep(1);
    setPermissionContext(null);
    setDelegationManager(null);
    setCreatedAgentId(null);
    setAgentName("My DCA Bot");
    setAmount("10");
    setIntervalSeconds(86400);
    setMaxExecutions("");
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
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900/20 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">🤖 DCA Agent</h1>
            <p className="text-gray-400 text-sm">
              Automated Dollar-Cost Averaging
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Info Banner */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-blue-400 mb-2">How it works</h3>
          <ol className="text-sm text-blue-200 space-y-1 list-decimal list-inside">
            <li>Configure your DCA strategy (tokens, amount, interval)</li>
            <li>Grant permission to the DCA agent via MetaMask</li>
            <li>Agent automatically executes swaps on schedule</li>
          </ol>
          <p className="text-xs text-blue-300 mt-2">
            DCA Agent Address: <code className="bg-blue-900/50 px-1 rounded">{DCA_AGENT_ADDRESS}</code>
          </p>
        </div>

        {isConnected ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column - Setup */}
            <div className="space-y-6">
              {/* Step 1: Configure & Grant Permission */}
              <div
                className={`bg-gray-800/80 rounded-xl p-6 border ${
                  step === 1 ? "border-blue-500" : "border-gray-700/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      step > 1 ? "bg-green-500" : step === 1 ? "bg-blue-500" : "bg-gray-600"
                    }`}
                  >
                    {step > 1 ? "✓" : "1"}
                  </div>
                  <h2 className="text-lg font-semibold">Configure & Grant Permission</h2>
                </div>

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
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
                      disabled={step !== 1}
                    />
                  </div>

                  {/* Token Selection */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Spend (Token In)
                      </label>
                      <select
                        value={tokenIn}
                        onChange={(e) => setTokenIn(e.target.value as TokenSymbol)}
                        className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600"
                        disabled={step !== 1}
                      >
                        {Object.entries(TOKENS).map(([symbol, token]) => (
                          <option key={symbol} value={symbol}>
                            {token.logo} {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        Buy (Token Out)
                      </label>
                      <select
                        value={tokenOut}
                        onChange={(e) => setTokenOut(e.target.value as TokenSymbol)}
                        className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600"
                        disabled={step !== 1}
                      >
                        {Object.entries(TOKENS)
                          .filter(([s]) => s !== tokenIn)
                          .map(([symbol, token]) => (
                            <option key={symbol} value={symbol}>
                              {token.logo} {symbol}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Amount per execution
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="flex-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
                        disabled={step !== 1}
                      />
                      <span className="px-3 py-2 bg-gray-600 rounded-lg">
                        {TOKENS[tokenIn].symbol}
                      </span>
                    </div>
                  </div>

                  {/* Interval */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Interval (seconds)
                    </label>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      {INTERVAL_PRESETS.map((preset) => (
                        <button
                          key={preset.value}
                          onClick={() => setIntervalSeconds(preset.value)}
                          disabled={step !== 1}
                          className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                            intervalSeconds === preset.value
                              ? "bg-blue-500 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="number"
                      value={intervalSeconds}
                      onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 60)}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 outline-none text-sm"
                      placeholder="Custom interval in seconds"
                      disabled={step !== 1}
                      min={60}
                    />
                  </div>

                  {/* Max Executions */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Max executions (optional)
                    </label>
                    <input
                      type="number"
                      value={maxExecutions}
                      onChange={(e) => setMaxExecutions(e.target.value)}
                      placeholder="Leave empty for unlimited"
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-blue-500 outline-none"
                      disabled={step !== 1}
                    />
                  </div>

                  {step === 1 && (
                    <button
                      onClick={requestPermissions}
                      disabled={isLoading}
                      className="w-full py-3 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                    >
                      {isLoading ? "Requesting..." : "Grant Permission to DCA Agent"}
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Create Agent */}
              <div
                className={`bg-gray-800/80 rounded-xl p-6 border ${
                  step === 2 ? "border-blue-500" : "border-gray-700/50"
                }`}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      step > 2 ? "bg-green-500" : step === 2 ? "bg-blue-500" : "bg-gray-600"
                    }`}
                  >
                    {step > 2 ? "✓" : "2"}
                  </div>
                  <h2 className="text-lg font-semibold">Create Agent</h2>
                </div>

                {permissionContext && (
                  <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <p className="text-green-400 text-sm">✅ Permission granted!</p>
                    <p className="text-green-300 text-xs mt-1 font-mono">
                      {permissionContext.slice(0, 40)}...
                    </p>
                  </div>
                )}

                {step === 2 && (
                  <button
                    onClick={createAgent}
                    disabled={isLoading}
                    className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:bg-gray-600 rounded-lg font-medium transition-colors"
                  >
                    {isLoading ? "Creating..." : "Create Agent"}
                  </button>
                )}

                {step === 3 && (
                  <div className="space-y-3">
                    <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                      <p className="text-green-400 font-medium">
                        🎉 Agent Created Successfully!
                      </p>
                      <p className="text-green-300 text-sm mt-1">
                        ID: {createdAgentId}
                      </p>
                    </div>
                    <button
                      onClick={resetForm}
                      className="w-full py-2 bg-blue-500 hover:bg-blue-400 rounded-lg font-medium transition-colors"
                    >
                      Create Another Agent
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Agents & Logs */}
            <div className="space-y-6">
              {/* Your Agents */}
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Your Agents</h2>
                  <button
                    onClick={fetchAgents}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Refresh
                  </button>
                </div>

                {agents.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No agents yet. Create one to get started!
                  </p>
                ) : (
                  <div className="space-y-3">
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
                          <p>
                            Every {agent.config.dca?.intervalSeconds}s •{" "}
                            {agent.executionCount} executions
                          </p>
                          <p>
                            Next:{" "}
                            {new Date(agent.nextExecution).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex gap-2 mt-2">
                          {agent.status === "active" && (
                            <button
                              onClick={() => pauseAgent(agent._id)}
                              className="px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded text-xs"
                            >
                              Pause
                            </button>
                          )}
                          {agent.status === "paused" && (
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
        ) : (
          <div className="bg-gray-800/80 rounded-2xl p-12 text-center border border-gray-700/50">
            <div className="text-6xl mb-4">🤖</div>
            <p className="text-gray-400 mb-6">
              Connect your wallet to create a DCA agent
            </p>
            <ConnectButton />
          </div>
        )}
      </div>
    </main>
  );
}
