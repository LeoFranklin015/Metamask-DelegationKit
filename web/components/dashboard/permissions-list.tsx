"use client"

import { useEffect, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { cn } from "@/lib/utils"

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
  }
  limitOrder?: {
    tokenIn: string
    tokenOut: string
    amountIn: string
    targetPrice: string
    direction: string
  }
  savings?: {
    token: string
    amountPerExecution: string
  }
  recurringPayment?: {
    token: string
    amount: string
    recipient: string
  }
}

interface Permission {
  id: string
  name: string
  agentType: string
  status: "active" | "paused" | "expired"
  spendingToken: string
  monthlyLimit: string
  spent: string
  lastExecution: string | null
  lastTxHash: string | null
  executionCount: number
  onChainRedemptionCount: number
  dataSource: "on-chain" | "off-chain"
  chainId: number
  config: PermissionConfig
}

// Helper to get token info
function getTokenInfo(address: string) {
  const normalized = address.toLowerCase()
  return TOKENS[normalized] || { symbol: "TOKEN", decimals: 18, logo: "●" }
}

// Helper to format relative time
function formatRelativeTime(date: string | null): string {
  if (!date) return "Never"
  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
}

// Helper to get description for a permission
function getPermissionDescription(permission: Permission): string {
  const tokenInfo = getTokenInfo(permission.spendingToken)

  if (permission.agentType === "dca" && permission.config.dca) {
    const inToken = getTokenInfo(permission.config.dca.tokenIn)
    const outToken = getTokenInfo(permission.config.dca.tokenOut)
    return `${inToken.symbol} → ${outToken.symbol}`
  }

  if (permission.agentType === "limit-order" && permission.config.limitOrder) {
    const inToken = getTokenInfo(permission.config.limitOrder.tokenIn)
    const outToken = getTokenInfo(permission.config.limitOrder.tokenOut)
    return `${permission.config.limitOrder.direction.toUpperCase()} ${inToken.symbol}/${outToken.symbol}`
  }

  if (permission.agentType === "savings" && permission.config.savings) {
    return `Auto-save ${tokenInfo.symbol}`
  }

  if (permission.agentType === "recurring-payment" && permission.config.recurringPayment) {
    const recipient = permission.config.recurringPayment.recipient
    return `Pay to ${recipient.slice(0, 6)}...${recipient.slice(-4)}`
  }

  return permission.name
}

function PermissionRow({ permission, index }: { permission: Permission; index: number }) {
  const [mounted, setMounted] = useState(false)
  const tokenInfo = getTokenInfo(permission.spendingToken)

  // Calculate progress
  const spent = Number(formatUnits(BigInt(permission.spent), tokenInfo.decimals))
  const limit = Number(formatUnits(BigInt(permission.monthlyLimit), tokenInfo.decimals))
  const progress = limit > 0 ? (spent / limit) * 100 : 0

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), index * 100)
    return () => clearTimeout(timer)
  }, [index])

  const agentLabel = AGENT_TYPE_LABELS[permission.agentType] || permission.agentType
  const description = getPermissionDescription(permission)

  return (
    <div
      className={cn(
        "group border border-border/50 bg-background/50 p-5 transition-all duration-300 hover:border-accent/50 hover:bg-accent/5",
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <span className="text-lg">{tokenInfo.logo}</span>
          <div>
            <h3 className="font-mono text-sm font-medium">{agentLabel}</h3>
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {spent.toLocaleString(undefined, { maximumFractionDigits: 4 })} / {limit.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tokenInfo.symbol}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-border/50 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-1000 ease-out",
              progress > 80 ? "bg-red-400" : progress > 50 ? "bg-yellow-400" : "bg-accent"
            )}
            style={{ width: mounted ? `${Math.min(progress, 100)}%` : "0%" }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {permission.executionCount} execution{permission.executionCount !== 1 ? "s" : ""}
          </span>
          {permission.dataSource === "on-chain" && (
            <span className="font-mono text-[10px] text-green-400/70 border border-green-400/30 bg-green-400/5 px-1.5 py-0.5">
              on-chain
            </span>
          )}
          {permission.lastTxHash && (
            <a
              href={`https://${permission.chainId === 11155111 ? "sepolia.etherscan.io" : "sepolia.basescan.org"}/tx/${permission.lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors"
            >
              View TX
            </a>
          )}
        </div>
        <button className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors opacity-0 group-hover:opacity-100">
          Manage →
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground/70">
          Last: {formatRelativeTime(permission.lastExecution)}
        </span>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border/50 bg-background/30 p-8 text-center">
      <p className="font-mono text-sm text-muted-foreground">No active permissions</p>
      <p className="font-mono text-[10px] text-muted-foreground mt-2">
        Configure an agent to grant spending permissions
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="border border-border/50 bg-background/50 p-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-6 h-6 bg-border/50 rounded" />
            <div>
              <div className="h-4 w-32 bg-border/50 rounded" />
              <div className="h-3 w-24 bg-border/50 rounded mt-1" />
            </div>
          </div>
          <div className="mt-4">
            <div className="h-1.5 w-full bg-border/50 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function PermissionsList() {
  const { address, isConnected } = useAccount()
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPermissions = useCallback(async () => {
    if (!address) {
      setPermissions([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch(`${BACKEND_URL}/api/agents/user/${address}`)

      if (!response.ok) {
        throw new Error("Failed to fetch permissions")
      }

      const data = await response.json()
      if (data.success) {
        setPermissions(data.permissions)
      } else {
        throw new Error(data.error || "Failed to fetch permissions")
      }
    } catch (err) {
      console.error("Error fetching permissions:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch permissions")
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchPermissions()
  }, [fetchPermissions])

  if (!isConnected) {
    return (
      <div className="border border-dashed border-border/50 bg-background/30 p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">Connect wallet to view permissions</p>
      </div>
    )
  }

  if (isLoading) {
    return <LoadingState />
  }

  if (error) {
    return (
      <div className="border border-red-400/30 bg-red-400/10 p-5">
        <p className="font-mono text-sm text-red-400">{error}</p>
        <button
          onClick={fetchPermissions}
          className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 mt-2"
        >
          Retry →
        </button>
      </div>
    )
  }

  if (permissions.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-3">
      {permissions.map((permission, index) => (
        <PermissionRow key={permission.id} permission={permission} index={index} />
      ))}
    </div>
  )
}
