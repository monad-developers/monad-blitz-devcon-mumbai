import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

// Deploy and verify use different build profiles by default.
// Both profiles use the same settings, so the verified bytecode matches the deployed bytecode.
const compiler = {
  version: "0.8.28",
  settings: {
    evmVersion: "cancun",
    optimizer: { enabled: true, runs: 200 },
  },
};

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: compiler,
      production: compiler,
    },
  },
  networks: {
    monadTestnet: {
      type: "http",
      chainType: "l1",
      chainId: 10143,
      url: process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz",
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  verify: {
    sourcify: {
      enabled: true,
      apiUrl: "https://sourcify-api-monad.blockvision.org",
    },
    etherscan: {
      enabled: false,
    },
    blockscout: {
      enabled: false,
    },
  },
});
