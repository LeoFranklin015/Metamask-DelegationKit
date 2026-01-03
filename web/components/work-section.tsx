"use client"

import { useRef, useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

// Dummy data - will be replaced with Envio data
const DUMMY_STATS = {
  totalExecutions: 1847,
  activeChains: 2,
  totalVolume: "$42.5K",
  latestExecution: {
    agent: "DCA Agent",
    amount: "0.2 USDC",
    recipient: "0x4d3b...8f2a",
    chain: "Sepolia",
    timeAgo: "3 mins ago",
  },
  recentExecutions: [
    { agent: "Subscription Agent", amount: "0.5 USDC", timeAgo: "2h ago" },
    { agent: "Savings Agent", amount: "0.1 ETH", timeAgo: "5h ago" },
    { agent: "DCA Agent", amount: "0.2 USDC", timeAgo: "8h ago" },
  ],
}

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted-foreground/10 rounded",
        className
      )}
    />
  )
}

function BentoCard({
  children,
  className,
  index,
  persistActive = false,
}: {
  children: React.ReactNode
  className?: string
  index: string
  persistActive?: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const isActive = isHovered || persistActive

  return (
    <div
      className={cn(
        "bento-card group relative border border-border/40 p-5 md:p-6 flex flex-col justify-between transition-all duration-500 cursor-pointer overflow-hidden",
        className,
        isActive && "border-accent/60 scale-[1.02]",
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Background layer */}
      <div
        className={cn(
          "absolute inset-0 bg-accent/5 transition-opacity duration-500",
          isActive ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col justify-between h-full">
        {children}
      </div>

      {/* Index marker */}
      <span
        className={cn(
          "absolute bottom-4 right-4 font-mono text-[10px] transition-colors duration-300 z-10",
          isActive ? "text-accent" : "text-muted-foreground/40",
        )}
      >
        {index}
      </span>

      {/* Corner accent */}
      <div
        className={cn(
          "absolute top-0 right-0 w-12 h-12 transition-all duration-500 z-10",
          isActive ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="absolute top-0 right-0 w-full h-px bg-accent" />
        <div className="absolute top-0 right-0 w-px h-full bg-accent" />
      </div>
    </div>
  )
}

export function WorkSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Simulate loading
  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 1500)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!sectionRef.current || !headerRef.current || !gridRef.current) return

    const ctx = gsap.context(() => {
      gsap.fromTo(
        headerRef.current,
        { x: -60, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: headerRef.current,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        },
      )

      const cards = gridRef.current?.querySelectorAll(".bento-card")
      if (cards && cards.length > 0) {
        gsap.set(cards, { y: 40, opacity: 0 })
        gsap.to(cards, {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.08,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gridRef.current,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
        })
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section ref={sectionRef} id="activity" className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12">
      {/* Section header */}
      <div ref={headerRef} className="mb-12">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">02 / Activity</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">LIVE EXECUTIONS</h2>
      </div>

      {/* Bento Grid */}
      <div
        ref={gridRef}
        className="grid grid-cols-2 md:grid-cols-6 gap-4 auto-rows-[140px] md:auto-rows-[160px]"
      >
        {/* Latest Execution - Large card */}
        <BentoCard className="col-span-2 md:col-span-3 row-span-2" index="01" persistActive>
          <div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Latest Execution
            </span>
            {isLoading ? (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : (
              <div className="mt-4">
                <h3 className="font-[var(--font-bebas)] text-3xl md:text-4xl tracking-tight text-accent group-hover:text-accent transition-colors">
                  {DUMMY_STATS.latestExecution.agent}
                </h3>
                <p className="mt-2 font-mono text-sm text-foreground">
                  {DUMMY_STATS.latestExecution.amount}{" "}
                  <span className="text-muted-foreground">→</span>{" "}
                  <span className="text-muted-foreground">{DUMMY_STATS.latestExecution.recipient}</span>
                </p>
              </div>
            )}
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {DUMMY_STATS.latestExecution.chain} • {DUMMY_STATS.latestExecution.timeAgo}
              </span>
            )}
          </div>
        </BentoCard>

        {/* Total Executions */}
        <BentoCard className="col-span-1 md:col-span-2" index="02">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Total
          </span>
          {isLoading ? (
            <Skeleton className="h-10 w-20" />
          ) : (
            <span className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight group-hover:text-accent transition-colors">
              {DUMMY_STATS.totalExecutions.toLocaleString()}
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">Executions</span>
        </BentoCard>

        {/* Active Chains */}
        <BentoCard className="col-span-1" index="03">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Chains
          </span>
          {isLoading ? (
            <Skeleton className="h-10 w-12" />
          ) : (
            <span className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight group-hover:text-accent transition-colors">
              {String(DUMMY_STATS.activeChains).padStart(2, "0")}
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">Active</span>
        </BentoCard>

        {/* Recent Executions List */}
        <BentoCard className="col-span-2 md:col-span-4" index="04">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Recent
          </span>
          <div className="flex-1 flex flex-col justify-center space-y-2 my-2">
            {isLoading ? (
              <>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-4 w-3/5" />
              </>
            ) : (
              DUMMY_STATS.recentExecutions.map((exec, idx) => (
                <div key={idx} className="flex items-center justify-between font-mono text-xs">
                  <span className="text-muted-foreground">
                    <span className="text-foreground group-hover:text-accent transition-colors">{exec.agent}</span> • {exec.amount}
                  </span>
                  <span className="text-muted-foreground/60">{exec.timeAgo}</span>
                </div>
              ))
            )}
          </div>
          <div />
        </BentoCard>

        {/* Total Volume */}
        <BentoCard className="col-span-2 md:col-span-2" index="05">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Volume
          </span>
          {isLoading ? (
            <Skeleton className="h-10 w-24" />
          ) : (
            <span className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight text-accent">
              {DUMMY_STATS.totalVolume}
            </span>
          )}
          <span className="font-mono text-[10px] text-muted-foreground">All Time</span>
        </BentoCard>
      </div>
    </section>
  )
}
