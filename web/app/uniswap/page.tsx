"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, usePublicClient, useWalletClient, useBalance } from "wagmi";
import { useState, useCallback } from "react";
import { parseEther, formatEther, formatUnits, encodeFunctionData, type Address } from "viem";

// Sepolia addresses
const WETH_ADDRESS = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const; // Sepolia WETH
const USDC_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const; // Sepolia USDC

// Uniswap V3 SwapRouter02 on Sepolia
const SWAP_ROUTER_ADDRESS = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as const;

// Uniswap V3 Quoter V2 on Sepolia
const QUOTER_V2_ADDRESS = "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as const;

// Pool fee tier (0.3% = 3000)
const POOL_FEE = 3000;

// ABIs
const SWAP_ROUTER_ABI = [
  {
    name: "exactInputSingle",
    type: "function",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
  },
  {
    name: "multicall",
    type: "function",
    inputs: [
      { name: "deadline", type: "uint256" },
      { name: "data", type: "bytes[]" },
    ],
    outputs: [{ name: "results", type: "bytes[]" }],
    stateMutability: "payable",
  },
] as const;

const QUOTER_V2_ABI = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
    stateMutability: "nonpayable",
  },
] as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "decimals",
    type: "function",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;

export default function UniswapPage() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { data: ethBalance } = useBalance({ address });

  const [ethAmount, setEthAmount] = useState("0.01");
  const [expectedUsdc, setExpectedUsdc] = useState<string | null>(null);
  const [slippage, setSlippage] = useState("0.5"); // 0.5% default slippage
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSwapping, setIsSwapping] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [txHash, setTxHash] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${timestamp}] ${message}`]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
    setTxHash(null);
  }, []);

  // Fetch USDC balance
  const fetchUsdcBalance = useCallback(async () => {
    if (!publicClient || !address) return;

    try {
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      });
      setUsdcBalance(formatUnits(balance, 6));
    } catch (error) {
      console.error("Error fetching USDC balance:", error);
    }
  }, [publicClient, address]);

  // Get quote for the swap
  const getQuote = useCallback(async () => {
    if (!publicClient || !ethAmount || parseFloat(ethAmount) <= 0) {
      setExpectedUsdc(null);
      return;
    }

    setIsQuoting(true);
    try {
      const amountIn = parseEther(ethAmount);
      addLog(`Getting quote for ${ethAmount} ETH...`);

      // Use simulateContract to call the quoter (it's a view function that reverts with the result)
      const { result } = await publicClient.simulateContract({
        address: QUOTER_V2_ADDRESS,
        abi: QUOTER_V2_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: WETH_ADDRESS,
            tokenOut: USDC_ADDRESS,
            amountIn,
            fee: POOL_FEE,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });

      const amountOut = result[0];
      const formattedAmount = formatUnits(amountOut, 6);
      setExpectedUsdc(formattedAmount);
      addLog(`Quote received: ${formattedAmount} USDC`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Quote error: ${errorMessage}`);
      setExpectedUsdc(null);

      // Try alternative: estimate based on a rough price
      if (errorMessage.includes("execution reverted")) {
        addLog("Note: The pool might not have enough liquidity or doesn't exist on Sepolia.");
        addLog("Uniswap V3 on Sepolia has limited liquidity. Try a smaller amount.");
      }
    } finally {
      setIsQuoting(false);
    }
  }, [publicClient, ethAmount, addLog]);

  // Execute the swap
  const executeSwap = useCallback(async () => {
    if (!walletClient || !publicClient || !address || !expectedUsdc) {
      addLog("Error: Missing required data for swap");
      return;
    }

    setIsSwapping(true);
    setTxHash(null);

    try {
      const amountIn = parseEther(ethAmount);
      const slippagePercent = parseFloat(slippage);
      const expectedUsdcBigInt = BigInt(Math.floor(parseFloat(expectedUsdc) * 1e6));
      const minAmountOut = (expectedUsdcBigInt * BigInt(Math.floor((100 - slippagePercent) * 100))) / BigInt(10000);

      addLog(`Initiating swap...`);
      addLog(`- Input: ${ethAmount} ETH`);
      addLog(`- Expected output: ${expectedUsdc} USDC`);
      addLog(`- Minimum output (with ${slippage}% slippage): ${formatUnits(minAmountOut, 6)} USDC`);

      // Encode the exactInputSingle call
      const swapData = encodeFunctionData({
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: WETH_ADDRESS,
            tokenOut: USDC_ADDRESS,
            fee: POOL_FEE,
            recipient: address,
            amountIn,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: BigInt(0),
          },
        ],
      });

      // Set deadline to 20 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

      addLog("Sending transaction...");

      // Use multicall with deadline
      const hash = await walletClient.writeContract({
        address: SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: "multicall",
        args: [deadline, [swapData]],
        value: amountIn,
      });

      setTxHash(hash);
      addLog(`Transaction submitted!`);
      addLog(`Hash: ${hash}`);
      addLog("Waiting for confirmation...");

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        addLog("Swap successful!");
        addLog(`Gas used: ${receipt.gasUsed.toString()}`);
        // Refresh balances
        fetchUsdcBalance();
      } else {
        addLog("Swap failed! Transaction reverted.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      addLog(`Swap error: ${errorMessage}`);

      if (errorMessage.includes("User rejected") || errorMessage.includes("user rejected")) {
        addLog("Transaction was rejected by user.");
      } else if (errorMessage.includes("insufficient funds")) {
        addLog("Insufficient ETH balance for this swap.");
      } else if (errorMessage.includes("STF")) {
        addLog("Swap failed: Insufficient output amount (try increasing slippage).");
      }
    } finally {
      setIsSwapping(false);
    }
  }, [walletClient, publicClient, address, ethAmount, expectedUsdc, slippage, addLog, fetchUsdcBalance]);

  // Fetch USDC balance on mount and when address changes
  useState(() => {
    if (address) {
      fetchUsdcBalance();
    }
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-900 to-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Uniswap V3 Swap</h1>
            <p className="text-gray-400">ETH → USDC on Sepolia</p>
          </div>
          <ConnectButton />
        </div>

        {/* Network Notice */}
        <div className="bg-blue-900/30 border border-blue-600/50 rounded-lg p-4 mb-6">
          <h3 className="font-semibold text-blue-400 mb-2">Sepolia Testnet</h3>
          <ul className="text-sm text-blue-200 space-y-1">
            <li>• Network: Ethereum Sepolia</li>
            <li>• WETH: {WETH_ADDRESS.slice(0, 10)}...{WETH_ADDRESS.slice(-8)}</li>
            <li>• USDC: {USDC_ADDRESS.slice(0, 10)}...{USDC_ADDRESS.slice(-8)}</li>
            <li>• Pool Fee: 0.3%</li>
          </ul>
        </div>

        {isConnected ? (
          <>
            {/* Balances */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Your Balances</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">ETH Balance</p>
                  <p className="text-xl font-mono">
                    {ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(6) : "0.000000"} ETH
                  </p>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-400 text-sm">USDC Balance</p>
                  <p className="text-xl font-mono">
                    {usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "0.00"} USDC
                  </p>
                  <button
                    onClick={fetchUsdcBalance}
                    className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {/* Swap Card */}
            <div className="bg-gray-800 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Swap</h2>

              {/* Input */}
              <div className="bg-gray-700/50 rounded-lg p-4 mb-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">You pay</span>
                  <span className="text-gray-400 text-sm">
                    Balance: {ethBalance ? parseFloat(formatEther(ethBalance.value)).toFixed(4) : "0"} ETH
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    value={ethAmount}
                    onChange={(e) => {
                      setEthAmount(e.target.value);
                      setExpectedUsdc(null);
                    }}
                    placeholder="0.0"
                    className="flex-1 bg-transparent text-2xl font-mono outline-none"
                    step="0.001"
                    min="0"
                  />
                  <div className="flex items-center gap-2 bg-gray-600 px-3 py-2 rounded-lg">
                    <span className="font-semibold">ETH</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  {["0.01", "0.05", "0.1"].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => {
                        setEthAmount(amount);
                        setExpectedUsdc(null);
                      }}
                      className="px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded text-xs"
                    >
                      {amount} ETH
                    </button>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center my-2">
                <div className="bg-gray-700 p-2 rounded-lg">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
              </div>

              {/* Output */}
              <div className="bg-gray-700/50 rounded-lg p-4 mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">You receive</span>
                  <span className="text-gray-400 text-sm">
                    Balance: {usdcBalance ? parseFloat(usdcBalance).toFixed(2) : "0"} USDC
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex-1 text-2xl font-mono text-gray-300">
                    {isQuoting ? (
                      <span className="text-gray-500">Loading...</span>
                    ) : expectedUsdc ? (
                      parseFloat(expectedUsdc).toFixed(2)
                    ) : (
                      <span className="text-gray-500">-</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 bg-gray-600 px-3 py-2 rounded-lg">
                    <span className="font-semibold">USDC</span>
                  </div>
                </div>
              </div>

              {/* Slippage */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-2">Slippage Tolerance</label>
                <div className="flex gap-2">
                  {["0.1", "0.5", "1.0"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSlippage(s)}
                      className={`px-3 py-1 rounded text-sm ${
                        slippage === s
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => setSlippage(e.target.value)}
                    className="w-20 px-2 py-1 bg-gray-700 rounded text-sm text-center"
                    step="0.1"
                    min="0"
                    max="50"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={getQuote}
                  disabled={isQuoting || !ethAmount || parseFloat(ethAmount) <= 0}
                  className="flex-1 px-4 py-3 bg-gray-600 hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
                >
                  {isQuoting ? "Getting Quote..." : "Get Quote"}
                </button>
                <button
                  onClick={executeSwap}
                  disabled={isSwapping || !expectedUsdc}
                  className="flex-1 px-4 py-3 bg-pink-600 hover:bg-pink-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
                >
                  {isSwapping ? "Swapping..." : "Swap"}
                </button>
              </div>

              {/* Rate Info */}
              {expectedUsdc && ethAmount && parseFloat(ethAmount) > 0 && (
                <div className="mt-4 p-3 bg-gray-700/50 rounded-lg text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>Rate</span>
                    <span>1 ETH = {(parseFloat(expectedUsdc) / parseFloat(ethAmount)).toFixed(2)} USDC</span>
                  </div>
                  <div className="flex justify-between text-gray-400 mt-1">
                    <span>Min. received</span>
                    <span>
                      {(parseFloat(expectedUsdc) * (1 - parseFloat(slippage) / 100)).toFixed(2)} USDC
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Transaction Status */}
            {txHash && (
              <div className="bg-gray-800 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-semibold mb-4">Transaction</h2>
                <div className="bg-gray-700/50 rounded-lg p-4">
                  <p className="text-gray-400 text-sm mb-2">Transaction Hash</p>
                  <a
                    href={`https://sepolia.etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 font-mono text-sm break-all"
                  >
                    {txHash}
                  </a>
                </div>
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
              <div className="bg-black rounded p-4 h-48 overflow-y-auto font-mono text-xs">
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
        ) : (
          <div className="bg-gray-800 rounded-lg p-12 text-center">
            <p className="text-gray-400 mb-4">Connect your wallet to start swapping</p>
            <ConnectButton />
          </div>
        )}
      </div>
    </main>
  );
}
