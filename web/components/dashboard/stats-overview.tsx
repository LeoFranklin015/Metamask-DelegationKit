"use client"

import { useEffect, useState } from "react"

interface StatCardProps {
  label: string
  value: string
  subValue?: string
  progress?: number
}

function StatCard({ label, value, subValue, progress }: StatCardProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

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
              style={{ width: mounted ? `${progress}%` : "0%" }}
            />
          </div>
          <div className="mt-1 flex justify-between">
            <span className="font-mono text-[10px] text-muted-foreground">
              {progress}% of limit
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function StatsOverview() {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      <StatCard
        label="Total Delegated"
        value="$12,450"
        subValue="across 4 agents"
      />
      <StatCard
        label="Spent This Month"
        value="$3,240"
        subValue="/ $5,000"
        progress={65}
      />
      <StatCard
        label="Total Executions"
        value="847"
        subValue="this month"
      />
    </div>
  )
}
