# ProofPay durable status

Updated: 2026-08-04 13:31 WAT

## Current state

- Active phase: Phase 0 complete; Phase 1 not started.
- Overall decision: proceed sequentially to the Flare sponsor-operation probe.
- Application UI: not started.
- Escrow contract: not started.
- Deployment: not started.
- Secrets received or stored: none.

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

Gate: `NOT_STARTED`

Required next action: use official Flare documentation to build and run the smallest read-only TypeScript probe, then prepare one wallet-approved FXRP transfer. If wallet interaction is required, save evidence, set `WAITING_FOR_USER`, and request one exact manual action.

Do not begin Phase 2.
