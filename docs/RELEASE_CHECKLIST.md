# Phase 7A release checklist

Internal submission freeze: **2026-08-13 23:00 Africa/Lagos**

Submission deadline record: **2026-08-14**; recheck the canonical DoraHacks
page before submission because its publisher timezone is not stated.

Phase 7A starting commit: `8f9958ebc3a615cc7f38024484caef6412ea8df7`
Final reviewed commit: `SELF` (the commit containing this checklist)

This checklist distinguishes the committed Phase 6B2 baseline from checks that
must be repeated on the Phase 7A submission commit. A checked baseline item is
not a substitute for an unchecked fresh-release gate.

## 1. Frozen release identity — committed baseline

- [x] Escrow Flow implementation commit:
  `78cfde3f3eeb3025f8eecdc4cb2d3db69f4c3d55`
- [x] Phase 6B2 evidence commit / Phase 7A starting HEAD:
  `8f9958ebc3a615cc7f38024484caef6412ea8df7`
- [x] Production deployment: `dpl_FAW3WmZqyeRunaxSkFqkPBu1T5Ny`, state
  `READY`, promotion status `PROMOTED`
- [x] Production domain: [https://proofpay.paysmat.xyz](https://proofpay.paysmat.xyz)
- [x] Known-good rollback deployment: `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9`
- [x] Coston2 chain ID: `114`
- [x] Deployed and explorer-verified contract:
  [`0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21`](https://coston2-explorer.flare.network/address/0x53bE2D49f4bFCF2cc04A225Ccb7398Fb5E5EAA21)
- [x] Contract deployment transaction:
  [`0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a`](https://coston2-explorer.flare.network/tx/0xa223570423d92e6dc972452ff00da35c2d59d5c0c4c9f3a971e7cd6dabf5f93a)
- [x] Phase 6B2 changed no DNS record, domain, contract, or chain state.

## 2. Protected evidence — committed baseline

| Record | SHA-256 |
| --- | --- |
| `deployment/coston2.json` | `bc27be052fe406d49ddbadbc990df9b5ebab62b94af80b7cdd7db9c937019824` |
| `artifacts/coston2-settlement-receipt.json` | `147641f646b00fe2785281060695a6db93dbfaf485d558a7a4f6d99d1a1a1d51` |
| `artifacts/live-scope-manifest.json` | `426ac3a1c07329e710bc781c0b1ce690c6fda43e26525af3d775974c03c29e00` |
| `artifacts/live-evidence-manifest.json` | `cc877dfbb838390110677f0117633eac8b81762ac26ebbc1d2dcea82844b6512` |
| `artifacts/coston2-browser-invoice.json` | `bd8e979aa1311546e50bb3b8cbda6e79031071e1e0024894e3aa98a829182904` |
| `artifacts/coston2-browser-settlement-receipt.json` | `aa672be937600dde10dc712042bb144c38122ab88e3401736750b818afaefe36` |
| `artifacts/browser-scope-manifest.json` | `d7dec92001b96b015557eff2e0c642f9a00e7f10a277fd2b5b35e0d635474c20` |
| `artifacts/browser-evidence-manifest.json` | `da524721294263c3c4575d429c48f71e93687154091ac00f29be110af1ded5b8` |
| `deployment/vercel.json` at Phase 7A start | `68efe9975030841a58b42b9f44d810f750a1635cc9c4c4ab52783f2ce2e3c6e6` |
| `artifacts/escrow-flow-final/visual-proof.json` | `251c6cd19c38cdffb72c4add9997904e4092e8584468fcab531d6e017d1f9b27` |

- [x] Recompute the protected hashes on the final submission commit and explain
  every intentional difference. Contract, live-receipt, scope, and evidence
  records should remain byte-identical unless a documented release blocker
  requires otherwise.

## 3. Live invoice evidence — committed baseline

| Invoice | Lifecycle | Settlement | Last committed read-only verification |
| --- | --- | --- | --- |
| [1](https://proofpay.paysmat.xyz/invoice/1) / [receipt](https://proofpay.paysmat.xyz/receipt/1) | `CREATED -> FUNDED -> SUBMITTED -> RELEASED` | Lock `5.299945 FXRP`; payout `4.818748`; refund `0.481197`; top-up `0`; final liabilities and contract balance `0` | Five current reconciliation checks passed at block `33973183` |
| [2](https://proofpay.paysmat.xyz/invoice/2) / [receipt](https://proofpay.paysmat.xyz/receipt/2) | `CREATED -> FUNDED -> SUBMITTED -> RELEASED` | Lock `2.126887 FXRP`; payout `1.933309`; refund `0.193578`; top-up `0`; final liabilities and contract balance `0` | Seven isolated verifier checks passed at block `33973412` |

- [x] For both invoices, payout plus refund equals the prior lock.
- [x] Receipt locators bind the expected lifecycle transactions and events.
- [x] Evidence commitments are described as byte-integrity evidence, not proof
  of delivery truth or quality.
- [x] Repeat read-only invoice-1 reconciliation on the frozen submission source:
  five checks passed at block `33976029`.
- [x] Repeat read-only invoice-2 receipt verification on the frozen submission
  source: seven isolated checks passed at block `33976062`.
  commit.
- [x] Confirm every production receipt and the judge-path Coston2 explorer link opens successfully.

Do not use the historical invoice-1 verifier's stale current-party-balance
comparison as a release gate: invoice 2 later changed the same wallets. The
current pinned reconciliation and immutable historical receipt are the
applicable evidence.

## 4. Test status — committed Phase 6B2 baseline

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm run test:unit`: 65 passed in seven files
- [x] `npm run build`
- [x] Deterministic one-worker browser suite: 27 passed
- [x] Production hydration browser test: 1 passed
- [x] Foundry suite: 69 passed, comprising 56 deterministic tests, seven
  financial-fuzz tests (six properties × 512 runs), and six invariants (128 runs,
  depth 32)
- [x] Production-contract coverage: 100% lines, statements, branches, and
  functions with Foundry `--ir-minimum`
- [x] Escrow Flow visual manifest: 17 captures, zero horizontal overflow,
  serious/critical Axe findings, console errors, page errors, signature
  requests, sends, or broadcasts
- [x] Phase 6B2 anonymous smoke: eight routes, six responsive checks, zero
  serious/critical Axe findings, browser errors, signature calls, send calls, or
  broadcasts
- [x] Bounded post-promotion log review: zero application error, fatal, or HTTP
  5xx entries in the recorded 1,000-record sample

## 5. Submission documents and licensing

- [x] Root MIT `LICENSE` added for original ProofPay source; dependency licenses
  remain separate.
- [x] `SECURITY.md` warns that this is an unaudited Coston2 hackathon prototype
  that must not receive real funds.
- [x] `docs/UPSTREAM.md` records the exact FAssets-demo commit, no-copy decision,
  submodule pins, and direct dependency-license metadata.
- [x] Judge-oriented `README.md` contains the required 16 sections, compact
  architecture diagram, production/contract/invoice/receipt/explorer links,
  local commands, exact baseline test counts, attribution, and honest
  limitations.
- [x] `docs/DORAHACKS_SUBMISSION.md` contains every requested draft field and a
  five-step judge quick path.
- [x] `docs/JUDGING_MATRIX.md` maps all five published criteria to claim IDs,
  repository evidence, and public proof routes.
- [x] Replace every pending-publication qualifier after the public
  repository has actually passed visibility, push, tag, and clone checks.
- [x] Verify the clean-clone install, lint, typecheck, unit-test, production-build,
  `forge fmt --check`, and `forge build` README commands. Public RPC and complete browser/contract
  suites were verified separately on the frozen source.
- [x] Run the final outbound and relative-link checker over README and all
  submission documents.

## 6. Fresh unauthenticated production observation — Phase 7A pending

Use a clean unauthenticated browser and record timestamp, HTTP/browser result,
console/page failures, overflow, and visible testnet/non-production disclosure.
Do not connect a wallet or click a final signing action.

- [x] `/` serves Escrow Flow and identifies the problem and solution in the first
  viewport.
- [x] `/app` makes milestone creation the dominant action.
- [x] `/invoice/1` reconciles to current Coston2 state.
- [x] `/invoice/2` reconciles to current Coston2 state.
- [x] `/receipt/1` decodes preserved lifecycle evidence and working links.
- [x] `/receipt/2` decodes preserved lifecycle evidence and working links.
- [x] Unknown invoice (use `/invoice/999999`) fails closed without invented data.
- [x] Unavailable receipt (use `/receipt/999999`) fails closed without invented
  evidence.
- [x] Mobile landing has no horizontal overflow or inaccessible primary action.
- [x] Mobile receipt preserves settlement values, lifecycle evidence, and links.
- [x] The exact label `Illustrative $100 milestone · no transaction is being
  sent` remains visible with the scenario control.
- [x] No serious browser error, secret, credential, or local
  filesystem path is exposed by the public routes/assets.
- [x] Coston2, test-assets, no-audit, no-legal/fiat-escrow, and
  non-production-ready limitations remain visible.

Observation record: `docs/JUDGE_OBSERVATION.md` — **PASS**

## 7. Judge-path audit — Phase 7A pending

- [x] Fresh browser starts on production landing.
- [x] Problem and solution are identifiable from the first viewport.
- [x] One illustrative release-price scenario changes by keyboard or pointer.
- [x] Real settled invoice 2 opens.
- [x] Permanent receipt 2 opens.
- [x] Lifecycle transactions can be revealed.
- [x] One Coston2 explorer destination opens.
- [x] Returning to `/app` exposes milestone creation as the primary action.
- [x] No signature request occurs without an explicit final user action.
- [x] Record clicks, elapsed time, confusing copy, dead ends, loading delays,
  browser errors, mobile friction, and any blocker.
- [x] Describe the run as a structured automated product audit, not human
  testing.

## 8. Public-repository safety — Phase 7A pending

- [x] `.gitignore` excludes `.env*` (except an intentional example),
  `node_modules`, build output, `.vercel`, broadcast output, logs, archives, and
  local artifacts.
- [x] `.vercelignore` excludes secrets, keys, archives, source/test/tooling
  directories, and all artifacts except the exact runtime deployment/receipt
  allowlist.
- [x] Three initialized top-level submodule pins at Phase 7A start:
  `flare-periphery@ca264d6`, `forge-std@bf647bd`, and
  `openzeppelin-contracts@cab1993`; three nested OpenZeppelin test-only gitlinks
  are uninitialized.
- [x] Direct dependency licenses and upstream attribution are recorded in
  `docs/UPSTREAM.md`.
- [x] Run the project exact-key scanner over the complete working tree; no separate installed
  general scanner was available, so no large scanner toolchain was installed.
- [x] Scan every reachable Git object/history revision for private keys,
  mnemonics, tokens, cookies, browser profiles, recovery archives, ignored
  wallet-secret files, and credential-bearing environment data.
- [x] Audit tracked absolute local paths and either remove them from the public
  release or document a defensible non-secret disposition. Do not overlook
  historical deployment/status records.
- [x] Confirm the ignored owner-only wallet file, `.env.local`, `.vercel/`, local
  browser state, and recovery archives are absent from every commit and push.
- [x] Confirm the first public-clone root and all recursively initialized submodules are clean
  after verification. The final source tree must be rechecked after this checklist commit.

## 9. Public GitHub release — Phase 7A pending

Candidate repository: `https://github.com/Samfresh-ai/proofpay`

- [x] Confirm the authenticated GitHub owner and that `proofpay` is unused or is
  clearly this project; otherwise use `proofpay-flare`.
- [x] Create or update exactly one **public** repository without overwriting
  unrelated work and without force-pushing.
- [x] Push complete history and the staging submission commit. The final `SELF` commit still needs
  its last push below.
- [x] Add only these topics: `flare`, `fxrp`, `ftso`, `web3`, `payments`,
  `escrow`, `coston2`.
- [x] Preserve the already-public annotated `summer-signal-2026` tag at its earlier checklist
  commit and create `summer-signal-2026-final` at the final reviewed `SELF` commit without moving
  or force-updating the first tag.
- [x] Confirm visibility `PUBLIC`, remote URL, and pushed staging commit. The final remote commit
  and tag target remain the last publication checks below.
- [x] Clone the public repository into a fresh temporary directory with
  submodules and verify the clone contains no secret or private local state.
- [x] Do not create a GitHub Release page unless the submission form requires it.

Recorded public URL: `https://github.com/Samfresh-ai/proofpay`

Recorded pushed staging commit: `215f6caeeca442e6d9ab39e39c6dbe5407739413`

Recorded final tag and target: `summer-signal-2026-final` -> `SELF` (annotated tag, verified after
push). The earlier `summer-signal-2026` tag remains published at `ad1c741d21544a49a2793cb14d86f6db5f4d73e4`.
Recorded secret-scan result: `PASS` — zero high-confidence findings in 20 reachable revisions and
513 reachable objects; zero sensitive archive/credential paths.

## 10. Video and submission media — Phase 7A pending

- [x] Mandatory evidence-first scene manifest, voiceover, onscreen text, shot
  list, and claims map are complete and mutually consistent.
- [x] Real production capture set is complete; no invented transaction, fake
  cursor action, private wallet material, or hidden testnet label appears.
- [x] Every voiceover and onscreen claim maps to a `CLAIMS_LEDGER.md` ID.
- [x] Final candidates exist under `artifacts/submission/`: 1200×630 cover,
  landing, app, receipt, expanded evidence, and architecture image.
- [x] Media manifest records source route, capture block or timestamp,
  dimensions, SHA-256, and intended submission position for every candidate.
- [ ] Optional review cut, if rendered, remains local and is not uploaded in
  Phase 7A. This is non-blocking: no still-only cut was rendered because it would not satisfy the
  planned continuous walkthrough.

## 11. Final release validation — must run on the submission commit

- [x] Complete web validation: lint, typecheck, 65 unit tests, build, 27 deterministic browser
  tests, one production-hydration test, and four isolated live-read-only browser tests passed.
- [x] Complete contract tests: Foundry format, forced build, and all 69 tests passed.
- [x] Fuzz tests and stateful invariants: six 512-run financial properties and six
  128-run/depth-32 invariants passed.
- [x] Production build
- [x] Anonymous public-route smoke tests
- [x] Live read-only invoice-1 and invoice-2 reconciliation
- [x] Receipt-1 and receipt-2 verification, subject to the documented stale legacy
  current-party-balance comparison for invoice 1
- [x] Accessibility, keyboard, reduced-motion, mobile, and overflow checks
- [x] Public GitHub clone test
- [x] Clean-install test (`npm ci --ignore-scripts`; 418 packages installed from the lockfile)
- [x] README command verification for setup/build/core verification commands
- [x] Link check: 26 unique HTTPS destinations returned HTTP 200 after bounded retry; one relative
  Markdown link resolved locally.
- [x] Secret scan across working tree and complete Git history
- [x] Submission-claim review against the claims ledger
- [x] `git diff --check`
- [x] Final repository and initialized-submodule cleanliness
- [x] Production deployment remains `READY`; no deployment, DNS, contract, or
  chain mutation was performed for the documentation-only freeze
- [x] Phase 7A requested zero wallet signatures and broadcast zero blockchain
  transactions

## 12. Finalization and sign-off

- [x] Update `docs/STATUS.md`, `docs/CLAIMS_LEDGER.md`, and this checklist with
  exact Phase 7A results.
- [x] Commit with exact subject `docs: prepare Summer Signal submission` (`SELF`).
- [x] Push the final `SELF` commit publicly and verify the remote `main` ref.
- [x] Create `summer-signal-2026-final` because the original tag was already public; verify its
  annotated object and peeled `SELF` target.
- [x] Verify remote branch/tag state from a fresh tagged clone.
- [x] Confirm the repository is clean after all evidence is committed.

Final commit: `SELF` (resolved by the public `main` ref and final tag)

Final public repository: `https://github.com/Samfresh-ai/proofpay` (`PUBLIC`)

Final release tag: `summer-signal-2026-final`

Final validator and timestamp: direct Codex, 2026-08-12 Africa/Lagos

## Gate decision

Every required Phase 7A gate is closed with evidence. The optional low-resolution review cut was
not rendered and is explicitly non-blocking; the complete final recording remains the next phase.

`READY FOR FINAL VIDEO AND DORAHACKS SUBMISSION`
