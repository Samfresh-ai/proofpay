# ProofPay Coston2 live settlement receipt

Observed: 2026-08-08. Network: Flare Testnet Coston2, chain ID `114`.

This is a receipt for one testnet invoice on the source-verified `ProofPayEscrow` at
`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`. It is not a claim of production, legal, fiat, or
audited escrow.

## Invoice and evidence

| Field | Value |
| --- | --- |
| Invoice ID | `1` |
| Milestone | Deploy and verify ProofPayEscrow on Coston2 |
| USD target | `$5.00` / `5,000,000` six-decimal atomic units |
| Freelancer | `0xB9CC4f51Bb837DC56998474961250287f40FA680` |
| Client | `0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42` |
| Delivery deadline | `1786275956` / `2026-08-09T11:45:56Z` |
| Scope hash | `0x3bf5d3c5e4c43cfd1d31f567803150989c95ae290f2b20196d132c9f03148eb9` |
| Evidence hash | `0x84670d349f4ccd01e15e8c6028d03bcc65ee56f072361cc03e44be9e7b927ca5` |
| Evidence URI | https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21 |

The scope and evidence hashes are `keccak256` commitments to the exact UTF-8 canonical JSON bytes
in `artifacts/live-scope-manifest.json` and `artifacts/live-evidence-manifest.json`.

The deadline was checkpointed as 24 hours after the prepare block. Because the live creation was
included after the separate gas setup and delayed RPC retries, its observed creation-to-deadline
interval was `84,940` seconds (`23h 35m 40s`), not the intended `86,400` seconds. The evidence and
settlement both completed well before that deadline; this timing variance is recorded rather than
described as an exact 24-hour onchain interval.

## Onchain settlement

| Observation | Atomic FXRP | FXRP |
| --- | ---: | ---: |
| Funded lock | `5,299,945` | `5.299945` |
| Freelancer payout | `4,818,748` | `4.818748` |
| Client refund | `481,197` | `0.481197` |
| Top-up | `0` | `0` |

The funding observation was raw XRP/USD `1,037,747` with six decimals at feed timestamp
`1786191119` (`2026-08-08T12:11:59Z`). The release observation was raw `1,037,614` with six
decimals at `1786191147` (`2026-08-08T12:12:27Z`). Payout plus refund equals the prior lock exactly:
`4,818,748 + 481,197 = 5,299,945` atomic FXRP.

Final FXRP balances were client `5.180252`, freelancer `4.819748`, and contract `0`. Relative to
the pre-flow snapshot, the client's FXRP fell by `4.818748` and the freelancer's rose by the same
amount. Active liabilities returned from the funded lock of `5.299945 FXRP` to `0`, and invoice
`1` is `RELEASED`.

The freelancer began with no C2FLR, so the client first sent exactly `1 C2FLR` as separate gas
setup. Final C2FLR balances were client `97.34732885` and freelancer `0.8682255`; their changes
reconcile with that transfer and the six confirmed transaction fees.

## Transactions

| Action | Transaction | Block |
| --- | --- | ---: |
| Separate gas setup | [`0xe59a…6170`](https://coston2-explorer.flare.network/tx/0xe59af5bf8adda39214a68489462b5f0a3a356be669554380e17759b71ab76170) | `33779786` |
| Create invoice | [`0x0de4…f298`](https://coston2-explorer.flare.network/tx/0x0de4d5979553124244b1677af47938d347b15f3fb8f773177b497413c8cff298) | `33779808` |
| Approve funding maximum | [`0x2bf0…3c55`](https://coston2-explorer.flare.network/tx/0x2bf02a049ad9fabc477c744189dca30a69ee0d37d3684fab3e304292c1c73c55) | `33779838` |
| Fund invoice | [`0x48e8…5e83`](https://coston2-explorer.flare.network/tx/0x48e8ffcc165c61c25efd2e91eef8aa550441d69b6e2cf5c8769affd24acd5e83) | `33779848` |
| Submit evidence | [`0x70c4…0fa1`](https://coston2-explorer.flare.network/tx/0x70c477613d2078a34d41e73fabb2e21665809f88403fbd481c5404a116b50fa1) | `33779864` |
| Release invoice | [`0xe3b7…41ee`](https://coston2-explorer.flare.network/tx/0xe3b7e5c5e965a8151222ef92febd1be5fb8b5913b2080e5faa528e5b94f141ee) | `33779874` |

No top-up transaction occurred. Before valid funding, an `eth_call` of `fundInvoice` with expired
deadline `1786191061` decoded to `ExpiredQuote(1786191061, 1786191062)`. No failing transaction was
sent, and same-block state and balance snapshots were identical.

## Evidence classification

Observed onchain:

- all six listed receipts succeeded on chain `114`;
- lifecycle events and stored invoice fields match the parties, target, deadline, hashes, prices,
  lock, payout, refund, and final state above;
- historical FXRP balance reads reconcile funding and release exactly;
- final active liabilities and contract FXRP balance are both zero.

Inferred from onchain and repository evidence:

- the exact canonical manifest files correspond to the onchain scope and evidence commitments;
- the verified explorer page is useful delivery evidence because its evidence submission was
  followed by a release signed by the named client wallet.

MVP limitations:

- Coston2 assets are test assets and do not represent fiat value;
- ProofPay is not audited, production-ready, legal escrow, fiat settlement, or a guarantee of USD
  stability;
- there is no arbitration, automatic release, or unilateral freelancer release;
- an evidence commitment proves byte integrity, not the truth or quality of the referenced work.

The orchestration ran from git commit `2aa2a2a75ca550de59c4e38920f4a59c1594acb1`. The complete
machine-readable receipt and transaction journal are `artifacts/coston2-settlement-receipt.json`
and `artifacts/coston2-live-invoice.json`.
