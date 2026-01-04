"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts"
import { DashboardHeader } from "@/components/dashboard/header"
import { AnimatedNoise } from "@/components/animated-noise"
import { formatUnits } from "viem"
import { cn } from "@/lib/utils"

// Envio GraphQL endpoint
const ENVIO_GRAPHQL_URL =
  process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL ||
  "https://indexer.dev.hyperindex.xyz/dca02a0/v1/graphql"

// Known agent addresses and their metadata
const AGENTS: Record<string, { name: string; type: string; icon: string; description: string; chain: string; chainId: number }> = {
  "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe": {
    name: "DCA Agent",
    type: "dca",
    icon: "↻",
    description: "Dollar-cost averaging into tokens via Uniswap V3",
    chain: "Sepolia",
    chainId: 11155111,
  },
  "0x0013bb0d8712dc4cacbc8cd32d4c0c851cdf18da": {
    name: "Limit Order Agent",
    type: "limit-order",
    icon: "⇌",
    description: "Execute trades when target price is reached",
    chain: "Sepolia",
    chainId: 11155111,
  },
  "0x4a5fade4f48c372b4c2cfdd1f58fb1ab1408674a": {
    name: "Savings Agent",
    type: "savings",
    icon: "⬡",
    description: "Auto-supply tokens to Aave V3 for yield",
    chain: "Base Sepolia",
    chainId: 84532,
  },
  "0x9d40c09a940a67ad7aff166c99e9422ce89aeb2d": {
    name: "Subscription Agent",
    type: "subscription",
    icon: "◈",
    description: "Automated recurring payments",
    chain: "Sepolia",
    chainId: 11155111,
  },
}

// Token info for display
const TOKENS: Record<string, { symbol: string; decimals: number }> = {
  "0xfff9976782d46cc05630d1f6ebab18b2324d6b14": { symbol: "WETH", decimals: 18 },
  "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238": { symbol: "USDC", decimals: 6 },
  "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984": { symbol: "UNI", decimals: 18 },
  "0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357": { symbol: "DAI", decimals: 18 },
  "0xf8fb3713d459d7c1018bd0a49d19b4c44290ebe5": { symbol: "LINK", decimals: 18 },
  // Base Sepolia tokens
  "0xba50cd2a20f6da35d788639e581bca8d0b5d4d5f": { symbol: "USDC", decimals: 6 },
  "0x0a215d8ba66387dca84b284d18c3b4ec3de6e54a": { symbol: "USDT", decimals: 6 },
  "0x4200000000000000000000000000000000000006": { symbol: "WETH", decimals: 18 },
}

// Chain info
const CHAINS: Record<number, { name: string; explorer: string }> = {
  11155111: { name: "Sepolia", explorer: "https://sepolia.etherscan.io" },
  84532: { name: "Base Sepolia", explorer: "https://sepolia.basescan.org" },
}

interface EnvioAgent {
  id: string
  address: string
  totalRedemptions: number
  firstSeenAt: string
  lastActiveAt: string
  chains: number[]
}

interface EnvioRedemption {
  id: string
  chainId: number
  rootDelegator: string
  spendingToken: string | null
  spendingLimit: string | null
  timestamp: string
  txHash: string
}

interface ActivityDataPoint {
  day: string
  date: string
  executions: number
}

function getTokenInfo(address: string | null) {
  if (!address) return { symbol: "TOKEN", decimals: 18 }
  return TOKENS[address.toLowerCase()] || { symbol: "TOKEN", decimals: 18 }
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(parseInt(timestamp) * 1000)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return "Just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// Fetch agent data from Envio
async function fetchAgentData(agentAddress: string): Promise<{ agent: EnvioAgent | null; redemptions: EnvioRedemption[] }> {
  const query = `
    query GetAgentData($address: String!) {
      Agent(where: { address: { _eq: $address } }) {
        id
        address
        totalRedemptions
        firstSeenAt
        lastActiveAt
        chains
      }
      Redemption(
        where: { redeemer: { _eq: $address } }
        order_by: { timestamp: desc }
        limit: 100
      ) {
        id
        chainId
        rootDelegator
        spendingToken
        spendingLimit
        timestamp
        txHash
      }
    }
  `

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { address: agentAddress.toLowerCase() },
      }),
    })

    const result = await response.json()

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors)
      return { agent: null, redemptions: [] }
    }

    return {
      agent: result.data?.Agent?.[0] || null,
      redemptions: result.data?.Redemption || [],
    }
  } catch (error) {
    console.error("Failed to fetch agent data:", error)
    return { agent: null, redemptions: [] }
  }
}

// Process redemptions into daily activity data for 7-day chart
function processActivityData(redemptions: EnvioRedemption[]): ActivityDataPoint[] {
  const now = Date.now()
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

  // Initialize daily buckets for the last 7 days
  const dailyData: ActivityDataPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - i * 24 * 60 * 60 * 1000)
    const dayKey = date.toISOString().split("T")[0]
    dailyData.push({
      day: dayNames[date.getDay()],
      date: dayKey,
      executions: 0,
    })
  }

  // Count redemptions per day
  redemptions.forEach((r) => {
    const timestamp = parseInt(r.timestamp) * 1000
    if (timestamp >= sevenDaysAgo) {
      const date = new Date(timestamp)
      const dayKey = date.toISOString().split("T")[0]
      const dataPoint = dailyData.find((d) => d.date === dayKey)
      if (dataPoint) {
        dataPoint.executions += 1
      }
    }
  })

  return dailyData
}

// Calculate unique delegators
function getUniqueDelegators(redemptions: EnvioRedemption[]): string[] {
  const delegators = new Set<string>()
  redemptions.forEach((r) => delegators.add(r.rootDelegator))
  return Array.from(delegators)
}

// Calculate total volume
function calculateTotalVolume(redemptions: EnvioRedemption[]): { amount: number; symbol: string }[] {
  const volumeByToken: Record<string, { amount: bigint; decimals: number; symbol: string }> = {}

  redemptions.forEach((r) => {
    const tokenAddress = r.spendingToken?.toLowerCase()
    const amount = r.spendingLimit
    if (tokenAddress && amount) {
      const tokenInfo = getTokenInfo(tokenAddress)
      if (!volumeByToken[tokenAddress]) {
        volumeByToken[tokenAddress] = { amount: 0n, decimals: tokenInfo.decimals, symbol: tokenInfo.symbol }
      }
      volumeByToken[tokenAddress].amount += BigInt(amount)
    }
  })

  return Object.values(volumeByToken).map((v) => ({
    amount: Number(formatUnits(v.amount, v.decimals)),
    symbol: v.symbol,
  }))
}

function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-card/50 backdrop-blur-sm border-border/50 p-6 animate-pulse">
            <div className="h-3 w-20 bg-border/50 rounded mb-3" />
            <div className="h-8 w-16 bg-border/50 rounded" />
          </Card>
        ))}
      </div>
    </div>
  )
}

function RecentExecutionRow({ redemption }: { redemption: EnvioRedemption }) {
  const tokenAddress = redemption.spendingToken
  const tokenInfo = getTokenInfo(tokenAddress)
  const amount = redemption.spendingLimit
  const chainInfo = CHAINS[redemption.chainId] || { name: "Unknown", explorer: "" }

  const formattedAmount = amount
    ? Number(formatUnits(BigInt(amount), tokenInfo.decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })
    : "-"

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/30 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border border-border/50 flex items-center justify-center">
          <span className="font-mono text-[10px] text-accent">TX</span>
        </div>
        <div>
          <a
            href={`${chainInfo.explorer}/tx/${redemption.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-xs text-accent hover:text-accent/80 transition-colors"
          >
            {redemption.txHash.slice(0, 10)}...{redemption.txHash.slice(-8)}
          </a>
          <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
            {chainInfo.name} • {formatRelativeTime(redemption.timestamp)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <span className="font-mono text-sm">
          {formattedAmount} {tokenInfo.symbol}
        </span>
      </div>
    </div>
  )
}

export default function AgentStatsPage() {
  const params = useParams()
  const agentId = params.id as string

  const [agentData, setAgentData] = useState<EnvioAgent | null>(null)
  const [redemptions, setRedemptions] = useState<EnvioRedemption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get agent metadata from known agents
  const agentMeta = AGENTS[agentId.toLowerCase()] || {
    name: `Agent ${agentId.slice(0, 6)}...${agentId.slice(-4)}`,
    type: "unknown",
    icon: "●",
    description: "Unknown agent",
    chain: "Unknown",
    chainId: 0,
  }

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { agent, redemptions: redems } = await fetchAgentData(agentId)
      setAgentData(agent)
      setRedemptions(redems)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data")
    } finally {
      setIsLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Calculate derived stats
  const uniqueDelegators = getUniqueDelegators(redemptions)
  const totalVolume = calculateTotalVolume(redemptions)
  const activityData = processActivityData(redemptions)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const executionsLast7d = redemptions.filter(
    (r) => parseInt(r.timestamp) * 1000 > sevenDaysAgo
  ).length

  // Get last active time
  const lastActive = agentData?.lastActiveAt
    ? formatRelativeTime(agentData.lastActiveAt)
    : redemptions[0]?.timestamp
    ? formatRelativeTime(redemptions[0].timestamp)
    : "Never"

  return (
    <div className="relative min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />
      <div className="relative z-10">
        <DashboardHeader />

        <main className="px-6 md:px-28 py-12 max-w-6xl mx-auto">
          {/* Navigation */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
            >
              ← Back to Dashboard
            </Link>

            {/* Agent Tabs */}
            <div className="flex items-center gap-2 border-b border-border/50 pb-4 overflow-x-auto">
              {Object.entries(AGENTS).map(([address, meta]) => (
                <Link
                  key={address}
                  href={`/dashboard/agent/${address}`}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 font-mono text-xs uppercase tracking-widest transition-colors whitespace-nowrap",
                    agentId.toLowerCase() === address.toLowerCase()
                      ? "bg-accent text-background"
                      : "border border-border/50 text-muted-foreground hover:border-accent/50 hover:text-foreground"
                  )}
                >
                  <span>{meta.icon}</span>
                  <span>{meta.name}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="mb-12">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 border border-accent/50 bg-accent/10 flex items-center justify-center">
                <span className="text-2xl">{agentMeta.icon}</span>
              </div>
              <div>
                <h1 className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight">
                  {agentMeta.name}
                </h1>
                <p className="font-mono text-xs text-muted-foreground mt-1">
                  {agentMeta.description}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <span className="font-mono text-[10px] text-muted-foreground border border-border/50 px-2 py-1">
                {agentMeta.chain}
              </span>
              <a
                href={`${CHAINS[agentMeta.chainId]?.explorer || ""}/address/${agentId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-accent hover:text-accent/80 transition-colors"
              >
                {agentId.slice(0, 10)}...{agentId.slice(-8)} ↗
              </a>
            </div>
          </div>

          {isLoading ? (
            <LoadingState />
          ) : error ? (
            <div className="border border-red-500/30 bg-red-500/10 p-6">
              <p className="font-mono text-sm text-red-400">{error}</p>
              <button
                onClick={fetchData}
                className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 mt-2"
              >
                Retry →
              </button>
            </div>
          ) : (
            <>
              {/* Key metrics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
                <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    Status
                  </p>
                  <p
                    className={cn(
                      "font-[var(--font-bebas)] text-2xl tracking-tight capitalize",
                      agentData ? "text-green-400" : "text-muted-foreground"
                    )}
                  >
                    {agentData ? "Active" : "No Data"}
                  </p>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    Total Executions
                  </p>
                  <p className="font-[var(--font-bebas)] text-2xl tracking-tight text-accent">
                    {agentData?.totalRedemptions || redemptions.length}
                  </p>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    Unique Users
                  </p>
                  <p className="font-[var(--font-bebas)] text-2xl tracking-tight">
                    {uniqueDelegators.length}
                  </p>
                </Card>

                <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
                    Last 7 Days
                  </p>
                  <p className="font-[var(--font-bebas)] text-2xl tracking-tight">
                    {executionsLast7d} exec
                  </p>
                </Card>
              </div>

              {/* Volume Stats */}
              {totalVolume.length > 0 && (
                <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6 mb-12">
                  <h2 className="font-[var(--font-bebas)] text-xl tracking-tight mb-4">
                    Total Volume Processed
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {totalVolume.map((v, i) => (
                      <div key={i} className="border border-border/30 p-4">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                          {v.symbol}
                        </p>
                        <p className="font-[var(--font-bebas)] text-xl tracking-tight">
                          {v.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Info Card */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6 mb-12">
                <h2 className="font-[var(--font-bebas)] text-xl tracking-tight mb-4">Agent Info</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      First Seen
                    </p>
                    <p className="font-mono text-sm">
                      {agentData?.firstSeenAt
                        ? new Date(parseInt(agentData.firstSeenAt) * 1000).toLocaleDateString()
                        : "-"}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Last Active
                    </p>
                    <p className="font-mono text-sm">{lastActive}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Chains Active
                    </p>
                    <p className="font-mono text-sm">
                      {agentData?.chains?.map((c) => CHAINS[c]?.name || c).join(", ") || agentMeta.chain}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                      Agent Type
                    </p>
                    <p className="font-mono text-sm capitalize">{agentMeta.type.replace("-", " ")}</p>
                  </div>
                </div>
              </Card>

              {/* Activity chart */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6 mb-12">
                <h2 className="font-[var(--font-bebas)] text-xl tracking-tight mb-6">
                  Execution Activity (7 Days)
                </h2>
                {activityData.some((d) => d.executions > 0) ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={activityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="day"
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        stroke="hsl(var(--muted-foreground))"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontFamily: "monospace",
                          fontSize: "12px",
                        }}
                        labelStyle={{ color: "hsl(var(--foreground))" }}
                        formatter={(value) => [`${value ?? 0} executions`, "Activity"]}
                        labelFormatter={(label: string, payload) => {
                          if (payload && payload[0]) {
                            return payload[0].payload.date
                          }
                          return label
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="executions"
                        stroke="#f97316"
                        strokeWidth={3}
                        dot={{ fill: "#f97316", strokeWidth: 2, r: 5 }}
                        activeDot={{ r: 7, fill: "#f97316", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center border border-dashed border-border/50">
                    <p className="font-mono text-sm text-muted-foreground">
                      No activity in the last 7 days
                    </p>
                  </div>
                )}
              </Card>

              {/* Recent Executions */}
              <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
                <h2 className="font-[var(--font-bebas)] text-xl tracking-tight mb-6">
                  Recent Executions
                </h2>
                {redemptions.length > 0 ? (
                  <div className="space-y-0">
                    {redemptions.slice(0, 10).map((r) => (
                      <RecentExecutionRow key={r.id} redemption={r} />
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center border border-dashed border-border/50">
                    <p className="font-mono text-sm text-muted-foreground">No executions yet</p>
                  </div>
                )}
              </Card>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
