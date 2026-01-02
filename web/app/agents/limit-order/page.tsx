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

// Limit Order Agent address
const LIMIT_ORDER_AGENT_ADDRESS = "0x0013bb0d8712dc4cacbc8cd32d4c0c851cdf18da" as Address;

// All available tokens
const TOKENS = {
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    address: null as Address | null,
    decimals: 18,
    logo: "⟠",
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as Address,
    decimals: 18,
    logo: "⟠",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
    decimals: 6,
    logo: "💵",
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
    name: "Dai Stablecoin",
    address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357" as Address,
    decimals: 18,
    logo: "◈",
  },
  LINK: {
    symbol: "LINK",
    name: "Chainlink",
    address: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5" as Address,
    decimals: 18,
    logo: "⬡",
  },
} as const;

type TokenSymbol = keyof typeof TOKENS;

// All pools with liquidity on Sepolia
const POOLS_WITH_LIQUIDITY: Array<{ tokenA: TokenSymbol; tokenB: TokenSymbol; fee: number; liquidity: string }> = [
  { tokenA: "WETH", tokenB: "USDC", fee: 500, liquidity: "1145834379..." },
  { tokenA: "WETH", tokenB: "USDC", fee: 3000, liquidity: "~$7.3K" },
  { tokenA: "WETH", tokenB: "USDC", fee: 10000, liquidity: "~$31K" },
  { tokenA: "WETH", tokenB: "UNI", fee: 500, liquidity: "2291036007..." },
  { tokenA: "WETH", tokenB: "UNI", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "WETH", tokenB: "UNI", fee: 10000, liquidity: "9365492206..." },
  { tokenA: "WETH", tokenB: "DAI", fee: 500, liquidity: "1465267620..." },
  { tokenA: "WETH", tokenB: "DAI", fee: 3000, liquidity: "~$6.8K" },
  { tokenA: "WETH", tokenB: "DAI", fee: 10000, liquidity: "2333363134..." },
  { tokenA: "WETH", tokenB: "LINK", fee: 500, liquidity: "1581060649..." },
  { tokenA: "WETH", tokenB: "LINK", fee: 3000, liquidity: "1037313167..." },
  { tokenA: "USDC", tokenB: "UNI", fee: 500, liquidity: "7158291702..." },
  { tokenA: "USDC", tokenB: "UNI", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "USDC", tokenB: "UNI", fee: 10000, liquidity: "~$31K" },
  { tokenA: "UNI", tokenB: "DAI", fee: 3000, liquidity: "~$6.8K" },
  { tokenA: "UNI", tokenB: "LINK", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "DAI", tokenB: "LINK", fee: 500, liquidity: "4092621011..." },
  { tokenA: "DAI", tokenB: "LINK", fee: 3000, liquidity: "~$6.8K" },
];

// Helper: Check if a pool exists with liquidity
function hasPoolWithLiquidity(tokenIn: TokenSymbol, tokenOut: TokenSymbol, fee: number): { exists: boolean; liquidity?: string } {
  const pool = POOLS_WITH_LIQUIDITY.find(p =>
    ((p.tokenA === tokenIn && p.tokenB === tokenOut) || (p.tokenA === tokenOut && p.tokenB === tokenIn)) && p.fee === fee
  );
  return pool ? { exists: true, liquidity: pool.liquidity } : { exists: false };
}

// Helper: Get all tokens that have pools
function getTokensWithPools(): TokenSymbol[] {
  const tokensInPools = new Set<TokenSymbol>();
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    tokensInPools.add(pool.tokenA);
    tokensInPools.add(pool.tokenB);
  });
  tokensInPools.delete("ETH");
  return Array.from(tokensInPools);
}

// Helper: Get valid output tokens for input
function getValidOutputTokens(tokenIn: TokenSymbol): TokenSymbol[] {
  const validTokens = new Set<TokenSymbol>();
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    if (pool.tokenA === tokenIn) validTokens.add(pool.tokenB);
    else if (pool.tokenB === tokenIn) validTokens.add(pool.tokenA);
  });
  validTokens.delete(tokenIn);
  validTokens.delete("ETH");
  return Array.from(validTokens);
}

// Helper: Get valid fee tiers for a pair
function getValidFeeTiers(tokenIn: TokenSymbol, tokenOut: TokenSymbol): number[] {
  const validFees: number[] = [];
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    if ((pool.tokenA === tokenIn && pool.tokenB === tokenOut) || (pool.tokenA === tokenOut && pool.tokenB === tokenIn)) {
      if (!validFees.includes(pool.fee)) validFees.push(pool.fee);
    }
  });
  return validFees.sort((a, b) => a - b);
}

// Fee tier labels
const FEE_TIER_LABELS: Record<number, string> = {
  500: "0.05%",
  3000: "0.3%",
  10000: "1%",
};

// Order direction
type OrderDirection = "buy" | "sell";

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
    limitOrder?: {
      tokenIn: string;
      tokenOut: string;
      amountIn: string;
      targetPrice: string;
      direction: OrderDirection;
    };
  };
}

// ============================================
// Component
// ============================================

export default function LimitOrderPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  // Check if on correct chain (Sepolia)
  const isCorrectChain = chainId === sepolia.id;

  // Form state
  const [agentName, setAgentName] = useState("My Limit Order");
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC");
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("WETH");
  const [amount, setAmount] = useState("100");
  const [targetPrice, setTargetPrice] = useState("");
  const [direction, setDirection] = useState<OrderDirection>("buy");
  const [feeTier, setFeeTier] = useState(3000);
  const [expiryDays, setExpiryDays] = useState(7);

  // Pool status
  const [poolStatus, setPoolStatus] = useState<"active" | "no-pool" | null>(null);
  const [poolLiquidity, setPoolLiquidity] = useState<string | null>(null);

  // Token balance
  const [tokenInBalance, setTokenInBalance] = useState<string | null>(null);
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
  // Token & Pool Management
  // ============================================

  const validOutputTokens = getValidOutputTokens(tokenIn);
  const validFeeTiers = getValidFeeTiers(tokenIn, tokenOut);

  // Auto-select first valid output token if current is invalid
  useEffect(() => {
    if (!validOutputTokens.includes(tokenOut) && validOutputTokens.length > 0) {
      setTokenOut(validOutputTokens[0]);
    }
  }, [tokenIn, validOutputTokens, tokenOut]);

  // Auto-select first valid fee tier if current is invalid
  useEffect(() => {
    if (!validFeeTiers.includes(feeTier) && validFeeTiers.length > 0) {
      setFeeTier(validFeeTiers[0]);
    }
  }, [tokenIn, tokenOut, validFeeTiers, feeTier]);

  // Check pool status
  useEffect(() => {
    const poolCheck = hasPoolWithLiquidity(tokenIn, tokenOut, feeTier);
    if (poolCheck.exists) {
      setPoolStatus("active");
      setPoolLiquidity(poolCheck.liquidity || null);
    } else {
      setPoolStatus("no-pool");
      setPoolLiquidity(null);
    }
  }, [tokenIn, tokenOut, feeTier]);

  // Fetch token balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!address || !publicClient) {
        setTokenInBalance(null);
        return;
      }

      const tokenData = TOKENS[tokenIn];
      if (!tokenData.address) {
        setTokenInBalance(null);
        return;
      }

      setIsLoadingBalance(true);
      try {
        const balance = await publicClient.readContract({
          address: tokenData.address,
          abi: ERC20_BALANCE_ABI,
          functionName: "balanceOf",
          args: [address],
        });
        setTokenInBalance(formatUnits(balance, tokenData.decimals));
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        setTokenInBalance(null);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
  }, [address, tokenIn, publicClient]);

  // ============================================
  // Request Permission & Create Agent
  // ============================================

  const requestPermissionsAndCreateAgent = useCallback(async () => {
    if (!walletClient || !address) {
      addLog("Wallet not connected");
      return;
    }

    const tokenInData = TOKENS[tokenIn];
    if (!tokenInData.address) {
      addLog("Invalid token selected");
      return;
    }

    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      addLog("Please enter a valid target price");
      return;
    }

    setIsLoading(true);
    addLog("Requesting ERC-20 permission for limit order...");
    addLog(`Delegating to Limit Order Agent: ${LIMIT_ORDER_AGENT_ADDRESS}`);

    try {
      const amountInWei = parseUnits(amount, tokenInData.decimals);

      // Calculate expiry
      const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60;

      addLog(`Token: ${tokenInData.symbol} (${tokenInData.address})`);
      addLog(`Amount: ${amount} ${tokenInData.symbol}`);
      addLog(`Target Price: ${targetPrice} ${tokenOut}/${tokenIn}`);
      addLog(`Direction: ${direction === "buy" ? "Buy when price drops to" : "Sell when price rises to"} target`);

      // For limit orders, we use a one-time transfer permission
      // The agent will check price and execute when target is reached
      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: sepolia.id,
          expiry,
          signer: {
            type: "account",
            data: {
              address: LIMIT_ORDER_AGENT_ADDRESS,
            },
          },
          permission: {
            type: "erc20-token-periodic",
            data: {
              tokenAddress: tokenInData.address,
              periodAmount: amountInWei,
              periodDuration: expiryDays * 24 * 60 * 60, // Full duration as one period
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
      addLog("Creating limit order agent in backend...");

      const tokenOutData = TOKENS[tokenOut];
      const tokenOutAddr = tokenOutData.address;

      const payload = {
        userAddress: address,
        name: agentName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: LIMIT_ORDER_AGENT_ADDRESS,
        config: {
          tokenIn: tokenInData.address,
          tokenOut: tokenOutAddr,
          amountIn: amountInWei.toString(),
          targetPrice,
          direction,
          feeTier,
          expiryTimestamp: expiry,
        },
      };

      const response = await fetch(`${BACKEND_URL}/api/agents/limit-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create agent");
      }

      addLog(`Limit order created! ID: ${data.agent.id}`);
      addLog(`Monitoring for price target...`);

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
  }, [walletClient, address, tokenIn, tokenOut, amount, targetPrice, direction, expiryDays, agentName, feeTier, addLog]);

  // ============================================
  // Fetch User's Agents
  // ============================================

  const fetchAgents = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch(
        `${BACKEND_URL}/api/agents?userAddress=${address}&agentType=limit-order`
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

  const cancelAgent = async (agentId: string) => {
    try {
      await fetch(`${BACKEND_URL}/api/agents/${agentId}`, {
        method: "DELETE",
      });
      addLog(`Order ${agentId} cancelled`);
      fetchAgents();
    } catch (error) {
      addLog(`Failed to cancel order: ${error}`);
    }
  };

  // Reset form
  const resetForm = () => {
    setCreatedAgentId(null);
    setAgentName("My Limit Order");
    setAmount("100");
    setTargetPrice("");
  };

  // Get token symbol from address
  const getTokenSymbol = (addr: string) => {
    for (const [symbol, token] of Object.entries(TOKENS)) {
      if (token.address?.toLowerCase() === addr.toLowerCase()) {
        return symbol;
      }
    }
    return addr.slice(0, 6) + "...";
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
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">📊 Limit Order Agent</h1>
            <p className="text-gray-400 text-sm">
              Set target price and execute automatically
            </p>
          </div>
          <ConnectButton />
        </div>

        {/* Info Banner */}
        <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mb-6">
          <h3 className="font-semibold text-purple-400 mb-2">How it works</h3>
          <ol className="text-sm text-purple-200 space-y-1 list-decimal list-inside">
            <li>Set your token pair, amount, and target price</li>
            <li>Grant permission - the agent monitors prices</li>
            <li>When price hits target, agent executes swap via Uniswap</li>
          </ol>
          <p className="text-xs text-purple-300 mt-2">
            Agent: <code className="bg-purple-900/50 px-1 rounded">{LIMIT_ORDER_AGENT_ADDRESS}</code>
          </p>
        </div>

        {/* Wrong Chain Warning */}
        {isConnected && !isCorrectChain && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-orange-400">Wrong Network</h3>
                <p className="text-sm text-orange-200">
                  Please switch to Sepolia to use Limit Orders
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
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left Column - Setup */}
            <div className="space-y-6">
              {/* Configuration */}
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <h2 className="text-lg font-semibold mb-4">Configure Limit Order</h2>

                <div className="space-y-4">
                  {/* Agent Name */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Order Name
                    </label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 outline-none"
                    />
                  </div>

                  {/* Order Direction */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Order Type
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setDirection("buy")}
                        className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                          direction === "buy"
                            ? "bg-green-500 text-white"
                            : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                        }`}
                      >
                        Buy (Price Below)
                      </button>
                      <button
                        onClick={() => setDirection("sell")}
                        className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                          direction === "sell"
                            ? "bg-red-500 text-white"
                            : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                        }`}
                      >
                        Sell (Price Above)
                      </button>
                    </div>
                  </div>

                  {/* Token Selection */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        {direction === "buy" ? "Pay With" : "Sell Token"}
                      </label>
                      <select
                        value={tokenIn}
                        onChange={(e) => setTokenIn(e.target.value as TokenSymbol)}
                        className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600"
                      >
                        {getTokensWithPools().map((symbol) => (
                          <option key={symbol} value={symbol}>
                            {TOKENS[symbol].logo} {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">
                        {direction === "buy" ? "Buy Token" : "Receive Token"}
                      </label>
                      <select
                        value={tokenOut}
                        onChange={(e) => setTokenOut(e.target.value as TokenSymbol)}
                        className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600"
                      >
                        {validOutputTokens.map((symbol) => (
                          <option key={symbol} value={symbol}>
                            {TOKENS[symbol].logo} {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Fee Tier */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Fee Tier
                    </label>
                    <div className="flex gap-2">
                      {validFeeTiers.map((fee) => (
                        <button
                          key={fee}
                          onClick={() => setFeeTier(fee)}
                          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            feeTier === fee
                              ? "bg-purple-500 text-white"
                              : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                          }`}
                        >
                          {FEE_TIER_LABELS[fee] || `${fee / 10000}%`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Pool Status */}
                  <div className={`p-3 rounded-lg ${
                    poolStatus === "active" ? "bg-green-500/10 border border-green-500/30" :
                    "bg-red-500/10 border border-red-500/30"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">Pool Status:</span>
                      <span className={`text-sm font-medium ${
                        poolStatus === "active" ? "text-green-400" : "text-red-400"
                      }`}>
                        {poolStatus === "active" && `Active ${poolLiquidity ? `(${poolLiquidity})` : ""}`}
                        {poolStatus === "no-pool" && "No Pool"}
                        {!poolStatus && "Select tokens"}
                      </span>
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-sm text-gray-400">
                        Amount to {direction === "buy" ? "spend" : "sell"}
                      </label>
                      <div className="text-xs text-gray-400">
                        Balance:{" "}
                        {isLoadingBalance ? (
                          <span className="text-gray-500">Loading...</span>
                        ) : tokenInBalance !== null ? (
                          <button
                            onClick={() => setAmount(tokenInBalance)}
                            className="text-purple-400 hover:text-purple-300"
                          >
                            {parseFloat(tokenInBalance).toFixed(6)} {TOKENS[tokenIn].symbol}
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
                        className="flex-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 outline-none"
                      />
                      <button
                        onClick={() => tokenInBalance && setAmount(tokenInBalance)}
                        disabled={!tokenInBalance}
                        className="px-3 py-2 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-xs font-medium transition-colors"
                      >
                        MAX
                      </button>
                      <span className="px-3 py-2 bg-gray-600 rounded-lg">
                        {TOKENS[tokenIn].symbol}
                      </span>
                    </div>
                  </div>

                  {/* Target Price */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Target Price ({direction === "buy" ? "execute when price ≥" : "execute when price ≥"})
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        placeholder="e.g., 0.0000001"
                        className="flex-1 px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-purple-500 outline-none"
                      />
                      <span className="px-3 py-2 bg-gray-600 rounded-lg text-xs">
                        {tokenOut}/{tokenIn}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {direction === "buy"
                        ? `Buy ${tokenOut} when 1 ${tokenIn} gets you ≥ ${targetPrice || "?"} ${tokenOut}`
                        : `Sell ${tokenIn} when 1 ${tokenIn} is worth ≥ ${targetPrice || "?"} ${tokenOut}`
                      }
                    </p>
                  </div>

                  {/* Expiry */}
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">
                      Order Expiry
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 7, 14, 30].map((days) => (
                        <button
                          key={days}
                          onClick={() => setExpiryDays(days)}
                          className={`px-2 py-2 rounded-lg text-xs transition-colors ${
                            expiryDays === days
                              ? "bg-purple-500 text-white"
                              : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                          }`}
                        >
                          {days}d
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Create Button */}
                  {createdAgentId ? (
                    <div className="space-y-3">
                      <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <p className="text-green-400 font-medium">
                          Limit Order Created!
                        </p>
                        <p className="text-green-300 text-sm mt-1">
                          ID: {createdAgentId}
                        </p>
                      </div>
                      <button
                        onClick={resetForm}
                        className="w-full py-2 bg-purple-500 hover:bg-purple-400 rounded-lg font-medium transition-colors"
                      >
                        Create Another Order
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={requestPermissionsAndCreateAgent}
                      disabled={isLoading || poolStatus !== "active" || !targetPrice}
                      className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-gray-600 disabled:to-gray-600 disabled:text-gray-400 rounded-lg font-medium transition-colors"
                    >
                      {isLoading ? "Processing..." :
                       poolStatus !== "active" ? "Select a pair with liquidity" :
                       !targetPrice ? "Enter target price" :
                       "Grant Permission & Create Order"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Orders & Logs */}
            <div className="space-y-6">
              {/* Your Orders */}
              <div className="bg-gray-800/80 rounded-xl p-6 border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Your Limit Orders</h2>
                  <button
                    onClick={fetchAgents}
                    className="text-xs text-purple-400 hover:text-purple-300"
                  >
                    Refresh
                  </button>
                </div>

                {agents.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-4">
                    No limit orders yet. Create one to get started!
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
                                ? "bg-yellow-500/20 text-yellow-400"
                                : agent.status === "completed"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-gray-500/20 text-gray-400"
                            }`}
                          >
                            {agent.status === "active" ? "Monitoring" : agent.status}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 space-y-1">
                          {agent.config.limitOrder && (
                            <>
                              <p>
                                {agent.config.limitOrder.direction === "buy" ? "Buy" : "Sell"}: {getTokenSymbol(agent.config.limitOrder.tokenIn)} → {getTokenSymbol(agent.config.limitOrder.tokenOut)}
                              </p>
                              <p>
                                Target: {agent.config.limitOrder.targetPrice}
                              </p>
                              <p>
                                Amount: {formatUnits(BigInt(agent.config.limitOrder.amountIn), TOKENS[getTokenSymbol(agent.config.limitOrder.tokenIn) as TokenSymbol]?.decimals || 18)}
                              </p>
                            </>
                          )}
                        </div>
                        {agent.status === "active" && (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => cancelAgent(agent._id)}
                              className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs"
                            >
                              Cancel Order
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
            <div className="text-6xl mb-4">📊</div>
            <p className="text-gray-400 mb-6">
              Connect your wallet to create limit orders
            </p>
            <ConnectButton />
          </div>
        ) : null}
      </div>
    </main>
  );
}
