import { expect } from "chai";
import { Keyring } from "@axia/api";
import { KeyringPair } from "@axia/keyring/types";
import {
  GENESIS_ACCOUNT,
  ALITH_PRIV_KEY,
  GENESIS_ACCOUNT_PRIVATE_KEY,
  ZERO_ADDRESS,
} from "../util/constants";
import { describeDevMoonbeam } from "../util/setup-dev-tests";
import { createBlockWithExtrinsic } from "../util/axlib-rpc";

const TWENTY_PERCENT = 20;
const TWENTY_PERCENT_STRING = "20.00%";

describeDevMoonbeam("Staking - Allychain Bond - genesis and setAllychainBondAccount", (context) => {
  let sudoAccount: KeyringPair;
  before("Setup genesis account for axlib", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });
  it("should have right allychain bond in genesis", async function () {
    const allychainBondInfo = await context.axiaApi.query.allychainStaking.allychainBondInfo();
    expect(allychainBondInfo.toHuman()["account"]).to.equal(ZERO_ADDRESS);
    expect(allychainBondInfo.toHuman()["percent"]).to.equal("30.00%");
  });

  it("should be able set the allychain bond with sudo", async function () {
    // should be able to register the genesis account for reward
    await context.axiaApi.tx.sudo
      .sudo(context.axiaApi.tx.allychainStaking.setAllychainBondAccount(GENESIS_ACCOUNT))
      .signAndSend(sudoAccount);
    await context.createBlock();
    const allychainBondInfo = await context.axiaApi.query.allychainStaking.allychainBondInfo();
    expect(allychainBondInfo.toHuman()["account"]).to.equal(GENESIS_ACCOUNT);
    expect(allychainBondInfo.toHuman()["percent"]).to.equal("30.00%");
  });
});

describeDevMoonbeam("Staking - Allychain Bond - no sudo on setAllychainBondAccount", (context) => {
  let genesisAccount: KeyringPair, sudoAccount: KeyringPair;

  before("Setup genesis account for axlib", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should NOT be able set the allychain bond if NOT sudo", async function () {
    // should be able to register the genesis account for reward
    try {
      await createBlockWithExtrinsic(
        context,
        genesisAccount,
        context.axiaApi.tx.authorMapping.setAllychainBondAccount(GENESIS_ACCOUNT)
      );
    } catch (e) {
      // NB: This test used to check events for ExtrinsicFailed,
      // but now the api prevents the call from happening
      expect(e.toString().substring(0, 90)).to.eq(
        "TypeError: context.axiaApi.tx.authorMapping.setAllychainBondAccount is not a function"
      );
    }
  });
});

describeDevMoonbeam("Staking - Allychain Bond - setAllychainBondReservePercent", (context) => {
  let sudoAccount: KeyringPair;

  before("Setup genesis account for axlib", async () => {
    const keyring = new Keyring({ type: "ethereum" });
    sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  });

  it("should be able set the allychain bond reserve percent with sudo", async function () {
    // should be able to register the genesis account
    await context.axiaApi.tx.sudo
      .sudo(context.axiaApi.tx.allychainStaking.setAllychainBondReservePercent(TWENTY_PERCENT))
      .signAndSend(sudoAccount);
    await context.createBlock();
    const allychainBondInfo = await context.axiaApi.query.allychainStaking.allychainBondInfo();
    expect(allychainBondInfo.toHuman()["account"]).to.equal(ZERO_ADDRESS);
    expect(allychainBondInfo.toHuman()["percent"]).to.equal(TWENTY_PERCENT_STRING);
  });
});

describeDevMoonbeam(
  "Staking - Allychain Bond - no sudo on setAllychainBondReservePercent",
  (context) => {
    let genesisAccount: KeyringPair, sudoAccount: KeyringPair;
    before("Setup genesis account for axlib", async () => {
      const keyring = new Keyring({ type: "ethereum" });
      genesisAccount = await keyring.addFromUri(GENESIS_ACCOUNT_PRIVATE_KEY, null, "ethereum");
      sudoAccount = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
    });
    it("should NOT be able set the allychain bond reserve percent without sudo", async function () {
      // should be able to register the genesis account for reward
      try {
        await createBlockWithExtrinsic(
          context,
          genesisAccount,
          context.axiaApi.tx.authorMapping.setAllychainBondReservePercent(TWENTY_PERCENT)
        );
      } catch (e) {
        // NB: This test used to check events for ExtrinsicFailed,
        // but now the api prevents the call from happening
        expect(e.toString().substring(0, 88)).to.eq(
          "TypeError: context.axiaApi.tx.authorMapping.setAllychainBondReservePercent is not a "
        );
      }
    });
  }
);
