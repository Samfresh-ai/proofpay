# ProofPay read-only interface specification

Status: Phase 5A implemented and validated on 2026-08-08.

## Phase boundary

Phase 5A presents contract and transaction-receipt evidence only. It introduces no wallet
connection, signature request, transaction control, authentication, database, indexer, API server,
analytics, landing page, or contract change. `/invoice/[id]` supports arbitrary positive invoice
IDs through direct contract reads. `/receipt/1` is the one verified historical receipt; another
positive receipt ID returns an honest unavailable state because no verified transaction locator
exists for it.

The invoice route never calls `eth_getLogs` and never scans history. It reads the invoice record,
status, retained lock, price observations, commitments, aggregate liabilities, and contract FXRP
balance at one pinned block. Each RPC request has a 15-second timeout and one retry. The receipt route uses
`artifacts/coston2-settlement-receipt.json` only to locate invoice 1's four lifecycle transaction
hashes, then fetches each referenced transaction, receipt, and block. Every lifecycle transaction
must contain exactly one log from the deployed ProofPay contract, that log must decode to the
expected event, and its values must match the verified invoice. The route then makes one pinned
current-state snapshot for the invoice, aggregate liabilities, contract balance, and relevant party
balances. Any contradiction fails the receipt. A generic history/indexing layer
and a browser-created invoice transaction journal remain explicit post-hackathon work.

## Evidence-fidelity map

| Displayed fact | Authoritative evidence | Source object | Relationship |
| --- | --- | --- | --- |
| Contract and network | Phase 4A deployment record | `deployment/coston2.json` | deployment configuration |
| Parties, target, deadline, scope hash, status, locked FXRP, price observations, evidence hash | current `invoices(id)` result | live Coston2 contract read | current durable record |
| Active liabilities | `activeFxrpLiabilities()` | live Coston2 contract read | current aggregate state |
| Contract FXRP balance | `balanceOf(contract)` | live Coston2 FXRP read | current token balance |
| Lifecycle transaction, block, event values | decoded ProofPay event from a verified transaction locator | live Coston2 transaction receipts for invoice 1 | proof for one transition |
| Evidence URI | `EvidenceSubmitted` event | live Coston2 evidence transaction receipt for invoice 1 | opaque retrieval reference committed by the evidence hash |
| Payout and client refund | `InvoiceReleased` event | live Coston2 release transaction receipt for invoice 1 | confirmed settlement amounts |
| Milestone title and scope lines for invoice 1 | canonical manifest whose exact bytes match the live scope hash | `artifacts/live-scope-manifest.json` plus live `scopeHash` | hash-verified offchain description |
| Completion note for invoice 1 | canonical manifest whose exact bytes match the live evidence hash | `artifacts/live-evidence-manifest.json` plus live `evidenceHash` | hash-verified offchain description |
| Expected invoice 1 values | independently verified Phase 4B receipt | `artifacts/coston2-settlement-receipt.json` | development and test oracle only; never the runtime data adapter |

Unknown manifests are not guessed. Their pages use `ProofPay milestone #ID` and show the onchain
hash without inventing a title or scope. Receipt events remain four parallel evidence rows and are
accepted only when each decodes for invoice 1 from the deployed contract at its locator hash.

## Direction sheet

### Product nouns

Invoice, milestone, agreement, client, freelancer, USD target, FXRP lock, delivery deadline,
scope commitment, evidence attachment, price observation, payout, refund, liability, settlement,
transaction, receipt, Coston2 contract.

### User priority

The first question is: **What happened to this milestone and its money?** The next available action
is read-only: follow the receipt or reveal the exact chain evidence that proves a stage.

### Information character

The interface is sparse, calm, operational, sequential, and trust-bearing. The milestone terms and
money movement lead; chain mechanics sit one disclosure deeper. It persuades only through observed
evidence.

### Visual thesis

The interface feels like an editorial financial document crossed with an onchain settlement
terminal because both parties need a legible agreement and independently checkable proof, expressed
through one dominant paper sheet, a chronological rule-based rail, serif document typography,
monospaced evidence, near-black ink, a restrained Flare-red accent, and motion limited to state
reveal.

### Signature interaction

The signature interaction is **evidence reveal**. The invoice's four-stage settlement rail remains
visible in the main reading flow. On the receipt, the settlement conclusion and money movement stay
visible while keyboard-operable native disclosures—closed by default—reveal the four lifecycle
transactions, blocks, hashes, commitments, and current contract state. The primary claim therefore
stays readable while its detailed proof remains one action away.

## Hierarchy and page composition

### Invoice document

1. ProofPay/Coston2 document masthead and status stamp.
2. Milestone title, invoice ID, target, deadline, parties, scope commitment.
3. Plain-language current-state summary answering owed, locked, happened, next, and proof.
4. A live release preview when available, labelled as a preview and never as a completed payment.
5. Evidence attachment when submitted.
6. Contract/network footer.
7. Settlement rail: `AGREED → FUNDED → DELIVERED → SETTLED`, with reached stages derived only from
   the current stored status. Decoded historical events appear only on the verified receipt.

On wide screens, the rail sits beside the document without becoming a dashboard sidebar. On narrow
screens, the complete document stays first and the rail follows as one vertical chronology.

### Settlement receipt

1. `SETTLED` stamp and milestone identity.
2. Four aligned money lines: target, locked, freelancer payout, client refund.
3. One plain-language price-protection explanation.
4. Funding and release price observations beside their feed timestamps.
5. Evidence attachment and scope/evidence commitments.
6. Progressive disclosures for settlement evidence, contract state, and the four parallel lifecycle
   transaction rows.
7. Testnet and product-limit notice.

Approval transactions and separate gas setup are not lifecycle stages and do not enter the primary
receipt. The four ProofPay lifecycle transactions remain parallel evidence rows under the receipt.

## State behavior

| State | Primary reading | Rail reached | Next-state language intent |
| --- | --- | --- | --- |
| unknown | No invoice record exists | none | no action; verify ID |
| `CREATED` | Terms exist; no FXRP is locked | agreed | waiting for client funding |
| `FUNDED` | FXRP is locked; delivery evidence is absent | agreed, funded | waiting for delivery evidence |
| `SUBMITTED` | Evidence exists; client release is pending | agreed, funded, delivered | waiting for client decision, unless a live quote proves top-up is required |
| `RELEASED` | Current contract state records release | all | link to confirmed payout/refund evidence only when a verified transaction locator exists |
| `CANCELLED` | Freelancer cancelled before funding | agreed | terminal; no FXRP was locked |
| `REFUNDED` | Missed unsubmitted milestone returned to client | agreed, funded | terminal; full lock returned |

`TOP_UP_REQUIRED` is derived, never shown as a stored contract state. A labelled test-only fixture must
prove this presentation: “Sample scenario — Top-up required. The escrow no longer covers the
milestone target. No payment has been released.” It must state that it is not live Coston2 evidence
and must never be used as a production fallback.

The App Router loading state announces that Coston2 data is being read. RPC failure is a full,
plain-language error document with a retry control. Unknown invoice is a normal not-found document,
not an RPC error. No stale or failed read falls back to the Phase 4B verification artifact.

## Product copy ledger

Human-facing copy follows the sequence object → event → consequence → evidence → next step. Values
are inserted only after their source reads succeed.

| Condition | Heading | Consequence and next step |
| --- | --- | --- |
| loading | Waiting for Coston2 data | Reading the invoice terms and settlement evidence. |
| RPC failure | Coston2 data could not be read | The contract or its events did not respond. Try again. |
| unknown | This invoice does not exist | No record was found at the deployed ProofPay contract on Coston2. Check the invoice ID. |
| `CREATED` | Agreement recorded | No FXRP has been locked. Waiting for the client to fund the milestone. |
| `FUNDED` | Milestone funded | The client locked the displayed FXRP amount. Waiting for delivery evidence. |
| `SUBMITTED` | Delivery evidence submitted | FXRP remains locked while the client reviews the evidence. Waiting for the client’s decision. |
| derived underfunding | Top-up required | The escrow no longer covers the milestone target. No payment has been released. |
| `RELEASED` | Payment released | The release state and price are confirmed. Show a receipt link only when its transaction locator is verified. |
| `CANCELLED` | Invoice cancelled | The freelancer cancelled before funding. No FXRP was locked. |
| `REFUNDED` | FXRP returned to the client | The deadline passed without submitted evidence. The full lock returned to the client. |

Receipt copy uses `Confirmed funding` and `Confirmed release` for mined observations. Any live
`quoteRelease` result is labelled `Preview quote` and explicitly says that it is not a confirmed
payout. The released live result reads:

> The client locked 5.299945 FXRP. At release, 4.818748 FXRP covered the $5.00 target. The remaining
> 0.481197 FXRP returned to the client.

The numeric sentence is composed from live event values; the fixed figures above are acceptance
evidence for invoice 1, not hardcoded runtime copy.

## Typography, color, depth, and motion

- Document face: a system editorial serif stack for titles and financial values.
- Utility face: a restrained system sans for labels and guidance.
- Evidence face: `ui-monospace` for addresses, hashes, timestamps, blocks, and transactions.
- Canvas: warm off-white; document: lighter paper; ink: near-black; rules: warm gray.
- Accent: one Flare-derived red for confirmed stamps, reached rail markers, focus rings, and links.
- Corners remain mostly square; subtle shadow and a fine border provide paper depth.
- No gradients, glow, glass, decorative chart, token imagery, card grid, or permanent navigation.
- Motion is a short opacity/position settle on document load and native disclosure reveal. Under
  `prefers-reduced-motion: reduce`, all nonessential motion is disabled.

## Accessibility and responsive acceptance

- One semantic `h1` per route with ordered headings beneath it.
- Native links and `details/summary` controls remain keyboard operable with visible focus rings.
- Status is repeated in text and shape/stamp treatment; color is never the only signal.
- Loading and RPC failure messages use appropriate live-region semantics.
- Hashes and addresses wrap with `overflow-wrap:anywhere`; primary content never requires
  horizontal scrolling.
- At 390 CSS pixels, money labels and values stack without clipping and the receipt remains one
  column. At desktop width, the invoice document and rail form an asymmetric two-column spread.
- Explorer links have action-specific accessible names and open the public Coston2 explorer.

## Genericness check

The screen has no generic metric tiles, bento grid, interchangeable SaaS hero, broad navigation,
or decorative container set. Every named component is a ProofPay object: `MilestoneDocument`,
`SettlementRail`, `MoneyLine`, `PriceObservation`, `EvidenceAttachment`,
`TransactionEvidence`, `SettlementReceipt`, `StatusStamp`, and `AddressLabel`.

## Validation boundary

Phase 5A can claim automated accessibility checks, responsive screenshot inspection, successful
live reconciliation, and passing code/build tests when evidence exists. Its pinned numeric block
reads do not eliminate the small reorganization race that a block-hash-bound client would close.
It cannot claim usability testing, production readiness, audit coverage, legal escrow, or mainnet
behavior.

## Implementation and validation record

- `/invoice/[id]` and `/receipt/[id]` are dynamic server-rendered App Router routes. Invoice IDs use
  direct pinned reads; only `/receipt/1` has a verified historical transaction locator.
- The receipt reads lifecycle stages in order to keep the public-RPC burst bounded. Transaction and
  receipt retrieval within one stage may occur together; the next stage begins only after the
  current event and block reconcile.
- Final live reconciliation passed at block `33799319`. The final live browser suite passed two
  route reads and wrote all five required screenshots from live Coston2 data. The screenshots show
  pinned blocks `33799377` (invoice) and `33799395` (receipt).
- TypeScript, ESLint, 18 unit tests, the production build, three fixture browser tests, two live
  browser tests, desktop/mobile/expanded Axe scans, 390-pixel overflow checks, exact secret scans,
  protected-file checks, and `git diff --check` passed.
- A temporary RPC failure rendered the explicit error and retry document without substituting
  fixtures. Final validation resumed only after live reconciliation succeeded.

## Phase 5B1 wallet-action extension

Phase 5B1 adds action preparation to the same document hierarchy; it does not replace the Phase 5A
read boundary or alter `/receipt/[id]`. `/app` creates or locates a milestone. `/invoice/[id]`
derives the next available action from the connected account, invoice state, deadline, chain, and
latest simulated quote. Every state-changing control requires an injected EVM wallet connected to
Coston2 chain `114`.

| Invoice state | Connected role | Available preparation |
| --- | --- | --- |
| `CREATED`, before deadline | client | quote, allowance check, exact approval when required, funding simulation |
| `CREATED` | freelancer | cancellation simulation |
| `FUNDED`, at or before deadline | freelancer | deterministic evidence commitment and submission simulation |
| `FUNDED`, after deadline | client | full-lock refund simulation |
| `SUBMITTED` | client | fresh release quote, then exact top-up or release simulation |
| terminal or unrelated | any | no state-changing control |

The wallet panel distinguishes no wallet, wrong network, connected client, connected freelancer,
and unrelated wallet. It uses the connected account's actual chain ID rather than the application's
configured default. A signature button appears only after the relevant simulation passes. The
review always shows action, network, contract, connected account, invoice ID, token/amount, quote
deadline, accepted maximum, expected result, and deterministic intent hash.

Funding independently recomputes the contract's upward-rounded USD conversion and 10% protection.
The user-selected tolerance is bounded from 0.5% through 5%. When the FXRP allowance is below the
accepted maximum, approval is a separate intent for that exact amount; unlimited approval is never
prepared. Funding must be quoted and simulated again after approval.

Evidence uses sorted canonical UTF-8 JSON. Public HTTP(S) delivery URLs are normalized, sorted,
deduplicated, stripped of fragments, and rejected when they contain credentials or local/private
hosts. Optional browser transaction references, wallet-actions commit, milestone title, and
completion note enter the same manifest. The displayed
`keccak256` commitment proves the submitted bytes only, not delivery truth or quality.

The browser-local transaction journal records prepared, awaiting-wallet, submitted, confirmed,
reverted, or abandoned status. It stores action identity and public transaction metadata only. A
stale awaiting-wallet entry returns to prepared after reload; submitted hashes reconcile through
their receipts. Prepared and submitted entries block duplicates. Confirmed state-changing actions
remain blocked until authoritative invoice state changes, while a confirmed approval may be
replaced by a newly simulated exact approval when a moving quote makes the prior allowance too
small. This journal is not an indexer, account, database, or cross-device history.

All Phase 5B1 browser signing tests use a deterministic injected EIP-1193 provider. They do not
contact the public Coston2 RPC and cannot broadcast a live transaction. Therefore Phase 5B1 proves
the preparation, simulation, wallet-request, receipt, and journaling behavior under test, but not a
real wallet's live Coston2 settlement.

Phase 5B1 validation passed 29 unit tests, ten fixture browser tests, two live read-only browser
tests, the production build, lint, typecheck, live settlement reconciliation, exact secret scans,
dependency audit, protected-file comparison, and `git diff --check`. The action browser tests cover
serious/critical Axe results, visible keyboard focus, and 390-pixel overflow. No real Coston2 wallet
transaction was sent.

## Phase 5B2 observed live behavior

The Phase 5B2 harness injects a temporary EIP-1193 provider through Playwright. Its signer and
private keys remain in the Node test process; no signer bridge exists in production application
code. Before each browser click, the harness preserves the visible intent and a pinned balance/state
snapshot. It then permits one broadcast, records the returned hash immediately, waits for the
receipt, and preserves the post-state. A completed journal skips all write actions on replay.

Invoice `2` exercised the live `CREATED → FUNDED → SUBMITTED → RELEASED` path. The funding preview
showed the base conversion, 10% protection, 2% maximum, allowance, price time, and quote deadline.
Four successive exact approvals were required because each refreshed live quote briefly exceeded
the prior allowance by a small atomic amount. The final funding lock was `2.126887 FXRP`. The
release preview required no top-up and resolved to `1.933309 FXRP` payout plus `0.193578 FXRP`
refund. The terminal page removed action controls, and `/receipt/2` displayed the decoded result.

The browser run recorded zero network switches, six quote refreshes, eight wallet prompts, four
approval prompts, zero rejected or duplicate actions, and one reload reconciliation. Action and
receipt Axe scans had no serious/critical results, and 390-pixel invoice and receipt pages did not
overflow horizontally. This is automated evidence, not human usability validation.

Two issues are preserved for refinement: `datetime-local` timezone interpretation produced an
`82,853`-second confirmed delivery window instead of exactly `86,400`, and restored injected-wallet
state emitted a development hydration warning before client rendering recovered. Neither value is
hidden or generalized into a production-readiness claim.
