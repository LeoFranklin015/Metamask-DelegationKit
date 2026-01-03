import { DelegationManager } from "generated";

// =============================================================================
// KNOWN ENFORCERS (lowercase)
// =============================================================================
const SPENDING_LIMIT_ENFORCER = "0x474e3ae7e169e940607cc624da8a15eb120139ab";
const TIMESTAMP_ENFORCER = "0x1046bb45c8d673d4ea75321280db34899413c069";

// =============================================================================
// DECODERS
// =============================================================================

/**
 * Decode SpendingLimitEnforcer terms
 * Layout: token (20 bytes) | amount (32 bytes) | period (32 bytes) | startDate (32 bytes)
 */
function decodeSpendingLimitTerms(termsHex: string): {
  token: string;
  limit: bigint;
  period: bigint;
  startDate: bigint;
} | null {
  try {
    const hex = termsHex.startsWith("0x") ? termsHex.slice(2) : termsHex;
    if (hex.length < 232) return null;

    return {
      token: "0x" + hex.slice(0, 40),
      limit: BigInt("0x" + hex.slice(40, 104)),
      period: BigInt("0x" + hex.slice(104, 168)),
      startDate: BigInt("0x" + hex.slice(168, 232)),
    };
  } catch {
    return null;
  }
}

/**
 * Decode TimestampEnforcer terms
 * Layout: expiryTimestamp (32 bytes)
 */
function decodeTimestampTerms(termsHex: string): bigint | null {
  try {
    const hex = termsHex.startsWith("0x") ? termsHex.slice(2) : termsHex;
    if (hex.length < 64) return null;
    return BigInt("0x" + hex.slice(0, 64));
  } catch {
    return null;
  }
}

// =============================================================================
// EXECUTION CALLDATA DECODER
// =============================================================================

const TRANSFER_SELECTOR = "a9059cbb";

/**
 * Decode execution calldata to extract transfer details
 * Format: abi.encodePacked(target, value, calldata)
 * - target: 20 bytes (token address)
 * - value: 32 bytes (ETH value, usually 0)
 * - calldata: transfer(to, amount) = 4 + 32 + 32 = 68 bytes
 */
function decodeExecutionCalldata(executionHex: string): {
  token: string;
  recipient: string;
  amount: bigint;
} | null {
  try {
    const hex = executionHex.startsWith("0x") ? executionHex.slice(2) : executionHex;

    // Minimum: 20 (target) + 32 (value) + 4 (selector) + 32 (to) + 32 (amount) = 120 bytes = 240 hex
    if (hex.length < 240) return null;

    const target = "0x" + hex.slice(0, 40);            // 20 bytes
    const selector = hex.slice(104, 112);              // 4 bytes (after 52 bytes)

    // Check if it's a transfer call
    if (selector.toLowerCase() !== TRANSFER_SELECTOR) return null;

    // Extract recipient (last 20 bytes of 32-byte padded address)
    const recipient = "0x" + hex.slice(136, 176);      // bytes 68-88
    const amount = BigInt("0x" + hex.slice(176, 240)); // bytes 88-120

    return { token: target.toLowerCase(), recipient: recipient.toLowerCase(), amount };
  } catch {
    return null;
  }
}

/**
 * Extract execution calldata from raw tx input
 * Searches for the execution bytes array containing the actual transfer
 */
function extractExecutionFromInput(inputHex: string): string | null {
  try {
    const hex = inputHex.startsWith("0x") ? inputHex.slice(2) : inputHex;

    // Look for common execution lengths (0x78 = 120 bytes for standard transfer)
    const lengthMarkers = [
      "0000000000000000000000000000000000000000000000000000000000000078", // 120 bytes
      "0000000000000000000000000000000000000000000000000000000000000074", // 116 bytes
    ];

    for (const marker of lengthMarkers) {
      const idx = hex.lastIndexOf(marker);
      if (idx !== -1) {
        const length = parseInt(marker, 16) * 2; // Convert to hex chars
        const executionStart = idx + 64; // After 32-byte length
        const executionData = hex.slice(executionStart, executionStart + length);

        // Validate it looks like execution data (starts with address, not zeros)
        if (executionData.length >= 40 && !executionData.startsWith("000000000000000000000000")) {
          return executionData;
        }
      }
    }

    // Fallback: search for transfer selector pattern in the data
    const transferPattern = "a9059cbb";
    const transferIdx = hex.lastIndexOf(transferPattern);

    if (transferIdx > 104) {
      // Work backwards to find the target address (20 bytes before value + selector)
      const executionStart = transferIdx - 104; // 52 bytes * 2
      const executionData = hex.slice(executionStart, transferIdx + 136); // selector + to + amount
      return executionData;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Add item to array if not present
 */
function addUnique<T>(arr: T[], item: T): T[] {
  return arr.includes(item) ? arr : [...arr, item];
}

// =============================================================================
// REDEEMED DELEGATION HANDLER
// =============================================================================

DelegationManager.RedeemedDelegation.handler(async ({ event, context }) => {
  const chainId = event.chainId;
  const timestamp = BigInt(event.block.timestamp);
  const blockNumber = BigInt(event.block.number);
  const txHash = event.transaction.hash;
  const logIndex = event.logIndex;

  // Indexed params
  const rootDelegator = event.params.rootDelegator.toLowerCase();
  const redeemer = event.params.redeemer.toLowerCase();

  // Delegation is a tuple: [delegate, delegator, authority, caveats[], salt, signature]
  const delegationTuple = event.params.delegation;
  const delegate = delegationTuple[0].toLowerCase();
  const delegator = delegationTuple[1].toLowerCase();
  const authority = delegationTuple[2];
  const caveatsTuple = delegationTuple[3]; // Array<[enforcer, terms, args]>
  const salt = delegationTuple[4].toString();

  // Extract enforcer addresses from caveats tuple
  const enforcers = caveatsTuple.map((c) => c[0].toLowerCase());

  // Decode caveat terms
  let spendingToken: string | undefined;
  let spendingLimit: bigint | undefined;
  let spendingPeriod: bigint | undefined;
  let spendingStartDate: bigint | undefined;
  let expiresAt: bigint | undefined;

  for (const caveat of caveatsTuple) {
    const enforcer = caveat[0].toLowerCase();
    const terms = caveat[1];

    if (enforcer === SPENDING_LIMIT_ENFORCER) {
      const decoded = decodeSpendingLimitTerms(terms);
      if (decoded) {
        spendingToken = decoded.token;
        spendingLimit = decoded.limit;
        spendingPeriod = decoded.period;
        spendingStartDate = decoded.startDate;
      }
    }

    if (enforcer === TIMESTAMP_ENFORCER) {
      const decoded = decodeTimestampTerms(terms);
      if (decoded) {
        expiresAt = decoded;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Decode actual execution details from tx input
  // ---------------------------------------------------------------------------
  let executedAmount: bigint | undefined;
  let executedToken: string | undefined;
  let executedRecipient: string | undefined;

  const txInput = event.transaction.input;
  if (txInput) {
    const executionData = extractExecutionFromInput(txInput);
    if (executionData) {
      const decoded = decodeExecutionCalldata(executionData);
      if (decoded) {
        executedToken = decoded.token;
        executedRecipient = decoded.recipient;
        executedAmount = decoded.amount;
      }
    }
  }

  // Use executed amount for tracking, default to 0 if not decoded
  const amount = executedAmount ?? 0n;

  // ---------------------------------------------------------------------------
  // Entity IDs
  // ---------------------------------------------------------------------------
  const redemptionId = `${chainId}-${txHash}-${logIndex}`;
  const delegationId = `${chainId}-${delegator}-${delegate}-${salt}`;
  const accountId = rootDelegator;
  const agentId = redeemer;

  // =========================================================================
  // 1. Create/Update Account (delegator)
  // =========================================================================
  const existingAccount = await context.Account.get(accountId);

  if (existingAccount) {
    context.Account.set({
      ...existingAccount,
      totalRedemptions: existingAccount.totalRedemptions + 1,
      lastActiveAt: timestamp,
      chains: addUnique(existingAccount.chains, chainId),
    });
  } else {
    context.Account.set({
      id: accountId,
      address: rootDelegator,
      totalRedemptions: 1,
      firstSeenAt: timestamp,
      lastActiveAt: timestamp,
      chains: [chainId],
    });
  }

  // =========================================================================
  // 2. Create/Update Agent (redeemer)
  // =========================================================================
  const existingAgent = await context.Agent.get(agentId);

  if (existingAgent) {
    context.Agent.set({
      ...existingAgent,
      totalRedemptions: existingAgent.totalRedemptions + 1,
      lastActiveAt: timestamp,
      chains: addUnique(existingAgent.chains, chainId),
    });
  } else {
    context.Agent.set({
      id: agentId,
      address: redeemer,
      totalRedemptions: 1,
      firstSeenAt: timestamp,
      lastActiveAt: timestamp,
      chains: [chainId],
    });
  }

  // =========================================================================
  // 3. Create/Update Delegation aggregate
  // =========================================================================
  const existingDelegation = await context.Delegation.get(delegationId);

  if (existingDelegation) {
    context.Delegation.set({
      ...existingDelegation,
      redemptionCount: existingDelegation.redemptionCount + 1,
      totalSpent: existingDelegation.totalSpent + amount,
      lastSeenAt: timestamp,
    });
  } else {
    context.Delegation.set({
      id: delegationId,
      chainId,
      delegator,
      delegate,
      salt,
      authority,
      account_id: accountId,
      agent_id: agentId,
      spendingToken,
      spendingLimit,
      spendingPeriod,
      spendingStartDate,
      expiresAt,
      enforcers,
      redemptionCount: 1,
      totalSpent: amount,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    });
  }

  // =========================================================================
  // 4. Create Redemption record
  // =========================================================================
  context.Redemption.set({
    id: redemptionId,
    chainId,
    account_id: accountId,
    agent_id: agentId,
    delegation_id: delegationId,
    rootDelegator,
    redeemer,
    delegate,
    delegator,
    authority,
    salt,
    spendingToken,
    spendingLimit,
    spendingPeriod,
    spendingStartDate,
    executedToken,
    executedAmount,
    executedRecipient,
    expiresAt,
    enforcers,
    timestamp,
    txHash,
    blockNumber,
  });
});
