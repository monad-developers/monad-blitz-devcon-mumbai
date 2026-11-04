# Deployments

## Monad testnet (chain 10143)

| Contract | Address |
|---|---|
| TapMateVault | [`0x4423C58852fF2C63648e83f0C00985Fde56cC5F9`](https://testnet.monadvision.com/address/0x4423C58852fF2C63648e83f0C00985Fde56cC5F9) |

- Deploy transaction: `0x526b73d1c584bab6abaa4f1bfb45aff5d90257c6dc17c1371c87f35af91424c1`
- Source verified on Sourcify (exact runtime match).
- Settings: chip 0.1 MON, answer window 120s, proof window 60s, max lock 30 days.
- These short windows are for the demo. Production needs a much longer answer window.

Testnet only. The tokens have no monetary value.

An earlier deployment at `0xE626D763cF852a8BDBC3C67B86431b4a01B4da46` is superseded. It let an old double-spend report charge a newly funded bond, and it never held player funds.
