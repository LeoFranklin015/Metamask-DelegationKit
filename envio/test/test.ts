import assert from "assert";
import { TestHelpers } from "generated";
const { MockDb, DelegationManager, Addresses } = TestHelpers;

describe("SpendHQ Delegation Indexer tests", () => {
  it("A RedeemedDelegation event creates Redemption, Delegation, Account, and Agent entities", async () => {
    // Initializing the mock database
    const mockDbInitial = MockDb.createMockDb();

    // Mock addresses
    const delegatorAddress = Addresses.defaultAddress;
    const delegateAddress = "0x1234567890123456789012345678901234567890";
    const redeemerAddress = "0x9876543210987654321098765432109876543210";

    // Creating a mock event
    // delegation tuple: [delegate, delegator, authority, caveats[], salt, signature]
    const mockEvent = DelegationManager.RedeemedDelegation.createMockEvent({
      rootDelegator: delegatorAddress,
      redeemer: redeemerAddress,
      delegation: [
        delegateAddress, // delegate
        delegatorAddress, // delegator
        "0x0000000000000000000000000000000000000000000000000000000000000000", // authority (ROOT)
        [], // caveats - Array<[enforcer, terms, args]>
        BigInt(12345), // salt
        "0x", // signature
      ],
    });

    // Processing the mock event on the mock database
    const updatedMockDb = await DelegationManager.RedeemedDelegation.processEvent({
      event: mockEvent,
      mockDb: mockDbInitial,
    });

    // Check that Account entity was created
    const accountEntity = updatedMockDb.entities.Account.get(delegatorAddress.toLowerCase());
    assert.ok(accountEntity, "Account entity should be created");
    assert.equal(accountEntity?.totalRedemptions, 1);
    // Note: uniqueAgents is now derived via @derivedFrom, not stored directly

    // Check that Agent entity was created
    const agentEntity = updatedMockDb.entities.Agent.get(redeemerAddress.toLowerCase());
    assert.ok(agentEntity, "Agent entity should be created");
    assert.equal(agentEntity?.totalRedemptions, 1);
    // Note: uniqueDelegators is now derived via @derivedFrom, not stored directly

    // Check that Delegation entity was created with relationships
    const delegationId = `${mockEvent.chainId}-${delegatorAddress.toLowerCase()}-${delegateAddress.toLowerCase()}-12345`;
    const delegationEntity = updatedMockDb.entities.Delegation.get(delegationId);
    assert.ok(delegationEntity, "Delegation entity should be created");
    assert.equal(delegationEntity?.account_id, delegatorAddress.toLowerCase());
    assert.equal(delegationEntity?.agent_id, redeemerAddress.toLowerCase());
    assert.equal(delegationEntity?.redemptionCount, 1);
  });

  it("Multiple redemptions from same delegation increment redemption count", async () => {
    // Initializing the mock database
    const mockDbInitial = MockDb.createMockDb();

    const delegatorAddress = Addresses.defaultAddress;
    const delegateAddress = "0x1234567890123456789012345678901234567890";
    const redeemerAddress = "0x9876543210987654321098765432109876543210";

    const delegationTuple: [string, string, string, [], bigint, string] = [
      delegateAddress,
      delegatorAddress,
      "0x0000000000000000000000000000000000000000000000000000000000000000",
      [],
      BigInt(12345),
      "0x",
    ];

    // First redemption
    const mockEvent1 = DelegationManager.RedeemedDelegation.createMockEvent({
      rootDelegator: delegatorAddress,
      redeemer: redeemerAddress,
      delegation: delegationTuple,
    });

    const mockDb1 = await DelegationManager.RedeemedDelegation.processEvent({
      event: mockEvent1,
      mockDb: mockDbInitial,
    });

    // Second redemption of same delegation
    const mockEvent2 = DelegationManager.RedeemedDelegation.createMockEvent({
      rootDelegator: delegatorAddress,
      redeemer: redeemerAddress,
      delegation: delegationTuple,
    });

    const mockDb2 = await DelegationManager.RedeemedDelegation.processEvent({
      event: mockEvent2,
      mockDb: mockDb1,
    });

    // Check Agent has 2 total redemptions
    const agentEntity = mockDb2.entities.Agent.get(redeemerAddress.toLowerCase());
    assert.equal(agentEntity?.totalRedemptions, 2);

    // Check Delegation has 2 redemptions
    const delegationId = `${mockEvent1.chainId}-${delegatorAddress.toLowerCase()}-${delegateAddress.toLowerCase()}-12345`;
    const delegationEntity = mockDb2.entities.Delegation.get(delegationId);
    assert.equal(delegationEntity?.redemptionCount, 2);
  });

  it("Redemption entity includes relationship IDs for derived fields", async () => {
    const mockDbInitial = MockDb.createMockDb();

    const delegatorAddress = Addresses.defaultAddress;
    const delegateAddress = "0x1234567890123456789012345678901234567890";
    const redeemerAddress = "0x9876543210987654321098765432109876543210";

    const mockEvent = DelegationManager.RedeemedDelegation.createMockEvent({
      rootDelegator: delegatorAddress,
      redeemer: redeemerAddress,
      delegation: [
        delegateAddress,
        delegatorAddress,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        [],
        BigInt(99999),
        "0x",
      ],
    });

    const updatedMockDb = await DelegationManager.RedeemedDelegation.processEvent({
      event: mockEvent,
      mockDb: mockDbInitial,
    });

    // Get the redemption entity
    const redemptionId = `${mockEvent.chainId}-${mockEvent.transaction.hash}-${mockEvent.logIndex}`;
    const redemptionEntity = updatedMockDb.entities.Redemption.get(redemptionId);

    assert.ok(redemptionEntity, "Redemption entity should be created");
    assert.equal(redemptionEntity?.account_id, delegatorAddress.toLowerCase());
    assert.equal(redemptionEntity?.agent_id, redeemerAddress.toLowerCase());

    const expectedDelegationId = `${mockEvent.chainId}-${delegatorAddress.toLowerCase()}-${delegateAddress.toLowerCase()}-99999`;
    assert.equal(redemptionEntity?.delegation_id, expectedDelegationId);
  });
});
