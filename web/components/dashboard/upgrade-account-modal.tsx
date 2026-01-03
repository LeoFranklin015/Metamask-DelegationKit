"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSendCalls } from "wagmi"
import { useAccount } from "wagmi"

interface UpgradeAccountModalProps {
  isOpen: boolean
  onClose: () => void
  onUpgradeSuccess: () => void
}

export function UpgradeAccountModal({ isOpen, onClose, onUpgradeSuccess }: UpgradeAccountModalProps) {
  const { address } = useAccount()
  const { sendCallsAsync } = useSendCalls()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpgrade = async () => {
    if (!address) return

    setIsLoading(true)
    setError(null)

    try {
      // Send batch transaction to trigger MetaMask smart account upgrade
      await sendCallsAsync({
        calls: [
          { to: address, value: BigInt(0) },
          { to: address, value: BigInt(0) },
        ],
      })

      // Wait a bit for the upgrade to propagate
      setTimeout(() => {
        onUpgradeSuccess()
      }, 10000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      if (errorMessage.includes("User rejected") || errorMessage.includes("user rejected")) {
        setError("You rejected the upgrade request.")
      } else if (errorMessage.includes("not supported") || errorMessage.includes("does not support")) {
        setError("Batch transactions not supported. Make sure you're using MetaMask Flask 13.5.0+ on Sepolia.")
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card/80 backdrop-blur-xl border-border/30 shadow-2xl shadow-black/20">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            Upgrade Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          <div className="border border-accent/30 bg-accent/5 p-4">
            <p className="font-mono text-xs text-muted-foreground leading-relaxed">
              SpendHQ requires your wallet to be upgraded to a{" "}
              <span className="text-accent">MetaMask Smart Account</span> via EIP-7702.
              This enables secure delegation of spending permissions to agents.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              What happens next
            </h4>
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <span className="font-mono text-[10px] text-accent">01</span>
                <span className="font-mono text-xs text-muted-foreground">
                  MetaMask will prompt you to upgrade your EOA
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-[10px] text-accent">02</span>
                <span className="font-mono text-xs text-muted-foreground">
                  Sign the transaction to enable smart account features
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="font-mono text-[10px] text-accent">03</span>
                <span className="font-mono text-xs text-muted-foreground">
                  Start delegating permissions to agents
                </span>
              </li>
            </ul>
          </div>

          {error && (
            <div className="border border-red-500/30 bg-red-500/10 p-3">
              <p className="font-mono text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 border border-border/50 px-4 py-3 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleUpgrade}
              disabled={isLoading}
              className="flex-1 bg-accent text-background px-4 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Upgrading..." : "Upgrade Now"}
            </button>
          </div>

          <p className="font-mono text-[10px] text-muted-foreground/60 text-center">
            Requires MetaMask Flask 13.5.0+ • Sepolia Network
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
