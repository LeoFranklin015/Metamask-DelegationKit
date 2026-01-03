"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

const navItems = [
  { id: "hero", label: "Home" },
  { id: "agents", label: "Agents" },
  { id: "activity", label: "Activity" },
]

export function SideNav() {
  const [activeSection, setActiveSection] = useState("hero")

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight / 3

      // Find which section we're currently in
      for (let i = navItems.length - 1; i >= 0; i--) {
        const element = document.getElementById(navItems[i].id)
        if (element) {
          const offsetTop = element.offsetTop
          if (scrollPosition >= offsetTop) {
            setActiveSection(navItems[i].id)
            break
          }
        }
      }
    }

    // Initial check
    handleScroll()

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: "smooth" })
    }
  }

  return (
    <nav className="fixed left-0 top-0 z-50 h-screen w-16 md:w-20 hidden md:flex flex-col justify-center border-r border-border/30 bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col gap-6 px-4">
        {navItems.map(({ id, label }, index) => (
          <button key={id} onClick={() => scrollToSection(id)} className="group relative flex items-center gap-3">
            {/* Dot indicator */}
            <div className="relative">
              <span
                className={cn(
                  "block h-2 w-2 rounded-full transition-all duration-300",
                  activeSection === id
                    ? "bg-accent scale-125"
                    : "bg-muted-foreground/30 group-hover:bg-muted-foreground/60",
                )}
              />
              {/* Glow effect for active */}
              {activeSection === id && (
                <span className="absolute inset-0 h-2 w-2 rounded-full bg-accent/50 blur-sm animate-pulse" />
              )}
            </div>

            {/* Label on hover */}
            <span
              className={cn(
                "absolute left-6 font-mono text-[10px] uppercase tracking-widest opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:left-8 whitespace-nowrap",
                activeSection === id ? "text-accent" : "text-muted-foreground",
              )}
            >
              {String(index + 1).padStart(2, "0")} {label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}
