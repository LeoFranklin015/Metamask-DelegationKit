"use client"

import Link from "next/link"
import { ScrambleTextOnHover } from "@/components/scramble-text"
import { BitmapChevron } from "@/components/bitmap-chevron"

export function DashboardHeader() {
  return (
    <header className="border-b border-border/50 sticky top-0 z-20 bg-background/80 backdrop-blur-sm">
      <div className="px-6 md:px-28 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <h1 className="font-[var(--font-bebas)] text-2xl tracking-tight group-hover:text-accent transition-colors">
            SPENDHQ
          </h1>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Watchtower</span>
        </Link>

        <nav className="flex items-center gap-8">
          <a
            href="/"
            className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
          >
            <ScrambleTextOnHover text="Back to Home" as="span" duration={0.4} />
            <BitmapChevron className="w-3 h-3 -rotate-90 group-hover:-translate-y-1 transition-transform" />
          </a>
        </nav>
      </div>
    </header>
  )
}
