// Sepolia Testnet Configuration

export const CHAIN_ID = 11155111;

// Uniswap V3 Addresses on Sepolia
export const UNISWAP = {
  SWAP_ROUTER: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E" as const,
  QUOTER_V2: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3" as const,
  FACTORY: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c" as const,
};

// Token Addresses on Sepolia
export const TOKENS = {
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const,
  USDC: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const,
  UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984" as const,
  DAI: "0xFF34B3d4Aee8ddCd6F9AFFFB6Fe49bD371b8a357" as const,
  LINK: "0xf8Fb3713D459D7C1018BD0A49D19b4C44290EBE5" as const,
} as const;

// Token decimals
export const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.WETH]: 18,
  [TOKENS.USDC]: 6,
  [TOKENS.UNI]: 18,
  [TOKENS.DAI]: 18,
  [TOKENS.LINK]: 18,
};

// ABIs
export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    name: "allowance",
    type: "function",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
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
    name: "transfer",
    type: "function",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

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

export const QUOTER_V2_ABI = [
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
