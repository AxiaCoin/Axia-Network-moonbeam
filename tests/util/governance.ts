import { Keyring } from "@axia/api";
import { ApiTypes, SubmittableExtrinsic } from "@axia/api/types";
import { KeyringPair } from "@axia/keyring/types";
import { blake2AsHex } from "@axia/util-crypto";
import {
  ALITH_PRIV_KEY,
  BALTATHAR_PRIV_KEY,
  CHARLETH_PRIV_KEY,
  DOROTHY_PRIV_KEY,
} from "./constants";
import { DevTestContext } from "./setup-dev-tests";
import { createBlockWithExtrinsic } from "./axlib-rpc";

const keyring = new Keyring({ type: "ethereum" });

export const notePreimage = async <
  Call extends SubmittableExtrinsic<ApiType>,
  ApiType extends ApiTypes
>(
  context: DevTestContext,
  proposal: Call,
  account: KeyringPair
): Promise<string> => {
  const encodedProposal = proposal.method.toHex() || "";
  await context.axiaApi.tx.democracy.notePreimage(encodedProposal).signAndSend(account);
  await context.createBlock();
  // return encodedHash
  return blake2AsHex(encodedProposal);
};

export const execFromTwoThirdsOfCouncil = async <
  Call extends SubmittableExtrinsic<ApiType>,
  ApiType extends ApiTypes
>(
  context: DevTestContext,
  axiaCall: Call
) => {
  // Council members
  const charleth = await keyring.addFromUri(CHARLETH_PRIV_KEY, null, "ethereum");
  const dorothy = await keyring.addFromUri(DOROTHY_PRIV_KEY, null, "ethereum");

  // Charleth submit the proposal to the council (and therefore implicitly votes for)
  let lengthBound = axiaCall.encodedLength;
  const { events: proposalEvents } = await createBlockWithExtrinsic(
    context,
    charleth,
    context.axiaApi.tx.councilCollective.propose(2, axiaCall, lengthBound)
  );
  const proposalHash = proposalEvents
    .find((e) => e.method.toString() == "Proposed")
    .data[2].toHex() as string;

  // Dorothy vote for this proposal and close it
  await Promise.all([
    context.axiaApi.tx.councilCollective.vote(proposalHash, 0, true).signAndSend(charleth),
    context.axiaApi.tx.councilCollective.vote(proposalHash, 0, true).signAndSend(dorothy),
  ]);
  await context.createBlock();

  return await createBlockWithExtrinsic(
    context,
    dorothy,
    context.axiaApi.tx.councilCollective.close(proposalHash, 0, 1_000_000_000, lengthBound)
  );
};

export const execFromAllMembersOfTechCommittee = async <
  Call extends SubmittableExtrinsic<ApiType>,
  ApiType extends ApiTypes
>(
  context: DevTestContext,
  axiaCall: Call
) => {
  // Tech committee members
  const alith = await keyring.addFromUri(ALITH_PRIV_KEY, null, "ethereum");
  const baltathar = await keyring.addFromUri(BALTATHAR_PRIV_KEY, null, "ethereum");

  // Alith submit the proposal to the council (and therefore implicitly votes for)
  let lengthBound = axiaCall.encodedLength;
  const { events: proposalEvents } = await createBlockWithExtrinsic(
    context,
    alith,
    context.axiaApi.tx.techCommitteeCollective.propose(2, axiaCall, lengthBound)
  );
  const proposalHash = proposalEvents
    .find((e) => e.method.toString() == "Proposed")
    .data[2].toHex() as string;

  // Alith, Baltathar vote for this proposal and close it
  await Promise.all([
    context.axiaApi.tx.techCommitteeCollective.vote(proposalHash, 0, true).signAndSend(alith),
    context.axiaApi.tx.techCommitteeCollective.vote(proposalHash, 0, true).signAndSend(baltathar),
  ]);

  await context.createBlock();
  await context.createBlock();
  return await createBlockWithExtrinsic(
    context,
    baltathar,
    context.axiaApi.tx.techCommitteeCollective.close(proposalHash, 0, 1_000_000_000, lengthBound)
  );
};
