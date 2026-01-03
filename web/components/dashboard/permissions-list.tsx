"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface Permission {
  id: string
  agent: string
  type: string
  spent: number
  limit: number
  status: "active" | "paused" | "expired"
  lastExecution: string
}

const permissions: Permission[] = [
  {
    id: "01",
    agent: "DCA Agent",
    type: "Weekly ETH Purchase",
    spent: 2400,
    limit: 5000,
    status: "active",
    lastExecution: "2 hours ago",
  },
  {
    id: "02",
    agent: "Subscription Agent",
    type: "Monthly Payments",
    spent: 450,
    limit: 1000,
    status: "active",
    lastExecution: "1 day ago",
  },
  {
    id: "03",
    agent: "Savings Agent",
    type: "Auto-Save 10%",
    spent: 890,
    limit: 2000,
    status: "active",
    lastExecution: "5 hours ago",
  },
  {
    id: "04",
    agent: "Limit Order Agent",
    type: "ETH/USDC Orders",
    spent: 0,
    limit: 3000,
    status: "paused",
    lastExecution: "Never",
  },
]

function PermissionRow({ permission, index }: { permission: Permission; index: number }) {
  const [mounted, setMounted] = useState(false)
  const progress = (permission.spent / permission.limit) * 100

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), index * 100)
    return () => clearTimeout(timer)
  }, [index])

  return (
    <div
      className={cn(
        "group border border-border/50 bg-background/50 p-5 transition-all duration-300 hover:border-accent/50 hover:bg-accent/5",
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[10px] text-accent">{permission.id}</span>
          <div>
            <h3 className="font-mono text-sm font-medium">{permission.agent}</h3>
            <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
              {permission.type}
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
            ${permission.spent.toLocaleString()} / ${permission.limit.toLocaleString()}
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
            style={{ width: mounted ? `${progress}%` : "0%" }}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[10px] text-muted-foreground">
          Last execution: {permission.lastExecution}
        </span>
        <button className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors opacity-0 group-hover:opacity-100">
          Manage →
        </button>
      </div>
    </div>
  )
}

export function PermissionsList() {
  return (
    <div className="space-y-3">
      {permissions.map((permission, index) => (
        <PermissionRow key={permission.id} permission={permission} index={index} />
      ))}
    </div>
  )
}
