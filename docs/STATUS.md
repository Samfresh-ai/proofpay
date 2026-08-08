# ProofPay durable status

Updated: 2026-08-08 11:04 WAT

## Current state

- Active phase: Phase 0, Phase 1, Phase 2, Phase 3A, Phase 3B, and Phase 4A complete.
- Overall decision: `PHASE_4A_PASS`; the confirmed Coston2 contract is ready for a separate live
  invoice-flow decision.
- Application UI: not started.
- Escrow contract: production core implemented, fuzzed, statefully invariant-tested, deployed to
  Coston2, and source-verified; not audited or claimed production-ready.
- Foundry: pinned production contract, deterministic mocks, 56 Phase 3A unit tests, seven passing
  Phase 3B financial-math tests, and six passing stateful invariants.
- Deployment: `ProofPayEscrow` is confirmed at
  `0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21` on Coston2 chain `114`; deployment and verification
  evidence is in `deployment/coston2.json`.
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

## Phase 3B — economic fuzzing, stateful invariants, and live FTSO tolerance

Gate: `PASS`

### Checkpoint 1 of 3 — financial fuzz testing

- Added `contracts/test/ProofPayEscrowFuzz.t.sol` without changing production contract code. Six
  fuzz properties run 512 cases each, plus one deterministic supported-range endpoint test.
- The documented fuzz domain is a USD target of `1..1e18` six-decimal units (`$0.000001` through
  `$1,000,000,000,000`), feed decimals `0..18`, and normalized XRP/USD prices from `$0.01` through
  `$100` where the selected decimal precision can represent that value. At zero decimals the
  representable lower bound is `$1`.
- Required payout matched an independent integer ceiling, always met the rational USD target, and
  one fewer FXRP atomic unit always failed it. Funding matched the exact two-stage calculation:
  upward-rounded base conversion followed by an upward-rounded 10% buffer.
- Release flows conserved the prior invoice lock exactly; quote branches returned either
  `locked - payout` as the refund or `payout - locked` as the top-up, never both. Normalization
  matched at 0, 6, 12, and 18 feed decimals.
- The minimum and maximum supported-domain endpoints completed without overflow or truncation.
  The maximum case produced a `1e20`-atomic payout and `1.1e20`-atomic protected funding amount.
- `/home/samfresh22/.foundry/bin/forge test --match-contract ProofPayEscrowFuzzTest -vv`: passed
  seven tests, zero failed, zero skipped. Each fuzz property completed 512 runs.
- Defects found: none. Production code changes: none.

### Checkpoint 2 of 3 — stateful invariant testing

- Added `contracts/test/ProofPayEscrowInvariant.t.sol` with one freelancer, one client, one
  unauthorized actor, the existing `MockFXRP` and `MockFtsoV2`, three seeded invoices, and up to
  eight tracked invoices per run.
- The handler targets 14 actions: create, fund, submit, top up, release, cancel, deadline refund,
  time advance, valid price change, invalid/stale/fee/reverting price configuration, direct token
  donation, unauthorized calls, repeated terminal calls, and a forced underfunded release attempt.
- Ghost accounting independently tracks active liabilities, direct donations, client deposits and
  refunds, freelancer payouts, immutable creation/funding/evidence records, terminal invoice
  records, and per-invoice terminal action counts.
- Six invariants passed: aggregate active locks equal both ghost and contract liabilities;
  liabilities remain solvent; donations remain exact non-liability surplus; funded terms,
  evidence, and terminal records remain immutable; terminal transfers cannot repeat; only the
  named parties receive escrow outflows; and all token supply remains at the client, freelancer,
  escrow, or handler donation source with no unrestricted recipient.
- Handler assertions also proved that unauthorized actions and every failed/underfunded release
  leave invoice state, liabilities, party balances, and contract balance unchanged; successful
  release pays the freelancer plus refunds the client exactly the prior lock; and cancellation or
  deadline refund conserves balances.
- Configuration: 128 invariant runs, depth 32, 4,096 handler calls per invariant, zero handler
  reverts or discarded calls. Reproducible seed:
  `0x000000000000000000000000000000000000000000000000000000003b202608`.
- The initial harness run exposed a targeting error: specifying selectors without an explicit
  target contract let Foundry call deployed mocks and the escrow directly. The smallest reproducer
  was one direct non-handler call, for example `MockFtsoV2.getFeedById` with a random unconfigured
  feed ID raising `UnexpectedFeedId`; random direct lifecycle calls similarly raised
  `InvoiceNotFound`. Foundry did not print a seed. Adding the handler as the sole target fixed the
  harness; this was not a production-contract defect.
- After the harness correction, the complete deterministic, fuzz, and invariant suite was rerun
  with the recorded seed: 69 tests passed, zero failed, zero skipped across five suites. No
  production contract change was required.

### Checkpoint 3 of 3 — live Coston2 FTSO tolerance

- Added the strictly read-only `scripts/sample-ftso-tolerance.ts` sampler and saved its evidence at
  `artifacts/ftso-tolerance.json`. The script resolves the current `FtsoV2` address through the
  official Coston2 registry and uses the official RPC; it has no wallet, signing, faucet, or
  transaction code path.
- Collected 24 successful XRP/USD reads from `2026-08-06T09:42:30.358Z` through
  `2026-08-06T09:45:17.476Z`, a 167.118-second successful-read span. Every record includes local
  read time, raw value, decimals, feed timestamp, observed age, calculated fee, and RPC outcome.
- Feed-age statistics: minimum `0.737s`, median `4.684s`, maximum `21.984s`. Failed reads: zero.
  Nonzero `calculateFeeById` results: zero. Every successful observation returned six decimals.
- Recommendation: keep the planned deployment `maximumPriceAge` at 30 seconds. The maximum healthy
  observation remained 8.016 seconds below the limit, the median remained far inside it, and no
  RPC failure or fee anomaly distorted the result. This is a bounded operational sample, not a
  guarantee of future feed cadence.
- `docs/CONTRACT_SPEC.md` remains unchanged because the evidence supports, rather than changes, the
  existing 30-second deployment setting.

### Independent contract review

- Authority and transitions: every public lifecycle function retains the specified freelancer or
  client authority, while the two quote functions remain open simulations. The only reachable
  transitions are `CREATED -> FUNDED -> SUBMITTED -> RELEASED`, `CREATED -> CANCELLED`, and
  `FUNDED -> REFUNDED`; terminal-state and duplicate-transfer attempts fail.
- Interaction safety: fund, top-up, release, and deadline refund are `nonReentrant`, commit effects
  before token transfers, validate exact contract balance deltas, and revert atomically on token
  mismatch. Aggregate liability changes match the associated invoice lock change.
- Oracle and client guards: every price path preflights `calculateFeeById`, rejects a nonzero fee,
  sends zero native value to the feed, rejects reverting/zero/malformed/future/stale observations,
  and enforces quote deadlines and client maxima at their exact equality boundaries.
- Math and evidence: payout and both funding stages use full-precision upward rounding. Fuzz and
  stateful settlement evidence confirms minimal sufficient payout, exact top-up/refund arithmetic,
  lock conservation, and immutable funded terms and evidence.
- Surface review: `forge inspect` shows the nine lifecycle functions, two quote functions, and
  read-only constants/dependency/invoice/liability getters. Storage contains only the invoice
  mapping, aggregate liabilities, and next invoice ID. Optimized assembly contains no
  `DELEGATECALL`, `CALLCODE`, or `SELFDESTRUCT` opcode. There is no admin, owner, rescue, pause,
  fee, treasury, proxy, arbitrary-recipient, native-withdrawal, or unrestricted-token-withdrawal
  surface.
- Compiler/lint review: Solidity `0.8.25` compiled successfully. The only warning in production is
  Forge's conservative `int8 -> uint8` lint at the scale calculation; every production caller
  first proves the value is `0..18`, and the fuzz suite covers that full range. Remaining messages
  are naming-style notes. No critical or high-severity defect remains.
- ABI and storage layout inspection passed. Production `ProofPayEscrow` size is 7,106-byte runtime
  and 7,793-byte initcode, leaving 17,470 and 41,359 bytes of the respective limits.
- Dependency pins match the lock and submodule commits: Flare periphery `0.1.52` at
  `ca264d6a31ddfb53d1bef7cb7bd1942aa89d323a`, forge-std `v1.16.2` at
  `bf647bd6046f2f7da30d0c2bf435e5c76a780c1b`, and OpenZeppelin Contracts `v5.7.0` at
  `cab19933c33c2ad1d4c7a84864a3601dddfd16f3`. JavaScript dependency versions match lockfile v3.
- Slither was not run because it is not installed. No static-analysis stack was installed or
  repaired. This review is not an audit.

### Final validation

- `/home/samfresh22/.foundry/bin/forge fmt --check`: passed.
- `/home/samfresh22/.foundry/bin/forge build --force`: passed; 41 files compiled with Solidity
  `0.8.25`.
- Deterministic suites: 56 passed, zero failed, zero skipped across three suites.
- Financial fuzz suite: seven passed, zero failed, zero skipped; six properties completed 512 runs
  each and the supported-range endpoint test passed.
- Stateful invariant suite: six passed, zero failed, zero skipped; 128 runs, depth 32, 4,096 calls
  per invariant, zero handler reverts, with seed
  `0x000000000000000000000000000000000000000000000000000000003b202608`.
- `/home/samfresh22/.foundry/bin/forge coverage --ir-minimum`: passed all 69 tests. Production
  `ProofPayEscrow.sol` coverage is 100% lines (`210/210`), statements (`246/246`), branches
  (`42/42`), and functions (`20/20`). Coverage remains supporting evidence, not an audit.
- `npm run typecheck`: passed under strict TypeScript settings.
- Repository secret scan: passed with zero high-confidence credential patterns. All 64-hex
  candidates are the already public Phase 1 calldata/transaction hash or the recorded Foundry
  seed; no wallet secret is present.
- Both JSON evidence artifacts parse successfully; `git diff --check` passed.
- Phase 3B diff inspection found no deployment, transaction, faucet, wallet creation,
  production-contract edit, frontend, landing page, or unrelated feature.

### Phase 3B defects and limitations

- Production defects found and fixed: none. The only failure was the initial invariant-harness
  target configuration described in checkpoint 2; its smallest counterexample was preserved in
  the checkpoint record and the handler targeting was corrected.
- Fuzz proof is bounded to the documented Phase 3B domain. The contract does not enforce that
  operational maximum at invoice creation, so inputs outside the proved domain may fail later
  quotes rather than silently truncate.
- The live FTSO evidence is one 167.118-second Coston2 sample and cannot guarantee future cadence.
- A submitted invoice still has no arbitration, timeout refund, automatic release, or unilateral
  freelancer release; a refusing client can leave FXRP locked indefinitely.
- Evidence binds bytes and a retrieval URI but does not prove truth or quality. A future nonzero
  FTSO fee fails closed and requires architecture revision. Direct FXRP donations remain stranded.
- No deployment, live escrow receipt, external audit, or production-security claim exists.

### Phase completion

- Commit subject on PASS: `test: prove ProofPay economic invariants`.
- Next decision: `READY FOR COSTON2 ESCROW DEPLOYMENT`.

## Phase 4A — Coston2 escrow deployment and verification

Gate: `PASS`

### Reviewed deployment intent

- Reused the funded Phase 1 sender
  `0x3c47ddC46848A7a225d3491DA5c211e2E7A51F42`; no wallet or faucet request was created.
- The final pre-broadcast checkpoint confirmed chain ID `114`, deployer balance
  `99.9016056 C2FLR`, zero FTSOv2 fee, and an XRP/USD observation with six decimals and age zero
  at Coston2 block `33775779`.
- Official discovery resolved `AssetManagerFXRP` to
  `0xc1Ca88b937d0b528842F95d5731ffB586f4fbDFA`, its FXRP token to
  `0x0b6A3645c240605887a5532109323A3E12273dc7`, and `FtsoV2` to
  `0xC4e9c78EA53db782E28f28Fdf80BaF59336B304d`. The addresses matched the Phase 1 and Phase 3B
  evidence.
- Constructor review passed for the resolved FXRP, resolved FTSOv2, XRP/USD feed
  `0x015852502f55534400000000000000000000000000`, and `30`-second maximum price age.
- The reviewed Solidity `0.8.25` artifact used optimizer `200`, IR, and Cancun EVM settings.
  Estimated gas was `1,668,280`; the padded limit was `2,001,936`; the expected maximum fee was
  `1.3012584 C2FLR` at `650 gwei`.
- The expected initcode hash was
  `0x3257394695ed7a2905c62dba2bfcb5c107fa9edad5b373f01bfcd8f3ccb8a960`; a live-RPC constructor
  simulation produced expected runtime hash
  `0xd455d0ee1c99f901d571e25c4cf25902249097d8212d485417e7032ee3ff5338` and predicted contract
  `0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`.
- `deployment/coston2.json` held this redacted intent before signing. The signed transaction hash
  was recorded before submission and marked submitted immediately after the RPC accepted it.

### Confirmed deployment

- Contract: `0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`.
- Transaction: `0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a`.
- Receipt: success in Coston2 block `33775801` at `2026-08-08T10:01:32.000Z`.
- Gas: `1,653,986` at `650,000,000,000 wei`; total fee `1.0750909 C2FLR`. The deployer balance
  change from `99.9016056` to `98.8265147 C2FLR` equals that receipt fee.
- The creation transaction input matched the reviewed initcode hash. Deployed runtime code exists
  and its hash exactly matches the pre-broadcast runtime hash.
- Onchain immutable getters return the intended FXRP, FTSOv2, feed ID, and 30-second maximum age.
  FXRP still reports six decimals.
- Initial state is zero and solvent: active liabilities `0`, contract FXRP balance `0`, and invoice
  `1` is empty. `quoteFunding(1)` returns the expected `InvoiceNotFound(1)` error.
- A non-persistent live `eth_call` created a temporary `$100.000000` invoice and called the deployed
  `quoteFunding` in one simulation. It returned protected funding of `106.259148 FXRP` at raw price
  `1035205`, six decimals, and feed timestamp `1786183293`; independent integer math matched.
  Re-reads proved that the simulation created no live invoice, liability, or token balance.
- The existing deterministic mock reproduced the stale-price rejection at 31 seconds while
  retaining the accepted 30-second boundary.
- Explorer source verification passed with the exact compiler, optimizer, IR, EVM, constructor,
  and creation-transaction settings preserved in `deployment/coston2.json`.

Explorer evidence:

- https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a
- https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21

### Phase 4A validation and boundary

- `forge fmt --check`: passed from the Foundry project root.
- `forge build --force`: passed with Solidity `0.8.25`.
- Complete deterministic, fuzz, and invariant suite: 69 passed, zero failed, zero skipped.
- Live-RPC Foundry deployment dry run: passed before broadcast. An earlier attempt rejected its
  current FTSO observation as invalid; it wrote no intent, signed no transaction, and sent
  nothing. The fresh final checkpoint and broadcast preflight both passed.
- Post-deployment bytecode, constructor, accounting, invalid-invoice, live-quote, and mock-stale
  checks: passed.
- `npm run typecheck`, repository secret scan, and `git diff --check`: passed.
- No invoice, FXRP escrow, evidence, funding, top-up, release, refund, or faucet transaction was
  sent in Phase 4A.
- Source verification is separate from deployment integrity; both passed in this phase.

### Remaining limitations

- Coston2 is a test network. This deployment is not an audit or a production-readiness claim.
- A submitted invoice still has no arbitration, timeout refund, automatic release, or unilateral
  freelancer release; a refusing client can leave FXRP locked indefinitely.
- Evidence binds bytes and a retrieval URI but does not prove truth or quality. A future nonzero
  FTSOv2 fee fails closed and requires an architecture revision. Direct FXRP donations remain
  stranded.

### Phase completion

- Commit subject on PASS: `deploy: publish ProofPay escrow on Coston2`.
- Next decision: `READY FOR LIVE INVOICE FLOW`.
