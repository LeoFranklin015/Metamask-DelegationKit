"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient, useSendCalls } from "wagmi";
import { useState, useCallback, useEffect } from "react";
import { parseUnits, encodeFunctionData, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import {
  toMetaMaskSmartAccount,
  Implementation,
  getSmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import {
  requestExecutionPermissions,
  erc7710BundlerActions,
  type RequestExecutionPermissionsParameters,
} from "@metamask/smart-accounts-kit/actions";
import { createBundlerClient, type BundlerClient } from "viem/account-abstraction";
import { http } from "viem";

// USDC address on Ethereum Sepolia
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

// ERC-20 Transfer ABI
const ERC20_TRANSFER_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

type PermissionGrant = {
  context: Hex;
  signerMeta: {
    delegationManager: Address;
  };
};

type SessionAccountData = {
  privateKey: Hex;
  address: Address;
  smartAccountAddress?: Address;
};

export default function Home() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { sendCallsAsync } = useSendCalls();

  const [sessionAccount, setSessionAccount] = useState<SessionAccountData | null>(null);
  const [smartAccount, setSmartAccount] = useState<Awaited<ReturnType<typeof toMetaMaskSmartAccount>> | null>(null);
  const [grantedPermissions, setGrantedPermissions] = useState<PermissionGrant[] | null>(null);
  const [isAccountUpgraded, setIsAccountUpgraded] = useState<boolean | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<string | null>(null);

  // Permission request parameters
  const [periodAmount, setPeriodAmount] = useState("1");
  const [periodDuration, setPeriodDuration] = useState("86400"); // 1 day in seconds
  const [expiryDays, setExpiryDays] = useState("7");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("0.1");
  const [bundlerUrl, setBundlerUrl] = useState("https://api.pimlico.io/v2/sepolia/rpc?apikey=pim_QEUJGJKNfJtK94AkqQ5jet");

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Check if connected account is upgraded to smart account
  const checkAccountUpgrade = useCallback(async () => {
    if (!address) return;

    try {
      addLog("Checking if account is upgraded to smart account...");
      addLog(`Address: ${address}`);

      // Try multiple methods to get the code
      let code: string | undefined;

      // Method 1: Try using publicClient
      if (publicClient) {
        try {
          code = await publicClient.getCode({ address });
          addLog(`PublicClient code: ${code || "empty"}`);
        } catch (e) {
          addLog(`PublicClient failed: ${e}`);
        }
      }

      // Method 2: If publicClient didn't work, try direct RPC call
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
          });
          const data = await response.json();
          code = data.result;
          addLog(`Direct RPC code: ${code || "empty"}`);
        } catch (e) {
          addLog(`Direct RPC failed: ${e}`);
        }
      }

      addLog(`Final code: ${code ? code.substring(0, 50) + "..." : "null/undefined"}`);
      addLog(`Code length: ${code?.length || 0}`);

      if (code && code !== "0x" && code.length > 2) {
        // EIP-7702 delegation code starts with 0xef0100 followed by the delegate address
        const startsWithEf0100 = code.toLowerCase().startsWith("0xef0100");
        addLog(`Starts with 0xef0100: ${startsWithEf0100}`);

        if (startsWithEf0100) {
          // Extract delegator address (remove 0xef0100 prefix - that's 8 characters: 0x + ef0100)
          const delegatorAddress = `0x${code.slice(8)}`.toLowerCase();
          addLog(`Delegator address: ${delegatorAddress}`);

          setIsAccountUpgraded(true);
          addLog(`Account is upgraded via EIP-7702 delegation!`);
        } else {
          // Has code but not EIP-7702 delegation
          setIsAccountUpgraded(false);
          addLog("Account has code but is not an EIP-7702 delegation.");
        }
      } else {
        setIsAccountUpgraded(false);
        addLog("Account is not upgraded (no delegation code found).");
      }
    } catch (error) {
      addLog(`Error checking account: ${error instanceof Error ? error.message : String(error)}`);
      setIsAccountUpgraded(false);
    }
  }, [publicClient, address, addLog]);

  // Upgrade account to MetaMask Smart Account
  const upgradeAccount = useCallback(async () => {
    if (!address) {
      addLog("Error: Wallet not connected");
      return;
    }

    setIsLoading("Upgrading account...");
    try {
      addLog("Initiating account upgrade to MetaMask Smart Account...");
      addLog("Sending batch transaction - MetaMask will prompt you to upgrade your EOA.");

      // Use wagmi's useSendCalls hook which properly handles EIP-5792
      // MetaMask will automatically prompt user to upgrade when sending batch transactions
      const result = await sendCallsAsync({
        calls: [
          {
            to: address,
            value: BigInt(0),
          },
          {
            to: address,
            value: BigInt(0),
          },
        ],
      });

      addLog(`Batch transaction sent! ID: ${result}`);
      addLog("Waiting for confirmation...");

      // Wait a bit and then check the status again
      setTimeout(() => {
        checkAccountUpgrade();
      }, 10000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error upgrading account: ${errorMessage}`);

      if (errorMessage.includes("User rejected") || errorMessage.includes("user rejected")) {
        addLog("User rejected the upgrade request.");
      } else if (errorMessage.includes("not supported") || errorMessage.includes("does not support")) {
        addLog("Batch transactions not supported. Make sure you're using MetaMask Flask 13.5.0+ and connected to Sepolia.");
      }
    } finally {
      setIsLoading(null);
    }
  }, [address, addLog, checkAccountUpgrade, sendCallsAsync]);

  // Generate or load session account
  const generateSessionAccount = useCallback(async () => {
    if (!publicClient) return;

    setIsLoading("Generating session account...");
    try {
      // Check localStorage for existing session account
      const stored = localStorage.getItem("sessionAccount");
      let privateKey: Hex;

      if (stored) {
        const parsed = JSON.parse(stored) as SessionAccountData;
        privateKey = parsed.privateKey;
        addLog("Loaded existing session account from storage");
      } else {
        privateKey = generatePrivateKey();
        addLog("Generated new session account private key");
      }

      const account = privateKeyToAccount(privateKey);

      // Create MetaMask Smart Account for session
      const metaMaskSmartAccount = await toMetaMaskSmartAccount({
        client: publicClient,
        implementation: Implementation.Hybrid,
        deployParams: [account.address, [], [], []],
        deploySalt: "0x",
        signer: { account },
      });

      const sessionData: SessionAccountData = {
        privateKey,
        address: account.address,
        smartAccountAddress: metaMaskSmartAccount.address,
      };

      // Save to localStorage
      localStorage.setItem("sessionAccount", JSON.stringify(sessionData));

      setSessionAccount(sessionData);
      setSmartAccount(metaMaskSmartAccount);
      addLog(`Session EOA: ${account.address}`);
      addLog(`Session Smart Account: ${metaMaskSmartAccount.address}`);
    } catch (error) {
      addLog(`Error generating session account: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [publicClient, addLog]);

  // Request Advanced Permissions
  const requestPermissionsHandler = useCallback(async () => {
    if (!walletClient || !smartAccount) {
      addLog("Error: Wallet client or session account not available");
      return;
    }

    setIsLoading("Requesting permissions...");
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      const expiry = currentTime + (parseInt(expiryDays) * 86400);

      addLog(`Requesting ERC-20 periodic permission...`);
      addLog(`- Token: USDC (${USDC_ADDRESS})`);
      addLog(`- Amount per period: ${periodAmount} USDC`);
      addLog(`- Period duration: ${periodDuration} seconds`);
      addLog(`- Expiry: ${new Date(expiry * 1000).toLocaleString()}`);
      addLog(`- Session account: ${smartAccount.address}`);

      const permissionParams: RequestExecutionPermissionsParameters = [{
        chainId: sepolia.id,
        expiry,
        signer: smartAccount.address,
        permission: {
          type: "erc20-token-periodic",
          data: {
            tokenAddress: USDC_ADDRESS,
            periodAmount: parseUnits(periodAmount, 6), // USDC has 6 decimals
            periodDuration: parseInt(periodDuration),
          },
        },
        isAdjustmentAllowed: true,
      }];

      // Use the direct function with wallet client cast to the expected type
      const permissions = await requestExecutionPermissions(
        walletClient as Parameters<typeof requestExecutionPermissions>[0],
        permissionParams
      );

      setGrantedPermissions(permissions as PermissionGrant[]);
      addLog("Permissions granted successfully!");
      addLog(`Context: ${(permissions as PermissionGrant[])[0]?.context?.substring(0, 50)}...`);
    } catch (error) {
      addLog(`Error requesting permissions: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(null);
    }
  }, [walletClient, smartAccount, periodAmount, periodDuration, expiryDays, addLog]);

  // Redeem permissions (execute transfer)
  const redeemPermissions = useCallback(async () => {
    if (!grantedPermissions || !smartAccount || !publicClient) {
      addLog("Error: No permissions granted or session account not available");
      return;
    }

    if (!recipientAddress) {
      addLog("Error: Please enter a recipient address");
      return;
    }

    if (!bundlerUrl) {
      addLog("Error: Please enter a bundler URL");
      return;
    }

    setIsLoading("Redeeming permissions...");
    try {
      const permissionsContext = grantedPermissions[0].context;
      const delegationManager = grantedPermissions[0].signerMeta.delegationManager;

      const amount = parseUnits(transferAmount, 6); // USDC has 6 decimals

      // Encode the ERC-20 transfer call
      const calldata = encodeFunctionData({
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [recipientAddress as Address, amount],
      });

      addLog(`Executing transfer on behalf of user...`);
      addLog(`- To: ${recipientAddress}`);
      addLog(`- Amount: ${transferAmount} USDC`);
      addLog(`- Delegation Manager: ${delegationManager}`);
      addLog(`- Bundler URL: ${bundlerUrl}`);

      // Create bundler client with ERC-7710 actions for delegation
      addLog("Creating bundler client...");
      const bundlerClient = createBundlerClient({
        client: publicClient,
        transport: http(bundlerUrl),
        paymaster: true,
      }).extend(erc7710BundlerActions());

      // Fetch current gas price from Pimlico bundler
      addLog("Fetching current gas prices from bundler...");
      const gasPriceResponse = await fetch(bundlerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "pimlico_getUserOperationGasPrice",
          params: [],
          id: 1,
        }),
      });
      const gasPriceData = await gasPriceResponse.json();

      let maxFeePerGas = BigInt(10000000000); // 10 gwei default
      let maxPriorityFeePerGas = BigInt(2000000000); // 2 gwei default

      if (gasPriceData.result?.fast) {
        maxFeePerGas = BigInt(gasPriceData.result.fast.maxFeePerGas);
        maxPriorityFeePerGas = BigInt(gasPriceData.result.fast.maxPriorityFeePerGas);
        addLog(`Gas prices: maxFee=${maxFeePerGas}, maxPriority=${maxPriorityFeePerGas}`);
      } else {
        addLog("Using default gas prices (couldn't fetch from bundler)");
      }

      addLog("Bundler client created, sending user operation with delegation...");

      // Send the user operation with delegation
      const userOperationHash = await bundlerClient.sendUserOperationWithDelegation({
        publicClient,
        account: smartAccount,
        calls: [
          {
            to: USDC_ADDRESS,
            data: calldata,
            permissionsContext,
            delegationManager,
          },
        ],
        maxFeePerGas,
        maxPriorityFeePerGas,
      });

      addLog(`User operation submitted!`);
      addLog(`User Operation Hash: ${userOperationHash}`);
      addLog("Waiting for receipt...");

      // Wait for the user operation receipt
      const receipt = await bundlerClient.waitForUserOperationReceipt({
        hash: userOperationHash,
      });

      addLog(`Transaction confirmed!`);
      addLog(`Transaction Hash: ${receipt.receipt.transactionHash}`);
      addLog(`Block Number: ${receipt.receipt.blockNumber}`);
      addLog(`Status: ${receipt.success ? "Success" : "Failed"}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Error redeeming permissions: ${errorMessage}`);

      if (errorMessage.includes("insufficient funds")) {
        addLog("Hint: The session account may need ETH for gas, or try a bundler with paymaster support.");
      } else if (errorMessage.includes("AA")) {
        addLog("Hint: This is an ERC-4337 error. Check the bundler configuration and account setup.");
      }
    } finally {
      setIsLoading(null);
    }
  }, [grantedPermissions, smartAccount, publicClient, recipientAddress, transferAmount, bundlerUrl, addLog]);

  // Clear session account
  const clearSessionAccount = useCallback(() => {
    localStorage.removeItem("sessionAccount");
    setSessionAccount(null);
    setSmartAccount(null);
    setGrantedPermissions(null);
    addLog("Session account cleared");
  }, [addLog]);

  // Auto-check account upgrade status when connected
  useEffect(() => {
    if (isConnected && address) {
      checkAccountUpgrade();
    } else {
      setIsAccountUpgraded(null);
    }
  }, [isConnected, address, checkAccountUpgrade]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">MetaMask Advanced Permissions</h1>
            <p className="text-gray-400">ERC-7115 Test Page</p>
          </div>
          <ConnectButton />
        </div>

        {/* Prerequisites Notice */}
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-yellow-400 mb-2">Prerequisites</h3>
          <ul className="text-sm text-yellow-200 space-y-1">
            <li>- MetaMask Flask 13.5.0 or later required</li>
            <li>- Account must be upgraded to MetaMask Smart Account</li>
            <li>- Network: Ethereum Sepolia testnet</li>
            <li>- Get Sepolia USDC from faucet for testing</li>
          </ul>
        </div>

        {isConnected && (
          <>
            {/* Account Status */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Account Status</h2>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-400">Connected:</span> {address}</p>
                <p>
                  <span className="text-gray-400">Smart Account Status:</span>{" "}
                  {isAccountUpgraded === null ? (
                    <span className="text-yellow-400">Checking...</span>
                  ) : isAccountUpgraded ? (
                    <span className="text-green-400">Upgraded</span>
                  ) : (
                    <span className="text-red-400">Not Upgraded</span>
                  )}
                </p>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={checkAccountUpgrade}
                    className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                  >
                    Refresh Status
                  </button>
                  {isAccountUpgraded === false && (
                    <button
                      onClick={upgradeAccount}
                      disabled={!!isLoading}
                      className="px-3 py-1 bg-orange-600 hover:bg-orange-500 disabled:bg-gray-600 rounded text-sm font-medium"
                    >
                      {isLoading === "Upgrading account..." ? "Upgrading..." : "Upgrade to Smart Account"}
                    </button>
                  )}
                </div>
                {isAccountUpgraded === false && (
                  <p className="text-xs text-gray-400 mt-2">
                    Click &quot;Upgrade to Smart Account&quot; to enable Advanced Permissions.
                    This will prompt MetaMask to upgrade your EOA to a smart account via EIP-7702.
                  </p>
                )}
              </div>
            </div>

            {/* Step 1: Session Account */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Step 1: Session Account</h2>
              {sessionAccount ? (
                <div className="space-y-2 text-sm">
                  <p><span className="text-gray-400">EOA Address:</span> {sessionAccount.address}</p>
                  <p><span className="text-gray-400">Smart Account:</span> {sessionAccount.smartAccountAddress}</p>
                  <button
                    onClick={clearSessionAccount}
                    className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                  >
                    Clear Session
                  </button>
                </div>
              ) : (
                <button
                  onClick={generateSessionAccount}
                  disabled={!!isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 rounded font-medium"
                >
                  {isLoading === "Generating session account..." ? "Generating..." : "Generate Session Account"}
                </button>
              )}
            </div>

            {/* Step 2: Request Permissions */}
            {sessionAccount && (
              <div className="bg-gray-800 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Step 2: Request Permissions</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Period Amount (USDC)</label>
                    <input
                      type="text"
                      value={periodAmount}
                      onChange={(e) => setPeriodAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Period Duration (seconds)</label>
                    <input
                      type="text"
                      value={periodDuration}
                      onChange={(e) => setPeriodDuration(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Expiry (days)</label>
                    <input
                      type="text"
                      value={expiryDays}
                      onChange={(e) => setExpiryDays(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={requestPermissionsHandler}
                  disabled={!!isLoading || !isAccountUpgraded}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 rounded font-medium"
                >
                  {isLoading === "Requesting permissions..." ? "Requesting..." : "Request Permissions"}
                </button>
                {!isAccountUpgraded && isAccountUpgraded !== null && (
                  <p className="text-red-400 text-sm mt-2">
                    Account must be upgraded to smart account first
                  </p>
                )}
              </div>
            )}

            {/* Step 3: Redeem Permissions */}
            {grantedPermissions && (
              <div className="bg-gray-800 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Step 3: Redeem Permissions</h2>
                <div className="mb-4 p-3 bg-green-900/30 border border-green-600/50 rounded">
                  <p className="text-green-400 text-sm">Permissions granted!</p>
                  <p className="text-green-300 text-xs mt-1">
                    Context: {grantedPermissions[0]?.context?.substring(0, 40)}...
                  </p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-1">Bundler RPC URL</label>
                  <input
                    type="text"
                    value={bundlerUrl}
                    onChange={(e) => setBundlerUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Default: Pimlico public bundler. You can also use Alchemy, Stackup, or other ERC-4337 bundlers.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Recipient Address</label>
                    <input
                      type="text"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      placeholder="0x..."
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Transfer Amount (USDC)</label>
                    <input
                      type="text"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>
                <button
                  onClick={redeemPermissions}
                  disabled={!!isLoading}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded font-medium"
                >
                  {isLoading === "Redeeming permissions..." ? "Executing..." : "Execute Transfer"}
                </button>
              </div>
            )}

            {/* Logs */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Logs</h2>
                <button
                  onClick={clearLogs}
                  className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black rounded p-4 h-64 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500">No logs yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <p key={i} className="text-gray-300 mb-1">{log}</p>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {!isConnected && (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <p className="text-gray-400 mb-4">Connect your wallet to get started</p>
            <ConnectButton />
          </div>
        )}
      </div>
    </main>
  );
}
