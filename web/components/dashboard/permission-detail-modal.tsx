"use client"

import { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatUnits } from "viem"
import { cn } from "@/lib/utils"
import {
  fetchRedemptionsForPermission,
  transformToActivity,
  getChainInfo,
  formatRelativeTime,
  type Activity,
} from "./recent-activity"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"

// Token info for display
const TOKENS: Record<string, { symbol: string; decimals: number; logo: string }> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18, logo: "⟠" },
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": { symbol: "USDC", decimals: 6, logo: "💵" },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18, logo: "🦄" },
  "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": { symbol: "DAI", decimals: 18, logo: "◈" },
  "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5": { symbol: "LINK", decimals: 18, logo: "⬡" },
}

// Agent type display names
const AGENT_TYPE_LABELS: Record<string, string> = {
  "dca": "DCA Agent",
  "limit-order": "Limit Order Agent",
  "savings": "Savings Agent",
  "recurring-payment": "Subscription Agent",
}

interface PermissionConfig {
  dca?: {
    tokenIn: string
    tokenOut: string
    amountPerExecution: string
    intervalSeconds: number
    feeTier?: number
  }
  limitOrder?: {
    tokenIn: string
    tokenOut: string
    amountIn: string
    targetPrice: string
    direction: string
    feeTier?: number
  }
  savings?: {
    token: string
    amountPerExecution: string
    intervalSeconds: number
  }
  recurringPayment?: {
    token: string
    amount: string
    recipient: string
    intervalSeconds: number
  }
}

export interface Permission {
  id: string
  name: string
  agentType: string
  status: "active" | "paused" | "expired" | "cancelled"
  spendingToken: string
  monthlyLimit: string
  spent: string
  lastExecution: string | null
  lastTxHash: string | null
  executionCount: number
  onChainRedemptionCount: number
  dataSource: "on-chain" | "off-chain"
  chainId: number
  sessionKeyAddress: string
  spendingLimit: string
  spendingPeriod: number
  startTime: number
  config: PermissionConfig
  createdAt: string
}

function getTokenInfo(address: string) {
  const normalized = address.toLowerCase()
  return TOKENS[normalized] || { symbol: "TOKEN", decimals: 18, logo: "●" }
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`
  return `${Math.floor(seconds / 86400)} days`
}

function TransactionRow({ activity }: { activity: Activity }) {
  const chainInfo = getChainInfo(activity.chainId)
  const shortTxHash = activity.txHash
    ? `${activity.txHash.slice(0, 10)}...${activity.txHash.slice(-8)}`
    : ""

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border border-border/50 flex items-center justify-center">
          <span className="font-mono text-[10px] text-accent">
            {activity.agentIcon}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            {activity.txHash && chainInfo.explorer ? (
              <a
                href={`${chainInfo.explorer}/tx/${activity.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-accent hover:text-accent/80 transition-colors"
              >
                {shortTxHash} ↗
              </a>
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {shortTxHash}
              </span>
            )}
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">
            {activity.chain}
          </span>
        </div>
      </div>
      <div className="text-right">
        {activity.amount && (
          <span className="font-mono text-xs">{activity.amount}</span>
        )}
        <p className="font-mono text-[10px] text-muted-foreground">
          {formatRelativeTime(activity.timestamp)}
        </p>
      </div>
    </div>
  )
}

interface PermissionDetailModalProps {
  isOpen: boolean
  onClose: () => void
  permission: Permission | null
  onCancelled?: () => void
}

export function PermissionDetailModal({
  isOpen,
  onClose,
  permission,
  onCancelled,
}: PermissionDetailModalProps) {
  const [transactions, setTransactions] = useState<Activity[]>([])
  const [isLoadingTx, setIsLoadingTx] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const fetchTransactions = useCallback(async () => {
    if (!permission) return

    try {
      setIsLoadingTx(true)
      // Fetch redemptions for this specific permission using composite key
      const redemptions = await fetchRedemptionsForPermission({
        delegate: permission.sessionKeyAddress,
        spendingToken: permission.spendingToken,
        spendingPeriod: permission.spendingPeriod,
        spendingStartDate: permission.startTime,
        limit: 50,
      })
      const activities = redemptions.map(transformToActivity)
      setTransactions(activities)
    } catch (error) {
      console.error("Failed to fetch transactions:", error)
    } finally {
      setIsLoadingTx(false)
    }
  }, [permission])

  useEffect(() => {
    if (isOpen && permission) {
      fetchTransactions()
    }
  }, [isOpen, permission, fetchTransactions])

  const handleCancel = async () => {
    if (!permission) return

    try {
      setIsCancelling(true)
      const response = await fetch(`${BACKEND_URL}/api/agents/${permission.id}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to cancel permission")
      }

      onCancelled?.()
      onClose()
    } catch (error) {
      console.error("Failed to cancel permission:", error)
    } finally {
      setIsCancelling(false)
    }
  }

  if (!permission) return null

  const tokenInfo = getTokenInfo(permission.spendingToken)
  const spent = Number(formatUnits(BigInt(permission.spent), tokenInfo.decimals))
  const limit = Number(formatUnits(BigInt(permission.monthlyLimit), tokenInfo.decimals))
  const progress = limit > 0 ? (spent / limit) * 100 : 0
  const agentLabel = AGENT_TYPE_LABELS[permission.agentType] || permission.agentType
  const chainInfo = getChainInfo(permission.chainId)

  // Get interval from config
  let interval = 0
  if (permission.config.dca) interval = permission.config.dca.intervalSeconds
  else if (permission.config.savings) interval = permission.config.savings.intervalSeconds
  else if (permission.config.recurringPayment) interval = permission.config.recurringPayment.intervalSeconds

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-background border-border/50 p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-border/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{tokenInfo.logo}</span>
              <div>
                <DialogTitle className="font-mono text-lg">{agentLabel}</DialogTitle>
                <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
                  {permission.name}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-widest px-2 py-1 border",
                permission.status === "active"
                  ? "text-green-400 border-green-400/30 bg-green-400/10"
                  : permission.status === "paused"
                  ? "text-yellow-400 border-yellow-400/30 bg-yellow-400/10"
                  : "text-muted-foreground border-border bg-muted/10"
              )}
            >
              {permission.status}
            </span>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
          {/* Progress Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Spending Progress
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {progress.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 w-full bg-border/50 overflow-hidden mb-2">
              <div
                className={cn(
                  "h-full transition-all duration-500",
                  progress > 80 ? "bg-red-400" : progress > 50 ? "bg-yellow-400" : "bg-accent"
                )}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs">
                {spent.toLocaleString(undefined, { maximumFractionDigits: 18 })} {tokenInfo.symbol}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                / {limit.toLocaleString(undefined, { maximumFractionDigits: 18 })} {tokenInfo.symbol}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Chain
              </span>
              <span className="font-mono text-sm">{chainInfo.name}</span>
            </div>
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Executions
              </span>
              <span className="font-mono text-sm">{permission.executionCount}</span>
            </div>
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Interval
              </span>
              <span className="font-mono text-sm">{interval > 0 ? formatInterval(interval) : "One-time"}</span>
            </div>
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Last Execution
              </span>
              <span className="font-mono text-sm">
                {permission.lastExecution
                  ? formatRelativeTime(new Date(permission.lastExecution))
                  : "Never"}
              </span>
            </div>
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Per-Period Limit
              </span>
              <span className="font-mono text-sm">
                {Number(formatUnits(BigInt(permission.spendingLimit), tokenInfo.decimals)).toLocaleString(undefined, { maximumFractionDigits: 18 })} {tokenInfo.symbol}
              </span>
            </div>
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
                Data Source
              </span>
              <span className={cn(
                "font-mono text-sm",
                permission.dataSource === "on-chain" ? "text-green-400" : "text-muted-foreground"
              )}>
                {permission.dataSource}
              </span>
            </div>
          </div>

          {/* Agent Address */}
          <div className="border border-border/30 p-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-1">
              Agent Address
            </span>
            <a
              href={`${chainInfo.explorer}/address/${permission.sessionKeyAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-accent hover:text-accent/80 transition-colors break-all"
            >
              {permission.sessionKeyAddress} ↗
            </a>
          </div>

          {/* Config Details */}
          {permission.config.dca && (
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
                DCA Configuration
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Token In:</span>{" "}
                  {getTokenInfo(permission.config.dca.tokenIn).symbol}
                </div>
                <div>
                  <span className="text-muted-foreground">Token Out:</span>{" "}
                  {getTokenInfo(permission.config.dca.tokenOut).symbol}
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  {Number(formatUnits(BigInt(permission.config.dca.amountPerExecution), getTokenInfo(permission.config.dca.tokenIn).decimals)).toLocaleString()}
                </div>
                <div>
                  <span className="text-muted-foreground">Fee Tier:</span>{" "}
                  {(permission.config.dca.feeTier || 3000) / 10000}%
                </div>
              </div>
            </div>
          )}

          {permission.config.recurringPayment && (
            <div className="border border-border/30 p-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground block mb-2">
                Payment Configuration
              </span>
              <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Recipient:</span>{" "}
                  <a
                    href={`${chainInfo.explorer}/address/${permission.config.recurringPayment.recipient}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:text-accent/80"
                  >
                    {permission.config.recurringPayment.recipient.slice(0, 10)}...{permission.config.recurringPayment.recipient.slice(-8)} ↗
                  </a>
                </div>
                <div>
                  <span className="text-muted-foreground">Amount:</span>{" "}
                  {Number(formatUnits(BigInt(permission.config.recurringPayment.amount), tokenInfo.decimals)).toLocaleString()} {tokenInfo.symbol}
                </div>
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Recent Transactions
              </span>
              <span className="font-mono text-[10px] text-green-400/70 border border-green-400/30 bg-green-400/5 px-1.5 py-0.5">
                on-chain
              </span>
            </div>
            <div className="border border-border/30 max-h-[200px] overflow-y-auto">
              {isLoadingTx ? (
                <div className="p-4 text-center">
                  <span className="font-mono text-xs text-muted-foreground">Loading transactions...</span>
                </div>
              ) : transactions.length === 0 ? (
                <div className="p-4 text-center">
                  <span className="font-mono text-xs text-muted-foreground">No transactions yet</span>
                </div>
              ) : (
                <div className="p-2">
                  {transactions.map((tx) => (
                    <TransactionRow key={tx.id} activity={tx} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-4 border-t border-border/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">
              Created {new Date(permission.createdAt).toLocaleDateString()}
            </span>
          </div>
          {permission.status === "active" && (
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors px-3 py-1.5 border border-red-400/30 hover:border-red-400/50 disabled:opacity-50"
            >
              {isCancelling ? "Cancelling..." : "Cancel Permission"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
