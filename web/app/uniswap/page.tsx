"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient, useBalance } from "wagmi";
import { useState, useCallback, useEffect } from "react";
import {
  parseEther,
  formatEther,
  formatUnits,
  parseUnits,
  encodeFunctionData,
  type Address,
} from "viem";

// ============================================
// SEPOLIA TOKEN & CONTRACT ADDRESSES
// ============================================

const TOKENS = {
  ETH: {
    symbol: "ETH",
    name: "Ethereum",
    address: null as Address | null, // Native token
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
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address, // Circle USDC
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
    address: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357" as Address, // Aave DAI
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

// Known pools with liquidity on Sepolia (from GeckoTerminal)
const KNOWN_POOLS: Record<string, { address: Address; fee: number; liquidity: string }> = {
  "WETH-USDC-3000": {
    address: "0x9799b5edc1aa7d3fad350309b08df3f64914e244" as Address,
    fee: 3000,
    liquidity: "~$7.3K",
  },
  "WETH-USDC-10000": {
    address: "0xcdf1597a0c2dda04e80e135351831b7a6af1f86d" as Address,
    fee: 10000,
    liquidity: "~$31K",
  },
  "WETH-UNI-3000": {
    address: "0x287b0e934ed0439e2a7b1d5f0fc25ea2c24b64f7" as Address,
    fee: 3000,
    liquidity: "~$7.7M ⭐",
  },
  "WETH-DAI-3000": {
    address: "0x1c9d93e574be622821398e3fe677e3a279f256f7" as Address,
    fee: 3000,
    liquidity: "~$6.8K",
  },
};

// Uniswap V3 contracts on Sepolia
const SWAP_ROUTER_ADDRESS = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address;
const QUOTER_V2_ADDRESS = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as Address;
const FACTORY_ADDRESS = "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as Address;

// Fee tiers
const FEE_TIERS = [
  { value: 500, label: "0.05%" },
  { value: 3000, label: "0.3%" },
  { value: 10000, label: "1%" },
];

// ============================================
// ABIs
// ============================================

const SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    name: "multicall",
    type: "function",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
    stateMutability: "payable",
  },
] as const;

const QUOTER_V2_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

const FACTORY_ABI = [
  {
    name: "getPool",
    type: "function",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ name: "pool", type: "address" }],
    stateMutability: "view",
  },
] as const;

const POOL_ABI = [
  {
    name: "liquidity",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint128" }],
    stateMutability: "view",
  },
  {
    name: "slot0",
    type: "function",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
    stateMutability: "view",
  },
] as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "symbol",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

// ============================================
// TYPES
// ============================================

type PoolStatus = {
  pair: string;
  tokenA: TokenSymbol;
  tokenB: TokenSymbol;
  fee: number;
  feeLabel: string;
  status: "checking" | "active" | "no-liquidity" | "no-pool" | "error" | "unknown";
  liquidity?: string;
  poolAddress?: Address;
};

// Generate all possible pairs
const generateAllPairs = (): Array<{ tokenA: TokenSymbol; tokenB: TokenSymbol; fee: number; feeLabel: string }> => {
  const pairs: Array<{ tokenA: TokenSymbol; tokenB: TokenSymbol; fee: number; feeLabel: string }> = [];
  const tokenSymbols = Object.keys(TOKENS) as TokenSymbol[];

  for (let i = 0; i < tokenSymbols.length; i++) {
    for (let j = i + 1; j < tokenSymbols.length; j++) {
      const tokenA = tokenSymbols[i];
      const tokenB = tokenSymbols[j];
      // Skip ETH/WETH pair as they're the same
      if ((tokenA === "ETH" && tokenB === "WETH") || (tokenA === "WETH" && tokenB === "ETH")) continue;

      for (const feeTier of FEE_TIERS) {
        pairs.push({
          tokenA,
          tokenB,
          fee: feeTier.value,
          feeLabel: feeTier.label,
        });
      }
    }
  }
  return pairs;
};

const ALL_PAIRS = generateAllPairs();

// ============================================
// COMPONENT
// ============================================

export default function UniswapPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: ethBalance } = useBalance({ address });

  // Token selection
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("ETH");
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("UNI");
  const [feeTier, setFeeTier] = useState(3000);

  // Amounts
  const [amountIn, setAmountIn] = useState("0.01");
  const [expectedOut, setExpectedOut] = useState<string | null>(null);
  const [slippage, setSlippage] = useState("1.0");

  // Balances
  const [balances, setBalances] = useState<Record<string, string>>({});

  // Pool info
  const [poolAddress, setPoolAddress] = useState<Address | null>(null);
  const [poolLiquidity, setPoolLiquidity] = useState<string | null>(null);
  const [isCheckingPool, setIsCheckingPool] = useState(false);

  // Pool explorer
  const [allPoolStatuses, setAllPoolStatuses] = useState<PoolStatus[]>([]);
  const [isScanningPools, setIsScanningPools] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [showPoolExplorer, setShowPoolExplorer] = useState(false);
  const [poolFilter, setPoolFilter] = useState<"all" | "active" | "no-pool">("all");

  // States
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setTxHash(null);
  }, []);

  // Get token info
  const getTokenIn = () => TOKENS[tokenIn];
  const getTokenOut = () => TOKENS[tokenOut];

  // Fetch all token balances
  const fetchBalances = useCallback(async () => {
    if (!publicClient || !address) return;

    const newBalances: Record<string, string> = {};

    // ETH balance
    if (ethBalance) {
      newBalances.ETH = formatEther(ethBalance.value);
    }

    // ERC20 balances
    for (const [symbol, token] of Object.entries(TOKENS)) {
      if (token.address) {
        try {
          const balance = await publicClient.readContract({
            address: token.address,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          });
          newBalances[symbol] = formatUnits(balance, token.decimals);
        } catch {
          newBalances[symbol] = "0";
        }
      }
    }

    setBalances(newBalances);
  }, [publicClient, address, ethBalance]);

  // Check pool liquidity
  const checkPoolLiquidity = useCallback(async () => {
    if (!publicClient) return;

    setIsCheckingPool(true);
    setPoolAddress(null);
    setPoolLiquidity(null);

    try {
      const tokenInAddr = tokenIn === "ETH" ? TOKENS.WETH.address : TOKENS[tokenIn].address;
      const tokenOutAddr = tokenOut === "ETH" ? TOKENS.WETH.address : TOKENS[tokenOut].address;

      if (!tokenInAddr || !tokenOutAddr) {
        addLog("Invalid token selection");
        return;
      }

      addLog(`Checking pool: ${tokenIn === "ETH" ? "WETH" : tokenIn}/${tokenOut === "ETH" ? "WETH" : tokenOut} (${feeTier / 10000}% fee)...`);

      // Get pool address from factory
      const pool = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: FACTORY_ABI,
        functionName: "getPool",
        args: [tokenInAddr, tokenOutAddr, feeTier],
      });

      if (pool === "0x0000000000000000000000000000000000000000") {
        addLog("❌ Pool does not exist for this pair and fee tier");
        setPoolLiquidity("No Pool");
        return;
      }

      setPoolAddress(pool);
      addLog(`Pool found: ${pool}`);

      // Get liquidity
      const liquidity = await publicClient.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "liquidity",
      });

      // Get slot0 for price info
      const slot0 = await publicClient.readContract({
        address: pool,
        abi: POOL_ABI,
        functionName: "slot0",
      });

      const liquidityFormatted = liquidity.toString();
      const sqrtPriceX96 = slot0[0];

      addLog(`Liquidity: ${liquidityFormatted}`);
      addLog(`SqrtPriceX96: ${sqrtPriceX96.toString()}`);

      if (liquidity === BigInt(0)) {
        setPoolLiquidity("No Liquidity ❌");
        addLog("⚠️ Pool exists but has no liquidity");
      } else {
        // Check known pools for better display
        const pairKey = `WETH-${tokenOut === "ETH" ? "WETH" : tokenOut}-${feeTier}`;
        const knownPool = KNOWN_POOLS[pairKey];
        if (knownPool) {
          setPoolLiquidity(`${knownPool.liquidity} ✅`);
        } else {
          setPoolLiquidity(`Active (${liquidityFormatted.slice(0, 8)}...) ✅`);
        }
        addLog("✅ Pool has liquidity!");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error checking pool: ${errorMessage}`);
      setPoolLiquidity("Error");
    } finally {
      setIsCheckingPool(false);
    }
  }, [publicClient, tokenIn, tokenOut, feeTier, addLog]);

  // Scan all pools
  const scanAllPools = useCallback(async () => {
    if (!publicClient) return;

    setIsScanningPools(true);
    setScanProgress(0);
    addLog("Starting pool scan for all pairs...");

    const statuses: PoolStatus[] = [];

    for (let i = 0; i < ALL_PAIRS.length; i++) {
      const pair = ALL_PAIRS[i];
      const pairName = `${pair.tokenA}/${pair.tokenB}`;

      // Update progress
      setScanProgress(Math.round(((i + 1) / ALL_PAIRS.length) * 100));

      // Get token addresses (use WETH for ETH)
      const tokenAAddr = pair.tokenA === "ETH" ? TOKENS.WETH.address : TOKENS[pair.tokenA].address;
      const tokenBAddr = pair.tokenB === "ETH" ? TOKENS.WETH.address : TOKENS[pair.tokenB].address;

      if (!tokenAAddr || !tokenBAddr) {
        statuses.push({
          pair: pairName,
          tokenA: pair.tokenA,
          tokenB: pair.tokenB,
          fee: pair.fee,
          feeLabel: pair.feeLabel,
          status: "error",
        });
        continue;
      }

      try {
        // Get pool address
        const pool = await publicClient.readContract({
          address: FACTORY_ADDRESS,
          abi: FACTORY_ABI,
          functionName: "getPool",
          args: [tokenAAddr, tokenBAddr, pair.fee],
        });

        if (pool === "0x0000000000000000000000000000000000000000") {
          statuses.push({
            pair: pairName,
            tokenA: pair.tokenA,
            tokenB: pair.tokenB,
            fee: pair.fee,
            feeLabel: pair.feeLabel,
            status: "no-pool",
          });
          continue;
        }

        // Get liquidity
        const liquidity = await publicClient.readContract({
          address: pool,
          abi: POOL_ABI,
          functionName: "liquidity",
        });

        if (liquidity === BigInt(0)) {
          statuses.push({
            pair: pairName,
            tokenA: pair.tokenA,
            tokenB: pair.tokenB,
            fee: pair.fee,
            feeLabel: pair.feeLabel,
            status: "no-liquidity",
            poolAddress: pool,
          });
        } else {
          // Check known pools for liquidity info
          const knownKey1 = `WETH-${pair.tokenB}-${pair.fee}`;
          const knownKey2 = `WETH-${pair.tokenA}-${pair.fee}`;
          const knownPool = KNOWN_POOLS[knownKey1] || KNOWN_POOLS[knownKey2];

          statuses.push({
            pair: pairName,
            tokenA: pair.tokenA,
            tokenB: pair.tokenB,
            fee: pair.fee,
            feeLabel: pair.feeLabel,
            status: "active",
            liquidity: knownPool?.liquidity || liquidity.toString().slice(0, 10) + "...",
            poolAddress: pool,
          });
        }
      } catch {
        statuses.push({
          pair: pairName,
          tokenA: pair.tokenA,
          tokenB: pair.tokenB,
          fee: pair.fee,
          feeLabel: pair.feeLabel,
          status: "error",
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    setAllPoolStatuses(statuses);
    setIsScanningPools(false);

    const activePools = statuses.filter((s) => s.status === "active").length;
    const noLiquidityPools = statuses.filter((s) => s.status === "no-liquidity").length;
    const noPools = statuses.filter((s) => s.status === "no-pool").length;

    addLog(`Scan complete! Active: ${activePools}, No Liquidity: ${noLiquidityPools}, No Pool: ${noPools}`);
  }, [publicClient, addLog]);

  // Select pair from pool explorer
  const selectPair = (tokenA: TokenSymbol, tokenB: TokenSymbol, fee: number) => {
    setTokenIn(tokenA);
    setTokenOut(tokenB);
    setFeeTier(fee);
    setExpectedOut(null);
    setPoolLiquidity(null);
    setShowPoolExplorer(false);
    addLog(`Selected pair: ${tokenA}/${tokenB} (${fee / 10000}%)`);
  };

  // Filter pools
  const filteredPools = allPoolStatuses.filter((pool) => {
    if (poolFilter === "all") return true;
    if (poolFilter === "active") return pool.status === "active";
    if (poolFilter === "no-pool") return pool.status === "no-pool" || pool.status === "no-liquidity";
    return true;
  });

  // Check if approval is needed
  const checkApproval = useCallback(async () => {
    if (!publicClient || !address || tokenIn === "ETH") {
      setNeedsApproval(false);
      return;
    }

    const token = TOKENS[tokenIn];
    if (!token.address) return;

    try {
      const allowance = await publicClient.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, SWAP_ROUTER_ADDRESS],
      });

      const amountNeeded = parseUnits(amountIn || "0", token.decimals);
      setNeedsApproval(allowance < amountNeeded);
    } catch {
      setNeedsApproval(true);
    }
  }, [publicClient, address, tokenIn, amountIn]);

  // Approve token
  const approveToken = useCallback(async () => {
    if (!walletClient || !address || tokenIn === "ETH") return;

    const token = TOKENS[tokenIn];
    if (!token.address) return;

    setIsApproving(true);
    try {
      addLog(`Approving ${token.symbol} for SwapRouter...`);

      const hash = await walletClient.writeContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [SWAP_ROUTER_ADDRESS, parseUnits("1000000", token.decimals)],
      });

      addLog(`Approval tx: ${hash}`);
      await publicClient?.waitForTransactionReceipt({ hash });
      addLog("✅ Approval confirmed!");
      setNeedsApproval(false);
    } catch (error) {
      addLog(`Approval error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsApproving(false);
    }
  }, [walletClient, publicClient, address, tokenIn, addLog]);

  // Get quote
  const getQuote = useCallback(async () => {
    if (!publicClient || !amountIn || parseFloat(amountIn) <= 0) {
      setExpectedOut(null);
      return;
    }

    setIsQuoting(true);
    try {
      const tokenInData = getTokenIn();
      const tokenOutData = getTokenOut();

      const tokenInAddr = tokenIn === "ETH" ? TOKENS.WETH.address : tokenInData.address;
      const tokenOutAddr = tokenOut === "ETH" ? TOKENS.WETH.address : tokenOutData.address;

      if (!tokenInAddr || !tokenOutAddr) {
        addLog("Invalid token addresses");
        return;
      }

      const amountInWei = parseUnits(amountIn, tokenInData.decimals);
      addLog(`Getting quote for ${amountIn} ${tokenInData.symbol}...`);

      const { result } = await publicClient.simulateContract({
        address: QUOTER_V2_ADDRESS,
        abi: QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: tokenInAddr,
            tokenOut: tokenOutAddr,
            amountIn: amountInWei,
            fee: feeTier,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });

      const amountOut = result[0];
      const formattedAmount = formatUnits(amountOut, tokenOutData.decimals);
      setExpectedOut(formattedAmount);
      addLog(`Quote: ${formattedAmount} ${tokenOutData.symbol}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Quote error: ${errorMessage}`);
      setExpectedOut(null);

      if (errorMessage.includes("execution reverted")) {
        addLog("⚠️ Pool may not exist or have insufficient liquidity. Try checking pool first.");
      }
    } finally {
      setIsQuoting(false);
    }
  }, [publicClient, amountIn, tokenIn, tokenOut, feeTier, addLog]);

  // Execute swap
  const executeSwap = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !expectedOut) {
      addLog("Error: Missing required data");
      return;
    }

    setIsSwapping(true);
    setTxHash(null);

    try {
      const tokenInData = getTokenIn();
      const tokenOutData = getTokenOut();

      const tokenInAddr = tokenIn === "ETH" ? TOKENS.WETH.address : tokenInData.address;
      const tokenOutAddr = tokenOut === "ETH" ? TOKENS.WETH.address : tokenOutData.address;

      if (!tokenInAddr || !tokenOutAddr) {
        addLog("Invalid token addresses");
        return;
      }

      const amountInWei = parseUnits(amountIn, tokenInData.decimals);
      const slippagePercent = parseFloat(slippage);
      const expectedOutWei = parseUnits(expectedOut, tokenOutData.decimals);
      const minAmountOut = (expectedOutWei * BigInt(Math.floor((100 - slippagePercent) * 100))) / BigInt(10000);

      addLog(`Initiating swap...`);
      addLog(`- Input: ${amountIn} ${tokenInData.symbol}`);
      addLog(`- Expected: ${expectedOut} ${tokenOutData.symbol}`);
      addLog(`- Min output (${slippage}% slippage): ${formatUnits(minAmountOut, tokenOutData.decimals)} ${tokenOutData.symbol}`);

      const swapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: tokenInAddr,
            tokenOut: tokenOutAddr,
            fee: feeTier,
            recipient: address,
            amountIn: amountInWei,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });

      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      addLog("Sending transaction...");

      const hash = await walletClient.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: "multicall",
        args: [deadline, [swapData]],
        value: tokenIn === "ETH" ? amountInWei : BigInt(0),
      });

      setTxHash(hash);
      addLog(`Transaction submitted: ${hash}`);
      addLog("Waiting for confirmation...");

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        addLog("✅ Swap successful!");
        addLog(`Gas used: ${receipt.gasUsed.toString()}`);
        fetchBalances();
      } else {
        addLog("❌ Swap failed!");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Swap error: ${errorMessage}`);

      if (errorMessage.includes("User rejected")) {
        addLog("Transaction rejected by user");
      } else if (errorMessage.includes("insufficient funds")) {
        addLog("Insufficient balance");
      } else if (errorMessage.includes("STF")) {
        addLog("Slippage too low - try increasing slippage tolerance");
      }
    } finally {
      setIsSwapping(false);
    }
  }, [walletClient, publicClient, address, amountIn, expectedOut, tokenIn, tokenOut, feeTier, slippage, addLog, fetchBalances]);

  // Swap tokens
  const swapTokens = () => {
    const temp = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(temp);
    setExpectedOut(null);
    setPoolLiquidity(null);
  };

  // Effects
  useEffect(() => {
    if (isConnected) {
      fetchBalances();
    }
  }, [isConnected, fetchBalances]);

  useEffect(() => {
    checkApproval();
  }, [checkApproval]);

  useEffect(() => {
    setExpectedOut(null);
    setPoolLiquidity(null);
  }, [tokenIn, tokenOut, feeTier]);

  // Render token selector
  const TokenSelector = ({
    value,
    onChange,
    excludeToken,
  }: {
    value: TokenSymbol;
    onChange: (v: TokenSymbol) => void;
    excludeToken: TokenSymbol;
  }) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as TokenSymbol)}
      className="bg-gray-700 text-white px-4 py-2 rounded-lg font-semibold cursor-pointer hover:bg-gray-600 transition-colors"
    >
      {(Object.keys(TOKENS) as TokenSymbol[])
        .filter((t) => t !== excludeToken)
        .map((symbol) => (
          <option key={symbol} value={symbol}>
            {TOKENS[symbol].logo} {symbol}
          </option>
        ))}
    </select>
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/20 to-gray-900 text-white p-4 md:p-8">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              🦄 Uniswap V3
            </h1>
            <p className="text-gray-400 text-sm">Sepolia Testnet</p>
          </div>
          <ConnectButton />
        </div>

        {/* Pool Explorer Toggle */}
        <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-pink-500/30 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-pink-400 text-sm">🔍 Pool Explorer</h3>
            <button
              onClick={() => setShowPoolExplorer(!showPoolExplorer)}
              className="px-3 py-1 bg-pink-500/20 hover:bg-pink-500/30 rounded-lg text-xs font-medium transition-colors"
            >
              {showPoolExplorer ? "Hide" : "Show All Pairs"}
            </button>
          </div>

          {/* Quick Picks - Always visible */}
          <div className="mb-3">
            <p className="text-gray-400 text-xs mb-2">⭐ Recommended (High Liquidity):</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => { setTokenIn("ETH"); setTokenOut("UNI"); setFeeTier(3000); }}
                className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors"
              >
                ETH → UNI (0.3%) ~$7.7M
              </button>
              <button
                onClick={() => { setTokenIn("ETH"); setTokenOut("USDC"); setFeeTier(10000); }}
                className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-xs font-medium transition-colors"
              >
                ETH → USDC (1%) ~$31K
              </button>
              <button
                onClick={() => { setTokenIn("ETH"); setTokenOut("DAI"); setFeeTier(3000); }}
                className="px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs font-medium transition-colors"
              >
                ETH → DAI (0.3%) ~$6.8K
              </button>
            </div>
          </div>

          {/* Expanded Pool Explorer */}
          {showPoolExplorer && (
            <div className="border-t border-pink-500/20 pt-3 mt-3">
              {/* Scan Button */}
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={scanAllPools}
                  disabled={isScanningPools}
                  className="px-4 py-2 bg-purple-500 hover:bg-purple-400 disabled:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
                >
                  {isScanningPools ? `Scanning... ${scanProgress}%` : "🔄 Scan All Pools"}
                </button>
                <span className="text-gray-400 text-xs">
                  {ALL_PAIRS.length} possible pairs × 3 fee tiers
                </span>
              </div>

              {/* Progress Bar */}
              {isScanningPools && (
                <div className="w-full bg-gray-700 rounded-full h-2 mb-3">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
              )}

              {/* Filter Tabs */}
              {allPoolStatuses.length > 0 && (
                <>
                  <div className="flex gap-2 mb-3">
                    <button
                      onClick={() => setPoolFilter("all")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        poolFilter === "all" ? "bg-gray-600 text-white" : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
                      }`}
                    >
                      All ({allPoolStatuses.length})
                    </button>
                    <button
                      onClick={() => setPoolFilter("active")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        poolFilter === "active" ? "bg-green-600 text-white" : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
                      }`}
                    >
                      ✅ Active ({allPoolStatuses.filter((p) => p.status === "active").length})
                    </button>
                    <button
                      onClick={() => setPoolFilter("no-pool")}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        poolFilter === "no-pool" ? "bg-red-600 text-white" : "bg-gray-700/50 text-gray-400 hover:bg-gray-600/50"
                      }`}
                    >
                      ❌ No Pool ({allPoolStatuses.filter((p) => p.status === "no-pool" || p.status === "no-liquidity").length})
                    </button>
                  </div>

                  {/* Pool List */}
                  <div className="max-h-64 overflow-y-auto space-y-1 pr-2">
                    {filteredPools.map((pool, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                          pool.status === "active"
                            ? "bg-green-500/10 border border-green-500/30"
                            : pool.status === "no-liquidity"
                            ? "bg-yellow-500/10 border border-yellow-500/30"
                            : "bg-gray-700/30 border border-gray-600/30"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {TOKENS[pool.tokenA].logo} {pool.tokenA}/{TOKENS[pool.tokenB].logo} {pool.tokenB}
                          </span>
                          <span className="text-gray-400">({pool.feeLabel})</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {pool.status === "active" && (
                            <>
                              <span className="text-green-400">{pool.liquidity}</span>
                              <button
                                onClick={() => selectPair(pool.tokenA, pool.tokenB, pool.fee)}
                                className="px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors"
                              >
                                Select
                              </button>
                            </>
                          )}
                          {pool.status === "no-liquidity" && (
                            <span className="text-yellow-400">No Liquidity ⚠️</span>
                          )}
                          {pool.status === "no-pool" && (
                            <span className="text-gray-500">No Pool</span>
                          )}
                          {pool.status === "error" && (
                            <span className="text-red-400">Error</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Summary */}
                  <div className="mt-3 pt-3 border-t border-pink-500/20 text-xs text-gray-400">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <div className="text-green-400 font-semibold text-lg">
                          {allPoolStatuses.filter((p) => p.status === "active").length}
                        </div>
                        <div>Active Pools</div>
                      </div>
                      <div>
                        <div className="text-yellow-400 font-semibold text-lg">
                          {allPoolStatuses.filter((p) => p.status === "no-liquidity").length}
                        </div>
                        <div>No Liquidity</div>
                      </div>
                      <div>
                        <div className="text-gray-500 font-semibold text-lg">
                          {allPoolStatuses.filter((p) => p.status === "no-pool").length}
                        </div>
                        <div>No Pool</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {allPoolStatuses.length === 0 && !isScanningPools && (
                <p className="text-gray-400 text-xs text-center py-4">
                  Click &quot;Scan All Pools&quot; to check availability of all token pairs
                </p>
              )}
            </div>
          )}
        </div>

        {isConnected ? (
          <>
            {/* Swap Card */}
            <div className="bg-gray-800/80 backdrop-blur rounded-2xl p-6 mb-6 border border-gray-700/50">
              {/* You Pay */}
              <div className="bg-gray-900/50 rounded-xl p-4 mb-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">You pay</span>
                  <span className="text-gray-400 text-sm">
                    Balance: {parseFloat(balances[tokenIn] || "0").toFixed(4)} {tokenIn}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={amountIn}
                    onChange={(e) => {
                      setAmountIn(e.target.value);
                      setExpectedOut(null);
                    }}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-3xl font-medium outline-none"
                    step="0.001"
                    min="0"
                  />
                  <TokenSelector value={tokenIn} onChange={setTokenIn} excludeToken={tokenOut} />
                </div>
                {/* Quick amounts */}
                <div className="flex gap-2 mt-3">
                  {["0.001", "0.01", "0.1"].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => { setAmountIn(amt); setExpectedOut(null); }}
                      className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 rounded text-xs transition-colors"
                    >
                      {amt}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      const bal = balances[tokenIn];
                      if (bal) {
                        const maxAmount = tokenIn === "ETH"
                          ? Math.max(0, parseFloat(bal) - 0.01).toFixed(4)
                          : bal;
                        setAmountIn(maxAmount);
                        setExpectedOut(null);
                      }
                    }}
                    className="px-2 py-1 bg-pink-500/20 hover:bg-pink-500/30 rounded text-xs transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Swap Button */}
              <div className="flex justify-center -my-2 relative z-10">
                <button
                  onClick={swapTokens}
                  className="bg-gray-700 hover:bg-gray-600 p-2 rounded-xl border-4 border-gray-800 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* You Receive */}
              <div className="bg-gray-900/50 rounded-xl p-4 mt-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">You receive</span>
                  <span className="text-gray-400 text-sm">
                    Balance: {parseFloat(balances[tokenOut] || "0").toFixed(4)} {tokenOut}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 text-3xl font-medium text-gray-300">
                    {isQuoting ? (
                      <span className="text-gray-500 animate-pulse">Loading...</span>
                    ) : expectedOut ? (
                      parseFloat(expectedOut).toFixed(6)
                    ) : (
                      <span className="text-gray-600">0.0</span>
                    )}
                  </div>
                  <TokenSelector value={tokenOut} onChange={setTokenOut} excludeToken={tokenIn} />
                </div>
              </div>

              {/* Fee Tier */}
              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-2">Fee Tier</label>
                <div className="flex gap-2">
                  {FEE_TIERS.map((tier) => (
                    <button
                      key={tier.value}
                      onClick={() => setFeeTier(tier.value)}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        feeTier === tier.value
                          ? "bg-pink-500 text-white"
                          : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                      }`}
                    >
                      {tier.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Pool Liquidity Check */}
              <div className="mt-4 p-3 bg-gray-900/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-400">Pool Status: </span>
                    <span className={`text-sm font-medium ${
                      poolLiquidity?.includes("✅") ? "text-green-400" :
                      poolLiquidity?.includes("❌") ? "text-red-400" :
                      "text-gray-400"
                    }`}>
                      {poolLiquidity || "Not checked"}
                    </span>
                  </div>
                  <button
                    onClick={checkPoolLiquidity}
                    disabled={isCheckingPool}
                    className="px-3 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {isCheckingPool ? "Checking..." : "Check Pool"}
                  </button>
                </div>
                {poolAddress && (
                  <div className="mt-2 text-xs text-gray-500">
                    Pool: {poolAddress.slice(0, 10)}...{poolAddress.slice(-8)}
                  </div>
                )}
              </div>

              {/* Slippage */}
              <div className="mt-4">
                <label className="block text-sm text-gray-400 mb-2">Slippage Tolerance</label>
                <div className="flex gap-2">
                  {["0.5", "1.0", "2.0", "5.0"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlippage(s)}
                      className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                        slippage === s
                          ? "bg-purple-500 text-white"
                          : "bg-gray-700/50 text-gray-300 hover:bg-gray-600/50"
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                </div>
              </div>

              {/* Rate Info */}
              {expectedOut && amountIn && parseFloat(amountIn) > 0 && (
                <div className="mt-4 p-3 bg-gray-900/30 rounded-lg text-sm space-y-1">
                  <div className="flex justify-between text-gray-400">
                    <span>Rate</span>
                    <span>1 {tokenIn} = {(parseFloat(expectedOut) / parseFloat(amountIn)).toFixed(6)} {tokenOut}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Min. received</span>
                    <span>{(parseFloat(expectedOut) * (1 - parseFloat(slippage) / 100)).toFixed(6)} {tokenOut}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Network fee</span>
                    <span>~${(0.01 * 2500).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 space-y-3">
                <button
                  onClick={getQuote}
                  disabled={isQuoting || !amountIn || parseFloat(amountIn) <= 0}
                  className="w-full py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 rounded-xl font-medium transition-colors"
                >
                  {isQuoting ? "Getting Quote..." : "Get Quote"}
                </button>

                {needsApproval && tokenIn !== "ETH" && (
                  <button
                    onClick={approveToken}
                    disabled={isApproving}
                    className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-800 text-black font-medium rounded-xl transition-colors"
                  >
                    {isApproving ? "Approving..." : `Approve ${tokenIn}`}
                  </button>
                )}

                <button
                  onClick={executeSwap}
                  disabled={isSwapping || !expectedOut || needsApproval}
                  className="w-full py-4 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-400 hover:to-purple-400 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 rounded-xl font-semibold text-lg transition-all"
                >
                  {isSwapping ? "Swapping..." : "Swap"}
                </button>
              </div>
            </div>

            {/* Transaction */}
            {txHash && (
              <div className="bg-gray-800/80 backdrop-blur rounded-xl p-4 mb-6 border border-green-500/30">
                <h3 className="font-semibold text-green-400 mb-2">Transaction Submitted</h3>
                <a
                  href={`https://sepolia.etherscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 text-sm font-mono break-all"
                >
                  {txHash}
                </a>
              </div>
            )}

            {/* Balances */}
            <div className="bg-gray-800/80 backdrop-blur rounded-xl p-4 mb-6 border border-gray-700/50">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold">Your Balances</h3>
                <button
                  onClick={fetchBalances}
                  className="text-xs text-blue-400 hover:text-blue-300"
                >
                  Refresh
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                {(Object.keys(TOKENS) as TokenSymbol[]).map((symbol) => (
                  <div key={symbol} className="bg-gray-900/50 rounded-lg p-2">
                    <div className="text-gray-400 text-xs">{TOKENS[symbol].logo} {symbol}</div>
                    <div className="font-mono">{parseFloat(balances[symbol] || "0").toFixed(4)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Logs */}
            <div className="bg-gray-800/80 backdrop-blur rounded-xl p-4 border border-gray-700/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Logs</h3>
                <button
                  onClick={clearLogs}
                  className="text-xs text-gray-400 hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black/50 rounded-lg p-3 h-40 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500">No logs yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <p key={i} className="text-gray-300 mb-1">{log}</p>
                  ))
                )}
              </div>
            </div>

            {/* Faucets */}
            <div className="mt-6 text-center text-sm text-gray-400">
              <p className="mb-2">Need test tokens?</p>
              <div className="flex flex-wrap justify-center gap-3">
                <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                  Circle USDC Faucet
                </a>
                <span>•</span>
                <a href="https://staging.aave.com/faucet/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                  Aave Faucet
                </a>
                <span>•</span>
                <a href="https://sepoliafaucet.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                  Sepolia ETH
                </a>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-gray-800/80 backdrop-blur rounded-2xl p-12 text-center border border-gray-700/50">
            <div className="text-6xl mb-4">🦄</div>
            <p className="text-gray-400 mb-6">Connect your wallet to start swapping</p>
            <ConnectButton />
          </div>
        )}
      </div>
    </main>
  );
}
