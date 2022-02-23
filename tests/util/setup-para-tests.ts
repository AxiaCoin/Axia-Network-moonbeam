import { ApiPromise } from "@axia/api";
import { ethers } from "ethers";
import { provideWeb3Api, provideEthersApi, provideAXIAApi, EnhancedWeb3 } from "./providers";
import { DEBUG_MODE } from "./constants";
import { HttpProvider } from "web3-core";
import {
  NodePorts,
  AllychainOptions,
  AllychainPorts,
  startAllychainNodes,
  stopAllychainNodes,
} from "./para-node";
const debug = require("debug")("test:setup");

export interface ParaTestContext {
  createWeb3: (protocol?: "ws" | "http") => Promise<EnhancedWeb3>;
  createEthers: () => Promise<ethers.providers.JsonRpcProvider>;
  createAXIAApiAllychains: () => Promise<ApiPromise>;
  createAXIAApiRelaychains: () => Promise<ApiPromise>;

  // We also provided singleton providers for simplicity
  web3: EnhancedWeb3;
  ethers: ethers.providers.JsonRpcProvider;
  axiaApiParaone: ApiPromise;
}

export interface AllychainApis {
  allychainId: number;
  apis: ApiPromise[];
}

export interface InternalParaTestContext extends ParaTestContext {
  _axiaApiAllychains: AllychainApis[];
  _axiaApiRelaychains: ApiPromise[];
  _web3Providers: HttpProvider[];
}

export function describeAllychain(
  title: string,
  options: AllychainOptions,
  cb: (context: InternalParaTestContext) => void
) {
  describe(title, function () {
    // Set timeout to 5000 for all tests.
    this.timeout(300000);

    // The context is initialized empty to allow passing a reference
    // and to be filled once the node information is retrieved
    let context: InternalParaTestContext = {} as InternalParaTestContext;

    // Making sure the Moonbeam node has started
    before("Starting Moonbeam Test Node", async function () {
      this.timeout(300000);
      const init = !DEBUG_MODE
        ? await startAllychainNodes(options)
        : {
            paraPorts: [
              {
                allychainId: 1000,
                ports: [
                  {
                    p2pPort: 19931,
                    wsPort: 19933,
                    rpcPort: 19932,
                  },
                ],
              },
            ],
            relayPorts: [],
          };
      // Context is given prior to this assignement, so doing
      // context = init.context will fail because it replace the variable;

      context._axiaApiAllychains = [];
      context._axiaApiRelaychains = [];
      context._web3Providers = [];

      context.createWeb3 = async (protocol: "ws" | "http" = "http") => {
        const provider =
          protocol == "ws"
            ? await provideWeb3Api(init.paraPorts[0].ports[0].wsPort, "ws")
            : await provideWeb3Api(init.paraPorts[0].ports[0].rpcPort, "http");
        context._web3Providers.push((provider as any)._provider);
        return provider;
      };
      context.createEthers = async () => provideEthersApi(init.paraPorts[0].ports[0].rpcPort);
      context.createAXIAApiAllychains = async () => {
        const apiPromises = await Promise.all(
          init.paraPorts.map(async (allychain: AllychainPorts) => {
            return {
              allychainId: allychain.allychainId,
              apis: await Promise.all(
                allychain.ports.map(async (ports: NodePorts) => {
                  return provideAXIAApi(ports.wsPort);
                })
              ),
            };
          })
        );
        // We keep track of the axiaApis to close them at the end of the test
        context._axiaApiAllychains = apiPromises;
        await Promise.all(
          apiPromises.map(async (promises) =>
            Promise.all(promises.apis.map((promise) => promise.isReady))
          )
        );
        // Necessary hack to allow axiaApi to finish its internal metadata loading
        // apiPromise.isReady unfortunately doesn't wait for those properly
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        return apiPromises[0].apis[0];
      };
      context.createAXIAApiRelaychains = async () => {
        const apiPromises = await Promise.all(
          init.relayPorts.map(async (ports: NodePorts) => {
            return await provideAXIAApi(ports.wsPort, true);
          })
        );
        // We keep track of the axiaApis to close them at the end of the test
        context._axiaApiRelaychains = apiPromises;
        await Promise.all(apiPromises.map((promise) => promise.isReady));
        // Necessary hack to allow axiaApi to finish its internal metadata loading
        // apiPromise.isReady unfortunately doesn't wait for those properly
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });

        return apiPromises[0];
      };

      context.axiaApiParaone = await context.createAXIAApiAllychains();
      await context.createAXIAApiRelaychains();
      context.web3 = await context.createWeb3();
      context.ethers = await context.createEthers();
      debug(
        `Setup ready [${/:([0-9]+)$/.exec((context.web3.currentProvider as any).host)[1]}] for ${
          this.currentTest.title
        }`
      );
    });

    after(async function () {
      await Promise.all(context._web3Providers.map((p) => p.disconnect()));
      await Promise.all(
        context._axiaApiAllychains.map(
          async (ps) => await Promise.all(ps.apis.map((p) => p.disconnect()))
        )
      );
      await Promise.all(context._axiaApiRelaychains.map((p) => p.disconnect()));

      if (!DEBUG_MODE) {
        await stopAllychainNodes();
        await new Promise((resolve) => {
          // TODO: Replace Sleep by actually checking the process has ended
          setTimeout(resolve, 1000);
        });
      }
    });

    cb(context);
  });
}
