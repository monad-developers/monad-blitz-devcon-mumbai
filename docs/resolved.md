# Resolved (verify) items

Checked on 4 Nov 2026 against the public RPC and the Monad and Circle docs.

| Item | Spec said | Found | How |
|---|---|---|---|
| Testnet chain ID | `10143` (verify) | **10143** (`0x279f`) | `eth_chainId` on `https://testnet-rpc.monad.xyz` |
| RPC | `https://testnet-rpc.monad.xyz` (verify) | **Works.** No second RPC chosen yet. | Live `eth_chainId`, `eth_getBlockByNumber`, `eth_feeHistory` calls |
| Explorer | `https://testnet.monadexplorer.com` (verify) | **Redirects (308) to `https://testnet.monadvision.com/`**. It returns 403 to curl, so the `/tx/<hash>` path is not confirmed yet. Check it in a browser before setting `PUBLIC_EXPLORER_URL`. | `curl -I` |
| USDC | Don't guess; use official test USDC if confirmed | **Circle testnet USDC at `0x534b2f3A21130d7a60830c2Df862319e593943A3`**: symbol `USDC`, 6 decimals, contract code present. Funding comes from Circle's faucet, so `MockUSDC` is still the fallback if faucet amounts are too small for the demo budget. | Circle docs, plus `cast call symbol/decimals/totalSupply` on chain |
| Gas accounting | Charged on gas limit (verify) | **Confirmed: charged on `gas_limit`, not gas used, with no refunds.** | Monad "Gas on Monad" and "Gas pricing" docs |
| Base fee | — | **Observed 100 gwei** on every recent block, with a typical priority fee of 15 gwei. The docs say 50 gwei is hard-coded on testnet, so the docs are out of date. Read the fee from the chain; don't hardcode it. | `eth_feeHistory` |
| Block time and finality | Sub-second (verify) | **About 0.31 s per block** (200 blocks in 62 s). Finality is not measured yet; the `/live` panel reports measured tap-to-paid only. | Block timestamps |

## Gas per call, measured on a local chain

| Call | Gas used |
|---|---|
| `AttemptRegistry.record`, passed and paid | 232,138 to 266,350 (higher for a contributor's first mint) |
| `AttemptRegistry.record`, failed | 97,933 to 115,033 |

The relayer estimates once for each outcome and sends `estimate × 1.25` as an explicit `gasLimit`. Because Monad charges the limit, a paid record costs about `300,000 × 115 gwei ≈ 0.035 MON` at current testnet fees. Fund each of the 5 relayer keys for the expected number of records plus margin.

## Still open

- Explorer transaction URL format on monadvision.
- A second RPC endpoint as a fallback.
- Whether Circle's faucet gives enough test USDC for a 100 USDC task budget. If not, deploy with `MockUSDC` and label it test USDC on screen.

Sources: [Gas on Monad](https://docs.monad.xyz/developer-essentials/gas-on-monad), [Gas pricing](https://docs.monad.xyz/developer-essentials/gas-pricing), [Circle quickstart for USDC on Monad](https://developers.circle.com/stablecoins/quickstart-setup-transfer-usdc-monad).
