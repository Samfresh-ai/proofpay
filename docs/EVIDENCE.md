# ProofPay evidence guide

This guide maps public Coston2 records, committed machine evidence, tests, and
project screenshots without exposing internal review notes or submission
working files.

## Evidence boundaries

The `$100` scenarios on the landing page are illustrative calculations. They
make the settlement rule easy to inspect and never send a transaction.

Invoices `1` and `2` are different: they are real, already-settled Coston2
records read from the deployed contract. Their receipt routes fetch public
transaction receipts, decode the expected lifecycle events, verify preserved
manifest hashes, and reconcile current contract state.

None of this evidence proves mainnet readiness, an audit, legal escrow, fiat
settlement, production security, human usability, or the truth of submitted
delivery evidence.

## Contract deployment

| Field | Public proof |
| --- | --- |
| Contract | [`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21) |
| Deployment transaction | [`0xa223…f93a`](https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a) |
| Deployment block | `33775801` |
| Runtime bytecode hash | `0xd455d0ee1c99f901d571e25c4cf25902249097d8212d485417e7032ee3ff5338` |
| Source verification | Verified on the Coston2 explorer |
| Machine record | [`deployment/coston2.json`](../deployment/coston2.json) |

The expected and deployed runtime hashes match. The constructor records FXRP,
FTSOv2, the XRP/USD feed ID, and a 30-second maximum price age.

## Invoice 1 — scripted Coston2 settlement

- Live invoice: [proofpay.paysmat.xyz/invoice/1](https://proofpay.paysmat.xyz/invoice/1)
- Decoded receipt: [proofpay.paysmat.xyz/receipt/1](https://proofpay.paysmat.xyz/receipt/1)
- Target: `$5.00`
- Lock: `5.299945 FXRP`
- Payout: `4.818748 FXRP`
- Refund: `0.481197 FXRP`
- Top-up: none
- Final state: `RELEASED`; active liabilities `0`; contract FXRP balance `0`

| Action | Transaction | Block |
| --- | --- | ---: |
| Create | [`0x0de4…f298`](https://coston2-explorer.flare.network/tx/0x0de4d5979553124244b1677af47938d347b15f3fb8f773177b497413c8cff298) | `33779808` |
| Exact approval | [`0x2bf0…3c55`](https://coston2-explorer.flare.network/tx/0x2bf02a049ad9fabc477c744189dca30a69ee0d37d3684fab3e304292c1c73c55) | `33779838` |
| Fund | [`0x48e8…5e83`](https://coston2-explorer.flare.network/tx/0x48e8ffcc165c61c25efd2e91eef8aa550441d69b6e2cf5c8769affd24acd5e83) | `33779848` |
| Submit evidence | [`0x70c4…0fa1`](https://coston2-explorer.flare.network/tx/0x70c477613d2078a34d41e73fabb2e21665809f88403fbd481c5404a116b50fa1) | `33779864` |
| Release | [`0xe3b7…41ee`](https://coston2-explorer.flare.network/tx/0xe3b7e5c5e965a8151222ef92febd1be5fb8b5913b2080e5faa528e5b94f141ee) | `33779874` |

The release conserves the lock exactly:
`4.818748 + 0.481197 = 5.299945 FXRP`.

What this demonstrates: deployment compatibility, one complete lifecycle,
price-based funding and release, payout/refund conservation, zero final
liabilities, and a decoded public receipt. It does not demonstrate a browser
wallet flow; invoice `2` does.

## Invoice 2 — browser wallet-action settlement

- Live invoice: [proofpay.paysmat.xyz/invoice/2](https://proofpay.paysmat.xyz/invoice/2)
- Decoded receipt: [proofpay.paysmat.xyz/receipt/2](https://proofpay.paysmat.xyz/receipt/2)
- Target: `$2.00`
- Lock: `2.126887 FXRP`
- Payout: `1.933309 FXRP`
- Refund: `0.193578 FXRP`
- Top-up: none
- Final state: `RELEASED`; active liabilities `0`; contract FXRP balance `0`

| Action | Transaction |
| --- | --- |
| Create | [`0xe467…36c7`](https://coston2-explorer.flare.network/tx/0xe467d0a5205a4fbdd0ffbb2b8efc0d7cc41682c38245a07266125a59a9d36c7a) |
| Exact approval 1 · `2.167766 FXRP` | [`0xd207…f4c11`](https://coston2-explorer.flare.network/tx/0xd20702d104759670b06b3e8b0b48aa52c1259e08797c8d1f6ab1074a336f4c11) |
| Exact approval 2 · `2.168627 FXRP` | [`0xf843…de43`](https://coston2-explorer.flare.network/tx/0xf843a43e19f1a899874095e5bcecb4dfcc64a3f6f69ac739c7a290ea14dfde43) |
| Exact approval 3 · `2.168893 FXRP` | [`0x601f…96c9c`](https://coston2-explorer.flare.network/tx/0x601fd5134b75b8a94d4353e6765ccb95e1b2d0ea6e65e5fd121da0adf6596c9c) |
| Exact approval 4 · `2.169425 FXRP` | [`0x70f4…ecb0`](https://coston2-explorer.flare.network/tx/0x70f48a8ab45e54bcd85cbdfb90a9121147231fbef58f17a858df62afe728ecb0) |
| Fund | [`0x60aa…d857`](https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857) |
| Submit evidence | [`0x91c0…c281`](https://coston2-explorer.flare.network/tx/0x91c0336de07ff5741c9f6d8e380d65e80d367c496da7abdae3d1373a6a6ec281) |
| Release | [`0x6e1b…d921`](https://coston2-explorer.flare.network/tx/0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921) |

The live quote moved while approvals confirmed, so the application requested a
new bounded exact approval each time. The preserved journal records one
broadcast per transaction and no replay. The release conserves the lock:
`1.933309 + 0.193578 = 2.126887 FXRP`.

What this demonstrates: the visible browser action flow, bounded approvals,
funding, evidence commitment, release, browser-journal replay protection, and
independent receipt reconstruction. The private keys remained outside the page
and outside Git.

## Runtime machine evidence

These paths are intentionally committed because production receipt rendering,
reconciliation, or evidence verification consumes them:

| Path | Purpose |
| --- | --- |
| [`deployment/coston2.json`](../deployment/coston2.json) | Deployment receipt, constructor dependencies, bytecode comparison, explorer verification |
| [`artifacts/coston2-live-invoice.json`](../artifacts/coston2-live-invoice.json) | Invoice 1 transaction journal and locators |
| [`artifacts/coston2-settlement-receipt.json`](../artifacts/coston2-settlement-receipt.json) | Invoice 1 settlement snapshot and lifecycle locators |
| [`artifacts/live-scope-manifest.json`](../artifacts/live-scope-manifest.json) | Canonical invoice 1 scope bytes |
| [`artifacts/live-evidence-manifest.json`](../artifacts/live-evidence-manifest.json) | Canonical invoice 1 evidence bytes |
| [`artifacts/coston2-browser-invoice.json`](../artifacts/coston2-browser-invoice.json) | Invoice 2 browser journal and locators |
| [`artifacts/coston2-browser-settlement-receipt.json`](../artifacts/coston2-browser-settlement-receipt.json) | Invoice 2 settlement snapshot and lifecycle locators |
| [`artifacts/browser-scope-manifest.json`](../artifacts/browser-scope-manifest.json) | Canonical invoice 2 scope bytes |
| [`artifacts/browser-evidence-manifest.json`](../artifacts/browser-evidence-manifest.json) | Canonical invoice 2 evidence bytes |

Additional reproducible integration evidence:

- [`artifacts/flare-probe.json`](../artifacts/flare-probe.json) records Coston2
  registry, FXRP, FTSOv2, and a user-approved test-token transfer probe.
- [`artifacts/ftso-tolerance.json`](../artifacts/ftso-tolerance.json) records a
  bounded read-only XRP/USD freshness sample. It is not a future-cadence
  guarantee.
- [`artifacts/browser-settlement-verification.json`](../artifacts/browser-settlement-verification.json)
  records the preserved independent invoice 2 verification result.

Public wallet addresses and transaction hashes in these files are blockchain
identifiers, not credentials. Historical local paths in two provenance records
are harmless and are not used by production.

## Automated tests

The repository contains:

- `56` deterministic Foundry tests;
- seven financial fuzz tests, including six properties configured for `512`
  runs each;
- six stateful invariants configured for `128` runs at depth `32`;
- `65` web unit tests across seven files;
- `27` deterministic one-worker browser tests; and
- one production hydration test.

The contract suites exercise authorization, transitions, deadlines, FTSO
failure modes, integer rounding, exact transfer deltas, reentrancy, solvency,
conservation, fuzzed financial outcomes, and stateful liabilities. The web
suites exercise live/fixture separation, policy, transaction intent identity,
replay protection, repeated top-ups, ambiguous wallet results, accessibility,
keyboard interaction, hydration, and responsive behavior.

Run the commands in the root [README](../README.md). Automated passing tests are
engineering evidence, not an audit, WCAG certification, or production-security
approval.

## Public image set

Only a small judge-facing image set remains in the public tree:

- [Project cover](assets/cover-1200x630.png)
- [Landing page](assets/landing.png)
- [Application](assets/app.png)
- [Settlement receipt](assets/receipt.png)
- [Architecture](assets/architecture.png)

They show actual ProofPay interfaces or project diagrams. Intermediate design,
validation, loading, error, mobile-duplicate, and video-production captures are
kept outside the public repository.

## Known evidence limitations

- Testnet assets have no represented real-world value.
- The two completed invoices did not require a top-up; top-up behavior is
  covered by contract, unit, and deterministic browser tests rather than a
  manufactured live transaction.
- Only invoices `1` and `2` have preserved decoded receipt locators.
- Current party balances can change after a receipt snapshot; settlement
  invariants use pinned events, invoice state, conservation, liabilities, and
  contract balance rather than treating old wallet balances as immutable.
- An evidence hash proves exact bytes, not delivery truth or quality.
- No audit, mainnet deployment, legal-escrow status, fiat settlement,
  production-security review, or human-usability validation is claimed.
