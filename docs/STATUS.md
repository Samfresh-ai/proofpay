# ProofPay durable status

Updated: 2026-08-10

## Current state

- Active phase: Phase 0 through Phase 5D complete; Phase 6A public deployment is live with one
  explicit hosted funding-flow evidence gap; Phase 6B1 Signal Ledger implementation and local
  validation are complete, with its one non-production Preview still pending.
- Overall decision: `PHASE_6B1_LOCAL_VALIDATION_PASS_PREVIEW_PENDING`. The Phase 6A historical gate remains
  `PUBLIC_DEPLOYMENT_NEEDS_REVISION`. Application commit
  `903c36bf8d0bf172c1aaf113b46db375c4e210c7` is deployed as Vercel deployment
  `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9` at `https://proofpay.paysmat.xyz`. DNS, HTTPS, anonymous
  routes, production smoke, logs, and both read-only invoice reconciliations pass. The requested
  hosted client funding-role quote and funding-intent screenshot remain impossible to prove from
  the two terminal invoices without a prohibited broadcast. Phase 6B1 has not changed that
  production deployment or canonical domain.
- Current production UI: `/app`, `/invoice/[id]`, and `/receipt/[id]` provide role-aware wallet
  action preparation and verified read-only settlement records; `/` redirects to `/app`. The
  locally validated Phase 6B1 candidate adds a real landing page and Signal Ledger product
  hierarchy while preserving contract reads, wallet actions, journal behavior, and receipt
  evidence. No Phase 6B1 Preview URL or deployment is recorded yet.
- Escrow contract: core implemented, fuzzed, statefully invariant-tested, deployed to
  Coston2, and source-verified; not audited or claimed production-ready.
- Foundry: pinned production contract, deterministic mocks, 56 Phase 3A unit tests, seven passing
  Phase 3B financial-math tests, and six passing stateful invariants.
- Deployment: `ProofPayEscrow` is confirmed at
  `0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21` on Coston2 chain `114`; deployment and verification
  evidence is in `deployment/coston2.json`.
- Live receipts: invoices `1` and `2` each moved
  `CREATED -> FUNDED -> SUBMITTED -> RELEASED`; their payout and refund values reconcile to their
  locks, active liabilities returned to zero, and both have preserved receipt locators. Evidence is
  in `docs/LIVE_RECEIPT.md`, `artifacts/coston2-settlement-receipt.json`, and
  `artifacts/coston2-browser-settlement-receipt.json`.
- Repository secrets: none. Disposable test-wallet secrets remain outside the repository in an owner-only local file; no secret value is recorded in project evidence.

## Source-of-truth precedence

When current records disagree, use this order:

1. deployed contract behavior and confirmed chain receipts;
2. committed machine artifacts;
3. current source and tests;
4. this durable status;
5. historical design documents.

Historical documents remain useful decision records, but their future-tense phase boundaries do not
override an implemented contract, a committed verifier artifact, or a confirmed receipt.

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

## Phase 4B — complete Coston2 invoice settlement

Gate: `PASS`

### Preflight and durable execution

- Reused the Phase 1 client and freelancer wallets from owner-only local storage. Their public
  addresses matched the required identities; no private key, wallet, or faucet request was
  created or recorded.
- The pre-transaction checkpoint independently matched chain ID `114`, the Phase 4A runtime hash,
  immutable dependencies, six-decimal FXRP, zero FTSOv2 fee, and a valid XRP/USD observation aged
  22 seconds. The contract had zero invoices, liabilities, FXRP balance, and surplus.
- The client held `9.999 FXRP` and `98.8265147 C2FLR`; the freelancer held `0.001 FXRP` and no
  C2FLR. The client therefore transferred exactly `1 C2FLR` for freelancer gas. This was separate
  from the invoice and confirmed in transaction
  `0xe59af5bf8adda39214a68489462b5f0a3a356be669554380e17759b71ab76170`.
- The protected preflight requirement for `$5.00` was `5.307708 FXRP`, below the `8 FXRP` limit,
  so the target remained `$5.00`; no fallback invoice was created.
- `artifacts/coston2-live-invoice.json` checkpointed every intended action before signing, its
  deterministic signed hash before broadcast, the RPC-returned hash immediately after submission,
  receipt, event, historical balances, and re-read state. Exactly one invoice was created.
- The first read-only resume-identity attempt encountered a transient official-RPC fetch failure
  before any intent, signing, or broadcast. It changed no chain state; the retry passed and every
  later action reconciled normally.

### Scope, funding, and evidence

- Canonical scope bytes hash to
  `0x3bf5d3c5e4c43cfd1d31f567803150989c95ae290f2b20196d132c9f03148eb9`. Freelancer transaction
  `0x0de4d5979553124244b1677af47938d347b15f3fb8f773177b497413c8cff298` created invoice `1` for
  `5,000,000` USD atomic units with client/freelancer identities, scope hash, and deadline intact.
- A read-only expired-deadline `fundInvoice` simulation returned the exact decoded
  `ExpiredQuote(1786191061, 1786191062)` data. Same-block snapshots were unchanged and no failing
  transaction was sent.
- `quoteFunding` returned `5.301211 FXRP` protected funding at raw XRP/USD `1,037,499`, six
  decimals, feed timestamp `1786191088`; independent two-stage upward rounding matched. The 2%
  transaction maximum was `5.407236 FXRP` and was approved exactly in transaction
  `0x2bf02a049ad9fabc477c744189dca30a69ee0d37d3684fab3e304292c1c73c55`.
- Funding transaction `0x48e8ffcc165c61c25efd2e91eef8aa550441d69b6e2cf5c8769affd24acd5e83`
  pulled exactly `5.299945 FXRP` at raw price `1,037,747`; the invoice, contract balance, and active
  liabilities all recorded that lock in `FUNDED` state.
- Canonical evidence bytes hash to
  `0x84670d349f4ccd01e15e8c6028d03bcc65ee56f072361cc03e44be9e7b927ca5` and bind the Phase 4A
  contract, transaction, block, runtime hash, constructor dependencies, commit, explorer page, and
  completion note. Transaction
  `0x70c477613d2078a34d41e73fabb2e21665809f88403fbd481c5404a116b50fa1` stored that hash, emitted
  the verified explorer URI, and moved the unchanged lock and liabilities to `SUBMITTED`.

### Release and final reconciliation

- The final release quote used raw XRP/USD `1,037,614`, six decimals, feed timestamp `1786191145`.
  It required `4.818748 FXRP`, predicted a `0.481197 FXRP` client refund, and required no top-up.
- Client transaction `0xe3b7e5c5e965a8151222ef92febd1be5fb8b5913b2080e5faa528e5b94f141ee`
  released `4.818748 FXRP` to the freelancer and refunded `0.481197 FXRP` to the client. Their sum
  is exactly the prior `5.299945 FXRP` lock.
- Final FXRP balances are client `5.180252`, freelancer `4.819748`, and contract `0`. Invoice `1`
  is `RELEASED`; active liabilities are `0`; no direct-donation surplus existed.
- `scripts/verify-live-invoice.ts` independently consumed the receipt, retrieved every receipt,
  decoded lifecycle events, re-read invoice and immutable state, checked historical balance
  deltas, recomputed manifest commitments, and passed payout/refund/liability reconciliation.

### Phase 4B evidence and boundary

- Public receipt: `docs/LIVE_RECEIPT.md`.
- Durable journal: `artifacts/coston2-live-invoice.json`.
- Canonical manifests: `artifacts/live-scope-manifest.json` and
  `artifacts/live-evidence-manifest.json`.
- Machine receipt: `artifacts/coston2-settlement-receipt.json`.
- The flow is Coston2-only and uses test assets. It is not production escrow, legal escrow, audited
  software, fiat settlement, or guaranteed USD stability. The MVP still has no arbitration or
  automatic/unilateral release.
- The deadline was computed as 24 hours after the prepare block, but gas setup and RPC delays meant
  the confirmed creation had `84,940` seconds (`23h 35m 40s`) remaining. Settlement completed well
  before it; the receipt does not claim an exact 24-hour creation-to-deadline interval.

### Phase 4B validation

- `forge fmt --check` and `forge build --force`: passed with Solidity `0.8.25`.
- Complete deterministic, fuzz, and invariant suite: 69 passed, zero failed, zero skipped. The six
  fuzz properties ran 512 cases each; all six stateful invariants ran 128 runs at depth 32 with
  zero handler reverts.
- `npm run typecheck`: passed under the existing strict TypeScript configuration.
- Live-flow JSON schema/status assertions and canonical-manifest checks: passed.
- `npm run verify:live:coston2`: passed in the separate read-only process for every receipt,
  address, invoice field, event, manifest hash, historical balance delta, price observation,
  payout/refund equality, and final liability/balance read.
- Exact-value scan for both owner-only wallet secrets: passed; neither value occurs in any tracked
  or untracked repository file. No secret was printed by the scan.
- `git diff --check`: passed.

### Phase completion

- Commit subject on PASS: `proof: settle live ProofPay invoice on Coston2`.
- Next decision: `READY FOR PRODUCT INTERFACE`.

## Phase 5A — read-only settlement interface

Gate: `PASS`

### Recovery and scope boundary

- Direct Codex resumed the preserved Phase 5A work at commit
  `a2c37b453004a193f0d76f3090f851691576527c`; it did not recreate the repository or repeat
  Phases 0–4. The recovery bundle is
  `/home/samfresh22/proofpay-recovery/phase5a-direct-codex-20260808T154513Z`.
- OpenClaw's gateway and liveness watchdog were stopped before implementation. Hermes was not
  started. The existing browser service was left unchanged.
- The completed interface remains read-only: it has no wallet connection, signature request,
  transaction button, write client, `eth_getLogs` history scan, indexer, database, or contract
  change.

### Checkpoint 1 — direct contract reads

- `/invoice/[id]` accepts canonical positive `uint256` IDs and directly reads `invoices(id)`,
  `activeFxrpLiabilities()`, and the contract FXRP balance at one pinned Coston2 block.
- A submitted invoice may add one read-only `quoteRelease` simulation at the same block. The result
  is labelled `Preview quote` and `Not confirmed`; a fixture-only top-up scenario is explicitly
  marked as not live Coston2 evidence.
- Each public RPC request has a 15-second timeout and one retry. Missing or contradictory evidence
  fails closed; fixture mode requires explicit test authorization and is disabled in production.
- Unit coverage proves ID parsing, exact-byte manifest verification and tamper rejection, locator
  identity and uniqueness, exact event shape, settlement conservation, fixture isolation, RPC
  policy constants, current copy boundaries, and the top-up presentation data.

### Checkpoint 2 — receipt-by-transaction-hash verification

- `/receipt/1` treats `artifacts/coston2-settlement-receipt.json` only as a verified transaction
  locator. It retrieves each referenced transaction, receipt, and block from Coston2 in lifecycle
  order; no backward scan or broad event query is used.
- Each lifecycle transaction must target the deployed ProofPay contract and contain exactly one
  deployed-contract log that decodes to the expected event for invoice 1. Additional, malformed,
  wrong, or contradictory contract events fail the receipt.
- After those lifecycle events decode in order, one current pinned snapshot re-reads the invoice,
  aggregate liabilities, contract FXRP balance, and both parties' FXRP balances. The latest receipt
  must not be newer than that snapshot, and the release event's payout plus refund must equal the
  confirmed historical lock.
- Final live reconciliation passed at block `33799319`: state `RELEASED`, lock `5.299945 FXRP`,
  payout `4.818748 FXRP`, refund `0.481197 FXRP`, active liabilities `0`, contract balance `0`,
  client balance `5.180252 FXRP`, and freelancer balance `4.819748 FXRP`.

### Checkpoint 3 — interface and route build

- Added the dynamic App Router routes `/invoice/[id]` and `/receipt/[id]`, typed server-side data
  views, loading/error/not-found documents, and same-route retry links for expected data failures.
- The approved direction is implemented as an editorial financial document crossed with an
  onchain settlement terminal: warm paper, dark serif hierarchy, monospaced evidence, thin rules,
  restrained Flare red, aligned money, status stamps, a settlement rail, and native evidence
  disclosures. It does not use dashboards, sidebars, bento grids, generic cards, gradients, or
  decorative charts.
- Production build passes with `/invoice/[id]` and `/receipt/[id]` server-rendered dynamically.

### Checkpoint 4 — live browser reconciliation

- The final live Playwright run passed both route reads using the default live adapter. It asserted
  the parties, deadline, scope and evidence commitments, hash-verified scope/note, contract and
  network, exact money values, FTSO prices/times, evidence URI, four transaction hashes, blocks,
  block times, and pinned-read provenance.
- The final live invoice screenshot records pinned block `33799377`; the receipt screenshots record
  pinned block `33799395`. The lifecycle block times are the actual Coston2 times:
  `12:10:16`, `12:11:59`, `12:12:21`, and `12:12:39 UTC`.
- A temporary public-RPC failure produced the explicit read-failed document with no fixture
  fallback. After the endpoint recovered, the final live run passed and overwrote all five required
  evidence images.

### Checkpoint 5 — final validation

- `npm run typecheck`: passed.
- `npm run lint`: passed with zero warnings.
- `npm run test:unit`: 18 passed, zero failed.
- `npm run build`: passed.
- `npm run test:e2e`: 3 passed, zero failed.
- `npm run reconcile:interface:coston2`: passed with exact event, conservation, solvency, current
  state, and pinned party-balance checks.
- `npm run test:e2e:live`: 2 passed, zero failed; five live screenshots captured.
- Axe scans passed on desktop invoice, mobile invoice, desktop receipt, mobile receipt, and expanded
  receipt evidence. Both 390-pixel routes had no horizontal overflow; the disclosure controls were
  keyboard operated.
- Exact wallet-secret and high-confidence secret scan: passed. Protected Phase 0–4 files were
  unchanged. Phase 5A source contains no write client, chain-write method, or log scan.
- `git diff --check`: passed.

### Screenshots and limitations

- Evidence images: `artifacts/interface/invoice-1-desktop.png`, `invoice-1-mobile.png`,
  `receipt-1-desktop.png`, `receipt-1-mobile.png`, and
  `receipt-1-evidence-expanded.png`. Only the live suite writes these filenames.
- Generic historical receipt discovery remains a post-hackathon indexing concern. Only invoice 1
  has a verified preserved transaction locator; arbitrary invoice IDs still receive direct current
  state without an inferred receipt.
- Numeric block pinning does not eliminate a small reorganization race. The UI has automated
  accessibility and responsive checks, not user-research or usability-test evidence.
- Coston2 and test FXRP are not mainnet, legal escrow, audited security, fiat settlement, or
  production readiness. Evidence commitments prove byte integrity, not delivery truth or quality.

### Phase completion

- Commit subject on PASS: `feat: present live ProofPay settlement`.
- Next decision: `READY FOR WALLET ACTIONS`.

## Phase 5B1 — wallet-connected action preparation

Gate: `PASS`

### Routes and policy

- Added `/app` for milestone creation and invoice lookup. Extended `/invoice/[id]` with one
  centralized role/state/deadline/quote policy. `/receipt/[id]` remains read-only.
- Added injected-wallet integration through wagmi and viem. The connected account's actual chain
  ID must be Coston2 `114`; client, freelancer, unrelated, disconnected, wrong-network, and terminal
  states receive distinct controls or explanations.
- No contract, deployment, RPC adapter, browser service, backend, database, indexer, auth,
  analytics, or live-chain transaction was added or changed.

### Action preparation

- Creation commits canonical scope bytes, simulates `createInvoice`, and shows the predicted ID
  before a signature request.
- Funding calls `quoteFunding`, independently checks the two-stage upward-rounded 10% protection,
  applies a 0.5%–5% accepted tolerance, checks allowance, and stages only an exact approval when
  needed. Approval and funding remain separate intents.
- Evidence normalizes public URLs and optional commit/note fields into sorted canonical UTF-8 JSON,
  displays its `keccak256` commitment, and simulates `submitEvidence`.
- Submitted invoices call `quoteRelease` before selecting an exact top-up or release. Cancellation
  and missed-deadline refund follow the deployed contract's existing role and deadline rules.
- Every prepared intent exposes the exact network, contract, account, invoice, token/amount,
  deadline, maximum, result, and intent hash. Contract reverts and nested EIP-1193 wallet rejection
  errors map to specific non-completion copy.

### Browser-local journal

- `proofpay.transaction-journal.v1` records only public action identity and transaction state:
  prepared, awaiting wallet, submitted, confirmed, reverted, or abandoned.
- Reload downgrades an interrupted unsigned wallet prompt to prepared and reconciles submitted
  hashes through receipts. Duplicate active actions are blocked until authoritative state changes;
  only unsigned prepared intents may be abandoned.
- The journal is browser/device-local. It has no account sync, server persistence, indexing, or
  generic historical receipt discovery.

### Validation boundary

- All action-browser tests use an injected deterministic EIP-1193 provider and fail if the real
  Coston2 RPC is contacted. Signing, rejection, receipt, and reload behavior are provider-only test
  evidence; no live Coston2 action was broadcast.
- A real live-browser settlement through an injected wallet remains the next explicit decision and
  cannot be claimed by this phase.

### Final validation

- `npm run lint` and `npm run typecheck`: passed with zero warnings or errors.
- `npm run test:unit`: 29 passed, zero failed, including 11 focused wallet-policy, amount,
  manifest, error, and journal tests while preserving all 18 Phase 5A tests.
- `npm run build`: passed; `/app` is static and `/invoice/[id]` and `/receipt/[id]` remain dynamic.
- `npm run test:e2e`: 10 passed, zero failed. Seven injected-provider action flows cover explicit
  wallet roles, wrong-network correction, creation rejection, exact approval then funding,
  evidence, cancellation, refund, top-up, release, journal reload, serious/critical Axe results,
  visible keyboard focus, and 390-pixel overflow. The three Phase 5A fixture tests still pass.
- `npm run reconcile:interface:coston2`: passed at pinned block `33803212` with the original four
  lifecycle transactions, exact lock/payout/refund conservation, zero liabilities, zero contract
  FXRP balance, and pinned party balances.
- `npm run test:e2e:live`: two read-only live tests passed. The five tracked Phase 5A screenshots
  were restored to their prior committed bytes after the validation run.
- Production dependency audit: zero known vulnerabilities. Exact-value scan for both owner-only
  test-wallet secrets and the focused high-confidence credential scan: zero hits.
- The 34 protected contract, deployment, script, and live-evidence files match baseline aggregate
  hash `1e8a79e8eac523b78d0e09d1294835939277c8050082a1db9b2ab0e1e711d5bf`.
- `git diff --check`: passed.

### Phase completion

- Commit subject on PASS: `feat: add ProofPay wallet actions`.
- Next decision: `READY FOR LIVE BROWSER SETTLEMENT`.

## Phase 5B2 — live browser settlement

Gate: `PASS` with one nonblocking delivery-window limitation.

### Live result

- Invoice `2`, target `$2.00`, was created through `/app` by the freelancer and then approved,
  funded, submitted, and released through `/invoice/2` by the correct browser-connected parties.
- The Node-only Playwright EIP-1193 bridge used the existing owner-only burner wallets. Private keys
  did not enter the page, application source, Playwright configuration, traces, screenshots,
  artifacts, logs, or git.
- Confirmed lifecycle transactions are create `0xe467…36c7a`, fund `0x60aa…d857`, evidence
  `0x91c0…c281`, and release `0x6e1b…d921`. Four exact approval prompts were required as the live
  quote moved; all four transactions are preserved and each broadcast count is one.
- Funding locked `2.126887 FXRP`. Release paid `1.933309 FXRP` and refunded `0.193578 FXRP` with no
  top-up. Invoice state is `RELEASED`; liabilities and contract FXRP balance are zero; final client
  and freelancer balances are `3.246943` and `6.753057 FXRP`.
- `/receipt/2` displayed the reconciled result from the preserved browser locator. The committed
  `artifacts/browser-settlement-verification.json` records the separate read-only verifier at block
  `33805289`, and the later replay run changed no broadcast count.

### Validation

- `npm run test:unit`: 30 passed.
- `npm run test:e2e`: 10 passed with one worker.
- `npm run test:e2e:browser-live`: live settlement passed, then the completed-journal replay passed
  without a new transaction.
- `npm run verify:browser-live:coston2`: passed exact manifests, lifecycle receipts, senders,
  destinations, state, conservation, zero liabilities, and party balances.
- `npm run lint`, `npm run typecheck`, and `npm run build`: passed.
- Ten required screenshots exist under `artifacts/browser-settlement/`; action and receipt Axe scans
  found no serious/critical issue, and both mobile states had no horizontal overflow.

### Observed limitations

- Four exact approvals were required because a fresh 2%-tolerance maximum increased by small atomic
  amounts while the live quote moved. Confirmed approvals no longer block a necessary refreshed
  exact approval; prepared, wallet-open, and submitted approvals still block duplicates.
- The `datetime-local` field produced an `82,853`-second confirmed delivery window because of local
  timezone interpretation, not exactly 24 hours. This settled invoice cannot be amended.
- Restored injected-wallet state produced a React hydration warning in development before client
  rendering recovered. This was nonblocking but remains interface-refinement work.
- The automated run is execution evidence, not human usability validation or production readiness.

### Phase completion

- Commit subject on PASS: `proof: settle ProofPay invoice through browser`.
- Next decision: `READY FOR INTERFACE REFINEMENT`.

## Phase 5C - interface refinement

Gate: `PASS`

### Defects corrected

- Deadline conversion now uses an explicit IANA timezone and Unix seconds. The 24-hour preset adds
  exactly `86,400` seconds, and the signing review shows local time, timezone/offset, UTC, and
  contract seconds. Historical invoice 2 remains unchanged at `82,853` seconds.
- Funding now freezes one 2%-tolerance intent across approval and funding. Invoice, account, chain,
  preview, protected base, maximum, deadline, and hash are persisted browser-locally. Approval is
  exact and requested only when allowance is insufficient; unlimited approval is absent.
- Wallet state crosses an explicit client hydration boundary. Deterministic server markup and the
  initial client render share an accessible loading state; development and production checks found
  zero hydration warnings.

### Settlement presentation

- Released public records use `SETTLED` and `Payment settled`; `RELEASED` appears only in technical
  contract evidence. Invoice and receipt mastheads now name the milestone record and settlement
  receipt directly.
- The rail binds every stage to its verified event, block, transaction, amount, or commitment, with
  human meaning first. Mobile preserves a compact agreed-to-settled summary without removing the
  detailed evidence.
- Confirmed settlement economics explain the 10% protection, payout, refund, two price observations,
  and percentage movement. Short identifiers expose copy, reveal, and explorer actions without
  forcing full hashes into mobile typography.
- The action band retains one role-aware primary action and expands the prepared intent with its
  maximum movement, recipient, possible pre-confirmation change, and completion proof.

### Validation and evidence

- `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm run build`: passed; unit suite
  totals 48 tests.
- `npm run test:e2e`: 12 passed, including deadline display, stable approval/funding behavior,
  reload preservation, wallet action flows, hydration warnings, accessibility, and mobile overflow.
- `npm run test:e2e:production`: one production hydration test passed with zero warnings.
- `npm run test:e2e:live`: three read-only invoice/receipt tests passed with desktop, mobile,
  expanded-evidence accessibility checks and no transaction controls.
- A later Phase 5C live read-only reconciliation is recorded in this status at pinned Coston2 block
  `33807030`; both invoices remained released, liabilities and contract FXRP balance remained zero,
  and no transaction was sent. No standalone machine-verification artifact for block `33807030` is
  committed, so it does not replace the invoice `2` verifier artifact's block `33805289`.
- The exact browser-secret scan passed. Protected contract, deployment, and existing receipt
  evidence were unchanged. Seven visually inspected screenshots are in
  `artifacts/interface-refinement/`. `git diff --check` passed.

### Remaining boundary

This is automated Coston2 testnet evidence. It is not human usability validation, an audit,
mainnet behavior, legal escrow, fiat settlement, or a production-security claim. Generic historical
receipt discovery remains limited to preserved locators, and browser-local intents are not
cross-device coordination.

### Phase completion

- Commit subject on PASS: `refactor: refine ProofPay settlement experience`.
- The later Phase 5D defect review superseded the recorded next decision; public deployment is not
  authorized while the repeated-top-up journal gate is open.

## Phase 5D — repeated top-up journal and documentation reconciliation

Gate: `PASS`

### Root cause and required behavior

- The deployed contract intentionally permits another exact top-up if a later XRP/USD observation
  makes the already topped-up `SUBMITTED` invoice underfunded again.
- The Phase 5B1 browser journal keyed confirmed non-approval actions primarily by account, invoice,
  and action. A confirmed `top_up` therefore looked permanently complete for that invoice and
  blocked a legitimate later quote.
- The corrected policy gives top-up its own deterministic intent identity over chain, contract,
  invoice, client account, action, observed locked FXRP, required top-up, accepted maximum, quote
  deadline, and price value/decimals/timestamp. Confirmed or reverted history consumes that exact
  broadcast hash without blocking a distinct later quote; abandoned unsigned history may be
  prepared again.
- Prepared state blocks the same intent. Wallet-open uncertainty blocks an overlapping same-scope
  top-up from signing, and any submitted top-up for the same account, chain, contract, and invoice
  must reconcile before another intent can be created. Reload preserves unresolved state, and
  account, chain, contract, or invoice changes invalidate the active prepared intent.
  Legacy or malformed wallet-open/submitted records that cannot prove the complete quote identity
  remain fail-closed, scope-blocking quarantine; they are never trusted for exact-hash matching.
- A connected client sees top-up only for a `SUBMITTED` invoice when a fresh release quote reports a
  nonzero shortfall and no applicable intent remains pending. A zero-shortfall quote offers no
  top-up.
- Funding, evidence submission, release, cancellation, and refund retain one-time protections.
  Approval remains allowance-driven and exact; no unlimited approval path is introduced.

### Validation and evidence boundary

- `npm run lint`, `npm run typecheck`, `npm run test:unit`, and `npm run build` passed. The final
  unit suite has 58 tests, including ten Phase 5D tests that vary each required identity field,
  enforce the status/hash state machine, preserve terminal history, quarantine unresolved legacy
  records, merge delayed receipt results into the current journal, and retain all one-time guards.
- `npm run test:e2e` passed 15 deterministic browser tests. Five focused top-up cases include two
  synchronous clicks producing one send, two distinct confirmed quote hashes remaining in history,
  exact-hash replay rejection, a zero-shortfall release, and an unresolved submitted receipt that
  survives reload and blocks a later quote before allowance or approval. An ambiguous provider
  failure after accepting a send but before returning its hash remains `awaiting_wallet`,
  unsignable across reload, and distinct from an explicit `4001` rejection. Axe found no
  serious/critical issue in the top-up state; the 390-pixel overflow and keyboard-focus checks
  passed. The production hydration test also passed.
- Current read-only Coston2 reconciliation passed for invoice `1` at block `33808897`; an invoice
  `2` public-only verifier run from a temporary directory passed at block `33808919`. These
  Phase 5D run locators are status evidence only and do not replace the committed invoice `2`
  machine artifact at block `33805289`. Neither check sent a transaction or modified a receipt.
- The historical Phase 4B `verify:live:coston2` script still compares current party balances to
  invoice `1`'s post-settlement snapshot. It stops at that stale comparison because invoice `2`
  later changed the same wallets; the current invoice `1` reconciliation and committed historical
  receipt remain the applicable evidence. Phase 5D does not modify that protected verifier.
- Exact browser-secret scanning, initialized-submodule cleanliness, protected contract/deployment/
  receipt byte checks, and `git diff --check` passed. No protected artifact changed.
- Repeated top-up remains deterministic simulated-price evidence only. No live
  Coston2 transaction, second top-up, contract change, redeployment, or new receipt artifact is
  authorized or claimed.
- The six existing project documents are reconciled in place while their historical phase decisions
  and live evidence remain preserved.
- Commit subject on PASS: `fix: support repeated ProofPay top-ups`.
- Next decision: `READY FOR PHASE 6A`.

## Phase 6A — public web deployment

Gate: `PUBLIC_DEPLOYMENT_NEEDS_REVISION`

### Committed deployment baseline

- Application commit `903c36bf8d0bf172c1aaf113b46db375c4e210c7` adds only the public-deployment
  preparation: `/` redirects to `/app`; canonical and Open Graph origins resolve from
  `NEXT_PUBLIC_SITE_URL` in Production and `VERCEL_URL` in Preview; the Coston2/test-assets/
  non-audit/non-legal-or-fiat-escrow notice remains persistent; and `.vercelignore` constrains the
  upload while preserving the committed deployment and receipt records required at runtime.
- Local lint, typecheck, 62 unit tests, 16 simulated browser tests, the production hydration test,
  production build, three live read-only browser checks, both invoice reconciliations, secret
  scanning, upload-scope inspection, protected-evidence checks, and `git diff --check` passed before
  deployment. Historical invoice, receipt, manifest, contract, and Coston2 deployment bytes were
  unchanged.
- This commit proves a deployment-ready source baseline. It does not by itself prove hosting, DNS,
  TLS, anonymous access, or custom-domain availability.

### Provider-hosted deployment evidence

- Vercel project `proofpay-paysmat` produced Preview deployment
  `dpl_28ihjc2manYnfZrydwyhDNDBnnAk` at
  `https://proofpay-paysmat-l2nkco16r-adamolekuntemitope4-2758s-projects.vercel.app` and corrected
  staged Production deployment `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9` at
  `https://proofpay-paysmat-6rkpku49p-adamolekuntemitope4-2758s-projects.vercel.app`; both reached
  Vercel state `READY`. The staged build exposes `https://proofpay.paysmat.xyz` canonical metadata.
- The Preview was created from precursor commit `326e827fb06b68028ea4f05091fce89d6d1aef3d`.
  Application commit `903c36b` changes only a metadata test fixture excluded from Vercel uploads;
  the Preview runtime payload is unchanged.
- Earlier staged deployment `dpl_F1wvviZF1tLe75yMHmkF4Ho8Rqfz` is retained only as correction
  history because it compiled the owner's corrected-away `.com` origin. It must not be promoted;
  no DNS record or public alias was created for that mistaken host.
- Because generated deployment URLs are protected, their browser checks used Vercel's automation
  bypass. Required application, invoice, receipt, and unknown-ID routes returned without browser,
  page, or HTTP failures; current values for invoices `1` and `2` reconciled; desktop and 390-pixel
  mobile views had no horizontal overflow; and sampled Axe scans had no serious or critical
  finding. These checks do not prove anonymous custom-domain access.
- An injected test provider connected on chain `114`, displayed the public account, prepared and
  simulated a fresh `createInvoice` intent, and then abandoned the unsigned journal entry. It made
  zero signature and transaction-send calls and produced no chain state change.

### Anonymous production evidence

- Vercel promoted corrected deployment `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9` without rebuilding.
  Promotion status maps project `proofpay-paysmat` to that exact deployment.
- Cloudflare serves the exact project-specific CNAME DNS-only. Both authorities and public
  resolvers agree; Vercel reports `verified: true`, `misconfigured: false`, and zero conflicts.
- HTTPS first passed at `2026-08-10T03:09:02Z`. The Let's Encrypt certificate identifies
  `proofpay.paysmat.xyz`; plain HTTP redirects with `308`, and `/app` returns `200` with HSTS.
- An anonymous, no-bypass browser run covered `/`, `/app`, both invoices and receipts, and both
  unknown-ID states. Exact `.xyz` canonicals, current values, desktop/mobile overflow, sampled Axe
  serious/critical findings, console errors, page errors, and failed browser responses all passed.
- Seven visually reviewed production screenshots are preserved under
  `artifacts/public-deployment/production/`. The wallet capture is explicitly an unsigned
  create-invoice intent, not a funding-intent substitute.
- Post-deployment read-only reconciliation pinned invoice `1` at block `33845120` and invoice `2`
  at block `33845158`. Both remain `RELEASED` with zero liabilities and zero contract balance; all
  seven invoice-2 verifier checks pass and protected artifact bytes are unchanged.
- Vercel logs for the bounded public-smoke interval contain zero application error/fatal entries
  and zero HTTP 5xx entries; the sampled request set contains only the corrected host and includes
  the expected public routes.
- Public Copy/Reveal and explorer-link checks pass without opening explorer destinations. Twelve
  sensitive paths are non-public, and 18 same-origin assets contain no local-path, owner-name,
  credential, private-key, or explicit source-map marker; no guessed source-map companion is
  publicly readable.

### Public wallet-action boundary

- The hosted evidence proves injected-wallet discovery, Coston2 recognition, and unsigned
  `createInvoice` intent preparation only. It does not prove a mined creation or the hosted client
  funding path.
- A read-only contract inventory at Coston2 block `33843618` found only invoices `1` and `2`, both
  terminal `RELEASED`. Terminal invoice pages cannot expose a current client/freelancer funding
  action or `quoteFunding` intent. Creating the non-terminal invoice needed for that exact hosted
  proof would require a prohibited broadcast. Deterministic tests cover the role and quote policy,
  but they are not public-host evidence and are not labelled as such.

### Custom-domain and completion boundary

- The owner corrected the intended host to `proofpay.paysmat.xyz`. Vercel's mistaken unverified
  `.com` entry was detached, the corrected domain is attached and verified, and its exact
  project-specific CNAME is `ac2b1f40626610de.vercel-dns-017.com.`. No verification TXT is required.
- Cloudflare is authoritative for `paysmat.xyz` through `braden.ns.cloudflare.com` and
  `heather.ns.cloudflare.com`. Both authorities returned `NXDOMAIN` for the `proofpay` A, AAAA,
  CNAME, and TXT lookups before mutation, so no target-host conflict exists. The preserved
  Cloudflare session added only the exact project-specific `proofpay` CNAME with proxying disabled
  (`DNS only`) and TTL `Auto`. Both authorities and public resolvers return that target, while
  Vercel reports the domain verified and correctly configured. No verification TXT was required.
- The promoted deployment and exact DNS evidence are recorded in `deployment/vercel.json` and
  `docs/DEPLOYMENT.md`. No root, `www`, mail, nameserver, or unrelated TXT record changed.
- The custom domain, HTTPS, anonymous public checks, and read-only reconciliation all pass. Phase
  6A still cannot receive the requested full PASS because the hosted role-aware funding quote and
  funding-intent screenshot remain an explicit evidence gap under the no-broadcast rule.

## Phase 6B1 — Signal Ledger interface

Gate: `LOCAL_VALIDATION_PASS_PREVIEW_PENDING`

### Locked scope and current status

- Phase 6B1 is an interface-only implementation whose local gate passes. Its locked direction is recorded in
  `docs/DESIGN_DIRECTION.md`, and its route and hierarchy target is recorded in
  `docs/INTERFACE_SPEC.md`.
- The target replaces the root redirect with a real Signal Ledger landing page, adds the four-state
  illustrative `$100` price-protection scenario, introduces a product shell, strengthens active
  and terminal invoice hierarchy, and refines receipt labels and responsive presentation.
- Contract code and deployment, Coston2 addresses, lifecycle state, wallet-action policy, quote and
  approval rules, signing/broadcast behavior, journal reconciliation, evidence commitments,
  verified receipt locators, and protected historical artifacts remain outside the change scope.
- The current production deployment remains `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9`, and the current
  canonical domain remains `https://proofpay.paysmat.xyz`. No production promotion, DNS change,
  domain change, contract transaction, or Phase 6B1 Preview deployment has been performed.

### Local evidence and decision boundary

- Pinned Node `22.21.1` passes lint, strict typechecking, the production build, `65` unit tests in
  seven files, `25` one-worker deterministic browser tests, one production-hydration test, exact
  secret scanning, and `git diff --check`. Scenario tests reproduce all four six-decimal outcomes;
  browser tests cover metadata, application/invoice/receipt/unknown/unavailable routes, role-aware
  simulated actions, duplicate prevention, keyboard focus, reduced motion, Axe serious/critical
  findings, `320/390/768/1024/1440` widths, and a `200%`-zoom equivalent.
- Twelve pre-edit route screenshots and their hashes are preserved under
  `artifacts/signal-ledger/baseline/`. The one-worker final visual runner produced `18` visually
  reviewed captures and `artifacts/signal-ledger/visual-proof.json`: `3,000,868` screenshot bytes,
  no overflow, console error, page error, signature request, transaction-send request, or broadcast.
  It uses live read-only invoice `2` values, explicit deterministic fixtures, and controlled
  pre-network loading/RPC-failure modes without substituting one evidence class for another.
- Read-only Coston2 reconciliation passes for invoice `1` at block `33875416` and invoice `2` at
  block `33875367`. Both remain terminal with conserved payout/refund and zero liabilities and
  contract balance; all invoice-2 verifier checks pass, and the four protected artifact hashes are
  unchanged. The first invoice-1 request observed a transient public-RPC wait state; the exact
  retry passed, consistent with the interface's fail-closed read boundary.
- Contract code and deployment, ABIs, wallet/action/funding/journal/manifest policy, DNS,
  `deployment/vercel.json`, and tracked historical evidence have zero diff from the Phase 6B1
  starting commit. Three initialized top-level submodules remain at their recorded commits with
  clean worktrees. No wallet signature, transaction broadcast, contract write, live-flow script,
  evidence replacement, DNS mutation, or production deployment action occurred.
- The one permitted non-production Vercel Preview and its public read-only smoke are still pending.
  No Preview URL, deployment ID, or hosted Phase 6B1 claim exists at this checkpoint.
- This automated implementation evidence does not prove human usability, WCAG conformance, audit
  coverage, mainnet readiness, legal escrow, fiat settlement, or production security.
