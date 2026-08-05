# ProofPay durable status

Updated: 2026-08-06 00:20 WAT

## Current state

- Active phase: Phase 0, Phase 1, Phase 2, and Phase 3A complete.
- Overall decision: `PHASE_3A_PASS`; fuzz and invariant testing remains a separate Phase 3B
  decision.
- Application UI: not started.
- Escrow contract: production core implemented and deterministically unit-tested; not deployed or
  audited.
- Foundry: pinned production contract, deterministic mocks, and 56 Phase 3A unit tests. Fuzz and
  invariant tests have not started.
- Deployment: not started.
- Repository secrets: none. Disposable test-wallet secrets remain outside the repository in an owner-only local file; no secret value is recorded in project evidence.

## Phase 0 — rules, licensing, and repository setup

Gate: `PASS`

### Canonical event rules

- Format and eligibility: open, virtual hackathon for builders. Participants may build from scratch, bring an existing project, or port an existing product. Existing work must be separated from work newly built, ported, integrated, or improved during the program.
- Platform eligibility: DoraHacks Terms require legal capacity, compliance with local law, and exclusion of sanctioned/excluded jurisdictions or individuals. Minors generally need parent/guardian permission and supervision; under 13, or under 16 in the UK/EU, cannot register.
- Deadline: 2026-08-14. The canonical page rendered the exact cutoff as `2026/08/14 20:59` in an `Africa/Lagos` browser timezone: 20:59 WAT / 19:59 UTC. The event text itself publishes only the date, not a source timezone; recheck before submission.
- Bounty 1 — Interoperable Asset Products: $6,000 total; first $4,000; second $2,000. XRP/FXRP and FAssets are priority areas; payment or merchant flows are explicitly eligible.
- Bounty 2 — Confidential Compute Apps: $6,000 total; first $4,000; second $2,000.
- Total prize pool: $12,000.
- Submission: project name; selected bounty; short product description; target user; demo/video/working-app link; GitHub repository or technical materials; explanation of Flare use; explanation of new/ported/integrated/improved work; contract addresses or deployment details when applicable; roadmap/next steps.
- Encouraged, not strict: deployment network; distribution/testing/user feedback; community, pilot, partner, or traction evidence.
- Judging: product usefulness; meaningful Flare integration; technical execution; evidence of new work; clarity and future potential. No weights are published.
- Repository/deployment rule: no explicit public-repository requirement and no mandatory network deployment is stated on the event page. Smart-contract/deployment details apply when relevant.
- Conduct: original, honest work with attribution; plagiarism, misrepresentation, IP infringement, fraud, harassment, and voting/ranking manipulation are prohibited.

Sources inspected:

- https://dorahacks.io/hackathon/flaresummersignal/detail
- https://dorahacks.io/hackathon/flaresummersignal/tracks
- https://dorahacks.io/legal/terms
- https://dorahacks.io/legal/code-of-conduct

### Repository and upstream evidence

- Fresh local repository initialized at `proofpay/` on branch `main`.
- Required documents created: `PROJECT.md`, `UPSTREAM.md`, `CLAIMS_LEDGER.md`, and `STATUS.md`.
- Official FAssets demo inspected at commit `16927d9594844350ae4e264464cc8662d48ffcaa`.
- Licensing status verified: README declares MIT, but no license text, root license metadata, or GitHub-detected license exists. Therefore no demo source was copied or materially adapted.
- Landing-page prompt thread inspected only for its specificity checklist.
- No application, escrow contract, or deployment code exists.

### Phase 0 risks and unknowns

- Upstream source reuse remains blocked by incomplete license evidence.
- DoraHacks does not publish judging weights or label the event's source timezone.
- Test-wallet availability, FXRP balances, C2FLR gas, official address resolution, and live FTSO behavior remain Phase 1 questions.

### Phase 0 completion record

- Commit subject: `chore: initialize ProofPay project`
- Evidence checks: clean fresh repository, required files present, no `src/`, `contracts/`, or deployment implementation created.

## Phase 1 — Flare sponsor-operation probe

Gate: `PASS`

### Live sponsor-operation evidence

- RPC: official Coston2 endpoint `https://coston2-api.flare.network/ext/C/rpc`.
- Actual chain ID: `114`; validation observed block: `33669285`.
- Flare Contract Registry: `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019`.
- `AssetManagerFXRP` resolved through the registry to `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA`.
- `fAsset()` resolved the Coston2 token to `0x0b6A3645c240605887a5532109323A3E12273dc7`.
- Token metadata: name `FXRP`, symbol `FTestXRP`, decimals `6`.
- `FtsoV2` resolved through the registry to `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d`.
- XRP/USD feed `0x015852502f55534400000000000000000000000000`: raw value `1067990`, decimals `6`, integer-safe display `1.06799`, feed timestamp `1785957045` (`2026-08-05T19:10:45.000Z`).
- Evidence artifact: `artifacts/flare-probe.json`.

### Wallet and funding evidence

- Reused the existing disposable Coston2 wallets; no wallet was regenerated.
- Sender: `0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42`.
- Recipient: `0xB9CC4f51Bb837DC56998474961250287f40FA680`.
- Secret storage: `~/.local/share/proofpay/coston2-burner-wallets.json`, outside the repository; directory mode `0700`, file mode `0600`, owned by the current user. Secret values were never displayed or copied into evidence.
- Before funding, official Coston2 RPC reads showed both wallets at `0 C2FLR` and `0 FTestXRP`, with no persisted transaction hash or receipt to reconcile.
- The official Flare Coston2 faucet reported sending `100 C2FLR` and `10 FXRP` to the sender. RPC reads at pre-transfer block `33668950` confirmed the sender held exactly `100 C2FLR` and `10 FTestXRP`; the recipient held `0 FTestXRP`.

### Confirmed transfer evidence

- Exact transfer: `0.001 FTestXRP` (`1000` atomic units) from the saved sender to the saved recipient.
- Transaction: `0x4c4394cfa2bbd2bed4a5125c4eacb34db8e7bd1a905e2dc9b9cbdf98e6d4503a`.
- Explorer: https://coston2-explorer.flare.network/tx/0x4c4394cfa2bbd2bed4a5125c4eacb34db8e7bd1a905e2dc9b9cbdf98e6d4503a
- Receipt: success on Coston2 chain `114`, block `33668951`, timestamp `2026-08-05T18:55:06.000Z`; `335` confirmations at final validation.
- Sender FTestXRP: `10` at block `33668950` to `9.999` at block `33668951` (`-0.001`).
- Recipient FTestXRP: `0` at block `33668950` to `0.001` at block `33668951` (`+0.001`).
- Sender C2FLR: `100` to `99.9016056`; the `-0.0983944 C2FLR` change equals the confirmed gas fee (`151376` gas at `650000000000` wei).
- Independent validation matched the current FXRP contract, exact calldata, sender, recipient, amount, zero native transaction value, one matching FXRP `Transfer` log, no unrelated ERC-20 transfer log, and historical before/after block-state balances.

### Probe implementation and checks

- Added the narrow TypeScript probe at `scripts/probe-flare.ts`; it provisions or reuses two disposable burners in fixed owner-only storage, prepares exactly `0.001 FXRP`, enforces Coston2 chain `114` before signing, saves the submitted hash before waiting, and independently validates the confirmed receipt and balances. No command accepts a private key, mnemonic, or seed argument.
- Added only the current probe dependencies: `viem` for typed RPC/ABI operations, `tsx` to execute TypeScript, TypeScript for strict checking, and Node type definitions.
- `npm install`: passed; zero reported vulnerabilities.
- `npm run typecheck`: passed.
- `npm run probe:flare -- --validate`: passed for chain, registry, FXRP metadata, FTSOv2, receipt, calldata, event-log isolation, and historical balance deltas.
- Recovery guards refuse to overwrite prepared or transaction evidence with a read-only snapshot or a second preparation; expected-failure checks preserved the confirmed artifact byte-for-byte.

### Phase completion and next decision

Phase 1 proved both sponsor operations required by the project gate: a live FTSOv2 XRP/USD read
and a real confirmed FXRP transfer on Coston2. Phase 2 was authorized later; no contract, frontend,
or landing page was started during Phase 1.

## Phase 2 — contract architecture and interface probe

Gate: `PASS`

### Locked architecture

- Added `docs/ARCHITECTURE.md` and `docs/CONTRACT_SPEC.md` as the implementation boundary for the
  future escrow.
- Persistent states are exactly `CREATED`, `FUNDED`, `SUBMITTED`, `RELEASED`, `CANCELLED`, and
  `REFUNDED`. `TOP_UP_REQUIRED` is derived and never stored.
- The freelancer creates, submits evidence, and cancels before funding. The named client alone
  funds, tops up, releases, and refunds a funded but unsubmitted invoice strictly after its
  delivery deadline.
- Evidence may be submitted through the exact delivery-deadline timestamp; refund becomes valid
  only after it. A submitted invoice has no refund or automatic-release path.
- The client can refuse release after evidence submission. The MVP has no mediator, arbitration,
  or unilateral freelancer release.
- Terms fixed at creation become immutable after funding. Funding and release observations retain
  the raw price, returned decimals, and feed timestamp.
- The evidence manifest hash is stored; its bounded URI is emitted once in `EvidenceSubmitted`.
  The contract treats the URI as untrusted text.

### Price and settlement policy

- USD target and FXRP token units both use six decimals.
- Required FXRP atomic units are `ceil(usdTarget * 10^feedDecimals / price)` using full-precision
  integer math.
- Funding applies a second upward-rounded fixed 10% buffer.
- Release upward-rounds the freelancer payout, refunds only `locked - payout`, and transfers
  nothing when locked FXRP is insufficient.
- The four locked `$100.000000` examples produce payout/refund/top-up results of `80/30/0`,
  `100/10/0`, `105.263158/4.736842/0`, and `0/0/1.111112` FXRP for release prices of `$1.25`,
  `$1.00`, `$0.95`, and `$0.90` respectively.
- XRP/USD uses the Phase 1 feed ID and the production `FtsoV2Interface`. Values must be positive,
  decimals must be `0..18`, timestamps must be nonzero and not future, and age must be at most 30
  seconds.
- Flare documents block-latency updates at approximately 1.8 seconds. The 30-second maximum is a
  ProofPay fail-closed risk policy, not a Flare-mandated constant.
- Quote, fund, top-up, and release calls use a fresh read with no cache. Client financial actions
  enforce an absolute quote deadline and caller-supplied maximum amount.

### Pinned Foundry interface probe

- Foundry project root: `contracts/`; Solidity: `0.8.25`.
- Flare Foundry periphery: `0.1.52` at
  `ca264d6a31ddfb53d1bef7cb7bd1942aa89d323a`.
- OpenZeppelin Contracts: `v5.7.0` at
  `cab19933c33c2ad1d4c7a84864a3601dddfd16f3`.
- forge-std: `v1.16.2` at `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`.
- The abstract `Phase2InterfaceProbe` compiles the exact official Coston2 registry,
  `IAssetManager.fAsset()`, ERC-20, production FTSOv2, SafeERC20, and ReentrancyGuard surfaces.
- The probe has no external entry point, invoice storage, settlement logic, deployment script, or
  deployed address.

### Phase 2 validation

- `forge fmt --check`: passed.
- `forge build`: passed with Solidity `0.8.25`.
- `forge test`: passed one narrow Phase 1 network-constant test; no business-logic tests exist.
- Independent BigInt verification matched the funding amount and all four worked integer examples.
- `npm run typecheck`: passed.
- Repository secret scan: passed; no secret value or wallet credential is present in the Phase 2
  changes.
- `git diff --check`: passed.
- Final scope inspection found no `ProofPayEscrow`, deployment, frontend, or landing-page code.

### Phase completion and next decision

Phase 2 makes the contract state machine, authority, math, FTSO freshness rule, public receipt,
events, errors, invariants, and Phase 3 test matrix implementation-ready. It proves dependency and
interface compilation only. Decide separately whether to authorize Phase 3 contract implementation.

## Phase 3A — escrow implementation and deterministic unit tests

Gate: `PASS`

### Implemented contract

- Added `contracts/src/ProofPayEscrow.sol` with exactly the persistent states `CREATED`, `FUNDED`,
  `SUBMITTED`, `RELEASED`, `CANCELLED`, and `REFUNDED`. `TOP_UP_REQUIRED` remains derived.
- Enforced only `CREATED -> FUNDED -> SUBMITTED -> RELEASED`, `CREATED -> CANCELLED`, and
  `FUNDED -> REFUNDED`, with the locked freelancer/client authorities and exact deadline
  boundaries.
- The constructor requires Coston2 chain ID `114`, code-bearing nonzero FXRP and FTSOv2
  dependencies, six FXRP decimals, a nonzero XRP/USD feed ID, and a nonzero maximum price age.
- Every price-dependent path first checks `calculateFeeById`. A nonzero result raises
  `UnsupportedFtsoFee`; an external fee/read failure raises `PriceReadFailed`; the production
  `getFeedById` call sends explicitly zero native value and rejects invalid or stale observations.
- Funding and payout use full-precision `Math.mulDiv` with upward rounding. Funding performs the
  base conversion and fixed 10% protection as two distinct upward-rounded stages.
- Funding/top-up transfer only the current calculated requirement. Release transfers nothing when
  per-invoice FXRP is insufficient; otherwise freelancer payout plus client refund equals the
  historical lock. Refund returns the complete unsubmitted lock.
- `activeFxrpLiabilities` tracks all `FUNDED` and `SUBMITTED` deposits. Every financial path checks
  current aggregate solvency, exact incoming/outgoing token deltas, and uses
  checks-effects-interactions under `ReentrancyGuard`.
- Evidence stores only one nonzero manifest hash and emits one opaque URI bounded to 256 bytes.
- The ABI has no owner, admin, pause, rescue, fee reserve, native-token accounting, arbitrary
  recipient, or unrestricted withdrawal path.
- The Phase 2-only abstract interface probe and its constant test were removed only after the
  production contract compiled against the same pinned Flare and OpenZeppelin imports.

### Deterministic unit evidence

- `contracts/test/ProofPayEscrowOracle.t.sol`: constructor, FTSO fee/read failures, invalid and
  stale observations, returned decimals, explicit zero-value feed call, quote neutrality, deadline,
  full-precision math, and two-stage rounding.
- `contracts/test/ProofPayEscrow.t.sol`: creation, every role, funding, exact transfers and rollback,
  evidence/hash/URI limits, cancellation, and strict unsubmitted refund behavior.
- `contracts/test/ProofPayEscrowSettlement.t.sol`: all four locked price scenarios, exact top-up,
  release conservation, duplicate release, aggregate liabilities, donation isolation,
  cross-subsidy rejection, token-delta rollback, and fund/top-up/release/refund reentrancy
  attempts.
- `forge fmt --check`: passed.
- `forge build --force`: passed with Solidity `0.8.25` and the pinned dependencies.
- `forge test -vv`: passed the complete deterministic suite; no fuzz or invariant test is present.
- Plain `forge coverage` was run and hit a compiler `stack too deep` error because Foundry disables
  the configured IR pipeline for its default coverage mode. Foundry's documented
  `forge coverage --ir-minimum` workaround passed. The coverage review added a missing funding
  quote deadline case, removed two redundant unreachable per-invoice balance branches, and added
  the remaining insufficient-top-up-balance failure case instead of testing trivial getters.
  Final production-contract coverage was 100% lines, statements, branches, and functions; mock
  helper branches were intentionally not padded with trivial tests.
- `npm run typecheck`: passed.
- Repository secret scan: passed. The only private-key-shaped source fields generate or load the
  ignored owner-only Phase 1 wallet file; no value is embedded. All 64-hex repository candidates
  are the already recorded public transaction/hash evidence.
- `git diff --check`: passed.

### Phase 3A changes from the Phase 2 specification

The Phase 3A authorization explicitly superseded three Phase 2 interface details:

- the constructor now receives feed ID and maximum price age as explicit third and fourth
  dependencies instead of fixing them in a two-argument constructor;
- every price read now performs the official `calculateFeeById` preflight and may raise the newly
  mandated `UnsupportedFtsoFee` error;
- aggregate active liabilities are exposed through a read-only generated getter so deterministic
  tests and later receipts can verify solvency.

The Foundry profile also enables `via_ir` because the exact public invoice record exceeds the
legacy code generator's stack limit. No approved product behavior changed.

### Remaining limitations

- This phase supplies deterministic unit evidence only. Fuzz/stateful invariant testing belongs to
  Phase 3B, and no deployment or live escrow receipt exists.
- A submitted invoice still has no mediator, arbitration, timeout refund, automatic release, or
  unilateral freelancer release. A refusing client can leave FXRP locked indefinitely.
- Evidence hash and URI bind a public submission but do not prove its truth or quality.
- A future nonzero FTSOv2 fee fails closed and requires an architecture revision.
- Direct FXRP donations remain stranded by design. No audit or production-security claim is made.
