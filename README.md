# ProofPay

Keep a milestone priced in dollars while settling it in FXRP.

## 1. Problem

A freelancer may quote work in dollars while a client funds with a volatile
crypto asset. If the asset falls before release, the freelancer can be
short-paid; if it rises, the client can leave unnecessary value locked. A
cross-border milestone also needs public evidence that the agreed lifecycle and
settlement actually occurred.

## 2. Product

ProofPay is a one-milestone escrow prototype for freelancers, small digital
service providers, and their clients. The freelancer defines a USD target,
client, deadline, and scope commitment. The client funds the contract with FXRP
plus 10% price protection. After the freelancer commits delivery evidence, a
fresh FTSOv2 XRP/USD observation determines whether the contract can pay the
full dollar target, refund the unused protection, or block release until the
client tops up.

ProofPay never stores a wallet private key. Financial actions are simulated
before the connected wallet is asked to approve or send them.

## 3. Live application

- Production: [proofpay.paysmat.xyz](https://proofpay.paysmat.xyz)
- Application: [proofpay.paysmat.xyz/app](https://proofpay.paysmat.xyz/app)
- Network: Flare Testnet Coston2, chain ID `114`
- Current production deployment: `dpl_FAW3WmZqyeRunaxSkFqkPBu1T5Ny`
- Deployed application commit: `78cfde3f3eeb3025f8eecdc4cb2d3db69f4c3d55`
- Public repository target: `https://github.com/Samfresh-ai/proofpay` — publication and clone
  verification remain release-checklist gates until confirmed.

The landing-page scenarios are explicitly illustrative and send no transaction.
Invoices and receipts below are read from real, already-settled Coston2 records.

## 4. Real Coston2 proof

Two invoices completed `CREATED -> FUNDED -> SUBMITTED -> RELEASED` on the
deployed contract:

| Proof | USD target | Locked FXRP | Payout | Refund | Final liabilities |
| --- | ---: | ---: | ---: | ---: | ---: |
| [Invoice 1](https://proofpay.paysmat.xyz/invoice/1) / [receipt](https://proofpay.paysmat.xyz/receipt/1) | $5.00 | 5.299945 | 4.818748 | 0.481197 | 0 |
| [Invoice 2](https://proofpay.paysmat.xyz/invoice/2) / [receipt](https://proofpay.paysmat.xyz/receipt/2) | $2.00 | 2.126887 | 1.933309 | 0.193578 | 0 |

In each receipt, payout plus refund equals the prior lock. The receipt verifier
checks the expected lifecycle event in every recorded transaction and reconciles
current invoice state, active liabilities, and contract FXRP balance. A delivery
commitment proves exact bytes, not the truth or quality of the work.

## 5. How the settlement works

1. The freelancer creates one USD-priced milestone with a named client,
   delivery deadline, and scope hash.
2. ProofPay reads a fresh FTSOv2 XRP/USD price. The contract upward-rounds the
   FXRP needed for the USD target, then upward-rounds a fixed 10% protection
   amount. The client approves only the bounded amount and funds the invoice.
3. The freelancer submits a nonzero evidence-manifest hash and a bounded public
   URI. The contract stores the commitment and emits the URI.
4. At release, the contract reads XRP/USD again and upward-rounds the FXRP payout
   needed to meet the original USD target.
5. If the lock covers the payout, the contract pays the freelancer and refunds
   the exact surplus to the client. If it does not, release transfers nothing
   and the interface derives a top-up-required state. A funded, unsubmitted
   invoice can instead be refunded by the client strictly after its deadline.

## 6. Why Flare is necessary

- **FXRP** supplies programmable XRP-derived value that an EVM contract can lock,
  pay, and refund.
- **FTSOv2** supplies the fresh XRP/USD observation used to reprice the unchanged
  dollar target at funding and release.
- **ProofPayEscrow** enforces the roles, deadlines, upward rounding, 10%
  protection, solvency, payout/refund conservation, and fail-closed top-up
  barrier.
- **Coston2** supplies public testnet transactions, verified source, and receipts
  that a judge can inspect independently.

Without both FXRP and FTSOv2, the contract could not settle XRP-derived value
against a dollar-denominated promise without trusting an application-side
conversion.

## 7. Architecture

```text
Freelancer / Client wallet
        ↓
ProofPay web application
        ↓
ProofPayEscrow on Coston2
   ├── FXRP
   └── FTSOv2 XRP/USD
        ↓
Public settlement receipt
```

The Next.js application reads the official Coston2 RPC directly, prepares
role-aware wallet actions with wagmi and viem, and maintains a browser-local
transaction journal. `ProofPayEscrow.sol` is the settlement authority. Preserved
transaction locators let the receipt route decode exact lifecycle events without
presenting the local journal as a chain indexer.

## 8. Contract and deployment

- Contract: [`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21)
- Deployment transaction: [`0xa223…f93a`](https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a)
- FXRP: [`0x0b6A3645c240605887a5532109323A3E12273dc7`](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7)
- FTSOv2: `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d`
- XRP/USD feed ID: `0x015852502f55534400000000000000000000000000`
- Compiler: Solidity `0.8.25`, optimizer `200`, via IR, Cancun EVM
- Deployment block: `33775801`; source status: verified on the Coston2 explorer

The constructor pins Coston2 chain ID `114`, six-decimal FXRP, the XRP/USD feed,
and a 30-second maximum price age. The contract has no owner, admin, rescue,
arbitrary-recipient, or unrestricted-withdrawal method.

## 9. Live invoices and receipts

| Lifecycle evidence | Invoice 1 | Invoice 2 |
| --- | --- | --- |
| Create | [`0x0de4…f298`](https://coston2-explorer.flare.network/tx/0x0de4d5979553124244b1677af47938d347b15f3fb8f773177b497413c8cff298) | [`0xe467…6c7a`](https://coston2-explorer.flare.network/tx/0xe467d0a5205a4fbdd0ffbb2b8efc0d7cc41682c38245a07266125a59a9d36c7a) |
| Exact approval | [`0x2bf0…3c55`](https://coston2-explorer.flare.network/tx/0x2bf02a049ad9fabc477c744189dca30a69ee0d37d3684fab3e304292c1c73c55) | [`0x70f4…ecb0`](https://coston2-explorer.flare.network/tx/0x70f48a8ab45e54bcd85cbdfb90a9121147231fbef58f17a858df62afe728ecb0) |
| Fund | [`0x48e8…5e83`](https://coston2-explorer.flare.network/tx/0x48e8ffcc165c61c25efd2e91eef8aa550441d69b6e2cf5c8769affd24acd5e83) | [`0x60aa…d857`](https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857) |
| Evidence | [`0x70c4…0fa1`](https://coston2-explorer.flare.network/tx/0x70c477613d2078a34d41e73fabb2e21665809f88403fbd481c5404a116b50fa1) | [`0x91c0…c281`](https://coston2-explorer.flare.network/tx/0x91c0336de07ff5741c9f6d8e380d65e80d367c496da7abdae3d1373a6a6ec281) |
| Release | [`0xe3b7…41ee`](https://coston2-explorer.flare.network/tx/0xe3b7e5c5e965a8151222ef92febd1be5fb8b5913b2080e5faa528e5b94f141ee) | [`0x6e1b…d921`](https://coston2-explorer.flare.network/tx/0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921) |

Invoice 1 was executed by a narrow Coston2 live-flow script. Invoice 2 was
executed through the browser wallet-action interface. Neither required a top-up.

## 10. What was built during Summer Signal

ProofPay's implementation is original work produced during Summer Signal:

- the single-milestone `ProofPayEscrow` contract and authority/state model;
- integer-safe USD-to-FXRP pricing, 10% protection, payout/refund conservation,
  and top-up-required policy;
- deterministic, fuzz, and stateful invariant contract suites;
- the wallet application, exact-approval funding flow, evidence builder,
  deadline conversion, and browser-local transaction journal;
- two live Coston2 settlement flows, preserved transaction locators, and an
  independent decoded receipt verifier; and
- the deployed Escrow Flow landing, application, invoice, and archival receipt
  interface.

The official FAssets demo was inspected for reference patterns only. No file or
code fragment from it was copied or materially adapted.

## 11. Upstream references and attribution

- [Flare Developer Hub](https://dev.flare.network/) and the pinned
  `flare-periphery` Coston2 interfaces
- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts)
  for `IERC20`, `SafeERC20`, `ReentrancyGuard`, and `Math`
- [Foundry forge-std](https://github.com/foundry-rs/forge-std) for contract tests
- [Flare FAssets demo](https://github.com/flare-foundation/fassets-demo-dapp/tree/16927d9594844350ae4e264464cc8662d48ffcaa), inspected as reference-only because its license grant was incomplete at that commit

Exact pins, license findings, and the no-copy decision are recorded in
[`docs/UPSTREAM.md`](docs/UPSTREAM.md). Third-party notices remain governed by
their own licenses; ProofPay's original source is available under the root MIT
License.

## 12. Local setup

Requirements: Node.js `22`, npm, Git, and Foundry for Solidity checks.

After the public-repository release gate confirms the repository URL:

```bash
git clone https://github.com/Samfresh-ai/proofpay.git
cd proofpay
git submodule update --init --recursive
npm ci
npm run dev
```

Open `http://localhost:3000`. The default data mode performs read-only calls to
the official public Coston2 RPC; no private key or `.env` file is required to
view the settled invoices and receipts. A wallet is required only for explicit
wallet actions. Do not use real funds.

For a production build with canonical metadata:

```bash
NEXT_PUBLIC_SITE_URL=https://proofpay.paysmat.xyz npm run build
npm run start
```

## 13. Tests and verification

The committed Phase 6B2 release evidence records:

- `65` passing web unit tests in seven files;
- `27` passing deterministic one-worker browser tests plus one production
  hydration test;
- `69` passing Foundry tests: `56` deterministic tests, seven financial-fuzz
  tests (six properties at `512` runs each), and six stateful invariants at
  `128` runs and depth `32`; and
- 17 final visual captures with zero serious/critical Axe findings, horizontal
  overflow, console errors, page errors, signature requests, sends, or
  broadcasts.

Run the reproducible local checks:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx playwright install chromium
npm run test:e2e
npm run scan:browser-secrets
npm run reconcile:interface:coston2
npm run verify:browser-live:coston2
cd contracts
forge fmt --check
forge build --force
forge test
```

The two reconciliation commands use public RPC reads and existing artifacts;
they do not authorize or send a transaction. The final Phase 7A release
checklist records the fresh rerun status separately from the committed Phase
6B2 baseline.

## 14. Known limitations

- Testnet assets only: Coston2 FXRP and C2FLR have no represented real-world
  value here.
- No audit or production-security review has been completed.
- No arbitration, mediator, automatic release, or forced release exists. A
  client can leave a submitted invoice locked by refusing release.
- ProofPay is not legal escrow and provides no fiat or bank settlement.
- An evidence commitment proves exact bytes, not delivery truth or work quality.
- The transaction journal is browser-local; it is not cross-browser or
  cross-device coordination and is not a generic chain indexer.
- Only two released invoices have preserved decoded receipt locators; arbitrary
  historical receipt discovery is not implemented.
- ProofPay is a hackathon prototype and is not production-ready.

## 15. Roadmap

- Add an optional mediator or time-bounded resolution path.
- Support multiple milestones while preserving per-milestone liabilities.
- Complete mainnet hardening and independent external review before any real
  asset use.
- Add FDC-backed XRP redemption proof.
- Add notifications and safe cross-device journal coordination.

## 16. Contact

[paysmat@paysmat.xyz](mailto:paysmat@paysmat.xyz)
