"use client"

import { useEffect, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { formatUnits } from "viem"

// Envio GraphQL endpoint
const ENVIO_GRAPHQL_URL =
  process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL ||
  "https://indexer.dev.hyperindex.xyz/dca02a0/v1/graphql"

// Token info for display with USD prices (mock prices for demo)
const TOKENS: Record<string, { symbol: string; decimals: number; usdPrice: number }> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18, usdPrice: 2500 },
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": { symbol: "USDC", decimals: 6, usdPrice: 1 },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18, usdPrice: 8 },
  "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": { symbol: "DAI", decimals: 18, usdPrice: 1 },
  "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5": { symbol: "LINK", decimals: 18, usdPrice: 15 },
  // Base Sepolia tokens
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18, usdPrice: 2500 },
}

interface StatsData {
  totalDelegations: number
  uniqueAgents: number
  totalExecutions: number
  executionsThisMonth: number
  totalVolumeUsd: number
  volumeThisMonthUsd: number
}

interface StatCardProps {
  label: string
  value: string
  subValue?: string
  progress?: number
  isLoading?: boolean
}

function StatCard({ label, value, subValue, progress, isLoading }: StatCardProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (isLoading) {
    return (
      <div className="flex-1 border border-border/50 bg-background/50 p-6 animate-pulse">
        <div className="h-3 w-24 bg-border/50 rounded" />
        <div className="mt-3 h-8 w-20 bg-border/50 rounded" />
        <div className="mt-2 h-3 w-16 bg-border/50 rounded" />
      </div>
    )
  }

  return (
    <div className="flex-1 border border-border/50 bg-background/50 p-6">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-[var(--font-bebas)] text-3xl md:text-4xl tracking-tight">
          {value}
        </span>
        {subValue && (
          <span className="font-mono text-xs text-muted-foreground">
            {subValue}
          </span>
        )}
      </div>
      {typeof progress === "number" && (
        <div className="mt-4">
          <div className="h-1 w-full bg-border/50 overflow-hidden">
            <div
              className="h-full bg-accent transition-all duration-1000 ease-out"
              style={{ width: mounted ? `${Math.min(progress, 100)}%` : "0%" }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {progress.toFixed(0)}% utilized
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function getTokenInfo(address: string | null) {
  if (!address) return { symbol: "TOKEN", decimals: 18, usdPrice: 0 }
  return TOKENS[address.toLowerCase()] || { symbol: "TOKEN", decimals: 18, usdPrice: 0 }
}

async function fetchAccountStats(address: string): Promise<StatsData> {
  // Get the start of current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfMonthTimestamp = Math.floor(startOfMonth.getTime() / 1000)

  const query = `
    query GetAccountStats($address: String!, $monthStart: numeric!) {
      Account(where: { address: { _eq: $address } }) {
        id
        totalRedemptions
      }

      allRedemptions: Redemption(
        where: { delegator: { _eq: $address } }
      ) {
        id
        redeemer
        spendingToken
        spendingLimit
        timestamp
      }

      monthRedemptions: Redemption(
        where: {
          delegator: { _eq: $address }
          timestamp: { _gte: $monthStart }
        }
      ) {
        id
        spendingToken
        spendingLimit
      }
    }
  `

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: {
          address: address.toLowerCase(),
          monthStart: startOfMonthTimestamp
        },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors)
      return {
        totalDelegations: 0,
        uniqueAgents: 0,
        totalExecutions: 0,
        executionsThisMonth: 0,
        totalVolumeUsd: 0,
        volumeThisMonthUsd: 0,
      }
    }

    const allRedemptions = result.data?.allRedemptions || []
    const monthRedemptions = result.data?.monthRedemptions || []

    // Calculate unique agents
    const uniqueAgents = new Set(allRedemptions.map((r: { redeemer: string }) => r.redeemer.toLowerCase()))

    // Calculate total volume in USD
    let totalVolumeUsd = 0
    allRedemptions.forEach((r: { spendingToken: string | null; spendingLimit: string | null }) => {
      if (r.spendingToken && r.spendingLimit) {
        const tokenInfo = getTokenInfo(r.spendingToken)
        const amount = Number(formatUnits(BigInt(r.spendingLimit), tokenInfo.decimals))
        totalVolumeUsd += amount * tokenInfo.usdPrice
      }
    })

    // Calculate this month's volume in USD
    let volumeThisMonthUsd = 0
    monthRedemptions.forEach((r: { spendingToken: string | null; spendingLimit: string | null }) => {
      if (r.spendingToken && r.spendingLimit) {
        const tokenInfo = getTokenInfo(r.spendingToken)
        const amount = Number(formatUnits(BigInt(r.spendingLimit), tokenInfo.decimals))
        volumeThisMonthUsd += amount * tokenInfo.usdPrice
      }
    })

    return {
      totalDelegations: allRedemptions.length,
      uniqueAgents: uniqueAgents.size,
      totalExecutions: allRedemptions.length,
      executionsThisMonth: monthRedemptions.length,
      totalVolumeUsd,
      volumeThisMonthUsd,
    }
  } catch (error) {
    console.error("Failed to fetch account stats:", error)
    return {
      totalDelegations: 0,
      uniqueAgents: 0,
      totalExecutions: 0,
      executionsThisMonth: 0,
      totalVolumeUsd: 0,
      volumeThisMonthUsd: 0,
    }
  }
}

function formatUsd(value: number): string {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `$${(value / 1000).toFixed(1)}K`
  }
  return `$${value.toFixed(2)}`
}

export function StatsOverview() {
  const { address, isConnected } = useAccount()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!address) {
      setStats(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const data = await fetchAccountStats(address)
      setStats(data)
    } catch (error) {
      console.error("Error fetching stats:", error)
    } finally {
      setIsLoading(false)
    }
  }, [address])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!isConnected) return
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [isConnected, fetchStats])

  if (!isConnected) {
    return (
      <div className="flex flex-col md:flex-row gap-4">
        <StatCard label="Total Volume" value="--" subValue="connect wallet" />
        <StatCard label="This Month" value="--" subValue="connect wallet" />
        <StatCard label="Total Executions" value="--" subValue="connect wallet" />
      </div>
    )
  }

  // Calculate month progress (assume a monthly budget based on total volume)
  const monthProgress = stats && stats.totalVolumeUsd > 0
    ? (stats.volumeThisMonthUsd / stats.totalVolumeUsd) * 100
    : 0

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <StatCard
        label="Total Volume"
        value={stats ? formatUsd(stats.totalVolumeUsd) : "--"}
        subValue={stats ? `across ${stats.uniqueAgents} agent${stats.uniqueAgents !== 1 ? "s" : ""}` : undefined}
        isLoading={isLoading}
      />
      <StatCard
        label="This Month"
        value={stats ? formatUsd(stats.volumeThisMonthUsd) : "--"}
        subValue={stats ? `${stats.executionsThisMonth} execution${stats.executionsThisMonth !== 1 ? "s" : ""}` : undefined}
        progress={stats ? monthProgress : undefined}
        isLoading={isLoading}
      />
      <StatCard
        label="Total Executions"
        value={stats ? stats.totalExecutions.toString() : "--"}
        subValue={stats ? "all time" : undefined}
        isLoading={isLoading}
      />
    </div>
  )
}
