"use client"

import { useEffect, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { cn } from "@/lib/utils"
import Link from "next/link"

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"

// Known agent addresses
const AGENT_ADDRESSES: Record<string, { name: string; type: string; icon: string; chain: string; chainId: number }> = {
  "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe": {
    name: "DCA Agent",
    type: "dca",
    icon: "↻",
    chain: "Sepolia",
    chainId: 11155111,
  },
  "0x0013bb0d8712dc4cacbc8cd32d4c0c851cdf18da": {
    name: "Limit Order Agent",
    type: "limit-order",
    icon: "⇌",
    chain: "Sepolia",
    chainId: 11155111,
  },
  "0x4a5fade4f48c372b4c2cfdd1f58fb1ab1408674a": {
    name: "Savings Agent",
    type: "savings",
    icon: "⬡",
    chain: "Base Sepolia",
    chainId: 84532,
  },
  "0x9d40c09a940a67ad7aff166c99e9422ce89aeb2d": {
    name: "Subscription Agent",
    type: "subscription",
    icon: "◈",
    chain: "Sepolia",
    chainId: 11155111,
  },
}

// Token info
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18 },
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": { symbol: "USDC", decimals: 6 },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": { symbol: "DAI", decimals: 18 },
  "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5": { symbol: "LINK", decimals: 18 },
}

interface Permission {
  id: string
  name: string
  agentType: string
  status: string
  sessionKeyAddress: string
  spendingToken: string
  spendingLimit: string
  chainId: number
  executionCount: number
  dataSource: string
}

interface AgentGroup {
  address: string
  name: string
  type: string
  icon: string
  chain: string
  chainId: number
  permissions: Permission[]
  totalExecutions: number
}

function getTokenInfo(address: string) {
  return TOKENS[address.toLowerCase()] || { symbol: "TOKEN", decimals: 18 }
}

function getAgentInfo(sessionKeyAddress: string, agentType: string) {
  const normalizedAddress = sessionKeyAddress.toLowerCase()
  if (AGENT_ADDRESSES[normalizedAddress]) {
    return AGENT_ADDRESSES[normalizedAddress]
  }

  const typeMap: Record<string, { name: string; icon: string }> = {
    "dca": { name: "DCA Agent", icon: "↻" },
    "limit-order": { name: "Limit Order Agent", icon: "⇌" },
    "savings": { name: "Savings Agent", icon: "⬡" },
    "recurring-payment": { name: "Subscription Agent", icon: "◈" },
  }

  return {
    name: typeMap[agentType]?.name || "Unknown Agent",
    type: agentType,
    icon: typeMap[agentType]?.icon || "●",
    chain: "Unknown",
    chainId: 0,
  }
}

function LoadingState() {
  return (
    <div className="flex items-start gap-8 animate-pulse overflow-x-auto pb-4">
      <div className="flex-shrink-0 w-40 h-24 bg-border/50 rounded" />
      <div className="flex flex-col gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-16 h-px bg-border/50" />
            <div className="w-32 h-16 bg-border/50 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border/50 bg-background/30 p-8 text-center">
      <p className="font-mono text-sm text-muted-foreground">No delegations found</p>
      <p className="font-mono text-[10px] text-muted-foreground mt-2">
        Create a new permission to delegate spending to an agent
      </p>
    </div>
  )
}

function PermissionNode({ permission, isFirst, isLast, totalCount }: {
  permission: Permission
  isFirst: boolean
  isLast: boolean
  totalCount: number
}) {
  const tokenInfo = getTokenInfo(permission.spendingToken)
  const limit = Number(formatUnits(BigInt(permission.spendingLimit), tokenInfo.decimals))

  return (
    <div className="flex items-center py-2">
      {/* Horizontal connector line */}
      <div className="relative w-12 shrink-0">
        <div className="absolute top-1/2 left-0 w-full h-px bg-white/40" />
        {/* Vertical line segment */}
        {totalCount > 1 && (
          <div
            className={cn(
              "absolute left-0 w-px bg-white/40",
              isFirst ? "top-1/2 h-[calc(50%+8px)]" : isLast ? "top-[-8px] h-[calc(50%+8px)]" : "top-[-8px] h-[calc(100%+16px)]"
            )}
          />
        )}
      </div>

      {/* Permission card */}
      <div className="group border border-border/50 bg-card/50 p-4 hover:border-accent/50 transition-colors min-w-[200px]">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-mono text-xs font-medium truncate">{permission.name}</h4>
          <span
            className={cn(
              "font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 border flex-shrink-0",
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
        <div className="flex items-center gap-2 mt-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {limit.toLocaleString(undefined, { maximumFractionDigits: 2 })} {tokenInfo.symbol}
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {permission.executionCount} exec
          </span>
        </div>
      </div>
    </div>
  )
}

function AgentNode({ agent, isFirst, isLast, totalAgents }: {
  agent: AgentGroup
  isFirst: boolean
  isLast: boolean
  totalAgents: number
}) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="flex items-start py-3">
      {/* Horizontal connector from wallet */}
      <div className="relative w-16 shrink-0 h-20 flex items-center">
        <div className="absolute top-1/2 left-0 w-full h-px bg-white/40" />
        {/* Vertical connector for multiple agents */}
        {totalAgents > 1 && (
          <div
            className={cn(
              "absolute left-0 w-px bg-white/40",
              isFirst ? "top-1/2 h-[calc(50%+12px)]" : isLast ? "top-[-12px] h-[calc(50%+12px)]" : "top-[-12px] h-[calc(100%+24px)]"
            )}
          />
        )}
      </div>

      {/* Agent card and its permissions */}
      <div className="flex items-start gap-1">
        {/* Agent card */}
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex items-center gap-4 border border-accent/50 bg-accent/5 p-4 cursor-pointer hover:bg-accent/10 transition-colors min-w-[220px]"
        >
          <div className="w-12 h-12 border border-accent/50 bg-accent/10 flex items-center justify-center shrink-0">
            <span className="text-xl">{agent.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-medium truncate">{agent.name}</h3>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-[9px] text-muted-foreground border border-border/50 px-1.5 py-0.5">
                {agent.chain}
              </span>
              <span className="font-mono text-[9px] text-muted-foreground">
                {agent.permissions.length} perm
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="font-mono text-[9px] text-muted-foreground">
              {isExpanded ? "◀" : "▶"}
            </span>
            <Link
              href={`/dashboard/agent/${agent.address}`}
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[8px] text-accent hover:text-accent/80 transition-colors"
            >
              Stats →
            </Link>
          </div>
        </div>

        {/* Permissions branching from agent */}
        {isExpanded && agent.permissions.length > 0 && (
          <div className="flex flex-col justify-center">
            {agent.permissions.map((permission, idx) => (
              <PermissionNode
                key={permission.id}
                permission={permission}
                isFirst={idx === 0}
                isLast={idx === agent.permissions.length - 1}
                totalCount={agent.permissions.length}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function DelegationTree() {
  const { address, isConnected } = useAccount()
  const [agentGroups, setAgentGroups] = useState<AgentGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchDelegations = useCallback(async () => {
    if (!address) {
      setAgentGroups([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${BACKEND_URL}/api/agents/user/${address}?status=all`)

      if (!response.ok) {
        throw new Error("Failed to fetch permissions")
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch permissions")
      }

      const permissions: Permission[] = data.permissions || []
      const groupMap = new Map<string, AgentGroup>()

      permissions.forEach((permission) => {
        const agentInfo = getAgentInfo(permission.sessionKeyAddress, permission.agentType)
        const groupKey = `${permission.agentType}-${permission.chainId}`

        if (!groupMap.has(groupKey)) {
          const knownAgent = Object.entries(AGENT_ADDRESSES).find(
            ([, info]) => info.type === permission.agentType && info.chainId === permission.chainId
          )

          groupMap.set(groupKey, {
            address: knownAgent?.[0] || permission.sessionKeyAddress,
            name: agentInfo.name,
            type: permission.agentType,
            icon: agentInfo.icon,
            chain: agentInfo.chain,
            chainId: permission.chainId,
            permissions: [],
            totalExecutions: 0,
          })
        }

        const group = groupMap.get(groupKey)!
        group.permissions.push(permission)
        group.totalExecutions += permission.executionCount
      })

      setAgentGroups(Array.from(groupMap.values()))
    } catch (err) {
      console.error("Error fetching delegations:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch delegations")
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchDelegations()
  }, [fetchDelegations])

  if (!isConnected) {
    return (
      <div className="border border-dashed border-border/50 bg-background/30 p-8 text-center">
        <p className="font-mono text-sm text-muted-foreground">Connect wallet to view delegation tree</p>
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
          onClick={fetchDelegations}
          className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 mt-2"
        >
          Retry →
        </button>
      </div>
    )
  }

  if (agentGroups.length === 0) {
    return <EmptyState />
  }

  const totalPermissions = agentGroups.reduce((sum, g) => sum + g.permissions.length, 0)
  const totalExecutions = agentGroups.reduce((sum, g) => sum + g.totalExecutions, 0)

  return (
    <div className="overflow-x-auto pb-6">
      <div className="flex items-start min-w-max gap-2">
        {/* Root node - User wallet */}
        <div className="flex items-center">
          <div className="border-2 border-accent bg-accent/10 p-5 min-w-[200px]">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 border border-accent flex items-center justify-center bg-accent/20">
                <span className="text-2xl">👤</span>
              </div>
              <div>
                <h3 className="font-mono text-sm font-medium">Your Wallet</h3>
                <p className="font-mono text-[10px] text-muted-foreground mt-1">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-accent/30 flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted-foreground">
                {totalPermissions} delegation{totalPermissions !== 1 ? "s" : ""}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {totalExecutions} exec
              </span>
            </div>
            <button
              onClick={fetchDelegations}
              className="mt-3 w-full font-mono text-[9px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors border border-border/50 px-2 py-1.5"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Agent branches */}
        <div className="flex flex-col justify-center">
          {agentGroups.map((agent, idx) => (
            <AgentNode
              key={`${agent.type}-${agent.chainId}`}
              agent={agent}
              isFirst={idx === 0}
              isLast={idx === agentGroups.length - 1}
              totalAgents={agentGroups.length}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
