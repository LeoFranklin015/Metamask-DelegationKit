"use client"

import { useState, useEffect, useCallback } from "react"
import { useAccount, usePublicClient } from "wagmi"
import { CustomConnectButton } from "@/components/ConnectButton"
import { UpgradeAccountModal } from "./upgrade-account-modal"
import { AnimatedNoise } from "@/components/animated-noise"

interface WalletGateProps {
  children: React.ReactNode
}

export function WalletGate({ children }: WalletGateProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [isUpgraded, setIsUpgraded] = useState<boolean | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const checkAccountUpgrade = useCallback(async () => {
    if (!address) return

    setIsChecking(true)
    try {
      let code: string | undefined

      // Try using publicClient first
      if (publicClient) {
        try {
          code = await publicClient.getCode({ address })
        } catch {
          // Fallback to direct RPC
        }
      }

      // Fallback: Direct RPC call
      if (!code || code === "0x") {
        try {
          const response = await fetch("https://rpc.sepolia.org", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              method: "eth_getCode",
              params: [address, "latest"],
              id: 1,
            }),
          })
          const data = await response.json()
          code = data.result
        } catch {
          // Failed to get code
        }
      }

      // Check for EIP-7702 delegation (starts with 0xef0100)
      if (code && code !== "0x" && code.length > 2) {
        const isEip7702 = code.toLowerCase().startsWith("0xef0100")
        setIsUpgraded(isEip7702)

        if (!isEip7702) {
          setShowUpgradeModal(true)
        }
      } else {
        setIsUpgraded(false)
        setShowUpgradeModal(true)
      }
    } catch {
      setIsUpgraded(false)
      setShowUpgradeModal(true)
    } finally {
      setIsChecking(false)
    }
  }, [address, publicClient])

  // Check upgrade status when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      checkAccountUpgrade()
    } else {
      setIsUpgraded(null)
      setShowUpgradeModal(false)
    }
  }, [isConnected, address, checkAccountUpgrade])

  // Not connected - show connect prompt
  if (!isConnected) {
    return (
      <div className="relative min-h-screen bg-background flex items-center justify-center">
        <AnimatedNoise opacity={0.03} />
        <div className="relative z-10 text-center space-y-8 px-6">
          <div className="space-y-4">
            <h1 className="font-[var(--font-bebas)] text-5xl md:text-6xl tracking-tight">
              Connect Wallet
            </h1>
            <p className="font-mono text-sm text-muted-foreground max-w-md mx-auto">
              Connect your wallet to access the SpendHQ dashboard and manage your agent permissions.
            </p>
          </div>

          <div className="flex justify-center">
            <CustomConnectButton />
          </div>

          <div className="border border-border/30 p-4 max-w-sm mx-auto">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              Requirements
            </p>
            <ul className="font-mono text-xs text-muted-foreground space-y-1">
              <li>• MetaMask Flask 13.5.0+</li>
              <li>• Sepolia Network</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  // Checking upgrade status
  if (isChecking || isUpgraded === null) {
    return (
      <div className="relative min-h-screen bg-background flex items-center justify-center">
        <AnimatedNoise opacity={0.03} />
        <div className="relative z-10 text-center space-y-6">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="space-y-2">
            <p className="font-mono text-sm text-foreground">Checking account status...</p>
            <p className="font-mono text-xs text-muted-foreground">
              Verifying EIP-7702 compliance
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Show upgrade modal if not upgraded
  if (!isUpgraded) {
    return (
      <div className="relative min-h-screen bg-background flex items-center justify-center">
        <AnimatedNoise opacity={0.03} />
        <div className="relative z-10 text-center space-y-8 px-6">
          <div className="space-y-4">
            <div className="w-16 h-16 border border-accent/50 flex items-center justify-center mx-auto">
              <span className="text-2xl">⚡</span>
            </div>
            <h1 className="font-[var(--font-bebas)] text-4xl md:text-5xl tracking-tight">
              Upgrade Required
            </h1>
            <p className="font-mono text-sm text-muted-foreground max-w-md mx-auto">
              Your wallet needs to be upgraded to a Smart Account to use SpendHQ.
            </p>
          </div>

          <button
            onClick={() => setShowUpgradeModal(true)}
            className="bg-accent text-background px-6 py-3 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors"
          >
            Upgrade Account
          </button>

          <p className="font-mono text-[10px] text-muted-foreground/60">
            Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>

        <UpgradeAccountModal
          isOpen={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          onUpgradeSuccess={() => {
            setShowUpgradeModal(false)
            checkAccountUpgrade()
          }}
        />
      </div>
    )
  }

  // Upgraded - render children
  return <>{children}</>
}
