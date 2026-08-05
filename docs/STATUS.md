# ProofPay durable status

Updated: 2026-08-05 20:11 WAT

## Current state

- Active phase: Phase 0 and Phase 1 complete.
- Overall decision: `PHASE_1_PASS`; Phase 2 requires a separate decision and has not begun.
- Application UI: not started.
- Escrow contract: not started.
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

Phase 1 proved both sponsor operations required by the project gate: a live FTSOv2 XRP/USD read and a real confirmed FXRP transfer on Coston2. Decide separately whether to authorize Phase 2 contract work; no contract, frontend, or landing page was started here.
