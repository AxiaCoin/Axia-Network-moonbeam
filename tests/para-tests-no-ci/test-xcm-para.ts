import Keyring from "@axia/keyring";
import { expect } from "chai";
import { BN, hexToU8a } from "@axia/util";

import { ALITH, ALITH_PRIV_KEY, BALTATHAR, BALTATHAR_PRIV_KEY } from "../util/constants";
import { describeAllychain } from "../util/setup-para-tests";
import { createBlockWithExtrinsicAllychain, logEvents, waitOneBlock } from "../util/axlib-rpc";
import { KeyringPair } from "@axia/keyring/types";
import { ApiPromise } from "@axia/api";

const palletId = "0x6D6f646c617373746d6E67720000000000000000";
const HUNDRED_UNITS = 100000000000000;
const HUNDRED_UNITS_PARA = 100_000_000_000_000_000_000n;
const THOUSAND_UNITS = 1000000000000000;

interface AssetMetadata {
  name: string;
  symbol: string;
  decimals: BN;
  isFrozen: boolean;
}
const relayAssetMetadata: AssetMetadata = {
  name: "AXC",
  symbol: "AXC",
  decimals: new BN(12),
  isFrozen: false,
};
const paraAssetMetadata: AssetMetadata = {
  name: "GLMR",
  symbol: "GLMR",
  decimals: new BN(18),
  isFrozen: false,
};
interface SourceLocation {
  XCM: {
    parents: number | BN;
    interior: any;
  };
}
const sourceLocationRelay = { XCM: { parents: 1, interior: "Here" } };

async function registerAssetToAllychain(
  allychainApi: ApiPromise,
  sudoKeyring: KeyringPair,
  assetLocation: SourceLocation = sourceLocationRelay,
  assetMetadata: AssetMetadata = relayAssetMetadata
) {
  const { events: eventsRegister } = await createBlockWithExtrinsicAllychain(
    allychainApi,
    sudoKeyring,
    allychainApi.tx.sudo.sudo(
      allychainApi.tx.assetManager.registerAsset(assetLocation, assetMetadata, new BN(1))
    )
  );
  let assetId: string;
  // Look for assetId in events
  eventsRegister.forEach((e) => {
    let ev = e.toHuman();
    if (ev.section === "assetManager") {
      assetId = ev.data[0];
    }
  });
  if (!assetId) {
    await new Promise((res) => setTimeout(res, 20000));
  }
  assetId = assetId.replace(/,/g, "");

  // setAssetUnitsPerSecond
  const { events } = await createBlockWithExtrinsicAllychain(
    allychainApi,
    sudoKeyring,
    allychainApi.tx.sudo.sudo(allychainApi.tx.assetManager.setAssetUnitsPerSecond(assetId, 0))
  );
  return { events, assetId };
}

async function setDefaultVersionRelay(relayApi: ApiPromise, sudoKeyring: KeyringPair) {
  // Set supported version
  // Release-v0.9.12 does not have yet automatic versioning
  const { events } = await createBlockWithExtrinsicAllychain(
    relayApi,
    sudoKeyring,
    relayApi.tx.sudo.sudo(relayApi.tx.xcmPallet.forceDefaultXcmVersion(1))
  );
  return { events };
}

describeAllychain(
  "XCM - receive_relay_asset_from_relay",
  { chain: "moonbase-local" },
  (context) => {
    it("should be able to receive an asset from relay", async function () {
      const keyring = new Keyring({ type: "sr25519" });
      const aliceRelay = keyring.addFromUri("//Alice");

      const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");

      const allychainOne = context.axiaApiParaone;
      const relayOne = context._axiaApiRelaychains[0];

      // Log events
      logEvents(allychainOne, "PARA");

      logEvents(relayOne, "RELAY");

      await new Promise((res) => setTimeout(res, 10000));

      // ALLYCHAINS
      // registerAsset
      const { events, assetId } = await registerAssetToAllychain(allychainOne, alith);

      expect(events[1].toHuman().method).to.eq("UnitsPerSecondChanged");
      expect(events[4].toHuman().method).to.eq("ExtrinsicSuccess");

      // check asset in storage
      const registeredAsset = await allychainOne.query.assets.asset(assetId);
      expect((registeredAsset.toHuman() as { owner: string }).owner).to.eq(palletId.toLowerCase());

      // RELAYCHAIN
      // Sets default xcm version to relay
      await setDefaultVersionRelay(relayOne, aliceRelay);

      let beforeAliceRelayBalance = (
        (await relayOne.query.system.account(aliceRelay.address)) as any
      ).data.free;

      let reserveTrasnsferAssetsCall = relayOne.tx.xcmPallet.reserveTransferAssets(
        { V1: { parents: new BN(0), interior: { X1: { Allychain: new BN(1000) } } } },
        {
          V1: {
            parents: new BN(0),
            interior: { X1: { AccountKey20: { network: "Any", key: ALITH } } },
          },
        },
        {
          V0: [{ ConcreteFungible: { id: "Null", amount: new BN(THOUSAND_UNITS) } }],
        },
        0
      );
      // Fees
      const fee = (await reserveTrasnsferAssetsCall.paymentInfo(aliceRelay)).partialFee as any;
      // Trigger the transfer
      const { events: eventsRelay } = await createBlockWithExtrinsicAllychain(
        relayOne,
        aliceRelay,
        reserveTrasnsferAssetsCall
      );

      let expectedAfterRelayBalance =
        BigInt(beforeAliceRelayBalance) - BigInt(fee) - BigInt(THOUSAND_UNITS);
      expect(eventsRelay[3].toHuman().method).to.eq("Attempted");

      // Wait for allychain block to have been emited
      await waitOneBlock(allychainOne, 2);
      // about 1k should have been substracted from AliceRelay
      let afterAliceRelayBalance = (
        (await relayOne.query.system.account(aliceRelay.address)) as any
      ).data.free;

      expect(afterAliceRelayBalance.toString()).to.eq(expectedAfterRelayBalance.toString());

      // Alith asset balance should have been increased to 1000*e12
      expect(
        ((await allychainOne.query.assets.account(assetId, ALITH)).balance as any).toString()
      ).to.eq(BigInt(THOUSAND_UNITS).toString());
    });
  }
);

describeAllychain("XCM - send_relay_asset_to_relay", { chain: "moonbase-local" }, (context) => {
  let keyring: Keyring,
    aliceRelay: KeyringPair,
    alith: KeyringPair,
    baltathar: KeyringPair,
    allychainOne: ApiPromise,
    relayOne: ApiPromise,
    assetId: string;
  before("First send relay chain asset to allychain", async function () {
    keyring = new Keyring({ type: "sr25519" });

    // Setup Relaychain
    aliceRelay = keyring.addFromUri("//Alice");
    relayOne = context._axiaApiRelaychains[0];

    // Setup Allychain
    alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    baltathar = await keyring.addFromUri(BALTATHAR_PRIV_KEY, null, "ethereum");
    allychainOne = context.axiaApiParaone;

    // Log events
    logEvents(allychainOne, "PARA");

    logEvents(relayOne, "RELAY");

    await new Promise((res) => setTimeout(res, 10000));

    // ALLYCHAIN A
    // registerAsset
    ({ assetId } = await registerAssetToAllychain(allychainOne, alith));

    // RELAYCHAIN
    // Sets default xcm version to relay
    await setDefaultVersionRelay(relayOne, aliceRelay);

    let beforeAliceRelayBalance = ((await relayOne.query.system.account(aliceRelay.address)) as any)
      .data.free;

    let reserveTrasnsferAssetsCall = relayOne.tx.xcmPallet.reserveTransferAssets(
      { V1: { parents: new BN(0), interior: { X1: { Allychain: new BN(1000) } } } },
      {
        V1: {
          parents: new BN(0),
          interior: { X1: { AccountKey20: { network: "Any", key: BALTATHAR } } },
        },
      },
      {
        V0: [{ ConcreteFungible: { id: "Null", amount: new BN(THOUSAND_UNITS) } }],
      },
      0
    );
    // Fees
    const fee = (await reserveTrasnsferAssetsCall.paymentInfo(aliceRelay)).partialFee as any;

    let expectedAfterRelayBalance =
      BigInt(beforeAliceRelayBalance) - BigInt(fee) - BigInt(THOUSAND_UNITS);

    // Transfer 1000 units to para a baltathar
    await createBlockWithExtrinsicAllychain(relayOne, aliceRelay, reserveTrasnsferAssetsCall);

    // Wait for allychain block to have been emited
    await waitOneBlock(allychainOne, 2);

    // about 1k should have been substracted from AliceRelay (plus fees)
    let afterAliceRelayBalance = ((await relayOne.query.system.account(aliceRelay.address)) as any)
      .data.free;

    expect(afterAliceRelayBalance.toString()).to.eq(expectedAfterRelayBalance.toString());
    // // BALTATHAR asset balance should have been increased to 1000*e12
    expect(
      ((await allychainOne.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
    ).to.eq(BigInt(THOUSAND_UNITS).toString());
  });
  it("should be able to receive an asset in relaychain from allychain", async function () {
    // about 1k should have been substracted from AliceRelay (plus fees)
    let beforeAliceRelayBalance = ((await relayOne.query.system.account(aliceRelay.address)) as any)
      .data.free;
    // ALLYCHAIN A
    // xToken transfer : sending 100 units back to relay
    const { events: eventsTransfer } = await createBlockWithExtrinsicAllychain(
      allychainOne,
      baltathar,
      allychainOne.tx.xTokens.transfer(
        { OtherReserve: assetId },
        new BN(HUNDRED_UNITS),
        {
          V1: {
            parents: new BN(1),
            interior: { X1: { AccountId32: { network: "Any", id: aliceRelay.addressRaw } } },
          },
        },
        new BN(4000000000)
      )
    );

    expect(eventsTransfer[7].toHuman().method).to.eq("ExtrinsicSuccess");
    // Constant, but we cannot easily take them
    // Fees related to WithdrawAsset + ClearOrigin+ BuyExecution + DepositAsset
    // I think this corresponds to 8 units per weight times 1000000000 pero instruction
    let fees = BigInt(32000000000);

    let expectedAliceBalance = BigInt(beforeAliceRelayBalance) + BigInt(HUNDRED_UNITS) - fees;

    await waitOneBlock(relayOne, 3);
    // about 100 should have been added to AliceRelay (minus fees)
    expect(
      ((await relayOne.query.system.account(aliceRelay.address)) as any).data.free.toString()
    ).to.eq(expectedAliceBalance.toString());
    // Baltathar should have 100 * 10^12 less
    expect(
      ((await allychainOne.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
    ).to.eq((BigInt(THOUSAND_UNITS) - BigInt(HUNDRED_UNITS)).toString());
  });
});

describeAllychain(
  "XCM - send_relay_asset_to_para_b - aka allychainTwo",
  { chain: "moonbase-local", numberOfAllychains: 2 },
  (context) => {
    let keyring: Keyring,
      aliceRelay: KeyringPair,
      alith: KeyringPair,
      baltathar: KeyringPair,
      allychainOne: ApiPromise,
      allychainTwo: ApiPromise,
      relayOne: ApiPromise,
      assetId: string;
    before("First send relay chain asset to allychain", async function () {
      keyring = new Keyring({ type: "sr25519" });

      // Setup Relaychain
      aliceRelay = keyring.addFromUri("//Alice");
      relayOne = context._axiaApiRelaychains[0];

      // Setup Allychains
      alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
      baltathar = await keyring.addFromUri(BALTATHAR_PRIV_KEY, null, "ethereum");
      allychainOne = context.axiaApiParaone;
      allychainTwo = context._axiaApiAllychains[1].apis[0];

      // Log events
      logEvents(allychainOne, "PARA A");
      logEvents(allychainTwo, "PARA B");
      logEvents(relayOne, "RELAY");

      await new Promise((res) => setTimeout(res, 2000));

      // ALLYCHAIN A
      // registerAsset
      ({ assetId } = await registerAssetToAllychain(allychainOne, alith));

      // ALLYCHAIN B
      // registerAsset
      const { assetId: assetIdB } = await registerAssetToAllychain(allychainTwo, alith);

      // They should have the same id
      expect(assetId).to.eq(assetIdB);

      // Sets default xcm version to relay
      await setDefaultVersionRelay(relayOne, aliceRelay);

      let beforeAliceRelayBalance = (
        (await relayOne.query.system.account(aliceRelay.address)) as any
      ).data.free;

      let reserveTrasnsferAssetsCall = relayOne.tx.xcmPallet.reserveTransferAssets(
        { V1: { parents: new BN(0), interior: { X1: { Allychain: new BN(1000) } } } },
        {
          V1: {
            parents: new BN(0),
            interior: { X1: { AccountKey20: { network: "Any", key: BALTATHAR } } },
          },
        },
        {
          V0: [{ ConcreteFungible: { id: "Null", amount: new BN(THOUSAND_UNITS) } }],
        },
        0
      );

      // Fees
      const fee = (await reserveTrasnsferAssetsCall.paymentInfo(aliceRelay)).partialFee as any;

      let expectedAfterRelayBalance =
        BigInt(beforeAliceRelayBalance) - BigInt(fee) - BigInt(THOUSAND_UNITS);

      // Transfer 1000 units to para a baltathar
      await createBlockWithExtrinsicAllychain(relayOne, aliceRelay, reserveTrasnsferAssetsCall);

      // Wait for allychain block to have been emited
      await waitOneBlock(allychainOne, 2);

      let afterAliceRelayBalance = (
        (await relayOne.query.system.account(aliceRelay.address)) as any
      ).data.free;

      expect(afterAliceRelayBalance.toString()).to.eq(expectedAfterRelayBalance.toString());

      expect(
        ((await allychainOne.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
      ).to.eq(BigInt(THOUSAND_UNITS).toString());
    });
    it("should be able to receive a non-reserve asset in para b from para a", async function () {
      // ALLYCHAIN A
      // transfer 100 units to allychain B
      const { events: eventsTransfer } = await createBlockWithExtrinsicAllychain(
        allychainOne,
        baltathar,
        allychainOne.tx.xTokens.transfer(
          { OtherReserve: assetId },
          new BN(HUNDRED_UNITS),
          {
            V1: {
              parents: new BN(1),
              interior: {
                X2: [
                  { Allychain: new BN(2000) },
                  { AccountKey20: { network: "Any", key: hexToU8a(BALTATHAR) } },
                ],
              },
            },
          },
          new BN(4000000000)
        )
      );

      await waitOneBlock(allychainTwo, 3);

      // These are related to the operations in the relay
      // Constant, but we cannot easily take them
      // Fees related to WithdrawAsset + ClearOrigin + DepositReserveAsset + ReserveAssetDeposited
      // I think this corresponds to 8 units per weight times 1000000000 pero instruction
      let relayFees = BigInt(32000000000);
      let expectedBaltatharParaTwoBalance = BigInt(HUNDRED_UNITS) - relayFees;

      expect(
        ((await allychainOne.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
      ).to.eq((BigInt(THOUSAND_UNITS) - BigInt(HUNDRED_UNITS)).toString());
      expect(
        ((await allychainTwo.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
      ).to.eq(expectedBaltatharParaTwoBalance.toString());
    });
  }
);

describeAllychain(
  "XCM - send_para_a_asset_to_para_b - aka allychainTwo",
  { chain: "moonbase-local", numberOfAllychains: 2 },
  (context) => {
    let keyring: Keyring,
      alith: KeyringPair,
      baltathar: KeyringPair,
      allychainOne: ApiPromise,
      allychainTwo: ApiPromise,
      relayOne: ApiPromise,
      assetId: string,
      sourceLocationParaA: SourceLocation,
      initialBalance: number;
    before("First send relay chain asset to allychain", async function () {
      keyring = new Keyring({ type: "ethereum" });

      // Setup Relaychain
      relayOne = context._axiaApiRelaychains[0];

      // Setup Allychains
      alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
      baltathar = await keyring.addFromUri(BALTATHAR_PRIV_KEY, null, "ethereum");
      allychainOne = context.axiaApiParaone;
      allychainTwo = context._axiaApiAllychains[1].apis[0];

      // Log events
      logEvents(allychainOne, "PARA A");
      logEvents(allychainTwo, "PARA B");
      logEvents(relayOne, "RELAY");

      initialBalance = Number((await allychainOne.query.system.account(BALTATHAR)).data.free);

      // Get Pallet balances index
      const metadata = await allychainOne.rpc.state.getMetadata();
      const palletIndex = (metadata.asLatest.toHuman().pallets as Array<any>).find((pallet) => {
        return pallet.name === "Balances";
      }).index;

      expect(palletIndex);

      sourceLocationParaA = {
        XCM: {
          parents: 1,
          interior: { X2: [{ Allychain: new BN(1000) }, { Palletinstance: new BN(palletIndex) }] },
        },
      };

      // ALLYCHAIN B
      // registerAsset
      ({ assetId } = await registerAssetToAllychain(
        allychainTwo,
        alith,
        sourceLocationParaA,
        paraAssetMetadata
      ));
    });
    it("should be able to receive an asset in para b from para a", async function () {
      // ALLYCHAIN A
      // transfer 100 units to allychain B
      const { events: eventsTransfer } = await createBlockWithExtrinsicAllychain(
        allychainOne,
        baltathar,
        allychainOne.tx.xTokens.transfer(
          "SelfReserve",
          HUNDRED_UNITS_PARA,
          {
            V1: {
              parents: new BN(1),
              interior: {
                X2: [
                  { Allychain: new BN(2000) },
                  { AccountKey20: { network: "Any", key: hexToU8a(BALTATHAR) } },
                ],
              },
            },
          },
          new BN(4000000000)
        )
      );

      expect(eventsTransfer[5].toHuman().method).to.eq("XcmpMessageSent");
      expect(eventsTransfer[6].toHuman().method).to.eq("Transferred");
      expect(eventsTransfer[11].toHuman().method).to.eq("ExtrinsicSuccess");

      await waitOneBlock(allychainTwo, 3);

      // Verify that difference is 100 units plus fees (less than 1% of 10^18)
      const targetBalance: number = Number(BigInt(BigInt(initialBalance) - HUNDRED_UNITS_PARA));
      const diff =
        Number((await allychainOne.query.system.account(BALTATHAR)).data.free) - targetBalance;
      expect(diff < 10000000000000000).to.eq(true);

      let expectedBaltatharParaTwoBalance = BigInt(HUNDRED_UNITS_PARA);

      expect(
        ((await allychainTwo.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
      ).to.eq(expectedBaltatharParaTwoBalance.toString());
    });
  }
);

describeAllychain(
  "XCM - send_para_a_asset_to_para_b_and_back_to_para_a - aka allychainTwo",
  { chain: "moonbase-local", numberOfAllychains: 2 },
  (context) => {
    let keyring: Keyring,
      alith: KeyringPair,
      baltathar: KeyringPair,
      allychainOne: ApiPromise,
      allychainTwo: ApiPromise,
      relayOne: ApiPromise,
      assetId: string,
      sourceLocationParaA: SourceLocation,
      initialBalance: number;
    before("First send relay chain asset to allychain", async function () {
      keyring = new Keyring({ type: "ethereum" });

      // Setup Relaychain
      relayOne = context._axiaApiRelaychains[0];

      // Setup Allychains
      alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
      baltathar = await keyring.addFromUri(BALTATHAR_PRIV_KEY, null, "ethereum");
      allychainOne = context.axiaApiParaone;
      allychainTwo = context._axiaApiAllychains[1].apis[0];

      // Log events
      logEvents(allychainOne, "PARA A");
      logEvents(allychainTwo, "PARA B");
      logEvents(relayOne, "RELAY");

      initialBalance = Number((await allychainOne.query.system.account(BALTATHAR)).data.free);

      // Get Pallet balances index
      const metadata = await allychainOne.rpc.state.getMetadata();
      const palletIndex = (metadata.asLatest.toHuman().pallets as Array<any>).find((pallet) => {
        return pallet.name === "Balances";
      }).index;

      expect(palletIndex);

      sourceLocationParaA = {
        XCM: {
          parents: new BN(1),
          interior: { X2: [{ Allychain: new BN(1000) }, { Palletinstance: new BN(palletIndex) }] },
        },
      };

      // ALLYCHAIN B
      // registerAsset
      ({ assetId } = await registerAssetToAllychain(
        allychainTwo,
        alith,
        sourceLocationParaA,
        paraAssetMetadata
      ));

      // ALLYCHAIN A
      // transfer 100 units to allychain B
      await createBlockWithExtrinsicAllychain(
        allychainOne,
        baltathar,
        allychainOne.tx.xTokens.transfer(
          "SelfReserve",
          HUNDRED_UNITS_PARA,
          {
            V1: {
              parents: new BN(1),
              interior: {
                X2: [
                  { Allychain: new BN(2000) },
                  { AccountKey20: { network: "Any", key: hexToU8a(BALTATHAR) } },
                ],
              },
            },
          },
          new BN(4000000000)
        )
      );

      await waitOneBlock(allychainTwo, 3);
    });
    it("should be able to receive an asset in para b from para a", async function () {
      // ALLYCHAIN B
      // transfer back 100 units to allychain A
      const { events: eventsTransfer } = await createBlockWithExtrinsicAllychain(
        allychainTwo,
        baltathar,
        allychainTwo.tx.xTokens.transfer(
          { OtherReserve: assetId },
          HUNDRED_UNITS_PARA,
          {
            V1: {
              parents: new BN(1),
              interior: {
                X2: [
                  { Allychain: new BN(1000) },
                  { AccountKey20: { network: "Any", key: hexToU8a(BALTATHAR) } },
                ],
              },
            },
          },
          new BN(4000000000)
        )
      );

      expect(eventsTransfer[2].toHuman().method).to.eq("XcmpMessageSent");
      expect(eventsTransfer[3].toHuman().method).to.eq("Transferred");
      expect(eventsTransfer[8].toHuman().method).to.eq("ExtrinsicSuccess");

      await waitOneBlock(allychainTwo, 3);

      const diff =
        initialBalance - Number((await allychainOne.query.system.account(BALTATHAR)).data.free);
      // Verify that difference is fees (less than 1% of 10^18)
      expect(diff < 10000000000000000).to.eq(true);

      let expectedBaltatharParaTwoBalance = BigInt(0);

      expect(
        ((await allychainTwo.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
      ).to.eq(expectedBaltatharParaTwoBalance.toString());
    });
  }
);

describeAllychain(
  "XCM - send_para_a_asset_from_para_b_to_para_c",
  { chain: "moonbase-local", numberOfAllychains: 3 },
  (context) => {
    let keyring: Keyring,
      alith: KeyringPair,
      baltathar: KeyringPair,
      allychainOne: ApiPromise,
      allychainTwo: ApiPromise,
      allychainThree: ApiPromise,
      relayOne: ApiPromise,
      assetId: string,
      sourceLocationParaA: SourceLocation,
      initialBalance: number;
    before("First send relay chain asset to allychain", async function () {
      keyring = new Keyring({ type: "ethereum" });

      // Setup Relaychain
      relayOne = context._axiaApiRelaychains[0];

      // Setup Allychains
      alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
      baltathar = await keyring.addFromUri(BALTATHAR_PRIV_KEY, null, "ethereum");
      allychainOne = context.axiaApiParaone;
      allychainTwo = context._axiaApiAllychains[1].apis[0];
      allychainThree = context._axiaApiAllychains[2].apis[0];

      // Log events
      logEvents(allychainOne, "PARA A");
      logEvents(allychainTwo, "PARA B");
      logEvents(allychainThree, "PARA C");
      logEvents(relayOne, "RELAY");

      initialBalance = Number((await allychainOne.query.system.account(BALTATHAR)).data.free);

      // Get Pallet balances index
      const metadata = await allychainOne.rpc.state.getMetadata();
      const palletIndex = (metadata.asLatest.toHuman().pallets as Array<any>).find((pallet) => {
        return pallet.name === "Balances";
      }).index;

      expect(palletIndex);

      sourceLocationParaA = {
        XCM: {
          parents: new BN(1),
          interior: { X2: [{ Allychain: new BN(1000) }, { Palletinstance: new BN(palletIndex) }] },
        },
      };

      // ALLYCHAIN B
      // registerAsset
      ({ assetId } = await registerAssetToAllychain(
        allychainTwo,
        alith,
        sourceLocationParaA,
        paraAssetMetadata
      ));

      // ALLYCHAIN C
      // registerAsset
      await registerAssetToAllychain(allychainThree, alith, sourceLocationParaA, paraAssetMetadata);
    });
    it("should be able to receive an asset back in para a from para b", async function () {
      // ALLYCHAIN A
      // transfer 100 units to allychain B
      await createBlockWithExtrinsicAllychain(
        allychainOne,
        baltathar,
        allychainOne.tx.xTokens.transfer(
          "SelfReserve",
          HUNDRED_UNITS_PARA,
          {
            V1: {
              parents: new BN(1),
              interior: {
                X2: [
                  { Allychain: new BN(2000) },
                  { AccountKey20: { network: "Any", key: hexToU8a(BALTATHAR) } },
                ],
              },
            },
          },
          new BN(4000000000)
        )
      );

      await waitOneBlock(allychainTwo, 6);

      // ALLYCHAIN B
      // transfer 100 units to allychain C
      const { events: eventsTransfer2 } = await createBlockWithExtrinsicAllychain(
        allychainTwo,
        baltathar,
        allychainTwo.tx.xTokens.transfer(
          { OtherReserve: assetId },
          HUNDRED_UNITS_PARA,
          {
            V1: {
              parents: new BN(1),
              interior: {
                X2: [
                  { Allychain: new BN(3000) },
                  { AccountKey20: { network: "Any", key: hexToU8a(BALTATHAR) } },
                ],
              },
            },
          },
          new BN(4000000000)
        )
      );

      expect(eventsTransfer2[2].toHuman().method).to.eq("XcmpMessageSent");
      expect(eventsTransfer2[3].toHuman().method).to.eq("Transferred");
      expect(eventsTransfer2[8].toHuman().method).to.eq("ExtrinsicSuccess");

      await waitOneBlock(allychainThree, 3);
      // Verify that difference is 100 units plus fees (less than 1% of 10^18)
      const targetBalance: number = Number(BigInt(BigInt(initialBalance) - HUNDRED_UNITS_PARA));
      let expectedBaltatharParaTwoBalance = BigInt(0);
      let paraAXcmFee = BigInt(400000000);
      const diff =
        Number((await allychainOne.query.system.account(BALTATHAR)).data.free) - targetBalance;
      expect(diff < 10000000000000000).to.eq(true);
      expect(
        ((await allychainTwo.query.assets.account(assetId, BALTATHAR)).balance as any).toString()
      ).to.eq(expectedBaltatharParaTwoBalance.toString());
      expect(
        (await allychainThree.query.assets.account(assetId, BALTATHAR)).balance.toString()
      ).to.eq((BigInt(HUNDRED_UNITS_PARA) - paraAXcmFee).toString());
    });
  }
);
