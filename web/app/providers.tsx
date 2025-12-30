"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, http, createConfig } from "wagmi";
import { sepolia } from "wagmi/chains";
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  walletConnectWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import "@rainbow-me/rainbowkit/styles.css";
import { useState, type ReactNode } from "react";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo-project-id";

// Configure wallets with MetaMask (Flask) as priority
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,  // This will connect to MetaMask Flask if installed
        injectedWallet,  // Fallback for any injected wallet
      ],
    },
    {
      groupName: "Other",
      wallets: [
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: "MetaMask Advanced Permissions Test",
    projectId,
  }
);

const config = createConfig({
  connectors,
  chains: [sepolia],
  transports: {
    // Use a public RPC that supports EIP-7702
    [sepolia.id]: http("https://sepolia.drpc.org"),
  },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
