"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { DashboardHeader } from "@/components/dashboard/header"
import { AnimatedNoise } from "@/components/animated-noise"

// Known agent addresses and their metadata
const AGENTS: Record<string, { name: string; type: string; icon: string; description: string; chain: string }> = {
  "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe": {
    name: "DCA Agent",
    type: "dca",
    icon: "↻",
    description: "Dollar-cost averaging into tokens via Uniswap V3",
    chain: "Sepolia",
  },
  "0x0013bb0d8712dc4cacbc8cd32d4c0c851cdf18da": {
    name: "Limit Order Agent",
    type: "limit-order",
    icon: "⇌",
    description: "Execute trades when target price is reached",
    chain: "Sepolia",
  },
  "0x4a5fade4f48c372b4c2cfdd1f58fb1ab1408674a": {
    name: "Savings Agent",
    type: "savings",
    icon: "⬡",
    description: "Auto-supply tokens to Aave V3 for yield",
    chain: "Base Sepolia",
  },
  "0x9d40c09a940a67ad7aff166c99e9422ce89aeb2d": {
    name: "Subscription Agent",
    type: "subscription",
    icon: "◈",
    description: "Automated recurring payments",
    chain: "Sepolia",
  },
}

export default function AgentsIndexPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <AnimatedNoise opacity={0.03} />
      <div className="relative z-10">
        <DashboardHeader />

        <main className="px-6 md:px-28 py-12 max-w-6xl mx-auto">
          {/* Navigation */}
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors mb-6 inline-block"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Title */}
          <div className="mb-12">
            <h1 className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight">
              Agent Statistics
            </h1>
            <p className="font-mono text-sm text-muted-foreground mt-2">
              View on-chain activity and performance metrics for each agent
            </p>
          </div>

          {/* Agent Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(AGENTS).map(([address, meta]) => (
              <Link key={address} href={`/dashboard/agent/${address}`}>
                <Card className="bg-card/50 backdrop-blur-sm border-border/50 p-6 hover:border-accent/50 transition-colors group cursor-pointer h-full">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 border border-border/50 group-hover:border-accent/50 flex items-center justify-center transition-colors">
                      <span className="text-2xl">{meta.icon}</span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-[var(--font-bebas)] text-2xl tracking-tight group-hover:text-accent transition-colors">
                        {meta.name}
                      </h3>
                      <p className="font-mono text-xs text-muted-foreground mt-1">
                        {meta.description}
                      </p>
                      <div className="flex items-center gap-3 mt-4">
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground border border-border/50 px-2 py-1">
                          {meta.chain}
                        </span>
                        <span className="font-mono text-[10px] text-accent group-hover:translate-x-1 transition-transform">
                          View Stats →
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>

          {/* Info Section */}
          <div className="mt-12 border border-border/30 p-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              About Agent Statistics
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Each agent operates on-chain using delegated permissions from users.
              Statistics are aggregated from the Envio indexer, showing real-time
              execution counts, volume, and activity metrics across all delegators.
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}
