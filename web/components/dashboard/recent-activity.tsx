"use client"

import { useEffect, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"
import { cn } from "@/lib/utils"
import Link from "next/link"

// Envio GraphQL endpoint
const ENVIO_GRAPHQL_URL =
  process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL ||
  "https://indexer.dev.hyperindex.xyz/dca02a0/v1/graphql"

// Chain info
const CHAINS: Record<number, { name: string; explorer: string }> = {
  11155111: { name: "Sepolia", explorer: "https://sepolia.etherscan.io" },
  84532: { name: "Base Sepolia", explorer: "https://sepolia.basescan.org" },
}

// Token info for display
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18 },
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": { symbol: "USDC", decimals: 6 },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": { symbol: "DAI", decimals: 18 },
  "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5": { symbol: "LINK", decimals: 18 },
}

// Known agent addresses mapped to their types
const AGENT_ADDRESSES: Record<string, { name: string; type: string; icon: string; action: string }> = {
  "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe": {
    name: "DCA Agent",
    type: "dca",
    icon: "↻",
    action: "DCA Executed"
  },
  "0x0013bb0d8712dc4cacbc8cd32d4c0c851cdf18da": {
    name: "Limit Order Agent",
    type: "limit-order",
    icon: "⇌",
    action: "Order Filled"
  },
  "0x4a5fade4f48c372b4c2cfdd1f58fb1ab1408674a": {
    name: "Savings Agent",
    type: "savings",
    icon: "⬡",
    action: "Auto-saved"
  },
  "0x9d40c09a940a67ad7aff166c99e9422ce89aeb2d": {
    name: "Subscription Agent",
    type: "subscription",
    icon: "◈",
    action: "Subscription Paid"
  },
}

export interface EnvioRedemption {
  id: string
  chainId: number
  delegate: string
  delegator: string
  rootDelegator: string
  redeemer: string
  spendingToken: string | null
  spendingLimit: string | null
  executedToken: string | null
  executedAmount: string | null
  executedRecipient: string | null
  timestamp: string
  txHash: string
}

export interface Activity {
  id: string
  agent: string
  agentType: string
  agentIcon: string
  action: string
  amount: string
  token: string
  chain: string
  chainId: number
  timestamp: Date
  txHash: string
}

// Helper to get token info
function getTokenInfo(address: string | null) {
  if (!address) return { symbol: "TOKEN", decimals: 18 }
  const normalized = address.toLowerCase()
  return TOKENS[normalized] || { symbol: "TOKEN", decimals: 18 }
}

// Helper to get chain info
export function getChainInfo(chainId: number) {
  return CHAINS[chainId] || { name: `Chain ${chainId}`, explorer: "" }
}

// Helper to get agent info by address
function getAgentInfo(address: string) {
  const normalized = address.toLowerCase()
  return AGENT_ADDRESSES[normalized] || {
    name: `Agent ${address.slice(0, 6)}...${address.slice(-4)}`,
    type: "unknown",
    icon: "●",
    action: "Executed"
  }
}

// Helper to format relative time
export function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  return date.toLocaleDateString()
}

// Fetch redemptions from Envio by delegator address
export async function fetchRedemptions(delegatorAddress: string, limit: number = 10): Promise<EnvioRedemption[]> {
  const query = `
    query GetRedemptionsForDelegator($delegator: String!, $limit: Int!) {
      Redemption(
        where: { delegator: { _eq: $delegator } }
        order_by: { timestamp: desc }
        limit: $limit
      ) {
        id
        chainId
        delegate
        delegator
        rootDelegator
        redeemer
        spendingToken
        spendingLimit
        executedToken
        executedAmount
        executedRecipient
        timestamp
        txHash
      }
    }
  `

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { delegator: delegatorAddress.toLowerCase(), limit },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors)
      return []
    }

    return result.data?.Redemption || []
  } catch (error) {
    console.error("Failed to fetch redemptions from Envio:", error)
    return []
  }
}

// Fetch redemptions from Envio by redeemer (agent) address
export async function fetchRedemptionsByRedeemer(redeemerAddress: string, limit: number = 50): Promise<EnvioRedemption[]> {
  const query = `
    query GetRedemptionsForRedeemer($redeemer: String!, $limit: Int!) {
      Redemption(
        where: { redeemer: { _eq: $redeemer } }
        order_by: { timestamp: desc }
        limit: $limit
      ) {
        id
        chainId
        delegate
        delegator
        rootDelegator
        redeemer
        spendingToken
        spendingLimit
        executedToken
        executedAmount
        executedRecipient
        timestamp
        txHash
      }
    }
  `

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { redeemer: redeemerAddress.toLowerCase(), limit },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors)
      return []
    }

    return result.data?.Redemption || []
  } catch (error) {
    console.error("Failed to fetch redemptions from Envio:", error)
    return []
  }
}

// Fetch redemptions for a specific permission (by delegate + spendingToken + spendingPeriod + startTime)
export async function fetchRedemptionsForPermission(params: {
  delegate: string
  spendingToken: string
  spendingPeriod: number
  spendingStartDate: number
  limit?: number
}): Promise<EnvioRedemption[]> {
  const query = `
    query GetRedemptionsForPermission(
      $delegate: String!,
      $spendingToken: String!,
      $spendingPeriod: numeric!,
      $spendingStartDate: numeric!,
      $limit: Int!
    ) {
      Redemption(
        where: {
          _and: [
            { delegate: { _eq: $delegate } },
            { spendingToken: { _eq: $spendingToken } },
            { spendingPeriod: { _eq: $spendingPeriod } },
            { spendingStartDate: { _eq: $spendingStartDate } }
          ]
        }
        order_by: { timestamp: desc }
        limit: $limit
      ) {
        id
        chainId
        delegate
        delegator
        rootDelegator
        redeemer
        spendingToken
        spendingLimit
        spendingPeriod
        spendingStartDate
        executedToken
        executedAmount
        executedRecipient
        timestamp
        txHash
      }
    }
  `

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: {
          delegate: params.delegate.toLowerCase(),
          spendingToken: params.spendingToken.toLowerCase(),
          spendingPeriod: params.spendingPeriod.toString(),
          spendingStartDate: params.spendingStartDate.toString(),
          limit: params.limit || 50,
        },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors)
      return []
    }

    return result.data?.Redemption || []
  } catch (error) {
    console.error("Failed to fetch redemptions for permission:", error)
    return []
  }
}

// Transform Envio redemption to Activity
export function transformToActivity(redemption: EnvioRedemption): Activity {
  // Prefer executed token/amount (decoded from calldata) over spending limit
  const tokenAddress = redemption.executedToken || redemption.spendingToken
  const tokenInfo = getTokenInfo(tokenAddress)
  const chainInfo = getChainInfo(redemption.chainId)
  const agentInfo = getAgentInfo(redemption.redeemer)

  let amount = ""
  // Use executedAmount if available (actual amount from tx), otherwise fall back to spendingLimit
  const amountValue = redemption.executedAmount || redemption.spendingLimit
  if (amountValue && tokenAddress) {
    const formattedAmount = formatUnits(BigInt(amountValue), tokenInfo.decimals)
    amount = `${Number(formattedAmount).toLocaleString(undefined, { maximumFractionDigits: 18 })} ${tokenInfo.symbol}`
  }

  return {
    id: redemption.id,
    agent: agentInfo.name,
    agentType: agentInfo.type,
    agentIcon: agentInfo.icon,
    action: agentInfo.action,
    amount,
    token: tokenInfo.symbol,
    chain: chainInfo.name,
    chainId: redemption.chainId,
    timestamp: new Date(parseInt(redemption.timestamp) * 1000),
    txHash: redemption.txHash,
  }
}

function ActivityRow({ activity, index }: { activity: Activity; index: number }) {
  const [mounted, setMounted] = useState(false)
  const chainInfo = getChainInfo(activity.chainId)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), index * 80)
    return () => clearTimeout(timer)
  }, [index])

  const shortTxHash = activity.txHash
    ? `${activity.txHash.slice(0, 6)}...${activity.txHash.slice(-4)}`
    : ""

  return (
    <div
      className={cn(
        "group flex items-center justify-between py-4 border-b border-border/30 last:border-b-0 transition-all duration-300 hover:bg-accent/5 px-2 -mx-2",
        mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 border border-border/50 flex items-center justify-center">
          <span className="font-mono text-xs text-accent">
            {activity.agentIcon}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{activity.action}</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              via {activity.agent}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-[10px] text-muted-foreground">
              {activity.chain}
            </span>
            <span className="text-muted-foreground/40">•</span>
            {activity.txHash && chainInfo.explorer ? (
              <a
                href={`${chainInfo.explorer}/tx/${activity.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors"
              >
                {shortTxHash}
              </a>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">
                {shortTxHash}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="text-right">
        {activity.amount && (
          <span className="font-mono text-sm">{activity.amount}</span>
        )}
        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
          {formatRelativeTime(activity.timestamp)}
        </p>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-0">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-4 py-4 border-b border-border/30 last:border-b-0 animate-pulse">
          <div className="w-8 h-8 bg-border/50" />
          <div className="flex-1">
            <div className="h-4 w-32 bg-border/50 rounded" />
            <div className="h-3 w-24 bg-border/50 rounded mt-1" />
          </div>
          <div className="text-right">
            <div className="h-4 w-16 bg-border/50 rounded" />
            <div className="h-3 w-12 bg-border/50 rounded mt-1" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="py-8 text-center">
      <p className="font-mono text-sm text-muted-foreground">No recent activity</p>
      <p className="font-mono text-[10px] text-muted-foreground mt-2">
        Delegation executions will appear here
      </p>
    </div>
  )
}

export function RecentActivity() {
  const { address, isConnected } = useAccount()
  const [activities, setActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchActivity = useCallback(async () => {
    if (!address) {
      setActivities([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Fetch only top 4 for the dashboard
      const redemptions = await fetchRedemptions(address, 4)
      const transformedActivities = redemptions.map(transformToActivity)
      setActivities(transformedActivities)
    } catch (err) {
      console.error("Error fetching activity:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch activity")
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchActivity()
  }, [fetchActivity])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected) return

    const interval = setInterval(fetchActivity, 30000)
    return () => clearInterval(interval)
  }, [isConnected, fetchActivity])

  return (
    <div className="border border-border/50 bg-background/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Recent Activity
          </h3>
          <span className="font-mono text-[10px] text-green-400/70 border border-green-400/30 bg-green-400/5 px-1.5 py-0.5">
            on-chain
          </span>
        </div>
        <Link
          href="/dashboard/activity"
          className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
        >
          View All →
        </Link>
      </div>

      {!isConnected ? (
        <div className="py-8 text-center">
          <p className="font-mono text-sm text-muted-foreground">
            Connect wallet to view activity
          </p>
        </div>
      ) : isLoading ? (
        <LoadingState />
      ) : error ? (
        <div className="py-4">
          <p className="font-mono text-sm text-red-400">{error}</p>
          <button
            onClick={fetchActivity}
            className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 mt-2"
          >
            Retry →
          </button>
        </div>
      ) : activities.length === 0 ? (
        <EmptyState />
      ) : (
        <div>
          {activities.map((activity, index) => (
            <ActivityRow key={activity.id} activity={activity} index={index} />
          ))}
        </div>
      )}
    </div>
  )
}
