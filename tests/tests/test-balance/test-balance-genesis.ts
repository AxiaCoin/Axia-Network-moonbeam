import { expect } from "chai";

import { GENESIS_ACCOUNT, GENESIS_ACCOUNT_BALANCE } from "../../util/constants";
import { describeDevMoonbeam } from "../../util/setup-dev-tests";

describeDevMoonbeam("Balance genesis", (context) => {
  it("should be accessible through web3", async function () {
    expect(await context.web3.eth.getBalance(GENESIS_ACCOUNT, 0)).to.equal(
      GENESIS_ACCOUNT_BALANCE.toString()
    );
  });

  it("should be accessible through axiaJs", async function () {
    const genesisHash = await context.axiaApi.rpc.chain.getBlockHash(0);
    const account = await context.axiaApi.query.system.account.at(genesisHash, GENESIS_ACCOUNT);
    expect(account.data.free.toString()).to.equal(GENESIS_ACCOUNT_BALANCE.toString());
  });
});
