"use client"

export function DelegationTree() {
  return (
    <div className="space-y-8">
      {/* Main Agent */}
      <div className="flex gap-4">
        <div className="w-48">
          <div className="border border-accent/50 bg-accent/5 rounded p-4">
            <h4 className="font-[var(--font-bebas)] text-lg tracking-tight text-accent">Finance Monitor</h4>
            <p className="font-mono text-xs text-muted-foreground mt-2">Parent Agent</p>
          </div>
        </div>

        {/* Connection lines and delegated agents */}
        <div className="flex-1">
          <div className="relative pl-8 space-y-6">
            {/* Vertical line */}
            <div className="absolute left-0 top-0 bottom-0 w-px bg-border/50" />

            {/* Delegated agent 1 */}
            <div className="relative">
              <div className="absolute -left-2 w-4 h-4 rounded-full bg-border border-2 border-background" />
              <div className="ml-6 w-48">
                <div className="border border-border/50 bg-card/50 rounded p-4 hover:border-accent/50 transition-colors">
                  <h4 className="font-[var(--font-bebas)] text-base tracking-tight">Expense Tracker</h4>
                  <p className="font-mono text-xs text-muted-foreground mt-2">Active • 189 tasks</p>
                </div>
              </div>
            </div>

            {/* Delegated agent 2 */}
            <div className="relative">
              <div className="absolute -left-2 w-4 h-4 rounded-full bg-border border-2 border-background" />
              <div className="ml-6 w-48">
                <div className="border border-border/50 bg-card/50 rounded p-4 hover:border-accent/50 transition-colors">
                  <h4 className="font-[var(--font-bebas)] text-base tracking-tight">Budget Analyzer</h4>
                  <p className="font-mono text-xs text-muted-foreground mt-2">Idle • 156 tasks</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Parent */}
      <div className="mt-12 flex gap-4">
        <div className="w-48">
          <div className="border border-foreground/20 bg-foreground/5 rounded p-4">
            <h4 className="font-[var(--font-bebas)] text-lg tracking-tight">Report Generator</h4>
            <p className="font-mono text-xs text-muted-foreground mt-2">Parent Agent</p>
          </div>
        </div>

        <div className="flex-1">
          <div className="relative pl-8">
            <div className="absolute left-0 top-0 h-16 w-px bg-border/50" />
            <div className="relative">
              <div className="absolute -left-2 w-4 h-4 rounded-full bg-border border-2 border-background" />
              <div className="ml-6 w-48">
                <div className="border border-border/50 bg-card/50 rounded p-4 hover:border-accent/50 transition-colors">
                  <h4 className="font-[var(--font-bebas)] text-base tracking-tight">Expense Tracker</h4>
                  <p className="font-mono text-xs text-muted-foreground mt-2">Active • 189 tasks</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
