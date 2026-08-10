# ProofPay interface specification

Status: Phases 5A–5D are implemented and validated, and Phase 6A production remains live at the
existing canonical domain. Phase 6B1 Signal Ledger implementation, local validation, and its
single protected non-production Preview pass.

## Current synopsis

The current application has `/app`, `/invoice/[id]`, and `/receipt/[id]`. Arbitrary positive invoice
IDs use direct pinned state reads; verified decoded receipts are available only where lifecycle
transaction locators are preserved. Both invoice `1` and browser-settled invoice `2` have preserved
locators. No generic event-history discovery, backend, database, indexer, authentication, or
cross-device journal exists.

Funding uses one frozen intent across allowance review, exact approval when required, and funding.
Under ordinary quote movement inside the accepted maximum, that means one approval rather than a
requote-and-reapprove loop. Expiry, an amount above the maximum, or an account, chain, contract, or
invoice mismatch invalidates the intent. Approval remains allowance-driven and unlimited approval
is never prepared.

Released public records use `SETTLED`, `Payment settled`, and `View settlement receipt` while
`RELEASED` remains the technical contract state. The settlement rail leads with human meaning—
milestone agreed, FXRP funded, delivery evidence attached, payment settled—and keeps event names,
blocks, transactions, amounts, price observations, and commitments in progressive technical
evidence disclosures. The warm editorial document, compact mobile rail, shortened identifiers,
keyboard focus, and reduced-motion behavior remain the current visual and accessibility direction.

Top-up is repeatable at the intent layer because the contract may require another exact shortfall
after a later XRP price decrease. A top-up intent binds chain, contract, invoice, client account,
action, observed locked FXRP, exact required top-up, accepted maximum, quote deadline, price value,
price decimals, price timestamp, and a deterministic hash. Prepared state blocks the same intent;
wallet-open uncertainty blocks an overlapping same-scope signing request, and any submitted
transaction in that scope must reconcile before a newer intent is created. A broadcast intent hash
cannot be reused, but confirmed or
reverted history does not block a distinct later quote. Abandoned unsigned history may be prepared
again because it was never submitted. Account, chain, contract, or invoice changes invalidate the
active intent; reload preserves and reconciles submitted state.

The top-up control is available only to the connected client for a `SUBMITTED` invoice when a fresh
release quote reports a nonzero shortfall and no applicable intent is pending reconciliation. A
zero-shortfall refresh offers release, not top-up. Funding, evidence submission, release,
cancellation, and refund retain their one-time state protections.

## Phase 6B1 Signal Ledger interface — Preview gate passed

Phase 6B1 changes the public presentation and product hierarchy without changing the deployed
contract, wallet-action policy, funding intent, journal/reconciliation behavior, evidence
commitments, receipt locators, canonical production domain, or current production deployment. The
locked visual direction is recorded in `docs/DESIGN_DIRECTION.md`. Local automated, read-only live,
visual, and protected hosted-Preview evidence validates the implementation.

### Landing page

`/` becomes a real product page in this fixed order: product header; hero and illustrative
milestone; problem; how ProofPay works; price protection; live proof; built on Flare; final call to
action. Its header contains ProofPay, `How it works`, `Live proof`, a visible `Coston2 testnet`
badge, and `Create a milestone`; it contains no wallet control.

The hero leads with `Keep the milestone in dollars. Settle it in FXRP.` and explains that the
milestone is priced at funding and release, a 10% FXRP buffer protects the target, unused FXRP
returns to the client, and a shortfall blocks release until top-up. Its primary action opens
`/app`; the secondary action opens `/receipt/2`.

The hero scenario is labelled `Illustrative $100 milestone · not live Coston2 data`. It fixes the
funding price at `$1/XRP`, base at `100 FXRP`, buffer at `10 FXRP`, and lock at `110 FXRP`:

| Release price | Required now | Result |
| --- | --- | --- |
| `$1.25` | `80 FXRP` | payout `80`, refund `30` |
| `$1.00` | `100 FXRP` | payout `100`, refund `10` |
| `$0.95` | `105.263158 FXRP` | payout `105.263158`, refund `4.736842` |
| `$0.90` | `111.111112 FXRP` | shortfall `1.111112`; release blocked pending top-up |

The visible calculation contains only USD target, locked FXRP, required FXRP now, and result. Four
buttons retain focus, expose the result through a polite live region, and switch instantly under
reduced motion. The scenario is explanatory arithmetic, never a fallback for failed Coston2 data.

`How ProofPay works` maps `AGREE -> FUND -> DELIVER -> SETTLE`, plus the derived `BLOCKED` outcome,
to the actual invoice record, protected quote, evidence commitment, release quote, and contract
events. Price protection uses one causal calculation and no chart. `Live proof` is headed `One
settled milestone, decoded from Coston2`, uses only verified invoice `2` values, and keeps full
contract, transaction, and commitment identifiers behind the existing copy/reveal/explorer
controls. The final action is headed `Create a dollar-priced FXRP milestone` and opens `/app`.

### Application shell and invoice hierarchy

Landing, `/app`, and active invoice controls use a modern system sans on the cool shell canvas.
Only receipt/document inserts retain the editorial serif and warm paper palette. The product header
contains ProofPay, Coston2 context, wallet state on application routes, and one contextual action;
there is no sidebar.

`/app` makes milestone creation dominant. When disconnected, its primary instruction is `Connect
wallet to create a milestone`; the form stays accessible but visually recedes. Existing milestone
lookup remains compact. An empty transaction journal is not rendered, and recent activity appears
only when entries exist.

Active invoices show, in order, one lifecycle strip; state, role, USD target, lock, and next
permitted action; one action focus panel; and progressively disclosed technical evidence. The
action headings are state-specific: `Fund this $100 milestone`, `Attach delivery evidence`, `Add
the required top-up`, or `Release payment`. The always-visible action summary answers what happens,
the maximum movement, recipient, what may change, and the proof of completion. Network, contract,
account, invoice, deadlines, and hashes sit under `Review exact transaction details`. All existing
policy, quote, approval, signing, broadcast, reconciliation, and journal hooks remain authoritative.

Terminal invoices show state, payout/refund where confirmed, a compact lifecycle, and `View
settlement receipt`; they do not render an empty action panel. Product copy says `SETTLED`, while
`RELEASED` remains a disclosed technical state. Mobile renders one lifecycle representation.

### Receipt refinements and evidence boundary

Receipts preserve their verified values and copy/reveal/explorer behavior. `SETTLEMENT RECEIPT ·
INVOICE #N` becomes more prominent than the long milestone title. The two technical disclosures are
named `How this settlement was confirmed` and `Commitments and final contract state`. The receipt
uses a compact one-line site footer and removes the outer receipt shadow on small screens.

Loading, RPC failure, unknown invoice, and unavailable receipt remain distinct fail-closed states.
Phase 6B1 passed checks at `320`, `390`, `768`, `1024`, and `1440` CSS pixels plus a `200%`-zoom
equivalent viewport. Keyboard focus, reduced motion, Axe serious/critical findings, wrapping,
target sizes, hydration, exact scenario math, protected behavior, controlled loading/RPC failure,
and read-only Coston2 reconciliation all pass. The evidence includes 12 pre-edit baselines and 18
visually reviewed final captures under `artifacts/signal-ledger/`; the final capture manifest
records zero horizontal overflow, console errors, page errors, signature requests, transaction
sends, or broadcasts. No human usability study, WCAG-conformance claim, audit, mainnet,
legal-escrow, fiat-settlement, or production-readiness claim is introduced.

Implementation commit `f43dcb886265722193f35a60e38cb7fce5ca7fe1` was deployed once to the
protected, unaliased Vercel Preview
`https://proofpay-paysmat-k90ehmlen-adamolekuntemitope4-2758s-projects.vercel.app` as deployment
`dpl_zQ9sneHYfRMPimFJJSKBSs4W8sCF`. The Preview target reached `READY`/`STAGED`; Vercel records
creation at `2026-08-10T16:47:05.590Z` and readiness at `2026-08-10T16:47:32.117Z`.

`artifacts/signal-ledger/preview-proof.json` records `PASS`: 13 route checks, 13 Axe scans with
zero serious or critical findings, eight screenshots at `390`, `640`, and `1440` CSS-pixel widths,
and zero horizontal overflow, console errors, page errors, or failed responses. It also records
the exact four keyboard-operated scenario outcomes with retained focus and polite live-region
updates. A strict injected wallet prepared one create simulation with zero signing, transaction
send, or broadcast calls. An independent browser pass covered all required routes and structural
accessibility at `320` and `1440` CSS pixels. Read-only Coston2 reconciliation passed for invoice
`1` at block `33875416` and invoice `2` at block `33875367`. This is automated protected-Preview
evidence, not active-live-invoice coverage, anonymous access evidence, human usability testing, or
WCAG-conformance proof.

Production deployment `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9` and canonical domain
`https://proofpay.paysmat.xyz` remain unchanged. Phase 6B1 performed no promotion, DNS change,
production alias, or contract transaction.

## Historical Phase 5A read-only boundary

This section records the Phase 5A checkpoint. At that checkpoint, the interface presented contract
and transaction-receipt evidence only. It introduced no wallet connection, signature request,
transaction control, authentication, database, indexer, API server,
analytics, landing page, or contract change. `/invoice/[id]` supports arbitrary positive invoice
IDs through direct contract reads. `/receipt/1` was then the one verified historical receipt; another
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
and a browser-created invoice transaction journal were outside the Phase 5A boundary. Later phases
added wallet actions, a browser-local journal, and the invoice `2` locator without adding generic
history indexing.

## Evidence-fidelity map

| Displayed fact | Authoritative evidence | Source object | Relationship |
| --- | --- | --- | --- |
| Contract and network | Phase 4A deployment record | `deployment/coston2.json` | deployment configuration |
| Parties, target, deadline, scope hash, status, locked FXRP, price observations, evidence hash | current `invoices(id)` result | live Coston2 contract read | current durable record |
| Active liabilities | `activeFxrpLiabilities()` | live Coston2 contract read | current aggregate state |
| Contract FXRP balance | `balanceOf(contract)` | live Coston2 FXRP read | current token balance |
| Lifecycle transaction, block, event values | decoded ProofPay event from a preserved verified locator | live Coston2 receipts for invoices 1 and 2 | proof for one transition |
| Evidence URI | `EvidenceSubmitted` event | live Coston2 evidence receipts for invoices 1 and 2 | opaque retrieval reference committed by the evidence hash |
| Payout and client refund | `InvoiceReleased` event | live Coston2 release receipts for invoices 1 and 2 | confirmed settlement amounts |
| Milestone title and scope lines | canonical manifest whose exact bytes match the live scope hash | `artifacts/live-scope-manifest.json` and `artifacts/browser-scope-manifest.json` plus live `scopeHash` | hash-verified offchain description |
| Completion note | canonical manifest whose exact bytes match the live evidence hash | `artifacts/live-evidence-manifest.json` and `artifacts/browser-evidence-manifest.json` plus live `evidenceHash` | hash-verified offchain description |
| Expected invoice 1 and 2 values | independently verified settlement records | `artifacts/coston2-settlement-receipt.json` and `artifacts/coston2-browser-settlement-receipt.json` | development and test oracles only; never the runtime data adapter |

Unknown manifests are not guessed. Their pages use `ProofPay milestone #ID` and show the onchain
hash without inventing a title or scope. Receipt events remain four parallel evidence rows and are
accepted only when every referenced transaction decodes for the requested invoice from the
deployed contract at its preserved locator. Locators currently exist for invoices `1` and `2`;
other released IDs receive an honest unavailable-receipt state.

## Direction sheet

### Product nouns

Invoice, milestone, agreement, client, freelancer, USD target, FXRP lock, delivery deadline,
scope commitment, evidence attachment, price observation, payout, refund, liability, settlement,
transaction, receipt, Coston2 contract.

### User priority

The first question is: **What happened to this milestone and its money?** The next available step is
either the one role- and state-authorized wallet action or, for completed records, following the
receipt and revealing the exact chain evidence that proves a stage.

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
| `RELEASED` | Payment settled | The release state and price are confirmed. Show a receipt link only when its transaction locator is verified. |
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

## Historical Phase 5A validation boundary

Phase 5A can claim automated accessibility checks, responsive screenshot inspection, successful
live reconciliation, and passing code/build tests when evidence exists. Its pinned numeric block
reads do not eliminate the small reorganization race that a block-hash-bound client would close.
It cannot claim usability testing, production readiness, audit coverage, legal escrow, or mainnet
behavior.

## Historical Phase 5A implementation and validation record

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

## Historical Phase 5B1 wallet-action extension

This section preserves the Phase 5B1 implementation record. Its requirement to requote funding
after approval was superseded by the Phase 5C frozen funding intent, and its action-level confirmed
journal rule was refined for repeatable top-up intents in Phase 5D. Phase 5B1 added action
preparation to the same document hierarchy; it did not replace the Phase 5A
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

## Historical Phase 5B2 observed live behavior

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

## Phase 5C settlement-experience refinement

Phase 5C preserves the editorial financial-document direction and fixes the two Phase 5B2 defects
without changing the contract, deployment, receipt locators, or transaction policy.

### Deadline boundary

- The creation form converts explicit clock fields and an IANA timezone into one Unix timestamp.
  It does not pass a timezone-free string to `Date` parsing.
- The 24-hour preset adds exactly `86,400` seconds to the current epoch instant. It does not imply
  that the window starts after confirmation.
- Before signing, the form and transaction intent show the selected local clock time with timezone
  and offset, its UTC equivalent, and the exact contract seconds.
- Nonexistent daylight-saving clock times are rejected. When a clock time occurs twice during a
  fall-back transition, the earlier matching instant is selected deterministically.
- Invoice 2 remains immutable historical evidence with an `82,853`-second creation-to-deadline
  interval; the interface does not rewrite or relabel that value.

### Stable funding intent

One frozen funding intent binds the preview requirement, 10% protected base, accepted 2% maximum,
quote deadline, invoice, account, chain, contract, and intent hash. The browser may request one
exact approval for that maximum, then simulate and fund with the same maximum and deadline. It
does not refresh while approval is pending or confirmed. Expiry, an amount above the maximum, or a
different account, chain, or invoice invalidates the intent. Existing sufficient allowance skips
approval; unlimited approval is never prepared. The contract still calculates and pulls only the
current required amount.

### Hydration and hierarchy

Wallet-derived account, chain, connection, and action state remain hidden until a client hydration
boundary has been crossed. Server and first-client markup use the same accessible loading panel,
and the document headings and evidence hierarchy do not change. Development and production
browser tests treat any hydration warning as a failure.

Released public surfaces use `SETTLED`, `Payment settled`, and `View settlement receipt`.
`RELEASED` is shown only as technical contract state. The invoice and receipt mastheads are
`PROOFPAY / MILESTONE RECORD` and `PROOFPAY / SETTLEMENT RECEIPT`; reader copy uses `ProofPay
escrow`, while `ProofPayEscrow` remains only for the deployed contract.

The settlement rail leads with `Milestone agreed`, `FXRP funded`, `Delivery evidence attached`,
and `Payment settled`. Verified event names, blocks, transactions, amounts, and commitments sit
beneath those human meanings. Mobile adds `Agreed -> Funded -> Delivered -> Settled` near the
invoice top and keeps the detailed rail below. Full identifiers are replaced by a stable shortened
form with copy and reveal controls; explorer links remain available where the identifier has a
canonical Coston2 destination.

Confirmed released views explain the 10% funding protection using the actual lock, payout, refund,
funding price, release price, and percentage movement. No chart or inferred economic value is
introduced. Sample top-up states remain visibly fixture-only and say that the escrow no longer
covers the target and no payment has been released.

Each role-aware action remains one band inside the milestone document. Its prepared intent answers
what happens, the token maximum, recipient, what can move before confirmation, and the evidence
that proves completion. Primary labels name the product action, such as `Fund this $5 milestone`
or `Release payment`; `Confirm transaction` is not used as a primary label.

Phase 5C validation passed 48 unit tests, 12 deterministic browser tests, one production hydration
test, three live read-only browser tests, lint, strict typechecking, the production build, invoice 1
reconciliation, invoice 2 receipt verification, exact secret scanning, accessibility scans, mobile
overflow checks, and `git diff --check`. Seven visually inspected screenshots are under
`artifacts/interface-refinement/`. This remains automated Coston2 testnet evidence, not human
usability, audit, mainnet, legal-escrow, or production-readiness evidence.

## Phase 5D repeatable top-up journal rule

Phase 5D changes browser intent policy only; it does not change the contract, deployment, product
scope, interface direction, receipt locators, or one-time lifecycle protections. The deterministic
intent hash covers the complete top-up observation and client acceptance described in the current
synopsis, so a later price observation and shortfall produce a distinct intent without erasing the
first top-up from journal history.

`prepared` blocks the same active intent. `awaiting_wallet` also blocks an overlapping same-scope
signing request because the wallet may still broadcast it. `submitted` blocks further top-up
creation across the same account, chain, contract, and invoice until its receipt is reconciled.
`confirmed` and `reverted` prove that a broadcast hash has been consumed and prevent that exact
intent from being sent again, but do not block a later distinct quote. `abandoned` remains history
and may be prepared again because no transaction was submitted. Reload restores active intent
state and reconciles a submitted hash before offering further action.

This rule is proved with deterministic simulated price decreases, field-by-field identity checks,
exact-hash and rapid-double-sign replay checks, zero-shortfall policy coverage, reload and delayed-
receipt reconciliation, ambiguous post-send/no-hash fail-closed handling, explicit-rejection
retryability, unresolved-record quarantine, context invalidation, and regression checks for
approval plus the one-time actions. The final gate passed 58 unit tests, 15
simulated browser tests, one production hydration test, the production build, top-up-state Axe,
390-pixel overflow and keyboard checks, current read-only reconciliation for invoices `1` and `2`,
protected-evidence checks, exact secret scanning, and `git diff --check` without a broadcast.

This deterministic evidence does not claim that a live Coston2 top-up, second top-up, cancellation,
or missed-deadline refund has been demonstrated. It adds no cross-device journal, audit, mainnet,
legal-escrow, fiat-settlement, human-usability, or production-readiness evidence.
