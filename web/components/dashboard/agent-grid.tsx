"use client"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface Agent {
  id: string
  name: string
  model: string
  status: "active" | "idle" | "error"
  tasksCompleted: number
  delegatedTo: string[]
  lastActive: string
}

const mockAgents: Agent[] = [
  {
    id: "agent-1",
    name: "Finance Monitor",
    model: "gpt-4-turbo",
    status: "active",
    tasksCompleted: 247,
    delegatedTo: ["agent-2", "agent-3"],
    lastActive: "2 minutes ago",
  },
  {
    id: "agent-2",
    name: "Expense Tracker",
    model: "gpt-4-turbo",
    status: "active",
    tasksCompleted: 189,
    delegatedTo: [],
    lastActive: "1 minute ago",
  },
  {
    id: "agent-3",
    name: "Budget Analyzer",
    model: "gpt-4-turbo",
    status: "idle",
    tasksCompleted: 156,
    delegatedTo: [],
    lastActive: "32 minutes ago",
  },
  {
    id: "agent-4",
    name: "Report Generator",
    model: "gpt-4-turbo",
    status: "active",
    tasksCompleted: 423,
    delegatedTo: ["agent-2"],
    lastActive: "5 seconds ago",
  },
]

const statusColors = {
  active: "bg-green-500/10 text-green-400 border-green-500/30",
  idle: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
}

export function AgentGrid({ onSelectAgent }: { onSelectAgent: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
      {mockAgents.map((agent) => (
        <Card
          key={agent.id}
          className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-accent/50 transition-all duration-300 overflow-hidden group"
        >
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-[var(--font-bebas)] text-xl tracking-tight group-hover:text-accent transition-colors">
                  {agent.name}
                </h3>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mt-1">
                  {agent.model}
                </p>
              </div>
              <div
                className={`px-3 py-1 rounded text-xs font-mono uppercase tracking-widest border ${statusColors[agent.status]}`}
              >
                {agent.status}
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-border/30" />

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Tasks</p>
                <p className="font-[var(--font-bebas)] text-2xl tracking-tight">{agent.tasksCompleted}</p>
              </div>
              <div>
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Delegated</p>
                <p className="font-[var(--font-bebas)] text-2xl tracking-tight">{agent.delegatedTo.length}</p>
              </div>
            </div>

            {/* Last active */}
            <p className="font-mono text-xs text-muted-foreground/60">Active {agent.lastActive}</p>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => onSelectAgent(agent.id)}
                className="flex-1 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 font-mono text-xs uppercase tracking-widest"
              >
                Configure
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-border/50 hover:border-accent/50 font-mono text-xs uppercase tracking-widest bg-transparent"
              >
                Stats
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
