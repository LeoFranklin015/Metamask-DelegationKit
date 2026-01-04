"use client"

import { useEffect, useState, useCallback } from "react"
import { useAccount } from "wagmi"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { DashboardHeader } from "@/components/dashboard/header"
import { WalletGate } from "@/components/dashboard/wallet-gate"
import { AnimatedNoise } from "@/components/animated-noise"
import { PermissionDetailModal, type Permission } from "@/components/dashboard/permission-detail-modal"
import {
  BACKEND_URL,
  PermissionRow,
} from "@/components/dashboard/permissions-list"

function LoadingState() {
  return (
    <div className="border border-border/50 bg-background/50">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="flex items-center gap-4 py-5 px-4 border-b border-border/30 last:border-b-0 animate-pulse">
          <div className="w-10 h-10 bg-border/50" />
          <div className="flex-1">
            <div className="h-4 w-40 bg-border/50 rounded" />
            <div className="h-3 w-28 bg-border/50 rounded mt-2" />
          </div>
          <div className="text-right">
            <div className="h-4 w-20 bg-border/50 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="border border-dashed border-border/50 bg-background/30 p-12 text-center">
      <p className="font-mono text-sm text-muted-foreground">
        {filter === "active" ? "No active permissions" : filter === "all" ? "No permissions found" : "No completed permissions"}
      </p>
      <p className="font-mono text-[10px] text-muted-foreground mt-2">
        {filter === "active"
          ? "Configure an agent to grant spending permissions"
          : "Your permissions history will appear here"}
      </p>
    </div>
  )
}

function FilterButton({
  active,
  onClick,
  children,
  count
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
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
      {count !== undefined && count > 0 && (
        <span className="ml-1.5 text-[9px] opacity-70">({count})</span>
      )}
    </button>
  )
}

export default function PermissionsPage() {
  const { address, isConnected } = useAccount()
  const [activePermissions, setActivePermissions] = useState<Permission[]>([])
  const [completedPermissions, setCompletedPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all")
  const [selectedPermission, setSelectedPermission] = useState<Permission | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const fetchPermissions = useCallback(async () => {
    if (!address) {
      setActivePermissions([])
      setCompletedPermissions([])
      setIsLoading(false)
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Fetch both active and completed permissions in parallel
      const [activeResponse, completedResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/api/agents/user/${address}?status=active`),
        fetch(`${BACKEND_URL}/api/agents/user/${address}?status=completed`),
      ])

      if (!activeResponse.ok || !completedResponse.ok) {
        throw new Error("Failed to fetch permissions")
      }

      const [activeData, completedData] = await Promise.all([
        activeResponse.json(),
        completedResponse.json(),
      ])

      if (activeData.success) {
        setActivePermissions(activeData.permissions)
      }
      if (completedData.success) {
        setCompletedPermissions(completedData.permissions)
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

  const handlePermissionClick = (permission: Permission) => {
    setSelectedPermission(permission)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setSelectedPermission(null)
  }

  const handlePermissionCancelled = () => {
    fetchPermissions()
  }

  // Get filtered permissions
  const allPermissions = [...activePermissions, ...completedPermissions]
  const displayedPermissions =
    filter === "all"
      ? allPermissions
      : filter === "active"
      ? activePermissions
      : completedPermissions

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
                  All Permissions
                </h1>
                <p className="font-mono text-xs text-muted-foreground mt-2">
                  Manage your agent spending permissions
                </p>
              </div>
              <button
                onClick={fetchPermissions}
                disabled={isLoading}
                className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors border border-border/50 px-3 py-1.5 disabled:opacity-50"
              >
                {isLoading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mb-6">
              <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mr-2">
                Filter:
              </span>
              <FilterButton
                active={filter === "all"}
                onClick={() => setFilter("all")}
                count={allPermissions.length}
              >
                All
              </FilterButton>
              <FilterButton
                active={filter === "active"}
                onClick={() => setFilter("active")}
                count={activePermissions.length}
              >
                Active
              </FilterButton>
              <FilterButton
                active={filter === "completed"}
                onClick={() => setFilter("completed")}
                count={completedPermissions.length}
              >
                History
              </FilterButton>
            </div>

            {/* Permissions count */}
            {!isLoading && displayedPermissions.length > 0 && (
              <div className="mb-4">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Showing {displayedPermissions.length} permission{displayedPermissions.length !== 1 ? "s" : ""}
                  {filter !== "all" && ` (filtered)`}
                </span>
              </div>
            )}

            {/* Content */}
            {!isConnected ? (
              <div className="border border-dashed border-border/50 bg-background/30 p-12 text-center">
                <p className="font-mono text-sm text-muted-foreground">
                  Connect wallet to view permissions
                </p>
              </div>
            ) : isLoading ? (
              <LoadingState />
            ) : error ? (
              <div className="border border-red-400/30 bg-red-400/10 p-6">
                <p className="font-mono text-sm text-red-400">{error}</p>
                <button
                  onClick={fetchPermissions}
                  className="font-mono text-[10px] uppercase tracking-widest text-red-400 hover:text-red-300 mt-3"
                >
                  Retry →
                </button>
              </div>
            ) : displayedPermissions.length === 0 ? (
              <EmptyState filter={filter} />
            ) : (
              <div className="space-y-3">
                {displayedPermissions.map((permission, index) => (
                  <PermissionRow
                    key={permission.id}
                    permission={permission}
                    index={index}
                    onClick={() => handlePermissionClick(permission)}
                  />
                ))}
              </div>
            )}
          </main>
        </div>

        <PermissionDetailModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          permission={selectedPermission}
          onCancelled={handlePermissionCancelled}
        />
      </div>
    </WalletGate>
  )
}
