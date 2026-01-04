"use client"

import { useState, useCallback, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAccount, useWalletClient, useSwitchChain, useChainId, useBalance, useReadContract } from "wagmi"
import { parseUnits, formatUnits, type Address, type Hex, erc20Abi } from "viem"
import {
  requestExecutionPermissions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions"
import { sepolia } from "viem/chains"
import { cn } from "@/lib/utils"

// ============================================
// Constants
// ============================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"

// Limit Order Agent address
const LIMIT_ORDER_AGENT_ADDRESS = "0x0013bb0d8712dc4cacbc8cd32d4c0c851cdf18da" as Address

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
} as const

type TokenSymbol = keyof typeof TOKENS

// All pools with liquidity on Sepolia
const POOLS_WITH_LIQUIDITY: Array<{ tokenA: TokenSymbol; tokenB: TokenSymbol; fee: number; liquidity: string }> = [
  { tokenA: "WETH", tokenB: "USDC", fee: 500, liquidity: "~$5K" },
  { tokenA: "WETH", tokenB: "USDC", fee: 3000, liquidity: "~$7.3K" },
  { tokenA: "WETH", tokenB: "USDC", fee: 10000, liquidity: "~$31K" },
  { tokenA: "WETH", tokenB: "UNI", fee: 500, liquidity: "~$2K" },
  { tokenA: "WETH", tokenB: "UNI", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "WETH", tokenB: "UNI", fee: 10000, liquidity: "~$5K" },
  { tokenA: "WETH", tokenB: "DAI", fee: 500, liquidity: "~$1K" },
  { tokenA: "WETH", tokenB: "DAI", fee: 3000, liquidity: "~$6.8K" },
  { tokenA: "WETH", tokenB: "DAI", fee: 10000, liquidity: "~$2K" },
  { tokenA: "WETH", tokenB: "LINK", fee: 500, liquidity: "~$1K" },
  { tokenA: "WETH", tokenB: "LINK", fee: 3000, liquidity: "~$1K" },
  { tokenA: "USDC", tokenB: "UNI", fee: 500, liquidity: "~$7K" },
  { tokenA: "USDC", tokenB: "UNI", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "USDC", tokenB: "UNI", fee: 10000, liquidity: "~$31K" },
  { tokenA: "UNI", tokenB: "DAI", fee: 3000, liquidity: "~$6.8K" },
  { tokenA: "UNI", tokenB: "LINK", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "DAI", tokenB: "LINK", fee: 500, liquidity: "~$4K" },
  { tokenA: "DAI", tokenB: "LINK", fee: 3000, liquidity: "~$6.8K" },
]

// Helper: Check if a pool exists with liquidity
function hasPoolWithLiquidity(tokenIn: TokenSymbol, tokenOut: TokenSymbol, fee: number): { exists: boolean; liquidity?: string } {
  const pool = POOLS_WITH_LIQUIDITY.find(p =>
    ((p.tokenA === tokenIn && p.tokenB === tokenOut) || (p.tokenA === tokenOut && p.tokenB === tokenIn)) && p.fee === fee
  )
  return pool ? { exists: true, liquidity: pool.liquidity } : { exists: false }
}

// Helper: Get all tokens that have pools
function getTokensWithPools(): TokenSymbol[] {
  const tokensInPools = new Set<TokenSymbol>()
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    tokensInPools.add(pool.tokenA)
    tokensInPools.add(pool.tokenB)
  })
  tokensInPools.delete("ETH")
  return Array.from(tokensInPools)
}

// Helper: Get valid output tokens for input
function getValidOutputTokens(tokenIn: TokenSymbol): TokenSymbol[] {
  const validTokens = new Set<TokenSymbol>()
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    if (pool.tokenA === tokenIn) validTokens.add(pool.tokenB)
    else if (pool.tokenB === tokenIn) validTokens.add(pool.tokenA)
  })
  validTokens.delete(tokenIn)
  validTokens.delete("ETH")
  return Array.from(validTokens)
}

// Helper: Get valid fee tiers for a pair
function getValidFeeTiers(tokenIn: TokenSymbol, tokenOut: TokenSymbol): number[] {
  const validFees: number[] = []
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    if ((pool.tokenA === tokenIn && pool.tokenB === tokenOut) || (pool.tokenA === tokenOut && pool.tokenB === tokenIn)) {
      if (!validFees.includes(pool.fee)) validFees.push(pool.fee)
    }
  })
  return validFees.sort((a, b) => a - b)
}

const FEE_TIER_LABELS: Record<number, string> = {
  500: "0.05%",
  3000: "0.3%",
  10000: "1%",
}

// Order direction
type OrderDirection = "buy" | "sell"

// CoinGecko IDs for price fetching
const COINGECKO_IDS: Record<TokenSymbol, string> = {
  ETH: "ethereum",
  WETH: "weth",
  USDC: "usd-coin",
  UNI: "uniswap",
  DAI: "dai",
  LINK: "chainlink",
}

// ============================================
// Component
// ============================================

interface LimitOrderConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function LimitOrderConfigModal({ isOpen, onClose, onSuccess }: LimitOrderConfigModalProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const isCorrectChain = chainId === sepolia.id

  // Form state
  const [agentName, setAgentName] = useState("My Limit Order")
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC")
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("WETH")
  const [amount, setAmount] = useState("100")
  const [targetPrice, setTargetPrice] = useState("")
  const [direction, setDirection] = useState<OrderDirection>("buy")
  const [feeTier, setFeeTier] = useState(3000)
  const [expiryDays, setExpiryDays] = useState(7)

  // Get token balance
  const tokenInData = TOKENS[tokenIn]
  // Native ETH balance
  const { data: ethBalance, isLoading: isEthBalanceLoading } = useBalance({
    address,
    chainId: sepolia.id,
  })
  // ERC20 token balance
  const { data: erc20Balance, isLoading: isErc20BalanceLoading } = useReadContract({
    address: tokenInData.address || undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: sepolia.id,
  })
  const tokenBalance = tokenInData.address
    ? { value: erc20Balance || 0n, decimals: tokenInData.decimals, symbol: tokenInData.symbol }
    : ethBalance
  const isBalanceLoading = tokenInData.address ? isErc20BalanceLoading : isEthBalanceLoading

  // Pool status
  const [poolStatus, setPoolStatus] = useState<"active" | "no-pool" | null>(null)
  const [poolLiquidity, setPoolLiquidity] = useState<string | null>(null)

  // Current exchange rate
  const [currentRate, setCurrentRate] = useState<string | null>(null)
  const [isLoadingRate, setIsLoadingRate] = useState(false)

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Valid tokens and fee tiers
  const validOutputTokens = getValidOutputTokens(tokenIn)
  const validFeeTiers = getValidFeeTiers(tokenIn, tokenOut)

  // Auto-select first valid output token if current is invalid
  useEffect(() => {
    if (!validOutputTokens.includes(tokenOut) && validOutputTokens.length > 0) {
      setTokenOut(validOutputTokens[0])
    }
  }, [tokenIn, validOutputTokens, tokenOut])

  // Auto-select first valid fee tier if current is invalid
  useEffect(() => {
    if (!validFeeTiers.includes(feeTier) && validFeeTiers.length > 0) {
      setFeeTier(validFeeTiers[0])
    }
  }, [tokenIn, tokenOut, validFeeTiers, feeTier])

  // Check pool status
  useEffect(() => {
    const poolCheck = hasPoolWithLiquidity(tokenIn, tokenOut, feeTier)
    if (poolCheck.exists) {
      setPoolStatus("active")
      setPoolLiquidity(poolCheck.liquidity || null)
    } else {
      setPoolStatus("no-pool")
      setPoolLiquidity(null)
    }
  }, [tokenIn, tokenOut, feeTier])

  // Fetch current exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      setIsLoadingRate(true)
      try {
        const tokenInId = COINGECKO_IDS[tokenIn]
        const tokenOutId = COINGECKO_IDS[tokenOut]

        const response = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${tokenInId},${tokenOutId}&vs_currencies=usd`
        )
        const data = await response.json()

        const tokenInPrice = data[tokenInId]?.usd
        const tokenOutPrice = data[tokenOutId]?.usd

        if (tokenInPrice && tokenOutPrice) {
          // Calculate how much tokenOut you get for 1 tokenIn
          const rate = tokenInPrice / tokenOutPrice
          setCurrentRate(rate.toPrecision(6))
        } else {
          setCurrentRate(null)
        }
      } catch {
        setCurrentRate(null)
      } finally {
        setIsLoadingRate(false)
      }
    }

    fetchRate()
    // Refresh every 30 seconds
    const interval = setInterval(fetchRate, 30000)
    return () => clearInterval(interval)
  }, [tokenIn, tokenOut])

  const handleCreate = useCallback(async () => {
    if (!walletClient || !address) return

    const tokenData = TOKENS[tokenIn]
    if (!tokenData.address) {
      setError("Invalid token selected")
      return
    }

    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      setError("Please enter a valid target price")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountInWei = parseUnits(amount, tokenData.decimals)
      const expiry = Math.floor(Date.now() / 1000) + expiryDays * 24 * 60 * 60

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: sepolia.id,
          expiry,
          signer: {
            type: "account",
            data: { address: LIMIT_ORDER_AGENT_ADDRESS },
          },
          permission: {
            type: "erc20-token-periodic",
            data: {
              tokenAddress: tokenData.address,
              periodAmount: amountInWei,
              periodDuration: expiryDays * 24 * 60 * 60,
            },
          },
          isAdjustmentAllowed: true,
        },
      ]

      const permissions = await requestExecutionPermissions(
        walletClient as Parameters<typeof requestExecutionPermissions>[0],
        permissionParams
      )

      // Type for the permission response
      type PermissionResponse = {
        context: Hex
        chainId: string
        permission: {
          data: {
            tokenAddress: string
            periodAmount: string
            periodDuration: number
            startTime: number
          }
        }
        signerMeta: { delegationManager: Address }
      }

      const granted = permissions as PermissionResponse[]
      const permission = granted[0]

      const permissionContext = permission.context
      const delegationManager = permission.signerMeta.delegationManager

      // Extract permission metadata for on-chain correlation
      const permissionData = permission.permission.data
      const chainIdNum = parseInt(permission.chainId, 16)

      const tokenOutData = TOKENS[tokenOut]
      const tokenOutAddr = tokenOutData.address

      const payload = {
        userAddress: address,
        name: agentName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: LIMIT_ORDER_AGENT_ADDRESS,
        // Permission metadata for on-chain correlation
        chainId: chainIdNum,
        spendingToken: permissionData.tokenAddress,
        spendingLimit: BigInt(permissionData.periodAmount).toString(),
        spendingPeriod: permissionData.periodDuration,
        startTime: permissionData.startTime,
        config: {
          tokenIn: tokenData.address,
          tokenOut: tokenOutAddr,
          amountIn: amountInWei.toString(),
          targetPrice,
          direction,
          feeTier,
          expiryTimestamp: expiry,
        },
      }

      const response = await fetch(`${BACKEND_URL}/api/agents/limit-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create agent")
      }

      setSuccess(true)
      onSuccess?.()

      setTimeout(() => {
        onClose()
        setSuccess(false)
        setAgentName("My Limit Order")
        setAmount("100")
        setTargetPrice("")
      }, 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      if (errorMessage.includes("User rejected") || errorMessage.includes("user rejected")) {
        setError("You rejected the permission request.")
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }, [walletClient, address, tokenIn, tokenOut, amount, targetPrice, direction, expiryDays, agentName, feeTier, onClose, onSuccess])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-card/80 backdrop-blur-xl border-border/30 shadow-2xl shadow-black/20 h-auto max-h-[98vh] overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            Configure Limit Order
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            Set target price and execute automatically via Uniswap
          </p>
        </DialogHeader>

        {/* Chain Check */}
        {!isCorrectChain && (
          <div className="border border-accent/30 bg-accent/5 p-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs text-accent">Wrong Network</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Please switch to Sepolia
                </p>
              </div>
              <button
                onClick={() => switchChain({ chainId: sepolia.id })}
                disabled={isSwitchingChain}
                className="bg-accent text-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {isSwitchingChain ? "Switching..." : "Switch"}
              </button>
            </div>
          </div>
        )}

        {isCorrectChain && (
          <div className="space-y-4 mt-1">
            {/* Agent Name */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Order Name
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Order Direction */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Order Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setDirection("buy")}
                  className={cn(
                    "py-2.5 font-mono text-xs uppercase tracking-widest transition-colors border",
                    direction === "buy"
                      ? "bg-green-500/20 border-green-500/50 text-green-400"
                      : "bg-background/50 border-border/50 text-muted-foreground hover:border-border"
                  )}
                >
                  Buy (Price Below)
                </button>
                <button
                  onClick={() => setDirection("sell")}
                  className={cn(
                    "py-2.5 font-mono text-xs uppercase tracking-widest transition-colors border",
                    direction === "sell"
                      ? "bg-red-500/20 border-red-500/50 text-red-400"
                      : "bg-background/50 border-border/50 text-muted-foreground hover:border-border"
                  )}
                >
                  Sell (Price Above)
                </button>
              </div>
            </div>

            {/* Token Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {direction === "buy" ? "Pay With" : "Sell Token"}
                </label>
                <select
                  value={tokenIn}
                  onChange={(e) => setTokenIn(e.target.value as TokenSymbol)}
                  className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                >
                  {getTokensWithPools().map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {TOKENS[symbol].logo} {symbol}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {direction === "buy" ? "Buy Token" : "Receive Token"}
                </label>
                <select
                  value={tokenOut}
                  onChange={(e) => setTokenOut(e.target.value as TokenSymbol)}
                  className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
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
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Fee Tier
              </label>
              <div className="flex gap-2">
                {validFeeTiers.map((fee) => (
                  <button
                    key={fee}
                    onClick={() => setFeeTier(fee)}
                    className={cn(
                      "flex-1 py-2 font-mono text-xs transition-colors border",
                      feeTier === fee
                        ? "bg-accent/20 border-accent/50 text-accent"
                        : "bg-background/50 border-border/50 text-muted-foreground hover:border-border"
                    )}
                  >
                    {FEE_TIER_LABELS[fee] || `${fee / 10000}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Pool Status */}
            <div className={cn(
              "p-3 border",
              poolStatus === "active"
                ? "border-green-500/30 bg-green-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Pool Status
                </span>
                <span className={cn(
                  "font-mono text-xs",
                  poolStatus === "active" ? "text-green-400" : "text-red-400"
                )}>
                  {poolStatus === "active" && `Active ${poolLiquidity ? `(${poolLiquidity})` : ""}`}
                  {poolStatus === "no-pool" && "No Pool"}
                  {!poolStatus && "Select tokens"}
                </span>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Amount to {direction === "buy" ? "spend" : "sell"}
                </label>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Balance:{" "}
                  {isBalanceLoading ? (
                    "..."
                  ) : tokenBalance ? (
                    <span className="text-accent">
                      {parseFloat(formatUnits(tokenBalance.value, tokenBalance.decimals)).toFixed(4)} {tokenBalance.symbol}
                    </span>
                  ) : (
                    "0"
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="flex-1 bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                />
                <button
                  onClick={() => {
                    if (tokenBalance) {
                      setAmount(formatUnits(tokenBalance.value, tokenBalance.decimals))
                    }
                  }}
                  className="px-2 py-2 bg-background/50 border border-border/50 font-mono text-[10px] text-muted-foreground hover:text-accent hover:border-accent/50 transition-colors"
                >
                  MAX
                </button>
                <span className="px-3 py-2 bg-background/50 border border-border/50 font-mono text-sm text-muted-foreground">
                  {TOKENS[tokenIn].symbol}
                </span>
              </div>
            </div>

            {/* Target Price */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Target Price
                </label>
                <span className="font-mono text-[10px] text-muted-foreground">
                  Current:{" "}
                  {isLoadingRate ? (
                    "..."
                  ) : currentRate ? (
                    <button
                      onClick={() => setTargetPrice(currentRate)}
                      className="text-accent hover:underline"
                    >
                      {currentRate} {tokenOut}/{tokenIn}
                    </button>
                  ) : (
                    "N/A"
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  placeholder={currentRate ? `Current: ${currentRate}` : "e.g., 0.0004"}
                  className="flex-1 bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                />
                <button
                  onClick={() => currentRate && setTargetPrice(currentRate)}
                  disabled={!currentRate}
                  className="px-2 py-2 bg-background/50 border border-border/50 font-mono text-[10px] text-muted-foreground hover:text-accent hover:border-accent/50 transition-colors disabled:opacity-50"
                >
                  USE
                </button>
                <span className="px-3 py-2 bg-background/50 border border-border/50 font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {tokenOut}/{tokenIn}
                </span>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground/60">
                {direction === "buy"
                  ? `Buy ${tokenOut} when 1 ${tokenIn} gets you ≥ ${targetPrice || "?"} ${tokenOut}`
                  : `Sell ${tokenIn} when 1 ${tokenIn} is worth ≥ ${targetPrice || "?"} ${tokenOut}`
                }
                {currentRate && targetPrice && (
                  <span className={cn(
                    "ml-2",
                    parseFloat(targetPrice) > parseFloat(currentRate) ? "text-green-400" : "text-red-400"
                  )}>
                    ({parseFloat(targetPrice) > parseFloat(currentRate)
                      ? `+${(((parseFloat(targetPrice) - parseFloat(currentRate)) / parseFloat(currentRate)) * 100).toFixed(2)}%`
                      : `${(((parseFloat(targetPrice) - parseFloat(currentRate)) / parseFloat(currentRate)) * 100).toFixed(2)}%`
                    } from current)
                  </span>
                )}
              </p>
            </div>

            {/* Expiry */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Order Expiry
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[1, 7, 14, 30].map((days) => (
                  <button
                    key={days}
                    onClick={() => setExpiryDays(days)}
                    className={cn(
                      "py-2 font-mono text-xs transition-colors border",
                      expiryDays === days
                        ? "bg-accent/20 border-accent/50 text-accent"
                        : "bg-background/50 border-border/50 text-muted-foreground hover:border-border"
                    )}
                  >
                    {days}d
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* Footer */}
        {isCorrectChain && (
          <div className="border-t border-border/30 pt-3 mt-3 space-y-2">
            {/* Error */}
            {error && (
              <div className="border border-red-500/30 bg-red-500/10 p-3">
                <p className="font-mono text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="border border-green-500/30 bg-green-500/10 p-3">
                <p className="font-mono text-xs text-green-400">Limit order created successfully!</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-border/50 px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isLoading || poolStatus !== "active" || !targetPrice || success}
                className="flex-1 bg-accent text-background px-4 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing..." :
                 success ? "Created!" :
                 poolStatus !== "active" ? "Select Valid Pair" :
                 !targetPrice ? "Enter Target Price" :
                 "Create Order"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
