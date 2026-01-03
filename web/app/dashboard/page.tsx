"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { AgentGrid } from "@/components/dashboard/agent-grid"
import { DelegationTree } from "@/components/dashboard/delegation-tree"
import { AgentConfigModal } from "@/components/dashboard/agent-config-modal"
import { AnimatedNoise } from "@/components/animated-noise"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function DashboardPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [isConfigOpen, setIsConfigOpen] = useState(false)

  return (
    <div className="relative min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />
      <div className="relative z-10">
        <DashboardHeader />

        <main className="px-6 md:px-28 py-12">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="border-b border-border/50 bg-transparent h-auto gap-8 rounded-none p-0">
              <TabsTrigger
                value="overview"
                className="border-b-2 border-transparent data-[state=active]:border-accent rounded-none px-0 py-3 font-mono text-xs uppercase tracking-widest"
              >
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="delegation"
                className="border-b-2 border-transparent data-[state=active]:border-accent rounded-none px-0 py-3 font-mono text-xs uppercase tracking-widest"
              >
                Delegation Map
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-12 space-y-8">
              <div>
                <h2 className="font-[var(--font-bebas)] text-3xl md:text-4xl tracking-tight mb-6">Active Agents</h2>
                <AgentGrid
                  onSelectAgent={(id) => {
                    setSelectedAgent(id)
                    setIsConfigOpen(true)
                  }}
                />
              </div>
            </TabsContent>

            <TabsContent value="delegation" className="mt-12">
              <div>
                <h2 className="font-[var(--font-bebas)] text-3xl md:text-4xl tracking-tight mb-8">
                  Delegation Hierarchy
                </h2>
                <DelegationTree />
              </div>
            </TabsContent>
          </Tabs>
        </main>

        <AgentConfigModal
          agentId={selectedAgent}
          isOpen={isConfigOpen}
          onClose={() => {
            setIsConfigOpen(false)
            setSelectedAgent(null)
          }}
        />
      </div>
    </div>
  )
}
