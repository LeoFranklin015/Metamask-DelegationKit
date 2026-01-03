"use client"

import { useRef, useEffect } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

gsap.registerPlugin(ScrollTrigger)

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  )
}

export function ColophonSection() {
  const sectionRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sectionRef.current || !contentRef.current) return

    const ctx = gsap.context(() => {
      gsap.from(contentRef.current, {
        y: 20,
        opacity: 0,
        duration: 0.8,
        ease: "power3.out",
        scrollTrigger: {
          trigger: contentRef.current,
          start: "top 95%",
          toggleActions: "play none none reverse",
        },
      })
    }, sectionRef)

    return () => ctx.revert()
  }, [])

  return (
    <footer
      ref={sectionRef}
      className="relative py-12 pl-6 md:pl-28 pr-6 md:pr-12 border-t border-border/30"
    >
      <div
        ref={contentRef}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-6"
      >
        {/* Left - Copyright */}
        <div className="flex items-center gap-6">
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            © 2025 SpendHQ
          </span>
          <span className="hidden md:block font-mono text-[10px] text-muted-foreground/40">
            •
          </span>
          <span className="hidden md:block font-mono text-[10px] text-muted-foreground">
            Powered by MetaMask Delegation
          </span>
        </div>

        {/* Right - Social Links */}
        <div className="flex items-center gap-4">
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-accent transition-colors duration-200"
          >
            <TwitterIcon className="w-4 h-4" />
            <span className="hidden md:inline">Twitter</span>
          </a>
          <span className="font-mono text-[10px] text-muted-foreground/40">•</span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2 font-mono text-xs text-muted-foreground hover:text-accent transition-colors duration-200"
          >
            <GithubIcon className="w-4 h-4" />
            <span className="hidden md:inline">GitHub</span>
          </a>
        </div>
      </div>
    </footer>
  )
}
