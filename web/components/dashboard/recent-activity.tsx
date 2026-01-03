"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface Activity {
  id: string
  agent: string
  action: string
  amount: string
  chain: string
  timestamp: string
  txHash: string
}

const activities: Activity[] = [
  {
    id: "1",
    agent: "DCA Agent",
    action: "Purchased ETH",
    amount: "$50.00",
    chain: "Base",
    timestamp: "2 hours ago",
    txHash: "0x1a2b...3c4d",
  },
  {
    id: "2",
    agent: "Savings Agent",
    action: "Auto-saved",
    amount: "$120.00",
    chain: "Arbitrum",
    timestamp: "5 hours ago",
    txHash: "0x5e6f...7g8h",
  },
  {
    id: "3",
    agent: "Subscription Agent",
    action: "Paid subscription",
    amount: "$9.99",
    chain: "Ethereum",
    timestamp: "1 day ago",
    txHash: "0x9i0j...1k2l",
  },
  {
    id: "4",
    agent: "DCA Agent",
    action: "Purchased ETH",
    amount: "$50.00",
    chain: "Base",
    timestamp: "1 day ago",
    txHash: "0x3m4n...5o6p",
  },
  {
    id: "5",
    agent: "Savings Agent",
    action: "Auto-saved",
    amount: "$85.00",
    chain: "Arbitrum",
    timestamp: "2 days ago",
    txHash: "0x7q8r...9s0t",
  },
]

function ActivityRow({ activity, index }: { activity: Activity; index: number }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), index * 80)
    return () => clearTimeout(timer)
  }, [index])

  return (
    <div
      className={cn(
        "group flex items-center justify-between py-4 border-b border-border/30 last:border-b-0 transition-all duration-300 hover:bg-accent/5 px-2 -mx-2",
        mounted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="w-8 h-8 border border-border/50 flex items-center justify-center">
          <span className="font-mono text-[10px] text-accent">
            {activity.agent.charAt(0)}
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
            <span className="font-mono text-[10px] text-muted-foreground">
              {activity.txHash}
            </span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <span className="font-mono text-sm">{activity.amount}</span>
        <p className="font-mono text-[10px] text-muted-foreground mt-0.5">
          {activity.timestamp}
        </p>
      </div>
    </div>
  )
}

export function RecentActivity() {
  return (
    <div className="border border-border/50 bg-background/50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Recent Activity
        </h3>
        <button className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors">
          View All →
        </button>
      </div>
      <div>
        {activities.map((activity, index) => (
          <ActivityRow key={activity.id} activity={activity} index={index} />
        ))}
      </div>
    </div>
  )
}
