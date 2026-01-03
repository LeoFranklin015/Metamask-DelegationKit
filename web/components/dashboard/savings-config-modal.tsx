"use client"

import { useState, useCallback, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAccount, useWalletClient, useSwitchChain, useChainId, useBalance } from "wagmi"
import { parseUnits, formatUnits, type Address, type Hex } from "viem"
import {
  requestExecutionPermissions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions"
import { baseSepolia } from "viem/chains"
import { cn } from "@/lib/utils"

// ============================================
// Constants
// ============================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"

// Savings Agent address (on Base Sepolia)
const SAVINGS_AGENT_ADDRESS = "0x4a5fade4f48c372b4c2cfdd1f58fb1ab1408674a" as Address

// Tokens supported by Aave V3 on Base Sepolia
const AAVE_SUPPORTED_TOKENS = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f" as Address,
    decimals: 6,
    logo: "💵",
    apy: "~3.5%",
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    address: "0x0a215D8ba66387DCA84B284D18c3B4ec3de6E54a" as Address,
    decimals: 6,
    logo: "💲",
    apy: "~3.2%",
  },
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0x4200000000000000000000000000000000000006" as Address,
    decimals: 18,
    logo: "⟠",
    apy: "~1.2%",
  },
} as const

type TokenSymbol = keyof typeof AAVE_SUPPORTED_TOKENS

// Time units for interval selection (minutes not supported by MetaMask delegation)
const TIME_UNITS = [
  { value: 3600, label: "Hours", short: "hr" },
  { value: 86400, label: "Days", short: "day" },
  { value: 604800, label: "Weeks", short: "wk" },
] as const

type TimeUnit = typeof TIME_UNITS[number]["value"]

// ============================================
// Component
// ============================================

interface SavingsConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function SavingsConfigModal({ isOpen, onClose, onSuccess }: SavingsConfigModalProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const isCorrectChain = chainId === baseSepolia.id

  // Form state
  const [agentName, setAgentName] = useState("My Savings Agent")
  const [token, setToken] = useState<TokenSymbol>("USDC")
  const [amount, setAmount] = useState("10")
  const [intervalValue, setIntervalValue] = useState(1)
  const [intervalUnit, setIntervalUnit] = useState<TimeUnit>(86400) // Default: days
  const [maxExecutions, setMaxExecutions] = useState("")

  // Calculate interval in seconds
  const intervalSeconds = intervalValue * intervalUnit

  // Get token balance
  const tokenData = AAVE_SUPPORTED_TOKENS[token]
  const { data: tokenBalance, isLoading: isBalanceLoading } = useBalance({
    address,
    token: tokenData.address,
    chainId: baseSepolia.id,
  })

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Calculate estimated yearly earnings
  const estimatedYearlyEarnings = useCallback(() => {
    if (!amount || parseFloat(amount) <= 0) return null
    const amountNum = parseFloat(amount)
    const executionsPerYear = (365 * 24 * 3600) / intervalSeconds
    const totalDeposited = amountNum * executionsPerYear
    const apyMatch = tokenData.apy.match(/[\d.]+/)
    const apyPercent = apyMatch ? parseFloat(apyMatch[0]) : 0
    const earnings = (totalDeposited * apyPercent) / 100
    return { totalDeposited: totalDeposited.toFixed(2), earnings: earnings.toFixed(2) }
  }, [amount, intervalSeconds, tokenData.apy])

  const handleCreate = useCallback(async () => {
    if (!walletClient || !address) return

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountInWei = parseUnits(amount, tokenData.decimals)
      const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: baseSepolia.id,
          expiry,
          signer: {
            type: "account",
            data: { address: SAVINGS_AGENT_ADDRESS },
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

      const payload = {
        userAddress: address,
        name: agentName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: SAVINGS_AGENT_ADDRESS,
        // Permission metadata for on-chain correlation
        chainId: chainIdNum,
        spendingToken: permissionData.tokenAddress,
        spendingLimit: BigInt(permissionData.periodAmount).toString(),
        spendingPeriod: permissionData.periodDuration,
        startTime: permissionData.startTime,
        config: {
          token: tokenData.address,
          amountPerExecution: amountInWei.toString(),
          intervalSeconds,
        },
        maxExecutions: maxExecutions ? parseInt(maxExecutions) : undefined,
      }

      const response = await fetch(`${BACKEND_URL}/api/agents/savings`, {
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
        setAgentName("My Savings Agent")
        setAmount("10")
        setMaxExecutions("")
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
  }, [walletClient, address, token, amount, intervalSeconds, maxExecutions, agentName, tokenData, onClose, onSuccess])

  const yearlyEstimate = estimatedYearlyEarnings()

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-card/80 backdrop-blur-xl border-border/30 shadow-2xl shadow-black/20 h-auto max-h-[98vh] overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            Configure Savings Agent
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            Auto-supply tokens to Aave V3 and earn yield
          </p>
        </DialogHeader>

        {/* Chain Check */}
        {!isCorrectChain && (
          <div className="border border-accent/30 bg-accent/5 p-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs text-accent">Wrong Network</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Please switch to Base Sepolia
                </p>
              </div>
              <button
                onClick={() => switchChain({ chainId: baseSepolia.id })}
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
                Agent Name
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Token Selection */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Token to Save
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(AAVE_SUPPORTED_TOKENS) as TokenSymbol[]).map((sym) => (
                  <button
                    key={sym}
                    onClick={() => setToken(sym)}
                    className={cn(
                      "p-3 border transition-colors text-center",
                      token === sym
                        ? "bg-green-500/20 border-green-500/50"
                        : "bg-background/50 border-border/50 hover:border-border"
                    )}
                  >
                    <div className="text-xl">{AAVE_SUPPORTED_TOKENS[sym].logo}</div>
                    <div className="font-mono text-xs mt-1">{sym}</div>
                    <div className="font-mono text-[10px] text-green-400 mt-0.5">
                      {AAVE_SUPPORTED_TOKENS[sym].apy} APY
                    </div>
                  </button>
                ))}
              </div>

              {/* Faucet Info */}
              <div className="border border-amber-500/30 bg-amber-500/5 p-3 mt-2">
                <div className="flex gap-2">
                  <span className="text-amber-400 text-sm">⚠</span>
                  <div className="space-y-1">
                    <p className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">
                      Need testnet tokens?
                    </p>
                    <ol className="font-mono text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                      <li>
                        Go to{" "}
                        <a
                          href="https://app.aave.com/faucet/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                        >
                          app.aave.com/faucet
                        </a>
                      </li>
                      <li>Enable testnet mode (top right toggle)</li>
                      <li>Switch to Base Sepolia network</li>
                      <li>Select {token} and request tokens from faucet</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            {/* Amount */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Amount per supply
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
                  {tokenData.symbol}
                </span>
              </div>
            </div>

            {/* Interval */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Supply Frequency
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
                = {intervalSeconds.toLocaleString()} seconds between supplies
              </p>
            </div>

            {/* Max Executions */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Max Supplies (optional)
              </label>
              <input
                type="number"
                value={maxExecutions}
                onChange={(e) => setMaxExecutions(e.target.value)}
                placeholder="Leave empty for unlimited"
                className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
              />
            </div>

            {/* Yearly Estimate */}
            {yearlyEstimate && (
              <div className="border border-green-500/30 bg-green-500/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Estimated Yearly
                  </span>
                  <span className="font-mono text-xs text-green-400">
                    ~{yearlyEstimate.totalDeposited} {tokenData.symbol} deposited
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Est. Earnings ({tokenData.apy})
                  </span>
                  <span className="font-mono text-xs text-green-400">
                    ~{yearlyEstimate.earnings} {tokenData.symbol}
                  </span>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="border border-border/30 p-3">
              <p className="font-mono text-[10px] text-muted-foreground/60 text-center">
                Savings Agent: {SAVINGS_AGENT_ADDRESS.slice(0, 10)}...{SAVINGS_AGENT_ADDRESS.slice(-8)} • Base Sepolia
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
                <p className="font-mono text-xs text-green-400">Savings agent created successfully!</p>
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
                disabled={isLoading || !amount || parseFloat(amount) <= 0 || success}
                className="flex-1 bg-accent text-background px-4 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing..." :
                 success ? "Created!" :
                 !amount || parseFloat(amount) <= 0 ? "Enter Amount" :
                 "Create Agent"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
