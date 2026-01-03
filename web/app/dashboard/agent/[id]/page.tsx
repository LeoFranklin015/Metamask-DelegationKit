"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts"
import { DashboardHeader } from "@/components/dashboard/header"
import { AnimatedNoise } from "@/components/animated-noise"

const agentData = {
  "agent-1": {
    name: "Finance Monitor",
    status: "active",
    tasksCompleted: 247,
    successRate: 98.5,
    avgResponseTime: 1.2,
    spendingToday: 245.5,
    spendingLimit: 1000,
  },
}

const activityData = [
  { time: "00:00", tasks: 4 },
  { time: "04:00", tasks: 8 },
  { time: "08:00", tasks: 12 },
  { time: "12:00", tasks: 18 },
  { time: "16:00", tasks: 25 },
  { time: "20:00", tasks: 31 },
  { time: "24:00", tasks: 35 },
]

export default function AgentStatsPage() {
  const params = useParams()
  const agentId = params.id as string
  const agent = agentData["agent-1"]

  return (
    <div className="relative min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />
      <div className="relative z-10">
        <DashboardHeader />

        <main className="px-6 md:px-28 py-12 max-w-6xl mx-auto">
          {/* Title */}
          <div className="mb-12">
            <Link
              href="/dashboard"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-4 inline-block"
            >
              ← Back to Dashboard
            </Link>
            <h1 className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight">{agent.name}</h1>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
            <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Status</p>
              <p className="font-[var(--font-bebas)] text-2xl tracking-tight text-green-400 capitalize">
                {agent.status}
              </p>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Success Rate</p>
              <p className="font-[var(--font-bebas)] text-2xl tracking-tight text-accent">{agent.successRate}%</p>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Avg Response</p>
              <p className="font-[var(--font-bebas)] text-2xl tracking-tight">{agent.avgResponseTime}s</p>
            </Card>

            <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Tasks Today</p>
              <p className="font-[var(--font-bebas)] text-2xl tracking-tight">{agent.tasksCompleted}</p>
            </Card>
          </div>

          {/* Spending */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6 mb-12">
            <h2 className="font-[var(--font-bebas)] text-xl tracking-tight mb-4">Spending Control</h2>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm">Today's Spending</span>
                  <span className="font-[var(--font-bebas)] text-lg tracking-tight">
                    ${agent.spendingToday.toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-background/50 rounded-full h-2">
                  <div
                    className="bg-accent rounded-full h-2 transition-all"
                    style={{ width: `${(agent.spendingToday / agent.spendingLimit) * 100}%` }}
                  />
                </div>
                <p className="font-mono text-xs text-muted-foreground mt-2">Limit: ${agent.spendingLimit.toFixed(2)}</p>
              </div>
            </div>
          </Card>

          {/* Activity chart */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6">
            <h2 className="font-[var(--font-bebas)] text-xl tracking-tight mb-6">Task Activity (24h)</h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={activityData}>
                <defs>
                  <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="tasks"
                  stroke="hsl(var(--accent))"
                  fillOpacity={1}
                  fill="url(#colorTasks)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </main>
      </div>
    </div>
  )
}
