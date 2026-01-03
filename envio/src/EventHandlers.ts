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
  const txHash = event.transaction.hash; // Transaction hash from event.transaction
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

  // =========================================================================
  // 1. Create Redemption record
  // =========================================================================
  const redemptionId = `${chainId}-${txHash}-${logIndex}`;

  context.Redemption.set({
    id: redemptionId,
    chainId,
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
    expiresAt,
    enforcers,
    timestamp,
    txHash,
    blockNumber,
  });

  // =========================================================================
  // 2. Create/Update Delegation aggregate
  // =========================================================================
  const delegationId = `${chainId}-${delegator}-${delegate}-${salt}`;
  const existingDelegation = await context.Delegation.get(delegationId);

  if (existingDelegation) {
    context.Delegation.set({
      ...existingDelegation,
      redemptionCount: existingDelegation.redemptionCount + 1,
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
      spendingToken,
      spendingLimit,
      spendingPeriod,
      spendingStartDate,
      expiresAt,
      enforcers,
      redemptionCount: 1,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    });
  }

  // =========================================================================
  // 3. Update Agent stats
  // =========================================================================
  const existingAgent = await context.Agent.get(redeemer);

  if (existingAgent) {
    context.Agent.set({
      ...existingAgent,
      totalRedemptions: existingAgent.totalRedemptions + 1,
      uniqueDelegators: addUnique(existingAgent.uniqueDelegators, rootDelegator),
      lastActiveAt: timestamp,
      chains: addUnique(existingAgent.chains, chainId),
    });
  } else {
    context.Agent.set({
      id: redeemer,
      address: redeemer,
      totalRedemptions: 1,
      uniqueDelegators: [rootDelegator],
      firstSeenAt: timestamp,
      lastActiveAt: timestamp,
      chains: [chainId],
    });
  }

  // =========================================================================
  // 4. Update Account stats
  // =========================================================================
  const existingAccount = await context.Account.get(rootDelegator);

  if (existingAccount) {
    context.Account.set({
      ...existingAccount,
      totalRedemptions: existingAccount.totalRedemptions + 1,
      uniqueAgents: addUnique(existingAccount.uniqueAgents, redeemer),
      lastActiveAt: timestamp,
      chains: addUnique(existingAccount.chains, chainId),
    });
  } else {
    context.Account.set({
      id: rootDelegator,
      address: rootDelegator,
      totalRedemptions: 1,
      uniqueAgents: [redeemer],
      firstSeenAt: timestamp,
      lastActiveAt: timestamp,
      chains: [chainId],
    });
  }
});
