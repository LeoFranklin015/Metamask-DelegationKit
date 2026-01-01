import { type Address } from "viem";
import { sepolia } from "viem/chains";

export const CHAIN = sepolia;

export const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3001";


// Uniswap V3 Addresses on Sepolia
export const UNISWAP = {
  SWAP_ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as Address,
  QUOTER_V2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as Address,
};

// Token Addresses on Sepolia
export const TOKENS: Record<string, Address> = {
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
  DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357",
  LINK: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5",
};

// Swap Router ABI (exactInputSingle)
export const SWAP_ROUTER_ABI = [
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
] as const;

// ERC20 ABI
export const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "approve",
    type: "function",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
