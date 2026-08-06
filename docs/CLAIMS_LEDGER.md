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
| TECH-003 | FTSOv2 returns XRP/USD value, decimals, and feed timestamp on Coston2. | PROVED | The Contract Registry resolved `FtsoV2`; the Phase 1 read is recorded in `artifacts/flare-probe.json`, and 24 further read-only samples are recorded in `artifacts/ftso-tolerance.json`. |
| TECH-004 | A real user-approved FXRP transfer confirms between two test wallets on Coston2. | PROVED | Transaction `0x4c4394cfa2bbd2bed4a5125c4eacb34db8e7bd1a905e2dc9b9cbdf98e6d4503a` succeeded on chain 114 and moved exactly `0.001 FTestXRP`; receipt, log isolation, and before/after balances are recorded in `artifacts/flare-probe.json`. |
| TECH-005 | The pinned Foundry project compiles the official Coston2 registry, AssetManager/FXRP, production FTSOv2, OpenZeppelin SafeERC20, and ReentrancyGuard interfaces needed by the locked design. | PROVED | Historical Phase 2 evidence is preserved in commit `c3e850a`; the production escrow now directly imports FTSOv2, SafeERC20, ReentrancyGuard, and Math under the same pins, and `forge build --force` passes. |
| ARCH-001 | ProofPay has an implementation-ready state machine, authority model, data record, ABI, events, errors, and security invariants for its single-invoice FXRP MVP. | PROVED | `docs/ARCHITECTURE.md`, `docs/CONTRACT_SPEC.md`, `contracts/src/ProofPayEscrow.sol`, 56 deterministic tests, six 512-run fuzz properties, and six 128-by-32 stateful invariants cover the specified core. Deployment and audit evidence remain absent. |
| ARCH-002 | The Phase 2 integer specification upward-rounds funding and payout and produces the four documented price-scenario results. | PROVED | Deterministic scenarios and bounded fuzz properties independently prove both upward-rounded funding stages, minimal upward-rounded payout, normalization at 0/6/12/18 decimals, exact top-up/refund differences, and no overflow in the documented Phase 3B domain. |
| TECH-006 | The implemented ProofPay escrow fails closed when the XRP/USD FTSO fee is nonzero or its observation is invalid or stale. | PROVED | Oracle tests cover fee preflight ordering, `UnsupportedFtsoFee`, external-read failure, zero/future/stale/malformed values, actual feed decimals, and explicit zero-value reads. The live sample returned zero fees but did not deploy or call the escrow. |
| TECH-007 | The ProofPay escrow exposes no owner, admin, rescue, arbitrary-recipient, or unrestricted withdrawal method. | PROVED | Final production ABI and opcode inspection contains only constants/dependency getters, invoice/liability getters, quotes, and the nine specified lifecycle functions; stateful token conservation found no unaccounted recipient. |
| TECH-008 | The sampled healthy Coston2 XRP/USD feed behavior supports the planned 30-second deployment freshness setting. | PROVED | `artifacts/ftso-tolerance.json` records 24/24 successful reads over 167.118 seconds: age min/median/max `0.737/4.684/21.984s`, zero failed reads, zero nonzero fees, and 8.016 seconds of headroom. This is a bounded sample, not a future-cadence guarantee. |
| PROD-001 | ProofPay prevents an underfunded release from silently short-paying the freelancer. | PROVED | The deterministic `$0.90` case and stateful forced-underfunding action preserve `SUBMITTED` and transfer zero; bounded fuzzing proves every successful payout meets the target and one fewer atomic unit would not. |
| PROD-002 | ProofPay refunds unused FXRP protection to the client. | PROVED | Deterministic scenarios, fuzzed release flows, and stateful ghost accounting show payout plus client refund equals the prior lock and the refund is exactly `locked - payout`. |
| PROD-003 | ProofPay provides legal escrow or complete dispute resolution. | FALSE | Explicit non-goal and known limitation. |
| PROD-004 | ProofPay supports fiat or Nigerian bank settlement. | FALSE | Explicit non-goal. |
| PROD-005 | ProofPay is production-secure. | FALSE | No audit or production evidence exists. |
| PROD-006 | ProofPay automatically releases FXRP after the freelancer submits evidence. | FALSE | The named client must call release; the Phase 2 architecture honestly records that the client can refuse. |
| PROD-007 | ProofPay enforces the locked six-state invoice lifecycle and freelancer/client authorities. | PROVED | Deterministic lifecycle tests plus a 14-action stateful handler exercise allowed, repeated, invalid, terminal, and unauthorized sequences; ghost records preserve terms, evidence, and terminal states. |
| PROD-008 | Active ProofPay FXRP liabilities cannot be cross-subsidized by another invoice or a direct donation during settlement. | PROVED | Deterministic multi-invoice tests and stateful invariants keep aggregate liabilities equal to active locks, never above balance, while direct donations remain exact non-liability surplus. |
| DEPLOY-001 | A ProofPay contract is deployed on Coston2. | PLANNED | The production core now exists locally, but Phase 3A explicitly excluded deployment. No contract address or live escrow transaction is claimed. |
