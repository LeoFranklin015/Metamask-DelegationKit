"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AgentConfigModalProps {
  agentId: string | null
  isOpen: boolean
  onClose: () => void
}

const models = ["gpt-4-turbo", "gpt-4", "gpt-3.5-turbo", "claude-3-opus"]

export function AgentConfigModal({ agentId, isOpen, onClose }: AgentConfigModalProps) {
  const [config, setConfig] = useState({
    name: "Finance Monitor",
    description: "Monitors financial transactions and spending patterns",
    model: "gpt-4-turbo",
    temperature: 0.7,
    maxTokens: 2000,
    spendingLimit: 1000,
  })

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border/50">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">Configure Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-widest">Agent Name</Label>
            <Input
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              className="bg-background/50 border-border/50 font-mono text-sm"
              placeholder="Enter agent name"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-widest">Description</Label>
            <textarea
              value={config.description}
              onChange={(e) => setConfig({ ...config, description: e.target.value })}
              className="w-full bg-background/50 border border-border/50 rounded px-3 py-2 font-mono text-sm resize-none focus:outline-none focus:border-accent/50"
              rows={3}
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-widest">Model</Label>
            <select
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="w-full bg-background/50 border border-border/50 rounded px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50 text-foreground"
            >
              {models.map((m) => (
                <option key={m} value={m} className="bg-background">
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="font-mono text-xs uppercase tracking-widest">Temperature</Label>
              <span className="font-mono text-sm text-accent">{config.temperature}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: Number.parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          {/* Spending Limit */}
          <div className="space-y-2">
            <Label className="font-mono text-xs uppercase tracking-widest">Spending Limit ($)</Label>
            <Input
              type="number"
              value={config.spendingLimit}
              onChange={(e) => setConfig({ ...config, spendingLimit: Number.parseFloat(e.target.value) })}
              className="bg-background/50 border-border/50 font-mono text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-border/50 font-mono text-xs uppercase tracking-widest bg-transparent"
            >
              Cancel
            </Button>
            <Button
              onClick={onClose}
              className="flex-1 bg-accent text-background hover:bg-accent/90 font-mono text-xs uppercase tracking-widest"
            >
              Save Config
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
