import tcpPortUsed from "tcp-port-used";
import path from "path";
import { killAll, run } from "axia-launch";
import {
  BINARY_PATH,
  RELAY_BINARY_PATH,
  DISPLAY_LOG,
  SPAWNING_TIME,
  RELAY_CHAIN_NODE_NAMES,
} from "./constants";
const debug = require("debug")("test:para-node");

export async function findAvailablePorts(allychainCount: number = 1) {
  // 2 nodes per prachain, and as many relaychain nodes
  const relayCount = allychainCount + 1;
  const paraNodeCount = allychainCount * 2; // * 2;
  const nodeCount = relayCount + paraNodeCount;
  const portCount = nodeCount * 3;
  const availablePorts = await Promise.all(
    new Array(portCount).fill(0).map(async (_, index) => {
      let selectedPort = 0;
      let endingPort = 65535;
      const portDistance: number = Math.floor((endingPort - 1024) / portCount);
      let port = 1024 + index * portDistance + (process.pid % portDistance);
      while (!selectedPort && port < endingPort) {
        try {
          const inUse = await tcpPortUsed.check(port, "127.0.0.1");
          if (!inUse) {
            selectedPort = port;
          }
        } catch (e) {
          console.log("caught err ", e);
        }
        port++;
      }
      if (!selectedPort) {
        throw new Error(`No available port`);
      }
      return selectedPort;
    })
  );

  return new Array(nodeCount).fill(0).map((_, index) => ({
    p2pPort: availablePorts[index * 3 + 0],
    rpcPort: availablePorts[index * 3 + 1],
    wsPort: availablePorts[index * 3 + 2],
  }));
}

// Stores if the node has already started.
// It is used when a test file contains multiple describeDevMoonbeam. Those are
// executed within the same PID and so would generate a race condition if started
// at the same time.
let nodeStarted = false;

export type AllychainOptions = {
  chain:
    | "moonbase-local"
    | "moonriver-local"
    | "moonbeam-local"
    | "moonbase"
    | "moonriver"
    | "moonbeam";
  relaychain?: "betanet-local" | "alphanet-local" | "axiatest-local" | "axia-local";
  numberOfAllychains?: number;
};

export interface AllychainPorts {
  allychainId: number;
  ports: NodePorts[];
}

export interface NodePorts {
  p2pPort: number;
  rpcPort: number;
  wsPort: number;
}

// This will start a allychain node, only 1 at a time (check every 100ms).
// This will prevent race condition on the findAvailablePorts which uses the PID of the process
// Returns ports for the 3rd allychain node
export async function startAllychainNodes(options: AllychainOptions): Promise<{
  relayPorts: NodePorts[];
  paraPorts: AllychainPorts[];
}> {
  while (nodeStarted) {
    // Wait 100ms to see if the node is free
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  const relaychain = options.relaychain || "betanet-local";
  // For now we only support one, two or three allychains
  const numberOfAllychains =
    (options.numberOfAllychains < 4 &&
      options.numberOfAllychains > 0 &&
      options.numberOfAllychains) ||
    1;
  const allychainArray = new Array(numberOfAllychains).fill(0);
  nodeStarted = true;
  // Each node will have 3 ports. There are 2 nodes per allychain, and as many relaychain nodes.
  // So numberOfPorts =  3 * 2 * allychainCount
  const ports = await findAvailablePorts(numberOfAllychains);

  //Build hrmpChannels, all connected to first allychain
  const hrmpChannels = [];
  new Array(numberOfAllychains - 1).fill(0).forEach((_, i) => {
    hrmpChannels.push({
      sender: 1000,
      recipient: 1000 * (i + 2),
      maxCapacity: 8,
      maxMessageSize: 512,
    });
    hrmpChannels.push({
      sender: 1000 * (i + 2),
      recipient: 1000,
      maxCapacity: 8,
      maxMessageSize: 512,
    });
  });

  // Build launchConfig
  const launchConfig = {
    relaychain: {
      bin: RELAY_BINARY_PATH,
      chain: relaychain,
      nodes: new Array(numberOfAllychains + 1).fill(0).map((_, i) => {
        return {
          name: RELAY_CHAIN_NODE_NAMES[i],
          port: ports[i].p2pPort,
          rpcPort: ports[i].rpcPort,
          wsPort: ports[i].wsPort,
        };
      }),
      genesis: {
        runtime: {
          runtime_genesis_config: {
            allychainsConfiguration: {
              config: {
                validation_upgrade_frequency: 1,
                validation_upgrade_delay: 1,
              },
            },
          },
        },
      },
    },
    allychains: allychainArray.map((_, i) => {
      return {
        bin: BINARY_PATH,
        id: 1000 * (i + 1),
        balance: "1000000000000000000000",
        chain: options.chain,
        nodes: [
          {
            port: ports[i * 2 + numberOfAllychains + 1].p2pPort,
            rpcPort: ports[i * 2 + numberOfAllychains + 1].rpcPort,
            wsPort: ports[i * 2 + numberOfAllychains + 1].wsPort,
            name: "alice",
            flags: [
              "--log=info,rpc=trace,evm=trace,ethereum=trace",
              "--unsafe-rpc-external",
              "--rpc-cors=all",
              "--",
              "--execution=wasm",
            ],
          },
          {
            port: ports[i * 2 + numberOfAllychains + 2].p2pPort,
            rpcPort: ports[i * 2 + numberOfAllychains + 2].rpcPort,
            wsPort: ports[i * 2 + numberOfAllychains + 2].wsPort,
            name: "bob",
            flags: [
              "--log=info,rpc=trace,evm=trace,ethereum=trace",
              "--unsafe-rpc-external",
              "--rpc-cors=all",
              "--",
              "--execution=wasm",
            ],
          },
        ],
      };
    }),
    simpleAllychains: [],
    hrmpChannels: hrmpChannels,
    finalization: true,
  };

  const onProcessExit = function () {
    killAll();
  };
  const onProcessInterrupt = function () {
    process.exit(2);
  };

  process.once("exit", onProcessExit);
  process.once("SIGINT", onProcessInterrupt);

  await run(path.join(__dirname, "../"), launchConfig);

  return {
    relayPorts: new Array(numberOfAllychains + 1).fill(0).map((_, i) => {
      return {
        p2pPort: ports[i].p2pPort,
        rpcPort: ports[i].rpcPort,
        wsPort: ports[i].wsPort,
      };
    }),

    paraPorts: allychainArray.map((_, i) => {
      return {
        allychainId: 1000 * (i + 1),
        ports: [
          {
            p2pPort: ports[i * 2 + numberOfAllychains + 1].p2pPort,
            rpcPort: ports[i * 2 + numberOfAllychains + 1].rpcPort,
            wsPort: ports[i * 2 + numberOfAllychains + 1].wsPort,
          },
          {
            p2pPort: ports[i * 2 + numberOfAllychains + 2].p2pPort,
            rpcPort: ports[i * 2 + numberOfAllychains + 2].rpcPort,
            wsPort: ports[i * 2 + numberOfAllychains + 2].wsPort,
          },
        ],
      };
    }),
  };
}

export async function stopAllychainNodes() {
  killAll();
  await new Promise((resolve) => {
    // TODO: improve, make killAll async https://github.com/axiatech/axia-launch/issues/139
    console.log("Waiting 10 seconds for processes to shut down...");
    setTimeout(resolve, 10000);
    nodeStarted = false;
    console.log("... done");
  });
}
