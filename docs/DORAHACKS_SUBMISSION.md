# DoraHacks submission draft

Status: **DRAFT — do not submit until every required release-checklist gate is
confirmed.**

## Project name

ProofPay

## Bounty

Interoperable Asset Products

## One-line description

ProofPay keeps freelance milestones priced in dollars while FXRP and FTSOv2
settle payouts and refunds transparently on Flare.

## Short product description

ProofPay is a one-milestone payment escrow prototype for freelancers, small
digital-service providers, and their clients. A freelancer quotes work in US
dollars while the client funds a smart contract with FXRP plus a fixed 10%
protection buffer. ProofPay reads Flare's FTSOv2 XRP/USD feed at funding and
release, using integer-safe upward rounding to preserve the dollar target. If
the FXRP lock covers the release-time payout, the contract pays the freelancer
and returns the exact surplus to the client. If it does not, release transfers
nothing and ProofPay shows the required top-up. The freelancer commits delivery
evidence before client-controlled release. Two complete Coston2 settlements,
verified contract source, decoded public receipts, deterministic tests, fuzz
properties, stateful invariants, and a live responsive application provide
independently inspectable testnet evidence. ProofPay is unaudited and not ready
for real funds.

## Problem

Cross-border freelancers commonly price milestone work in a stable unit such as
USD while clients may hold a volatile crypto asset. A lock that looked adequate
at funding can underpay the freelancer at release; a price rise can leave too
much client value trapped. Ordinary wallet transfers also do not encode the
agreed deadline, parties, scope commitment, delivery commitment, payout, refund,
or final liability. ProofPay makes that volatility decision explicit and leaves
a public testnet receipt.

## Target user

Freelancers, small digital-service providers, and clients paying milestone work.

## How it works

1. The freelancer creates one milestone with a six-decimal USD target, named
   client, delivery deadline, and scope-manifest hash.
2. The contract reads a fresh FTSOv2 XRP/USD funding price. It upward-rounds the
   base FXRP requirement and a second fixed 10% protection amount.
3. The client approves only a bounded FXRP amount and funds the invoice. The
   funding observation and actual lock become part of the receipt.
4. The freelancer submits a deterministic delivery-evidence hash and a bounded
   public URI. The commitment proves exact bytes, not work quality.
5. At release, FTSOv2 reprices the unchanged USD target. The contract
   upward-rounds the freelancer payout.
6. When the lock is sufficient, ProofPay pays the full target and refunds
   `locked - payout` to the client. When it is insufficient, release sends
   nothing and the interface derives `top-up required`; the client can add only
   the quoted shortfall before trying release again.
7. A funded but unsubmitted invoice can be refunded by its client strictly after
   the delivery deadline. A submitted invoice has no automatic or forced
   release in this prototype.

## How ProofPay uses Flare

- **FXRP** is the programmable XRP-derived asset that `ProofPayEscrow` locks,
  pays to the freelancer, and refunds to the client.
- **FTSOv2** is causal to every financial decision: the contract reads the
  XRP/USD value, decimals, and timestamp at funding, top-up, and release; an
  invalid, future, older-than-30-seconds, or nonzero-fee observation fails
  closed.
- **ProofPayEscrow** combines those primitives in an original Coston2 contract
  with immutable parties and terms, exact roles, upward-rounded math, aggregate
  FXRP liabilities, and no admin withdrawal path.
- **Coston2** provides the public verified deployment and already-confirmed
  lifecycle transactions used by the live application and decoded receipts.

FXRP supplies settlement value; FTSOv2 reprices the dollar promise; the contract
releases, refunds, or blocks; and Coston2 supplies inspectable testnet evidence.

## What was newly built

### Reference patterns inspected

The official Flare FAssets demo was inspected at commit
`16927d9594844350ae4e264464cc8662d48ffcaa` for chain selection, registry lookup,
FXRP discovery, FTSOv2 reads, and wallet-flow patterns. Its license evidence was
incomplete at that commit, so no source file or fragment was copied or
materially adapted. Exact attribution is in `docs/UPSTREAM.md`.

### Original Summer Signal work

- `ProofPayEscrow.sol`, its state/authority model, and its Coston2 deployment;
- the six-decimal pricing and fixed-protection model, exact payout/refund
  conservation, fail-closed oracle policy, and top-up barrier;
- the wallet application for creation, exact approvals, funding, evidence,
  top-up, release, cancellation, and refund intents;
- deadline conversion and a browser-local, quote-bound transaction journal with
  duplicate/conflict protection;
- the invoice-2 live browser settlement and the invoice-1 scripted settlement;
- deterministic receipt locators, independent event/state reconciliation, and
  public decoded receipt routes; and
- the production Escrow Flow interface, including its clearly labelled
  illustrative mechanism and responsive archival receipt.

## Technical evidence

- Production application: [https://proofpay.paysmat.xyz](https://proofpay.paysmat.xyz)
- Public GitHub repository: `https://github.com/Samfresh-ai/proofpay` — **pending
  publication, visibility, tag, clean-clone, and link confirmation before this
  draft may be submitted**
- Verified Coston2 contract: [`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21)
- Contract deployment: [`0xa223…f93a`](https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a)
- Invoice 1: [live invoice](https://proofpay.paysmat.xyz/invoice/1) · [decoded receipt](https://proofpay.paysmat.xyz/receipt/1) · [fund](https://coston2-explorer.flare.network/tx/0x48e8ffcc165c61c25efd2e91eef8aa550441d69b6e2cf5c8769affd24acd5e83) · [release](https://coston2-explorer.flare.network/tx/0xe3b7e5c5e965a8151222ef92febd1be5fb8b5913b2080e5faa528e5b94f141ee)
- Invoice 2: [live invoice](https://proofpay.paysmat.xyz/invoice/2) · [decoded receipt](https://proofpay.paysmat.xyz/receipt/2) · [create](https://coston2-explorer.flare.network/tx/0xe467d0a5205a4fbdd0ffbb2b8efc0d7cc41682c38245a07266125a59a9d36c7a) · [fund](https://coston2-explorer.flare.network/tx/0x60aa661a4c755b807a1911cce513603f103912226570ab9d9fafaf272eb3d857) · [evidence](https://coston2-explorer.flare.network/tx/0x91c0336de07ff5741c9f6d8e380d65e80d367c496da7abdae3d1373a6a6ec281) · [release](https://coston2-explorer.flare.network/tx/0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921)

Production currently maps exact READY deployment
`dpl_FAW3WmZqyeRunaxSkFqkPBu1T5Ny`, built from application commit
`78cfde3f3eeb3025f8eecdc4cb2d3db69f4c3d55`, to the canonical domain.

## Testing

Committed release evidence records:

- `69` passing Foundry tests: `56` deterministic; seven financial-fuzz tests,
  including six properties run `512` times each; and six stateful invariants run
  `128` times at depth `32`;
- 100% line, statement, branch, and function coverage for the production
  contract using Foundry's `--ir-minimum` coverage mode;
- `65` passing web unit tests in seven files;
- `27` passing deterministic one-worker browser tests and one production
  hydration test;
- browser tests for wallet roles, bounded approvals, quote identity, duplicate
  prevention, deadline conversion, receipt reconstruction, unknown/failure
  states, keyboard operation, reduced motion, and responsive layouts;
- 17 final visual captures with zero serious/critical Axe findings, horizontal
  overflow, console errors, page errors, signature requests, sends, or
  broadcasts; and
- both live Coston2 invoices independently reconciled with conserved locks and
  zero final active liabilities and contract FXRP balance.

These are automated technical checks, not a human-usability study, WCAG
certification, security audit, or mainnet proof.

## Known limitations

- Coston2 testnet assets only; no mainnet or real-funds activity is claimed.
- The contract and application have not been audited and are not
  production-ready (`PROD-005`, `UI-022`).
- There is no mediator, arbitration, automatic release, forced release, or legal
  escrow; a refusing client can leave submitted FXRP locked (`PROD-003`,
  `PROD-006`).
- There is no fiat or bank settlement (`PROD-004`).
- Evidence commitments prove bytes, not delivery truth or quality (`LIVE-004`).
- The transaction journal is local to one browser and cannot universally
  prevent cross-browser or cross-device conflict (`UI-012`).
- Generic receipt discovery is not implemented; only preserved invoice-1 and
  invoice-2 locators have decoded public receipts (`UI-006`, `UI-007`).
- Live top-up, cancellation, and missed-deadline refund have not all been
  demonstrated; those paths remain deterministic-test evidence (`UI-013`).
- Automated browser evidence does not prove human usability (`UI-016`).

## Roadmap

- Optional mediator or time-bounded resolution
- Multiple milestone support
- Mainnet hardening and independent external review
- FDC-backed XRP redemption proof
- Notifications and cross-device journal support

## Contact

[paysmat@paysmat.xyz](mailto:paysmat@paysmat.xyz)

## Judge quick path

1. Open the [landing page](https://proofpay.paysmat.xyz), read the first viewport,
   and change one clearly labelled illustrative release-price scenario.
2. Open [real invoice 2](https://proofpay.paysmat.xyz/invoice/2) and confirm
   `SETTLED`, the `2.126887 FXRP` lock, `1.933309 FXRP` payout, and `0.193578
   FXRP` refund.
3. Open [receipt 2](https://proofpay.paysmat.xyz/receipt/2), then reveal the
   lifecycle transactions and zero final liabilities.
4. Open the [release transaction on the Coston2 explorer](https://coston2-explorer.flare.network/tx/0x6e1b8c009e9021aa05d5aeabaf1e7effcbf0b15402ef7a4b153bfcf26a82d921).
5. Return to the [application](https://proofpay.paysmat.xyz/app); milestone
   creation is the primary action, and no signature is requested until a user
   explicitly proceeds with a wallet action.
