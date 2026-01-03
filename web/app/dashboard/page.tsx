"use client"

import { useState } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { DelegationTree } from "@/components/dashboard/delegation-tree"
import { NewPermissionModal } from "@/components/dashboard/new-permission-modal"
import { DCAConfigModal } from "@/components/dashboard/dca-config-modal"
import { StatsOverview } from "@/components/dashboard/stats-overview"
import { PermissionsList } from "@/components/dashboard/permissions-list"
import { RecentActivity } from "@/components/dashboard/recent-activity"
import { WalletGate } from "@/components/dashboard/wallet-gate"
import { AnimatedNoise } from "@/components/animated-noise"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export default function DashboardPage() {
  const [isNewPermissionOpen, setIsNewPermissionOpen] = useState(false)
  const [isDCAConfigOpen, setIsDCAConfigOpen] = useState(false)

  return (
    <WalletGate>
      <div className="relative min-h-screen bg-background">
        <AnimatedNoise opacity={0.03} />
        <div className="relative z-10">
          <DashboardHeader />

        <main className="px-6 md:px-28 py-12">
          <Tabs defaultValue="overview" className="w-full">
            <div className="flex items-center justify-between border-b border-border/50">
              <TabsList className="bg-transparent h-auto gap-8 rounded-none p-0">
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

              <button
                onClick={() => setIsNewPermissionOpen(true)}
                className="bg-accent text-background px-4 py-2 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors"
              >
                New Permission +
              </button>
            </div>

            <TabsContent value="overview" className="mt-12 space-y-10">
              <StatsOverview />

              <div>
                <h2 className="font-[var(--font-bebas)] text-3xl md:text-4xl tracking-tight mb-6">
                  Active Permissions
                </h2>
                <PermissionsList />
              </div>

              <RecentActivity />
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

        <NewPermissionModal
          isOpen={isNewPermissionOpen}
          onClose={() => setIsNewPermissionOpen(false)}
          onSelectAgent={(agentId) => {
            setIsNewPermissionOpen(false)
            // Open appropriate config modal based on agent type
            if (agentId === "dca") {
              setIsDCAConfigOpen(true)
            }
            // TODO: Add other agent modals (subscription, savings, limit-order)
          }}
        />

        <DCAConfigModal
          isOpen={isDCAConfigOpen}
          onClose={() => setIsDCAConfigOpen(false)}
        />
      </div>
    </div>
    </WalletGate>
  )
}
