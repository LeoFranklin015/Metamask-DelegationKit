"use client"

import { useState, useCallback, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useAccount, useWalletClient, useSwitchChain, useChainId, useBalance } from "wagmi"
import { parseUnits, formatUnits, type Address, type Hex } from "viem"
import {
  requestExecutionPermissions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions"
import { sepolia } from "viem/chains"
import { cn } from "@/lib/utils"

// ============================================
// Constants
// ============================================

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"

// Subscription Agent address
const SUBSCRIPTION_AGENT_ADDRESS = "0x9d40c09a940a67ad7aff166c99e9422ce89aeb2d" as Address

// USDC on Sepolia for payments
const USDC = {
  symbol: "USDC",
  name: "USD Coin",
  address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as Address,
  decimals: 6,
}

// Predefined subscription services
const SUBSCRIPTION_SERVICES = [
  {
    id: "netflix",
    name: "Netflix",
    icon: "🎬",
    color: "red",
    price: "0.20",
    merchantAddress: "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address,
    features: ["Unlimited movies & TV shows", "Watch on any device", "Cancel anytime"],
  },
  {
    id: "spotify",
    name: "Spotify",
    icon: "🎵",
    color: "green",
    price: "0.10",
    merchantAddress: "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address,
    features: ["Ad-free music", "Offline listening", "Unlimited skips"],
  },
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    icon: "🤖",
    color: "emerald",
    price: "0.50",
    merchantAddress: "0x4d3b8dd169fa999a3689ef6eeea640d0468de0fe" as Address,
    features: ["GPT-4 access", "Faster responses", "Priority access"],
  },
  {
    id: "custom",
    name: "Custom",
    icon: "⚙️",
    color: "gray",
    price: "",
    merchantAddress: "" as Address,
    features: ["Set your own price", "Any recipient address"],
  },
] as const

type ServiceId = typeof SUBSCRIPTION_SERVICES[number]["id"]

// Billing cycles
const BILLING_CYCLES = [
  { value: "monthly", label: "Monthly", seconds: 30 * 24 * 60 * 60 }, // 30 days
  { value: "yearly", label: "Yearly", seconds: 365 * 24 * 60 * 60 }, // 365 days
] as const

type BillingCycle = typeof BILLING_CYCLES[number]["value"]

// ============================================
// Component
// ============================================

interface SubscriptionConfigModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function SubscriptionConfigModal({ isOpen, onClose, onSuccess }: SubscriptionConfigModalProps) {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()

  const isCorrectChain = chainId === sepolia.id

  // Form state
  const [selectedService, setSelectedService] = useState<ServiceId>("netflix")
  const [customName, setCustomName] = useState("")
  const [customPrice, setCustomPrice] = useState("")
  const [customRecipient, setCustomRecipient] = useState("")
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly")

  // Calculate interval in seconds from billing cycle
  const intervalSeconds = BILLING_CYCLES.find(c => c.value === billingCycle)?.seconds || 30 * 24 * 60 * 60

  // Get current service details
  const currentService = SUBSCRIPTION_SERVICES.find(s => s.id === selectedService)!
  const isCustom = selectedService === "custom"

  // Existing subscriptions (to prevent duplicates)
  const [existingSubscriptions, setExistingSubscriptions] = useState<string[]>([])
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false)

  // Check if already subscribed to selected service
  const isAlreadySubscribed = !isCustom && existingSubscriptions.includes(selectedService)

  // Fetch existing subscriptions
  useEffect(() => {
    const fetchSubscriptions = async () => {
      if (!address) return
      setIsLoadingSubscriptions(true)
      try {
        const response = await fetch(`${BACKEND_URL}/api/agents/user/${address}`)
        if (response.ok) {
          const data = await response.json()
          // Extract service IDs from subscription agents
          const subscribed = data.agents
            ?.filter((agent: { type: string }) => agent.type === "recurring-payment")
            ?.map((agent: { name: string }) => {
              // Match service by name
              if (agent.name?.toLowerCase().includes("netflix")) return "netflix"
              if (agent.name?.toLowerCase().includes("spotify")) return "spotify"
              if (agent.name?.toLowerCase().includes("chatgpt")) return "chatgpt"
              return null
            })
            .filter(Boolean) || []
          setExistingSubscriptions(subscribed)
        }
      } catch {
        // Ignore errors, just allow subscription
      } finally {
        setIsLoadingSubscriptions(false)
      }
    }
    fetchSubscriptions()
  }, [address])

  // Get USDC balance
  const { data: usdcBalance, isLoading: isBalanceLoading } = useBalance({
    address,
    token: USDC.address,
    chainId: sepolia.id,
  })

  // UI state
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Get effective values
  const effectivePrice = isCustom ? customPrice : currentService.price
  const effectiveRecipient = isCustom ? customRecipient : currentService.merchantAddress
  const effectiveName = isCustom ? (customName || "Custom Subscription") : `${currentService.name} Subscription`

  const handleCreate = useCallback(async () => {
    if (!walletClient || !address) return

    if (!effectivePrice || parseFloat(effectivePrice) <= 0) {
      setError("Please enter a valid price")
      return
    }

    if (isCustom && (!effectiveRecipient || !effectiveRecipient.startsWith("0x"))) {
      setError("Please enter a valid recipient address")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const amountInWei = parseUnits(effectivePrice, USDC.decimals)
      const expiry = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 // 1 year

      const permissionParams: RequestExecutionPermissionsParameters = [
        {
          chainId: sepolia.id,
          expiry,
          signer: {
            type: "account",
            data: { address: SUBSCRIPTION_AGENT_ADDRESS },
          },
          permission: {
            type: "erc20-token-periodic",
            data: {
              tokenAddress: USDC.address,
              periodAmount: amountInWei,
              periodDuration: intervalSeconds,
            },
          },
          isAdjustmentAllowed: true,
        },
      ]

      const permissions = await requestExecutionPermissions(
        walletClient as Parameters<typeof requestExecutionPermissions>[0],
        permissionParams
      )

      const granted = permissions as Array<{
        context: Hex
        signerMeta: { delegationManager: Address }
      }>

      const permissionContext = granted[0].context
      const delegationManager = granted[0].signerMeta.delegationManager

      const payload = {
        userAddress: address,
        name: effectiveName,
        permissionContext,
        delegationManager,
        sessionKeyAddress: SUBSCRIPTION_AGENT_ADDRESS,
        config: {
          token: USDC.address,
          amount: amountInWei.toString(),
          recipient: effectiveRecipient,
          intervalSeconds,
        },
      }

      const response = await fetch(`${BACKEND_URL}/api/agents/recurring-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to create subscription")
      }

      setSuccess(true)
      onSuccess?.()

      setTimeout(() => {
        onClose()
        setSuccess(false)
        setSelectedService("netflix")
        setCustomName("")
        setCustomPrice("")
        setCustomRecipient("")
      }, 2000)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      if (errorMessage.includes("User rejected") || errorMessage.includes("user rejected")) {
        setError("You rejected the permission request.")
      } else {
        setError(errorMessage)
      }
    } finally {
      setIsLoading(false)
    }
  }, [walletClient, address, effectivePrice, effectiveRecipient, effectiveName, intervalSeconds, isCustom, onClose, onSuccess])

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-card/80 backdrop-blur-xl border-border/30 shadow-2xl shadow-black/20 h-auto max-h-[98vh] overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="font-[var(--font-bebas)] text-2xl tracking-tight">
            Configure Subscription
          </DialogTitle>
          <p className="font-mono text-xs text-muted-foreground">
            Set up recurring payments with automatic billing
          </p>
        </DialogHeader>

        {/* Chain Check */}
        {!isCorrectChain && (
          <div className="border border-accent/30 bg-accent/5 p-4 mt-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-xs text-accent">Wrong Network</p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  Please switch to Sepolia
                </p>
              </div>
              <button
                onClick={() => switchChain({ chainId: sepolia.id })}
                disabled={isSwitchingChain}
                className="bg-accent text-background px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {isSwitchingChain ? "Switching..." : "Switch"}
              </button>
            </div>
          </div>
        )}

        {isCorrectChain && (
          <div className="space-y-4 mt-1">
            {/* Service Selection */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Select Service
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SUBSCRIPTION_SERVICES.map((service) => {
                  const isSubscribed = service.id !== "custom" && existingSubscriptions.includes(service.id)
                  return (
                    <button
                      key={service.id}
                      onClick={() => setSelectedService(service.id)}
                      className={cn(
                        "p-3 border transition-colors text-left relative",
                        selectedService === service.id
                          ? service.color === "red" ? "bg-red-500/20 border-red-500/50" :
                            service.color === "green" ? "bg-green-500/20 border-green-500/50" :
                            service.color === "emerald" ? "bg-emerald-500/20 border-emerald-500/50" :
                            "bg-accent/20 border-accent/50"
                          : "bg-background/50 border-border/50 hover:border-border",
                        isSubscribed && "opacity-60"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{service.icon}</span>
                        <div>
                          <div className="font-mono text-xs flex items-center gap-1.5">
                            {service.name}
                            {isSubscribed && (
                              <span className="text-[9px] text-amber-400 bg-amber-500/20 px-1 py-0.5 rounded">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          {service.price && (
                            <div className="font-mono text-[10px] text-muted-foreground">
                              ${service.price}/month
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Service Features (for non-custom) */}
            {!isCustom && currentService.features.length > 0 && (
              <div className={cn(
                "p-3 border",
                currentService.color === "red" ? "border-red-500/30 bg-red-500/5" :
                currentService.color === "green" ? "border-green-500/30 bg-green-500/5" :
                currentService.color === "emerald" ? "border-emerald-500/30 bg-emerald-500/5" :
                "border-border/30 bg-background/50"
              )}>
                <div className="space-y-1">
                  {currentService.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <span className="text-green-400">✓</span>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Fields */}
            {isCustom && (
              <>
                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Subscription Name
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder="e.g., My Service"
                    className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Recipient Address
                  </label>
                  <input
                    type="text"
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Price (USDC)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={customPrice}
                      onChange={(e) => setCustomPrice(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 bg-background/50 border border-border/50 px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent/50"
                    />
                    <span className="px-3 py-2 bg-background/50 border border-border/50 font-mono text-sm text-muted-foreground">
                      USDC
                    </span>
                  </div>
                </div>
              </>
            )}

            {/* Billing Cycle */}
            <div className="space-y-2">
              <label className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Billing Cycle
              </label>
              <div className="grid grid-cols-2 gap-2">
                {BILLING_CYCLES.map((cycle) => (
                  <button
                    key={cycle.value}
                    onClick={() => setBillingCycle(cycle.value)}
                    className={cn(
                      "p-3 border transition-colors font-mono text-sm",
                      billingCycle === cycle.value
                        ? "bg-accent/20 border-accent/50 text-accent"
                        : "bg-background/50 border-border/50 hover:border-border text-muted-foreground"
                    )}
                  >
                    {cycle.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Balance */}
            <div className="flex items-center justify-between p-3 border border-border/30 bg-background/30">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Your USDC Balance
              </span>
              <span className="font-mono text-xs">
                {isBalanceLoading ? (
                  "..."
                ) : usdcBalance ? (
                  <span className="text-accent">
                    {parseFloat(formatUnits(usdcBalance.value, usdcBalance.decimals)).toFixed(2)} USDC
                  </span>
                ) : (
                  "0 USDC"
                )}
              </span>
            </div>

            {/* Summary */}
            {effectivePrice && (
              <div className="border border-accent/30 bg-accent/5 p-3">
                <p className="font-mono text-xs text-center">
                  <span className="text-muted-foreground">You will be charged </span>
                  <span className="text-accent font-bold">${effectivePrice} USDC</span>
                  <span className="text-muted-foreground"> {billingCycle}</span>
                </p>
              </div>
            )}

            {/* Already Subscribed Warning */}
            {isAlreadySubscribed && (
              <div className="border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex gap-2 items-center">
                  <span className="text-amber-400 text-sm">⚠</span>
                  <p className="font-mono text-[10px] text-amber-400">
                    You already have an active {currentService.name} subscription
                  </p>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="border border-border/30 p-3">
              <p className="font-mono text-[10px] text-muted-foreground/60 text-center">
                Subscription Agent: {SUBSCRIPTION_AGENT_ADDRESS.slice(0, 10)}...{SUBSCRIPTION_AGENT_ADDRESS.slice(-8)}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        {isCorrectChain && (
          <div className="border-t border-border/30 pt-3 mt-3 space-y-2">
            {/* Error */}
            {error && (
              <div className="border border-red-500/30 bg-red-500/10 p-3">
                <p className="font-mono text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="border border-green-500/30 bg-green-500/10 p-3">
                <p className="font-mono text-xs text-green-400">Subscription created successfully!</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 border border-border/50 px-4 py-2.5 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isLoading || !effectivePrice || (isCustom && !effectiveRecipient) || success || isAlreadySubscribed}
                className="flex-1 bg-accent text-background px-4 py-2.5 font-mono text-xs uppercase tracking-widest hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Processing..." :
                 success ? "Created!" :
                 isAlreadySubscribed ? "Already Subscribed" :
                 !effectivePrice ? "Enter Price" :
                 isCustom && !effectiveRecipient ? "Enter Recipient" :
                 "Subscribe"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
