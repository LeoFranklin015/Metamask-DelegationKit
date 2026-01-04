"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface NewPermissionModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectAgent: (agentId: string) => void
}

const agents = [
  {
    id: "dca",
    name: "DCA Agent",
    status: "live" as const,
    description: "Dollar-cost average into any token automatically",
    details: "Powered by Uniswap • Set frequency, amount, and target token",
    icon: "↻",
  },
  {
    id: "subscription",
    name: "Subscription Agent",
    status: "live" as const,
    description: "Automate recurring payments and subscriptions",
    details: "Pay for services, memberships, and bills on schedule",
    icon: "◎",
  },
  {
    id: "savings",
    name: "Savings Agent",
    status: "live" as const,
    description: "Auto-save a percentage of incoming funds",
    details: "Set aside 1-50% of deposits to a savings vault",
    icon: "⬡",
  },
  {
    id: "limit-order",
    name: "Limit Order Agent",
    status: "live" as const,
    description: "Execute trades when price targets are hit",
    details: "Powered by Uniswap • Set buy/sell price targets",
    icon: "◇",
  },
]

function AgentCard({
  agent,
  onSelect,
}: {
  agent: (typeof agents)[0]
  onSelect: () => void
}) {
  const isDisabled = false

  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className={cn(
        "group w-full text-left border border-border/50 p-5 transition-all duration-300",
        isDisabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:border-accent/60 hover:bg-accent/5 cursor-pointer"
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">{agent.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-mono text-sm font-medium">{agent.name}</h3>
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border",
                  agent.status === "live"
                    ? "text-green-400 border-green-400/30 bg-green-400/10"
                    : "text-muted-foreground border-border bg-muted/10"
                )}
              >
                {agent.status}
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground mt-1">
              {agent.description}
            </p>
          </div>
        </div>
        {!isDisabled && (
          <span className="font-mono text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
            →
          </span>
        )}
      </div>
      <p className="font-mono text-[10px] text-muted-foreground/60 mt-3 pl-8">
        {agent.details}
      </p>
    </button>
  )
}

export function NewPermissionModal({ isOpen, onClose, onSelectAgent }: NewPermissionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl bg-card/80 backdrop-blur-xl border-border/30 shadow-2xl shadow-black/20">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            New Permission
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground mt-1">
            Select an agent to delegate spending permissions
          </p>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              onSelect={() => {
                onSelectAgent(agent.id)
                onClose()
              }}
            />
          ))}
        </div>

        <div className="mt-6 pt-4 border-t border-border/30">
          <p className="font-mono text-[10px] text-muted-foreground text-center">
            All agents use MetaMask Delegation for secure, revocable permissions
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
