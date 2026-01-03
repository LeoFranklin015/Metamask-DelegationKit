"use client"

import { useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

const agents = [
  {
    id: "01",
    status: "LIVE",
    title: "DCA Agent",
    description: "Automated dollar-cost averaging into any token.",
  },
  {
    id: "02",
    status: "LIVE",
    title: "Subscription Agent",
    description: "Recurring payments on a set schedule.",
  },
  {
    id: "03",
    status: "LIVE",
    title: "Savings Agent",
    description: "Auto-transfer funds to yield vaults.",
  },
  {
    id: "04",
    status: "SOON",
    title: "Limit Order Agent",
    description: "Execute swaps at target prices.",
  },
]

export function SignalsSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !headerRef.current || !tableRef.current) return

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
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        },
      )

      const rows = tableRef.current?.querySelectorAll(".agent-row")
      if (rows) {
        gsap.fromTo(
          rows,
          { x: -40, opacity: 0 },
          {
            x: 0,
            opacity: 1,
            duration: 0.6,
            stagger: 0.1,
            ease: "power3.out",
            scrollTrigger: {
              trigger: tableRef.current,
              start: "top 90%",
              toggleActions: "play none none reverse",
            },
          },
        )
      }
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <section id="agents" ref={sectionRef} className="relative py-32 pl-6 md:pl-28 pr-6 md:pr-12">
      {/* Section header */}
      <div ref={headerRef} className="mb-12">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-accent">01 / Agents</span>
        <h2 className="mt-4 font-[var(--font-bebas)] text-5xl md:text-7xl tracking-tight">ACTIVE SYSTEMS</h2>
      </div>

      {/* Agents Table */}
      <div ref={tableRef} className="w-full">
        {/* Table Header */}
        <div className="hidden md:grid grid-cols-12 gap-4 py-3 border-b border-border/30">
          <div className="col-span-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">No.</div>
          <div className="col-span-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Status</div>
          <div className="col-span-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Title</div>
          <div className="col-span-6 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Description</div>
        </div>

        {/* Table Rows */}
        {agents.map((agent) => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </div>
    </section>
  )
}

function AgentRow({
  agent,
}: {
  agent: { id: string; status: string; title: string; description: string }
}) {
  const isLive = agent.status === "LIVE"

  return (
    <div
      className={cn(
        "agent-row group grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 py-6 border-b border-border/20",
        "transition-all duration-300 cursor-pointer",
        "hover:bg-accent/5 hover:border-accent/30",
      )}
    >
      {/* Number */}
      <div className="col-span-1 flex items-center">
        <span className="font-mono text-xs text-muted-foreground/60 group-hover:text-accent transition-colors">
          {agent.id}
        </span>
      </div>

      {/* Status */}
      <div className="col-span-2 flex items-center">
        <span
          className={cn(
            "font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded-sm",
            isLive
              ? "text-emerald-400 bg-emerald-400/10"
              : "text-muted-foreground bg-muted-foreground/10",
          )}
        >
          {agent.status}
        </span>
      </div>

      {/* Title */}
      <div className="col-span-3 flex items-center">
        <h3 className="font-[var(--font-bebas)] text-2xl md:text-3xl tracking-tight group-hover:text-accent transition-colors">
          {agent.title}
        </h3>
      </div>

      {/* Description */}
      <div className="col-span-6 flex items-center">
        <p className="font-mono text-xs text-muted-foreground leading-relaxed">
          {agent.description}
        </p>
      </div>
    </div>
  )
}
