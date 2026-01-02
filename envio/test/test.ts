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
    assert.deepEqual(accountEntity?.uniqueAgents, [redeemerAddress.toLowerCase()]);

    // Check that Agent entity was created
    const agentEntity = updatedMockDb.entities.Agent.get(redeemerAddress.toLowerCase());
    assert.ok(agentEntity, "Agent entity should be created");
    assert.equal(agentEntity?.totalRedemptions, 1);
    assert.deepEqual(agentEntity?.uniqueDelegators, [delegatorAddress.toLowerCase()]);
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
    // But only 1 unique delegator
    assert.equal(agentEntity?.uniqueDelegators.length, 1);
  });
});
