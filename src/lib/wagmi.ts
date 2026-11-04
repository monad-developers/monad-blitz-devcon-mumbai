import { createConfig, http } from "wagmi";
import { monadTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

export const chain = monadTestnet;

export const config = createConfig({
  chains: [monadTestnet],
  // The injected connector talks to the MetaMask browser extension directly.
  connectors: [injected({ target: "metaMask" })],
  transports: {
    [monadTestnet.id]: http(process.env.NEXT_PUBLIC_MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

export const explorer = monadTestnet.blockExplorers.default.url;
export const txUrl = (hash: string) => `${explorer}/tx/${hash}`;
export const addressUrl = (address: string) => `${explorer}/address/${address}`;
