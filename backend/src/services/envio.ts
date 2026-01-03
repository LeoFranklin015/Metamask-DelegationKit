/**
 * Envio GraphQL Client
 * Fetches on-chain delegation redemption data from Envio indexer
 */

// Envio GraphQL endpoint - hosted indexer
const ENVIO_GRAPHQL_URL =
  process.env.ENVIO_GRAPHQL_URL || "https://indexer.dev.hyperindex.xyz/dca02a0/v1/graphql";

interface EnvioRedemption {
  id: string;
  chainId: number;
  delegate: string;
  delegator: string;
  rootDelegator: string;
  redeemer: string;
  spendingToken: string | null;
  spendingLimit: string | null;
  spendingPeriod: string | null;
  spendingStartDate: string | null;
  expiresAt: string | null;
  timestamp: string;
  txHash: string;
  blockNumber: string;
  enforcers: string[];
  salt: string;
  authority: string;
}

interface EnvioQueryResult {
  data?: {
    Redemption?: EnvioRedemption[];
  };
  errors?: Array<{ message: string }>;
}

/**
 * Create a composite key for matching on-chain delegations with off-chain agents
 * Key: {chainId}-{delegate}-{delegator}-{spendingToken}-{spendingPeriod}-{spendingStartDate}
 */
export function createDelegationKey(params: {
  chainId: number;
  delegate: string;
  delegator: string;
  spendingToken: string;
  spendingPeriod: number | string;
  startTime: number | string;
}): string {
  return [
    params.chainId,
    params.delegate.toLowerCase(),
    params.delegator.toLowerCase(),
    params.spendingToken.toLowerCase(),
    params.spendingPeriod.toString(),
    params.startTime.toString(),
  ].join("-");
}

/**
 * Aggregated on-chain data for a delegation
 */
export interface OnChainDelegationData {
  redemptionCount: number;
  totalSpent: bigint; // spendingLimit * redemptionCount (each redemption = 1 period's worth)
  lastRedemptionAt: number | null;
  lastTxHash: string | null;
  redemptions: Array<{
    timestamp: number;
    txHash: string;
    blockNumber: string;
  }>;
}

/**
 * Fetch all redemptions for a specific delegator (user) from Envio
 */
export async function fetchRedemptionsForDelegator(
  delegatorAddress: string
): Promise<EnvioRedemption[]> {
  const query = `
    query GetRedemptionsForDelegator($delegator: String!) {
      Redemption(
        where: { delegator: { _eq: $delegator } }
        order_by: { timestamp: desc }
      ) {
        id
        chainId
        delegate
        delegator
        rootDelegator
        redeemer
        spendingToken
        spendingLimit
        spendingPeriod
        spendingStartDate
        expiresAt
        timestamp
        txHash
        blockNumber
        enforcers
        salt
        authority
      }
    }
  `;

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { delegator: delegatorAddress.toLowerCase() },
      }),
    });

    const result = (await response.json()) as EnvioQueryResult;

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors);
      return [];
    }

    return result.data?.Redemption || [];
  } catch (error) {
    console.error("Failed to fetch redemptions from Envio:", error);
    return [];
  }
}

/**
 * Fetch all redemptions for a specific redeemer (agent/session key) from Envio
 */
export async function fetchRedemptionsForRedeemer(
  redeemerAddress: string
): Promise<EnvioRedemption[]> {
  const query = `
    query GetRedemptionsForRedeemer($redeemer: String!) {
      Redemption(
        where: { redeemer: { _eq: $redeemer } }
        order_by: { timestamp: desc }
      ) {
        id
        chainId
        delegate
        delegator
        rootDelegator
        redeemer
        spendingToken
        spendingLimit
        spendingPeriod
        spendingStartDate
        expiresAt
        timestamp
        txHash
        blockNumber
        enforcers
        salt
        authority
      }
    }
  `;

  try {
    const response = await fetch(ENVIO_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { redeemer: redeemerAddress.toLowerCase() },
      }),
    });

    const result = (await response.json()) as EnvioQueryResult;

    if (result.errors) {
      console.error("Envio GraphQL errors:", result.errors);
      return [];
    }

    return result.data?.Redemption || [];
  } catch (error) {
    console.error("Failed to fetch redemptions from Envio:", error);
    return [];
  }
}

/**
 * Build a map of delegation keys to aggregated on-chain data
 * Groups redemptions by: chainId + delegate + delegator + spendingToken + spendingPeriod + spendingStartDate
 */
export async function buildOnChainDataMap(
  delegatorAddress: string
): Promise<Map<string, OnChainDelegationData>> {
  const redemptions = await fetchRedemptionsForDelegator(delegatorAddress);
  const map = new Map<string, OnChainDelegationData>();

  for (const redemption of redemptions) {
    // Skip redemptions without spending limit data
    if (
      !redemption.spendingToken ||
      !redemption.spendingPeriod ||
      !redemption.spendingStartDate ||
      !redemption.spendingLimit
    ) {
      continue;
    }

    const key = createDelegationKey({
      chainId: redemption.chainId,
      delegate: redemption.delegate,
      delegator: redemption.delegator,
      spendingToken: redemption.spendingToken,
      spendingPeriod: redemption.spendingPeriod,
      startTime: redemption.spendingStartDate,
    });

    const existing = map.get(key);
    const timestamp = parseInt(redemption.timestamp);
    const spendingLimit = BigInt(redemption.spendingLimit);

    if (existing) {
      // Add to existing aggregation
      existing.redemptionCount += 1;
      existing.totalSpent += spendingLimit;
      existing.redemptions.push({
        timestamp,
        txHash: redemption.txHash,
        blockNumber: redemption.blockNumber,
      });

      // Update last redemption if this one is newer
      if (!existing.lastRedemptionAt || timestamp > existing.lastRedemptionAt) {
        existing.lastRedemptionAt = timestamp;
        existing.lastTxHash = redemption.txHash;
      }
    } else {
      // Create new aggregation
      map.set(key, {
        redemptionCount: 1,
        totalSpent: spendingLimit,
        lastRedemptionAt: timestamp,
        lastTxHash: redemption.txHash,
        redemptions: [
          {
            timestamp,
            txHash: redemption.txHash,
            blockNumber: redemption.blockNumber,
          },
        ],
      });
    }
  }

  return map;
}

/**
 * Get on-chain data for a specific delegation
 */
export async function getOnChainDataForDelegation(params: {
  chainId: number;
  delegate: string;
  delegator: string;
  spendingToken: string;
  spendingPeriod: number;
  startTime: number;
}): Promise<OnChainDelegationData | null> {
  const map = await buildOnChainDataMap(params.delegator);
  const key = createDelegationKey(params);
  return map.get(key) || null;
}
