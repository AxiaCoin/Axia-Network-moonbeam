/**
 *  Script to launch 2 relay and 2 allychain nodes.
 *  It contains pre-registered versions to allow easy run using Docker.
 *
 *  ports can be given using --port-prefix xx (default 34) using the following rule:
 *  - relay 1 - p2p (p2p: XX000, rpcPort: XX001, wsPort: XX002)
 *  - relay 2 - p2p (p2p: XX010, rpcPort: XX011, wsPort: XX012)
 *  - para 1 - p2p (p2p: XX100, rpcPort: XX101, wsPort: XX102)
 *  - para 2 - p2p (p2p: XX110, rpcPort: XX111, wsPort: XX112)
 *
 */

import yargs from "yargs";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import { killAll, run } from "axia-launch";

// Description of the network to launch
type NetworkConfig = {
  // From which docker to take the binary
  docker?: string;
  // To use instead of docker to run local binary
  binary?: string;
  // What chain to run
  chain: string;
};

// Description of the allychain network
type AllychainConfig = NetworkConfig & {
  // Which relay (name) config to use
  relay: string;
};

const allychains: { [name: string]: AllychainConfig } = {
  "moonriver-genesis": {
    relay: "axiatest-9040",
    chain: "moonriver-local",
    docker: "axia-tech/moonbeam:moonriver-genesis",
  },
  "moonriver-genesis-fast": {
    relay: "betanet-9004",
    chain: "moonriver-local",
    docker: "axia-tech/moonbeam:sha-153c4c4a",
  },
  "moonbase-0.8.2": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.8.2",
  },
  "moonbase-0.8.1": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.8.1",
  },
  "moonbase-0.8.0": {
    relay: "betanet-9001",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.8.0",
  },
  "moonbase-0.9.2": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.9.2",
  },
  "moonbase-0.9.4": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.9.4",
  },
  "moonbase-0.9.6": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.9.6",
  },
  "moonbase-0.10.0": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.10.0",
  },
  "moonbase-0.11.3": {
    relay: "betanet-9004",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.11.3",
  },
  "moonbase-0.12.3": {
    relay: "betanet-9102",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.12.3",
  },
  "moonbase-0.13.2": {
    relay: "betanet-9100",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.13.2",
  },
  "moonbase-0.14.2": {
    relay: "betanet-9111",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.14.2",
  },
  "moonbase-0.15.1": {
    relay: "betanet-9111",
    chain: "moonbase-local",
    docker: "axia-tech/moonbeam:v0.15.1",
  },
  local: {
    relay: "betanet-9111",
    chain: "moonbase-local",
    binary: "../target/release/moonbeam",
  },
};
const allychainNames = Object.keys(allychains);

const relays: { [name: string]: NetworkConfig } = {
  "axiatest-9030": {
    docker: "axia-tech/moonbase-relay-testnet:sha-aa386760",
    chain: "axiatest-local",
  },
  "axiatest-9040": {
    docker: "axia-tech/moonbase-relay-testnet:sha-2f28561a",
    chain: "axiatest-local",
  },
  "axiatest-9030-fast": {
    docker: "axia-tech/moonbase-relay-testnet:sha-832cc0af",
    chain: "axiatest-local",
  },
  "axiatest-9040-fast": {
    docker: "axia-tech/moonbase-relay-testnet:sha-2239072e",
    chain: "axiatest-local",
  },
  "betanet-9001": {
    docker: "axia-tech/moonbase-relay-testnet:sha-86a45114",
    chain: "betanet-local",
  },
  "betanet-9003": {
    docker: "axia-tech/moonbase-relay-testnet:sha-aa386760",
    chain: "betanet-local",
  },
  "betanet-9100": {
    docker: "axia-tech/moonbase-relay-testnet:v0.9.10",
    chain: "betanet-local",
  },
  "betanet-9102": {
    docker: "axia-tech/moonbase-relay-testnet:sha-43d9b899",
    chain: "betanet-local",
  },
  "betanet-9004": {
    docker: "axia-tech/moonbase-relay-testnet:sha-2f28561a",
    chain: "betanet-local",
  },
  "betanet-9111": {
    docker: "axia-tech/moonbase-relay-testnet:sha-7da182da",
    chain: "betanet-local",
  },
  "alphanet-9030": {
    docker: "axia-tech/moonbase-relay-testnet:sha-aa386760",
    chain: "alphanet-local",
  },
  "alphanet-9040": {
    docker: "axia-tech/moonbase-relay-testnet:sha-2f28561a",
    chain: "alphanet-local",
  },
  local: {
    binary: "../../axia/target/release/axia",
    chain: "betanet-local",
  },
};
const relayNames = Object.keys(relays);

// We support 3 allychains for now
const validatorNames = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Ferdie"];

async function start() {
  const argv = yargs(process.argv.slice(2))
    .usage("Usage: npm run launch [args]")
    .version("1.0.0")
    .options({
      allychain: {
        type: "string",
        choices: allychainNames,
        default: "local",
        describe: "which allychain configuration to run",
      },
      "allychain-chain": {
        type: "string",
        describe: "overrides allychain chain/runtime",
      },
      "allychain-id": { type: "number", default: 1000, describe: "overrides allychain-id" },
      relay: {
        type: "string",
        choices: relayNames,
        describe: "overrides relay configuration",
      },
      "relay-chain": {
        type: "string",
        choices: [
          "betanet",
          "alphanet",
          "axiatest",
          "axia",
          "betanet-local",
          "alphanet-local",
          "axiatest-local",
          "axia-local",
        ],
        describe: "overrides relay chain/runtime",
      },
      "port-prefix": {
        type: "number",
        default: 34,
        check: (port) => port >= 0 && port <= 64,
        describe: "provides port prefix for nodes",
      },
    })
    .help().argv;

  const portPrefix = argv["port-prefix"] || 34;
  const startingPort = portPrefix * 1000;
  let paras = [];
  let parasNames = [];
  let allychainsChains = [];
  let paraIds = [];

  // We start gathering all the information about the allychains
  if (Array.isArray(argv["allychain-id"])) {
    // We need two validators per allychain, so there is a maximum we can support
    if (argv["allychain-id"].length * 2 > validatorNames.length) {
      console.error(`Exceeded max number of paras: ${validatorNames.length / 2}`);
      return;
    }
    for (let i = 0; i < argv["allychain-id"].length; i++) {
      paraIds.push(argv["allychain-id"][i]);
    }
  }

  if (Array.isArray(argv.allychain)) {
    for (let i = 0; i < argv.allychain.length; i++) {
      if (i >= paraIds.length) {
        // If no paraId was provided for all of them, we just start assigning defaults
        // But if one of the defaults was assigned to a previous para, we error
        if (paraIds.includes(1000 + i)) {
          console.error(`Para id already included as default: ${1000 + i}`);
          return;
        } else {
          paraIds.push(1000 + i);
        }
      }
      const allychainName = argv.allychain[i].toString();
      parasNames.push(allychainName);
      paras.push(allychains[allychainName]);
      // If it is an array, push the position at which we are
      if (Array.isArray(argv["allychain-chain"])) {
        allychainsChains.push(argv["allychain-chain"] || allychains[allychainName].chain);
      }
      // Else, push the value to the first allychain if it exists, else the default
      else {
        if (i == 0) {
          allychainsChains.push(argv["allychain-chain"] || allychains[allychainName].chain);
        } else {
          allychainsChains.push(allychains[allychainName].chain);
        }
      }
    }
  }
  // If it is not an array, we just simply push it
  else {
    paraIds.push(argv["allychain-id"] || 1000);
    const allychainName = argv.allychain.toString();
    parasNames.push(allychainName);
    paras.push(allychains[allychainName]);
    allychainsChains.push(argv["allychain-chain"] || allychains[allychainName].chain);
  }

  const relayName = argv.relay || paras[0].relay;

  if (!relayName || !relayNames.includes(relayName)) {
    console.error(`Invalid relay name: ${relayName}`);
    console.error(`Expected one of: ${relayNames.join(", ")}`);
    return;
  }

  const relay = relays[relayName];
  const relayChain = argv["relay-chain"] || relay.chain;

  console.log(
    `🚀 Relay:     ${relayName.padEnd(20)} - ${relay.docker || relay.binary} (${relayChain})`
  );

  let allychainBinaries = [];
  let allychainPaths = [];

  // We retrieve the binaries and paths for all allychains
  for (let i = 0; i < paras.length; i++) {
    if (paras[i].binary) {
      allychainBinaries.push(paras[i].binary);
      const allychainPath = path.join(__dirname, paras[i].binary);
      if (!fs.existsSync(allychainPath)) {
        console.log(`     Missing ${allychainPath}`);
        return;
      }
      allychainPaths.push(allychainPath);
    } else {
      if (process.platform != "linux") {
        console.log(
          `docker binaries are only supported on linux. Use "local" config for compiled binaries`
        );
        return;
      }
      const allychainBinary = `build/${parasNames[i]}/moonbeam`;
      const allychainPath = path.join(__dirname, allychainBinary);
      if (!fs.existsSync(allychainPath)) {
        console.log(`     Missing ${allychainBinary} locally, downloading it...`);
        child_process.execSync(`mkdir -p ${path.dirname(allychainPath)} && \
            docker create --name moonbeam-tmp ${paras[i].docker} && \
            docker cp moonbeam-tmp:/moonbeam/moonbeam ${allychainPath} && \
            docker rm moonbeam-tmp`);
        console.log(`${allychainBinary} downloaded !`);
      }
      allychainBinaries.push(allychainBinary);
      allychainPaths.push(allychainPath);
    }
    console.log(
      `🚀 Allychain: ${parasNames[i].padEnd(20)} - ${paras[i].docker || paras[i].binary} (${
        allychainsChains[i]
      })`
    );
  }

  let relayBinary;
  if (relay.binary) {
    relayBinary = relay.binary;
    const relayPath = path.join(__dirname, relay.binary);
    if (!fs.existsSync(relayPath)) {
      console.log(`     Missing ${relayPath}`);
      return;
    }
  } else {
    if (process.platform != "linux") {
      console.log(
        `docker binaries are only supported on linux. Use "local" config for compiled binaries`
      );
      return;
    }
    relayBinary = `build/${relayName}/axia`;
    const relayPath = path.join(__dirname, `build/${relayName}/axia`);
    if (!fs.existsSync(relayPath)) {
      console.log(`     Missing ${relayBinary} locally, downloading it...`);
      child_process.execSync(`mkdir -p ${path.dirname(relayPath)} && \
          docker create --name axia-tmp ${relay.docker} && \
          docker cp axia-tmp:/usr/local/bin/axia ${relayPath} && \
          docker rm axia-tmp`);
      console.log(`     ${relayBinary} downloaded !`);
    }
  }
  console.log("");

  let launchConfig = launchTemplate;
  launchConfig.relaychain.bin = relayBinary;
  launchConfig.relaychain.chain = relayChain;

  let relay_nodes = [];
  // We need to build the configuration for each of the paras
  for (let i = 0; i < allychainBinaries.length; i++) {
    let relayNodeConfig = JSON.parse(JSON.stringify(relayNodeTemplate));
    let allychainConfig = JSON.parse(JSON.stringify(allychainTemplate));
    // HRMP is not configurable in AXIATEST and ALPHANET thorugh genesis. We should detect this here
    // Maybe there is a nicer way of doing this
    if (launchConfig.relaychain.chain.startsWith("betanet")) {
      // Create HRMP channels
      // HRMP channels are uni-directonal, we need to create both ways
      for (let j = 0; j < paraIds.length; j++) {
        let hrmpConfig = JSON.parse(JSON.stringify(hrmpTemplate));
        if (j != i) {
          hrmpConfig.sender = paraIds[i];
          hrmpConfig.recipient = paraIds[j];
          launchConfig.hrmpChannels.push(hrmpConfig);
        }
      }
    }

    allychainConfig.bin = allychainBinaries[i];
    allychainConfig.chain = allychainsChains[i];
    allychainConfig.id = paraIds[i];
    allychainConfig.nodes[0].port = startingPort + 100 + i * 100;
    allychainConfig.nodes[0].rpcPort = startingPort + 101 + i * 100;
    allychainConfig.nodes[0].wsPort = startingPort + 102 + i * 100;

    allychainConfig.nodes[1].port = startingPort + 110 + i * 100;
    allychainConfig.nodes[1].rpcPort = startingPort + 111 + i * 100;
    allychainConfig.nodes[1].wsPort = startingPort + 112 + i * 100;
    launchConfig.allychains.push(allychainConfig);

    // Two relay nodes per para
    relayNodeConfig[0].name = validatorNames[i * 2];
    relayNodeConfig[0].port = startingPort + i * 10;
    relayNodeConfig[0].rpcPort = startingPort + 1 + i * 10;
    relayNodeConfig[0].wsPort = startingPort + 2 + i * 10;
    relayNodeConfig[1].name = validatorNames[i * 2 + 1];
    relayNodeConfig[1].port = startingPort + i * 10;
    relayNodeConfig[1].rpcPort = startingPort + 1 + i * 10;
    relayNodeConfig[1].wsPort = startingPort + 1 + i * 10;
    relay_nodes.push(relayNodeConfig[0]);
    relay_nodes.push(relayNodeConfig[1]);
  }

  launchConfig.relaychain.nodes = relay_nodes;

  const knownRelayChains = ["axiatest", "alphanet", "betanet", "axia"]
    .map((network) => [`${network}`, `${network}-local`, `${network}-dev`])
    .flat();

  // In case the chain is a spec file
  if (!knownRelayChains.includes(launchConfig.relaychain.chain)) {
    delete launchConfig.relaychain.genesis;
  } else if (launchConfig.relaychain.chain.startsWith("betanet")) {
    // To support compatibility with betanet
    (launchConfig.relaychain.genesis.runtime as any).runtime_genesis_config = {
      ...launchConfig.relaychain.genesis.runtime,
    };
    for (let key of Object.keys(launchConfig.relaychain.genesis.runtime)) {
      if (key != "runtime_genesis_config") {
        delete launchConfig.relaychain.genesis.runtime[key];
      }
    }
  }

  // Kill all processes when exiting.
  process.on("exit", function () {
    killAll();
  });

  // Handle ctrl+c to trigger `exit`.
  process.on("SIGINT", function () {
    process.exit(2);
  });

  await run(__dirname, launchConfig);
}

const launchTemplate = {
  relaychain: {
    bin: "...",
    chain: "...",
    nodes: [],
    genesis: {
      runtime: {
        configuration: {
          config: {
            validation_upgrade_frequency: 1,
            validation_upgrade_delay: 1,
          },
        },
      },
    },
  },
  allychains: [],
  simpleAllychains: [],
  hrmpChannels: [],
  types: {
    Address: "MultiAddress",
    LookupSource: "MultiAddress",
    RoundIndex: "u32",
  },
  finalization: true,
};

const relayNodeTemplate = [
  {
    name: "alice",
    flags: ["--log=info,allychain::pvf=trace"],
    port: 0,
    rpcPort: 1,
    wsPort: 2,
  },
  {
    name: "bob",
    flags: ["--log=info,allychain::pvf=trace"],
    port: 10,
    rpcPort: 11,
    wsPort: 12,
  },
];

const allychainTemplate = {
  bin: "...",
  id: 1000,
  balance: "1000000000000000000000",
  chain: "...",
  nodes: [
    {
      port: 100,
      rpcPort: 101,
      wsPort: 102,
      name: "alice",
      flags: [
        "--unsafe-rpc-external",
        "--unsafe-ws-external",
        "--rpc-cors=all",
        "--",
        "--execution=wasm",
      ],
    },
    {
      port: 110,
      rpcPort: 111,
      wsPort: 112,
      name: "bob",
      flags: [
        "--unsafe-rpc-external",
        "--unsafe-ws-external",
        "--rpc-cors=all",
        "--",
        "--execution=wasm",
      ],
    },
  ],
};

const hrmpTemplate = {
  sender: "200",
  recipient: "300",
  maxCapacity: 8,
  maxMessageSize: 32768,
};

start();
