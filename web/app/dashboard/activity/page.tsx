"use client"

import { useEffect, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { DashboardHeader } from "@/components/dashboard/header"
import { WalletGate } from "@/components/dashboard/wallet-gate"
import { AnimatedNoise } from "@/components/animated-noise"
import {
  Activity,
  fetchRedemptions,
  transformToActivity,
  getChainInfo,
  formatRelativeTime,
} from "@/components/dashboard/recent-activity"

function ActivityRow({ activity, index }: { activity: Activity; index: number }) {
  const [mounted, setMounted] = useState(false)
  const chainInfo = getChainInfo(activity.chainId)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), index * 50)
    return () => clearTimeout(timer)
  }, [index])

  const shortTxHash = activity.txHash
    ? `${activity.txHash.slice(0, 6)}...${activity.txHash.slice(-4)}`
    : ""

  return (
    <div
      className={cn(
        "group flex items-center justify-between py-5 px-4 border-b border-border/30 last:border-b-0 transition-all duration-300 hover:bg-accent/5",
        mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 border border-border/50 flex items-center justify-center">
          <span className="font-mono text-sm text-accent">
            {activity.agentIcon}
          </span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">{activity.action}</span>
            <span className="font-mono text-xs text-muted-foreground">
              via {activity.agent}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">
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
                {shortTxHash} ↗
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
          <span className="font-mono text-sm font-medium">{activity.amount}</span>
        )}
        <p className="font-mono text-[10px] text-muted-foreground mt-1">
          {formatRelativeTime(activity.timestamp)}
        </p>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="border border-border/50 bg-background/50">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
        <div key={i} className="flex items-center gap-4 py-5 px-4 border-b border-border/30 last:border-b-0 animate-pulse">
          <div className="w-10 h-10 bg-border/50" />
          <div className="flex-1">
            <div className="h-4 w-40 bg-border/50 rounded" />
            <div className="h-3 w-28 bg-border/50 rounded mt-2" />
          </div>
          <div className="text-right">
            <div className="h-4 w-20 bg-border/50 rounded" />
            <div className="h-3 w-14 bg-border/50 rounded mt-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="border border-dashed border-border/50 bg-background/30 p-12 text-center">
      <p className="font-mono text-sm text-muted-foreground">No activity found</p>
      <p className="font-mono text-[10px] text-muted-foreground mt-2">
        Your delegation executions will appear here once agents start executing
      </p>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-colors",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border/50 text-muted-foreground hover:border-accent/50 hover:text-accent"
      )}
    >
      {children}
    </button>
  )
}

export default function ActivityPage() {
  const { address, isConnected } = useAccount()
  const [activities, setActivities] = useState<Activity[]>([])
  const [filteredActivities, setFilteredActivities] = useState<Activity[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>("all")

  const fetchActivity = useCallback(async () => {
    if (!address) {
      setActivities([])
      setFilteredActivities([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Fetch up to 100 redemptions for the full activity page
      const redemptions = await fetchRedemptions(address, 100)
      const transformedActivities = redemptions.map(transformToActivity)
      setActivities(transformedActivities)
      setFilteredActivities(transformedActivities)
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

  // Apply filter
  useEffect(() => {
    if (filter === "all") {
      setFilteredActivities(activities)
    } else {
      setFilteredActivities(activities.filter(a => a.agentType === filter))
    }
  }, [filter, activities])

  // Get unique agent types for filter buttons
  const agentTypes = Array.from(new Set(activities.map(a => a.agentType)))

  return (
    <WalletGate>
      <div className="relative min-h-screen bg-background">
        <AnimatedNoise opacity={0.03} />
        <div className="relative z-10">
          <DashboardHeader />

          <main className="px-6 md:px-28 py-12">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <Link
                  href="/dashboard"
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors mb-2 inline-block"
                >
                  ← Back to Dashboard
                </Link>
                <h1 className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight">
                  Activity History
                </h1>
                <p className="font-mono text-xs text-muted-foreground mt-2">
                  All on-chain delegation executions for your account
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-green-400/70 border border-green-400/30 bg-green-400/5 px-2 py-1">
                  on-chain data
                </span>
                <button
                  onClick={fetchActivity}
                  disabled={isLoading}
                  className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors border border-border/50 px-3 py-1.5 disabled:opacity-50"
                >
                  {isLoading ? "Loading..." : "Refresh"}
                </button>
              </div>
            </div>

            {/* Filters */}
            {activities.length > 0 && (
              <div className="flex items-center gap-2 mb-6">
                <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mr-2">
                  Filter:
                </span>
                <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
                  All
                </FilterButton>
                {agentTypes.includes("dca") && (
                  <FilterButton active={filter === "dca"} onClick={() => setFilter("dca")}>
                    DCA
                  </FilterButton>
                )}
                {agentTypes.includes("limit-order") && (
                  <FilterButton active={filter === "limit-order"} onClick={() => setFilter("limit-order")}>
                    Limit Order
                  </FilterButton>
                )}
                {agentTypes.includes("savings") && (
                  <FilterButton active={filter === "savings"} onClick={() => setFilter("savings")}>
                    Savings
                  </FilterButton>
                )}
                {agentTypes.includes("subscription") && (
                  <FilterButton active={filter === "subscription"} onClick={() => setFilter("subscription")}>
                    Subscription
                  </FilterButton>
                )}
              </div>
            )}

            {/* Activity count */}
            {!isLoading && filteredActivities.length > 0 && (
              <div className="mb-4">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Showing {filteredActivities.length} transaction{filteredActivities.length !== 1 ? "s" : ""}
                  {filter !== "all" && ` (filtered)`}
                </span>
              </div>
            )}

            {/* Content */}
            {!isConnected ? (
              <div className="border border-dashed border-border/50 bg-background/30 p-12 text-center">
                <p className="font-mono text-sm text-muted-foreground">
                  Connect wallet to view activity
                </p>
              </div>
            ) : isLoading ? (
              <LoadingState />
            ) : error ? (
              <div className="border border-red-400/30 bg-red-400/10 p-6">
                <p className="font-mono text-sm text-red-400">{error}</p>
                <button
                  onClick={fetchActivity}
                  className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 mt-3"
                >
                  Retry →
                </button>
              </div>
            ) : filteredActivities.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="border border-border/50 bg-background/50">
                {filteredActivities.map((activity, index) => (
                  <ActivityRow key={activity.id} activity={activity} index={index} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </WalletGate>
  )
}
