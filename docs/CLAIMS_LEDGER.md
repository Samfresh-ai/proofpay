# Claims ledger

Last updated: 2026-08-06

Statuses: `PROVED`, `PARTIAL`, `INFERRED`, `PLANNED`, `FALSE`.

| ID | Claim | Status | Evidence or constraint |
| --- | --- | --- | --- |
| RULE-001 | Flare Summer Signal closes on 2026-08-14. | PROVED | Canonical DoraHacks detail page; exact rendered cutoff recorded in `STATUS.md`. |
| RULE-002 | Payment flows using XRP/FXRP or FAssets fit Bounty 1. | PROVED | Canonical DoraHacks track page. |
| RULE-003 | Existing projects and ports are allowed when new work is separated clearly. | PROVED | Canonical event detail page. |
| RULE-004 | Judging uses product usefulness, Flare integration quality, technical execution, evidence of new work, and clarity/future potential. | PROVED | Canonical event detail page; no weights are published. |
| TECH-001 | Coston2 reports chain ID 114 through the selected RPC. | PROVED | Live RPC read recorded in `artifacts/flare-probe.json`. |
| TECH-002 | FXRP can be resolved through the current official discovery mechanism. | PROVED | The Contract Registry resolved `AssetManagerFXRP`; `fAsset()` resolved the token; metadata is recorded in `artifacts/flare-probe.json`. |
| TECH-003 | FTSOv2 returns XRP/USD value, decimals, and feed timestamp on Coston2. | PROVED | The Contract Registry resolved `FtsoV2`; a live `getFeedById` simulation is recorded in `artifacts/flare-probe.json`. |
| TECH-004 | A real user-approved FXRP transfer confirms between two test wallets on Coston2. | PROVED | Transaction `0x4c4394cfa2bbd2bed4a5125c4eacb34db8e7bd1a905e2dc9b9cbdf98e6d4503a` succeeded on chain 114 and moved exactly `0.001 FTestXRP`; receipt, log isolation, and before/after balances are recorded in `artifacts/flare-probe.json`. |
| TECH-005 | The pinned Foundry project compiles the official Coston2 registry, AssetManager/FXRP, production FTSOv2, OpenZeppelin SafeERC20, and ReentrancyGuard interfaces needed by the locked design. | PROVED | Historical Phase 2 evidence is preserved in commit `c3e850a`; the production escrow now directly imports FTSOv2, SafeERC20, ReentrancyGuard, and Math under the same pins, and `forge build --force` passes. |
| ARCH-001 | ProofPay has an implementation-ready state machine, authority model, data record, ABI, events, errors, and security invariants for its single-invoice FXRP MVP. | PROVED | `docs/ARCHITECTURE.md`, `docs/CONTRACT_SPEC.md`, `contracts/src/ProofPayEscrow.sol`, and 56 deterministic unit tests cover the specified core. Deployment and audit evidence remain absent. |
| ARCH-002 | The Phase 2 integer specification upward-rounds funding and payout and produces the four documented price-scenario results. | PROVED | `Math.mulDiv` uses upward rounding for both funding stages and payout; exact, overflow-resistant, and all four worked scenarios pass in the deterministic Foundry suites. Fuzz proof remains Phase 3B work. |
| TECH-006 | The implemented ProofPay escrow fails closed when the XRP/USD FTSO fee is nonzero or its observation is invalid or stale. | PROVED | Oracle tests cover fee preflight ordering, `UnsupportedFtsoFee`, external-read failure, zero/future/stale/malformed values, actual feed decimals, and explicit zero-value reads. This is unit evidence, not a deployed read. |
| TECH-007 | The ProofPay escrow exposes no owner, admin, rescue, arbitrary-recipient, or unrestricted withdrawal method. | PROVED | Production ABI inspection contains only constants/dependency getters, invoice/liability getters, quotes, and the nine specified lifecycle functions. |
| PROD-001 | ProofPay prevents an underfunded release from silently short-paying the freelancer. | PROVED | The `$0.90` deterministic case raises the exact `TopUpRequired`, preserves `SUBMITTED`, release observation and balances, and transfers zero; exact top-up then permits full payout. |
| PROD-002 | ProofPay refunds unused FXRP protection to the client. | PROVED | Deterministic `$1.25`, `$1.00`, and `$0.95` release cases pay the upward-rounded target and refund exactly `locked - payout`; payout plus refund equals the prior lock. |
| PROD-003 | ProofPay provides legal escrow or complete dispute resolution. | FALSE | Explicit non-goal and known limitation. |
| PROD-004 | ProofPay supports fiat or Nigerian bank settlement. | FALSE | Explicit non-goal. |
| PROD-005 | ProofPay is production-secure. | FALSE | No audit or production evidence exists. |
| PROD-006 | ProofPay automatically releases FXRP after the freelancer submits evidence. | FALSE | The named client must call release; the Phase 2 architecture honestly records that the client can refuse. |
| PROD-007 | ProofPay enforces the locked six-state invoice lifecycle and freelancer/client authorities. | PROVED | Deterministic lifecycle tests exercise every allowed transition, wrong-role rejection, terminal behavior, evidence replacement rejection, cancellation, and the strict unsubmitted-refund deadline. |
| PROD-008 | Active ProofPay FXRP liabilities cannot be cross-subsidized by another invoice or a direct donation during settlement. | PROVED | Multi-invoice tests track every funding/top-up/release/refund liability delta, preserve donations as surplus, and reject a settlement when aggregate liabilities exceed contract balance even though one invoice alone is covered. |
| DEPLOY-001 | A ProofPay contract is deployed on Coston2. | PLANNED | The production core now exists locally, but Phase 3A explicitly excluded deployment. No contract address or live escrow transaction is claimed. |
