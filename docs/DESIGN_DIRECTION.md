# Escrow Flow design direction

Status: Phase 6B2 implementation, local validation, protected Preview, and promoted Production pass.
Escrow Flow is the current presentation direction. Automated visual evidence does not substitute
for human usability research or a WCAG-conformance audit.

## Phase 6B2 Escrow Flow

### Thesis and causal mechanism

Escrow Flow makes the product's actual money logic visible before introducing technical proof:
`USD agreement -> FXRP lock -> payout + refund`, or an amber `top-up required` barrier when the
existing lock cannot cover the target. The hero pairs the product promise with this mechanism in
the first viewport. Its disclosure is exact: `Illustrative $100 milestone · no transaction is
being sent`. The four scenarios preserve the tested six-decimal results already documented here;
they are client-side explanatory arithmetic and never replace a failed or unavailable Coston2 read.

The application is the operational continuation of that mechanism. Active milestones lead with
the next authorized action and its movement boundary. Terminal milestones present `SETTLED`, the
confirmed payout and refund, and only then the handoff `Completed settlement -> permanent proof`.
The settlement receipt remains a separate archival object rather than adopting the operational
terminal treatment.

### Visual system

- Landing, application, and invoice routes use a light editorial shell (`#F2F1EC`), white
  operational surfaces (`#FFFEFA`), near-black ink (`#121411`), and Flare red (`#C9143A`) for rules,
  action edges, and decisive controls.
- The hero mechanism and transaction-intent surfaces use dark `#171A17` fields. They are reserved
  for causal simulation and exact action review, not used as an ambient crypto theme.
- Amber is reserved for the insufficient-lock/top-up barrier. Confirmed payout/refund remains a
  distinct successful outcome; color is reinforced by labels and structure.
- Product, terminal, money, and control hierarchy use bold modern sans typography. Technical
  identifiers remain monospaced. The warm receipt canvas and serif document insert remain the only
  archival paper layer.
- Thin rules and red guides organize the route. Square surfaces dominate; decorative card grids,
  gradients, glow, coins, token art, bento layouts, and prototype-only routes or assets are absent.

### Behavior, responsive layout, and accessibility

- Scenario selection changes only the causal result. Native buttons support pointer, Tab,
  Arrow-key, Home/End, Enter, and Space operation; focus remains visible and the result is announced
  through a polite live region.
- Motion explains a state transition or flow direction only. Reduced-motion mode removes the
  animation while retaining the same values, focus, controls, and announcement.
- Acceptance widths are `320`, `390`, `768`, `1024`, and `1440` CSS pixels. Mobile uses a `2 x 2`
  scenario selector, a vertical causal flow, full-width primary actions, stacked forms and wallet
  controls, and identifiers that wrap without horizontal overflow.
- Interactive targets remain at least `44 x 44` CSS pixels; focus treatment, text contrast, semantic
  headings, landmarks, native disclosures, and distinct loading, unknown, unavailable-receipt, and
  RPC-failure states remain required.

### Preservation and evidence

Escrow Flow changes presentation, not authority. Contract and deployment records, wallet policy,
funding-intent and transaction-journal behavior, receipt locators and decoded evidence, and
fail-closed data adapters remain authoritative. It introduces no invented live facts, prototype
fallback, signature request, send, or broadcast.

Implementation commit `78cfde3f3eeb3025f8eecdc4cb2d3db69f4c3d55` produced 17 bound captures in
`artifacts/escrow-flow-final/visual-proof.json`, protected READY Preview
`dpl_MFtrM77aWwm3cmhaCapd8TP4qrKF`, and promoted READY Production deployment
`dpl_FAW3WmZqyeRunaxSkFqkPBu1T5Ny`. Responsive, keyboard, reduced-motion, controlled-failure,
sampled accessibility, public-smoke, log, and read-only chain gates pass. This is automated Coston2
testnet evidence, not a claim of human usability, WCAG conformance, audit coverage, mainnet
readiness, legal escrow, fiat settlement, delivery truth, or production security.

## Historical Phase 6B1 Signal Ledger direction

The following direction sheet records the prior Phase 6B1 checkpoint. Escrow Flow supersedes its
presentation choices while preserving its product nouns, evidence hierarchy, and behavioral
boundaries.

### Thesis

Signal Ledger presents ProofPay as a causal record of one dollar-priced FXRP milestone: what was
agreed, what was locked, what evidence arrived, what may happen next, and which Coston2 records
prove the outcome. It should feel like a precise financial product, not a generic crypto dashboard
or a paper-themed marketing site.

The public landing page explains the settlement mechanism with one illustrative `$100` milestone.
The application shell then makes the next permitted milestone action dominant. Terminal records
collapse to their outcome and route readers to the settlement receipt. The receipt remains the warm
document layer where confirmed values and their technical evidence can be inspected.

### Information layers

1. **Orient:** product identity, Coston2 testnet context, milestone state, user role, and USD target.
2. **Understand:** lock, payout/refund or shortfall, lifecycle consequence, and next permitted action.
3. **Act:** one state-authorized action with its maximum movement, recipient, variable terms, and
   completion proof.
4. **Verify:** exact network, contract, account, invoice, deadlines, commitments, events, and
   transaction locators behind progressive disclosure.

The product layer calls a successful outcome `SETTLED`. `RELEASED` remains available only as the
technical contract state. Copy follows object -> event -> consequence -> evidence -> next step.

### Landing composition

The landing page order is fixed: product header; hero and illustrative milestone; problem; how
ProofPay works; price protection; live proof; built on Flare; final call to action. The first
viewport leads with `Keep the milestone in dollars. Settle it in FXRP.` and pairs its explanation
with a keyboard-operable four-state scenario. The scenario is explicitly labelled illustrative and
must never be presented as live Coston2 data.

The live-proof section is one decoded settlement, not a metric grid. It leads with the confirmed
money outcome for invoice `2` and keeps full identifiers available through the existing copy,
reveal, and explorer controls. No invented value may fill a failed or unavailable read.

### Shell and document relationship

- Landing and application routes use the cool shell canvas and white operational surfaces.
- The product header carries ProofPay, a visible `Coston2 testnet` badge, wallet state where
  relevant, and one contextual action. The landing header has no wallet control.
- `/app` gives milestone creation priority. A disconnected wallet exposes the explicit connection
  requirement while keeping the form legible but visually receded.
- Active invoices show one lifecycle strip, essential milestone facts, one action focus panel, and
  progressively disclosed transaction detail. They do not use a sidebar or equal-weight action
  cards.
- Terminal invoices show state, payout/refund, a compact lifecycle, and `View settlement receipt`.
  They do not reserve an empty action panel.
- Receipts retain the warm paper canvas and serif document insert. Their receipt identity is more
  prominent than the milestone title, while confirmed settlement evidence remains progressively
  inspectable.

### Type and hierarchy

- Product shell, landing copy, controls, and operational money: modern system sans serif.
- Receipt and document inserts only: the existing editorial serif.
- Addresses, hashes, timestamps, blocks, and transaction data: `ui-monospace`.
- Body copy is at least `16px`; supporting copy `14-15px`; technical detail `13px`; utilities
  `12px`.
- Uppercase is limited to brief utilities, lifecycle tokens, and document marks. Paragraphs and
  action names use normal sentence case.

### Palette, rules, and depth

| Role | Value |
| --- | --- |
| shell canvas | `#F3F5F1` |
| surface | `#FFF` |
| ink | `#171A18` |
| muted text | `#5E665F` |
| cool rule | `#D6DBD3` |
| Flare signal | `#D91F43` |
| dark Flare | `#9C1530` |
| blocked amber | `#945B16` |
| confirmed green | `#2F6A50` |
| receipt canvas | `#EBE5DB` |
| receipt paper | `#FBF8F1` |
| warm rule | `#C9BEB1` |

Surfaces are square or use at most a `4px` radius. Thin rules carry most grouping. A `2-3px`
signal edge is reserved for action, confirmed, or blocked states. The receipt/document insert is
the only place for a shadow.

### Motion

Motion must explain cause: a selected scenario changes its settlement result, a disclosure opens,
or an action state advances. Transitions use `160-240ms` ease-out timing. There is no ambient,
parallax, looping, or decorative movement. With `prefers-reduced-motion: reduce`, state changes are
instant and retain the same information, focus, and announcements.

### Responsive behavior

The interface must remain coherent at `320`, `390`, `768`, `1024`, and `1440` CSS pixels and at
`200%` zoom. Mobile uses a `16px` gutter, full-width primary actions, copy before the illustrative
scenario, a `2 x 2` scenario control layout, and one lifecycle representation. Identifiers wrap
without horizontal overflow. Wide layouts may pair a dominant reading column with context, but
must not become a dashboard sidebar.

### Accessibility

- Semantic landmarks and ordered headings describe every route.
- Native links, buttons, and disclosures remain fully keyboard operable.
- Interactive targets are at least `44 x 44` CSS pixels and visible focus is at least `3px`.
- Scenario results and asynchronous state changes use an appropriate polite live region without
  moving focus.
- State is communicated by words and shape as well as color; foreground/background pairs target
  WCAG AA contrast.
- Loading, unknown-invoice, unavailable-receipt, and RPC-failure states remain distinct and honest.
- Reduced-motion mode has functional parity.

Automated, responsive, visual, and protected-Preview checks cover these implementation
requirements. Implementation commit `f43dcb886265722193f35a60e38cb7fce5ca7fe1` is staged at the
protected, unaliased Vercel Preview
`https://proofpay-paysmat-k90ehmlen-adamolekuntemitope4-2758s-projects.vercel.app` as deployment
`dpl_zQ9sneHYfRMPimFJJSKBSs4W8sCF`. `artifacts/signal-ledger/preview-proof.json` records the
hosted route, responsive, keyboard, accessibility, failure, and unsigned wallet-simulation checks.
The Preview evidence is not a claim of anonymous access, human usability testing, WCAG
conformance, audit coverage, mainnet readiness, or production security.

### Avoid list

No glassmorphism, dark crypto theme, gradients, neon, glow, token or coin illustrations, bento
layout, pricing table, testimonial, logo strip, decorative chart, huge diagram, generated blob,
sidebar, equal-weight action panel, rounded-card system, or generic Web3 copy. No decorative motion,
invented live data, or implication of fiat settlement, legal escrow, audit, or mainnet behavior.
