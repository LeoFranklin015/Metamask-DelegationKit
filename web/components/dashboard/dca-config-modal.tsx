"use client"

import { useState, useCallback, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAccount, useWalletClient, useSwitchChain, useChainId, useBalance } from "wagmi"
import { parseUnits, formatUnits, type Address, type Hex } from "viem"
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

// Fixed DCA Agent address
const DCA_AGENT_ADDRESS = "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address

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
  { tokenA: "WETH", tokenB: "USDC", fee: 500, liquidity: "High" },
  { tokenA: "WETH", tokenB: "USDC", fee: 3000, liquidity: "~$7.3K" },
  { tokenA: "WETH", tokenB: "USDC", fee: 10000, liquidity: "~$31K" },
  { tokenA: "WETH", tokenB: "UNI", fee: 500, liquidity: "High" },
  { tokenA: "WETH", tokenB: "UNI", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "WETH", tokenB: "UNI", fee: 10000, liquidity: "High" },
  { tokenA: "WETH", tokenB: "DAI", fee: 500, liquidity: "High" },
  { tokenA: "WETH", tokenB: "DAI", fee: 3000, liquidity: "~$6.8K" },
  { tokenA: "WETH", tokenB: "DAI", fee: 10000, liquidity: "High" },
  { tokenA: "WETH", tokenB: "LINK", fee: 500, liquidity: "High" },
  { tokenA: "WETH", tokenB: "LINK", fee: 3000, liquidity: "High" },
  { tokenA: "USDC", tokenB: "UNI", fee: 500, liquidity: "High" },
  { tokenA: "USDC", tokenB: "UNI", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "USDC", tokenB: "UNI", fee: 10000, liquidity: "~$31K" },
  { tokenA: "UNI", tokenB: "DAI", fee: 3000, liquidity: "~$6.8K" },
  { tokenA: "UNI", tokenB: "LINK", fee: 3000, liquidity: "~$7.7M" },
  { tokenA: "DAI", tokenB: "LINK", fee: 500, liquidity: "High" },
  { tokenA: "DAI", tokenB: "LINK", fee: 3000, liquidity: "~$6.8K" },
]

// Helper functions
function hasPoolWithLiquidity(tokenIn: TokenSymbol, tokenOut: TokenSymbol, fee: number): { exists: boolean; liquidity?: string } {
  const pool = POOLS_WITH_LIQUIDITY.find(p =>
    ((p.tokenA === tokenIn && p.tokenB === tokenOut) || (p.tokenA === tokenOut && p.tokenB === tokenIn)) && p.fee === fee
  )
  return pool ? { exists: true, liquidity: pool.liquidity } : { exists: false }
}

function getTokensWithPools(): TokenSymbol[] {
  const tokensInPools = new Set<TokenSymbol>()
  POOLS_WITH_LIQUIDITY.forEach(pool => {
    tokensInPools.add(pool.tokenA)
    tokensInPools.add(pool.tokenB)
  })
  tokensInPools.delete("ETH")
  return Array.from(tokensInPools)
}

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

// Time units for interval selection
const TIME_UNITS = [
  { value: 60, label: "Minutes", short: "min" },
  { value: 3600, label: "Hours", short: "hr" },
  { value: 86400, label: "Days", short: "day" },
  { value: 604800, label: "Weeks", short: "wk" },
] as const

type TimeUnit = typeof TIME_UNITS[number]["value"]

// ============================================
// Component
// ============================================

interface DCAConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function DCAConfigModal({ isOpen, onClose, onSuccess }: DCAConfigModalProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const isCorrectChain = chainId === sepolia.id

  // Form state
  const [agentName, setAgentName] = useState("My DCA Bot")
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("USDC")
  const [tokenOut, setTokenOut] = useState<TokenSymbol>("WETH")
  const [amount, setAmount] = useState("1")
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<TimeUnit>(86400) // Default: days
  const [maxExecutions, setMaxExecutions] = useState("")
  const [feeTier, setFeeTier] = useState(3000)

  // Calculate interval in seconds
  const intervalSeconds = intervalValue * intervalUnit

  // Get token balance
  const tokenInData = TOKENS[tokenIn]
  const { data: tokenBalance, isLoading: isBalanceLoading } = useBalance({
    address,
    token: tokenInData.address || undefined,
    chainId: sepolia.id,
  })

  // Pool status
  const [poolStatus, setPoolStatus] = useState<"checking" | "active" | "no-pool" | "no-liquidity" | null>(null)
  const [poolLiquidity, setPoolLiquidity] = useState<string | null>(null)

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const validOutputTokens = getValidOutputTokens(tokenIn)
  const validFeeTiers = getValidFeeTiers(tokenIn, tokenOut)

  // Auto-select valid output token
  useEffect(() => {
    if (!validOutputTokens.includes(tokenOut) && validOutputTokens.length > 0) {
      setTokenOut(validOutputTokens[0])
    }
  }, [tokenIn, validOutputTokens, tokenOut])

  // Auto-select valid fee tier
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

  const handleCreate = useCallback(async () => {
    if (!walletClient || !address) return

    const tokenData = TOKENS[tokenIn]
    if (!tokenData.address) {
      setError("Invalid token selected")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountInWei = parseUnits(amount, tokenData.decimals)
      const expiry = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: sepolia.id,
          expiry,
          signer: {
            type: "account",
            data: { address: DCA_AGENT_ADDRESS },
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

      // Create agent in backend
      const tokenOutData = TOKENS[tokenOut]
      const tokenOutAddr = tokenOut === "ETH" ? TOKENS.WETH.address : tokenOutData.address

      const payload = {
        userAddress: address,
        name: agentName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: DCA_AGENT_ADDRESS,
        // Permission metadata for on-chain correlation
        chainId: chainIdNum,
        spendingToken: permissionData.tokenAddress,
        spendingLimit: BigInt(permissionData.periodAmount).toString(),
        spendingPeriod: permissionData.periodDuration,
        startTime: permissionData.startTime,
        config: {
          tokenIn: tokenData.address,
          tokenOut: tokenOutAddr,
          amountPerExecution: amountInWei.toString(),
          intervalSeconds,
          maxSlippage: 1.0,
          feeTier,
        },
        maxExecutions: maxExecutions ? parseInt(maxExecutions) : undefined,
      }

      const response = await fetch(`${BACKEND_URL}/api/agents/dca`, {
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

      // Close after short delay
      setTimeout(() => {
        onClose()
        setSuccess(false)
      }, 2000)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes("User rejected")) {
        setError("You rejected the permission request")
      } else {
        setError(msg)
      }
    } finally {
      setIsLoading(false)
    }
  }, [walletClient, address, tokenIn, tokenOut, amount, intervalSeconds, maxExecutions, agentName, feeTier, onClose, onSuccess])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-card/80 backdrop-blur-xl border-border/30 shadow-2xl shadow-black/20 h-auto max-h-[98vh] overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            Configure DCA Agent
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            Dollar-cost average into any token automatically
          </p>
        </DialogHeader>

        {/* Wrong Chain Warning */}
        {!isCorrectChain && (
          <div className="border border-yellow-500/30 bg-yellow-500/10 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs text-yellow-400 font-medium">Wrong Network</p>
                <p className="font-mono text-[10px] text-yellow-400/70 mt-1">
                  Switch to Sepolia to continue
                </p>
              </div>
              <button
                onClick={() => switchChain({ chainId: sepolia.id })}
                disabled={isSwitchingChain}
                className="bg-yellow-500 text-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:bg-yellow-400 transition-colors disabled:opacity-50"
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
                DCA Name
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Token Selection */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Spend (Token In)
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
                  Buy (Token Out)
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
                      "flex-1 px-3 py-2 font-mono text-xs transition-colors border",
                      feeTier === fee
                        ? "bg-accent text-background border-accent"
                        : "bg-background/50 text-muted-foreground border-border/50 hover:border-accent/50"
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
                ? "border-green-500/30 bg-green-500/10"
                : "border-red-500/30 bg-red-500/10"
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
                  Amount per execution
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

            {/* Interval */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Execution Interval
              </label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">Every</span>
                <input
                  type="number"
                  min={1}
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 bg-background/50 border border-border/50 px-2 py-2 font-mono text-sm focus:outline-none focus:border-accent/50 text-center"
                />
                <select
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(Number(e.target.value) as TimeUnit)}
                  className="flex-1 bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                >
                  {TIME_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground/60">
                = {intervalSeconds.toLocaleString()} seconds between executions
              </p>
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
                <p className="font-mono text-xs text-green-400">Agent created successfully!</p>
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
                disabled={isLoading || poolStatus !== "active" || success}
                className="flex-1 bg-accent text-background px-4 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing..." : success ? "Created!" : "Create Agent"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
