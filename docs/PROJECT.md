# ProofPay project brief

Last verified: 2026-08-04

## Product

ProofPay lets a freelancer create a USD-priced milestone that a client funds with FXRP. Flare prices the milestone at funding and release, unused protection returns to the client, and an underfunded escrow cannot silently short-pay the freelancer.

The core user is a freelancer or small digital-service provider receiving a cross-border milestone payment. The freelancer needs proof of funding before work begins; the client needs controlled release after delivery; both need explicit handling of XRP/USD movement.

## Hackathon fit

Target: Flare Summer Signal, Bounty 1 — Interoperable Asset Products.

The canonical track page names payment or merchant flows, XRP/FXRP, and FAssets as eligible or priority directions. ProofPay's sponsor-native causal loop is therefore:

1. resolve and move FXRP on Coston2;
2. read XRP/USD through FTSOv2;
3. use the fresh price to determine the FXRP needed for a fixed USD milestone;
4. release enough FXRP to meet that target, refund any excess, or block release when funding is insufficient.

No product implementation may begin until the Phase 1 probe proves the sponsor operations with a real Coston2 transfer.

## Locked MVP scope

- Coston2 only; FXRP only; XRP/USD FTSO feed only.
- One milestone, one freelancer, and one client per invoice.
- Client approval is required for release.
- Public delivery URL, immutable evidence hash, and short completion note.
- Client funds the USD target plus a fixed 10% FXRP protection buffer.
- Unused FXRP returns to the client.
- If the buffer is insufficient, release is blocked until the client tops up.
- Wallets sign their own transactions; ProofPay never receives or stores private keys.
- The contract and Flare integration are the causal core.

Known limitation: the MVP has no arbitration or automatic release if a client refuses to approve submitted work.

## Non-goals

No marketplace, profiles, messaging, ratings, recurring invoices, multiple milestones, payroll, accounting, fiat payout, bank integration, multiple currencies or chains, DAO, arbitration, AI feature, token charts, backend database, indexer, subgraph, Redis, Docker infrastructure, microservices, workers, proxies, factories, generic oracle framework, component library, or generalized payments SDK.

## Financial rules reserved for later implementation

- USD amounts use six decimals.
- Contract calculations use integer arithmetic only.
- Funding and payout requirements round upward.
- A stale or invalid price blocks financial operations.
- A released invoice cannot pay twice.
- Freelancer payout plus client refund cannot exceed locked FXRP.
- Only the client funds, tops up, and releases; only the freelancer submits evidence.
- No unrestricted admin withdrawal exists.

These rules describe the approved target behavior. They are not implemented or proved in Phase 0.

## Phase gates

### Phase 0 — rules, licensing, and repository

Pass only when canonical event rules are recorded, upstream licensing status is verified, required documents exist, and no application or contract has been built.

### Phase 1 — Flare sponsor-operation probe

Pass only when the official mechanism resolves FXRP and FTSOv2, XRP/USD is read with its feed timestamp, a user-approved FXRP transfer confirms on Coston2, balances and transaction evidence are recorded, no secret enters the repository, and the probe is reproducible.

If manual signing is required, the durable status becomes `WAITING_FOR_USER`. If official operations cannot be proved after a bounded investigation, the probe fails and product implementation stops.

## Risks and current unknowns

- Two test wallets may not both be available in the browser wallet or the sender may lack FXRP/C2FLR.
- Current FAssets addresses and interfaces must be resolved rather than assumed.
- The reference demo declares MIT in its README but supplies no license text; its code is not reusable unless that ambiguity is resolved.
- DoraHacks displays an exact deadline in the viewer's timezone but does not label the event's source timezone.
- The event page gives no judging weights and no explicit repository-visibility requirement.

## Later interface specificity checklist

When Phase 5 is authorized, specify the product, user, visual thesis, typography, page sequence, interaction, motion, responsive behavior, and explicit avoid-list. This is the only method retained from the referenced landing-page prompt thread; none of its preset visual styles are adopted.

## Canonical sources

- Event detail: https://dorahacks.io/hackathon/flaresummersignal/detail
- Track detail: https://dorahacks.io/hackathon/flaresummersignal/tracks
- DoraHacks Terms of Use (updated 2026-05-05): https://dorahacks.io/legal/terms
- DoraHacks Code of Conduct (updated 2024-12-04): https://dorahacks.io/legal/code-of-conduct
- Flare Developer Hub: https://dev.flare.network/
- Landing-page specificity reference: https://x.com/aiwithmayank/status/2080228272911389138

