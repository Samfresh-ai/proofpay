import Link from "next/link";

import { IllustrativeMilestone } from "@/components/illustrative-milestone";
import { TechnicalIdentifier } from "@/components/technical-identifier";

import type { ReceiptLifecycleView, ReceiptView } from "@/lib/proofpay";

const COSTON2_EXPLORER_ORIGIN = "https://coston2-explorer.flare.network";

interface VerifiedLandingProof {
  receipt: ReceiptView;
  funding: ReceiptLifecycleView;
  release: ReceiptLifecycleView;
  evidenceCommitment: string;
  target: string;
}

function verifiedLandingProof(receipt: ReceiptView | null): VerifiedLandingProof | null {
  if (receipt?.id !== "2" || receipt.invoice.id !== "2") return null;
  const funding = receipt.lifecycle.find((stage) => stage.stage === "FUNDED");
  const evidence = receipt.lifecycle.find((stage) => stage.stage === "DELIVERED");
  const release = receipt.lifecycle.find((stage) => stage.stage === "SETTLED");
  const target = receipt.invoice.usdTarget?.display;
  const evidenceCommitment = receipt.invoice.evidence?.hash;
  if (!funding || !evidence || !release || !target || !evidenceCommitment) return null;
  return { receipt, funding, release, evidenceCommitment, target };
}

function LandingHeader() {
  return (
    <header className="product-header landing-product-header">
      <div className="product-header-inner">
        <Link aria-label="ProofPay home" className="product-wordmark" href="/">
          ProofPay
        </Link>
        <nav aria-label="Landing page" className="landing-navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#live-proof">Live proof</a>
        </nav>
        <div className="product-header-actions">
          <span className="network-badge">Coston2 testnet</span>
          <Link className="header-action" href="/app">Create a milestone</Link>
        </div>
      </div>
    </header>
  );
}

function LiveProof({ receipt }: { receipt: ReceiptView | null }) {
  const proof = verifiedLandingProof(receipt);

  return (
    <section aria-labelledby="live-proof-title" className="landing-section live-proof-section" id="live-proof">
      <div className="section-heading">
        <p className="section-kicker">Live proof</p>
        <h2 id="live-proof-title">One settled milestone, decoded from Coston2</h2>
      </div>

      {proof ? (
        <div className="live-proof-surface" data-testid="landing-live-proof">
          <div className="live-proof-summary">
            <p className="live-proof-context">Invoice #2 · {proof.receipt.invoice.title}</p>
            <dl>
              <div>
                <dt>Milestone target</dt>
                <dd>{proof.target}</dd>
              </div>
              <div>
                <dt>Confirmed FXRP lock</dt>
                <dd>{proof.receipt.confirmed.locked.display}</dd>
              </div>
              <div>
                <dt>Freelancer payout</dt>
                <dd>{proof.receipt.confirmed.payout.display}</dd>
              </div>
              <div>
                <dt>Client refund</dt>
                <dd>{proof.receipt.confirmed.refund.display}</dd>
              </div>
              <div className="live-proof-state">
                <dt>Final state</dt>
                <dd><span className="confirmed-state">SETTLED</span></dd>
              </div>
            </dl>
            <Link className="text-action" href="/receipt/2">Open the full settlement receipt</Link>
          </div>

          <div aria-label="Confirmed Coston2 identifiers" className="live-proof-identifiers" role="group">
            <div className="live-proof-identifier">
              <span>ProofPayEscrow contract</span>
              <TechnicalIdentifier
                explorerHref={`${COSTON2_EXPLORER_ORIGIN}/address/${proof.receipt.invoice.contractAddress}`}
                explorerLabel="Open the ProofPayEscrow contract on the Coston2 explorer"
                label="ProofPayEscrow contract"
                value={proof.receipt.invoice.contractAddress}
              />
            </div>
            <div className="live-proof-identifier">
              <span>Funding transaction</span>
              <TechnicalIdentifier
                explorerHref={proof.funding.explorerUrl}
                explorerLabel="Open the funding transaction on the Coston2 explorer"
                label="Funding transaction"
                value={proof.funding.transactionHash}
              />
            </div>
            <div className="live-proof-identifier">
              <span>Evidence commitment</span>
              <TechnicalIdentifier
                label="Evidence commitment"
                value={proof.evidenceCommitment}
              />
            </div>
            <div className="live-proof-identifier">
              <span>Release transaction</span>
              <TechnicalIdentifier
                explorerHref={proof.release.explorerUrl}
                explorerLabel="Open the release transaction on the Coston2 explorer"
                label="Release transaction"
                value={proof.release.transactionHash}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="live-proof-unavailable" data-testid="landing-live-proof-unavailable" role="status">
          <strong>Live Coston2 proof is temporarily unavailable.</strong>
          <p>No stored or illustrative settlement value is substituted for invoice #2.</p>
          <Link className="text-action" href="/receipt/2">Retry the settlement receipt</Link>
        </div>
      )}
    </section>
  );
}

export function LandingPage({ receipt }: { receipt: ReceiptView | null }) {
  return (
    <div className="product-shell landing-shell">
      <LandingHeader />
      <main id="main-content">
        <section aria-labelledby="landing-hero-title" className="landing-hero">
          <div className="hero-copy">
            <p className="hero-kicker">Dollar-priced milestone escrow</p>
            <h1 id="landing-hero-title">Keep the milestone in dollars. Settle it in FXRP.</h1>
            <p className="hero-support">
              ProofPay prices the milestone when it is funded and again when it is released. A 10% FXRP buffer protects the target; unused FXRP returns to the client, and a shortfall blocks release until it is topped up.
            </p>
            <p className="hero-plain-language">
              Agree on a dollar amount. The freelancer receives that value; unused funds return to the client, and payment stops if the milestone is short.
            </p>
            <div className="hero-actions">
              <Link className="primary-action" href="/app">Create a milestone</Link>
              <Link className="secondary-action" href="/receipt/2">See a real settlement</Link>
            </div>
          </div>
          <IllustrativeMilestone />
        </section>

        <section aria-labelledby="problem-title" className="landing-section problem-section">
          <div className="section-heading">
            <p className="section-kicker">The problem</p>
            <h2 id="problem-title">Funding alone does not preserve the agreement.</h2>
          </div>
          <p className="continuous-explanation">
            A crypto invoice can be fully funded and still be worth less by release time. ProofPay keeps the agreement in USD, then recalculates the FXRP needed before payment moves.
          </p>
        </section>

        <section aria-labelledby="how-it-works-title" className="landing-section how-section" id="how-it-works">
          <div className="section-heading">
            <p className="section-kicker">How ProofPay works</p>
            <h2 id="how-it-works-title">One agreement. Four confirmed stages.</h2>
          </div>
          <ol aria-label="ProofPay milestone stages" className="mechanism-flow">
            <li>
              <span className="mechanism-stage">AGREE</span>
              <p>Invoice terms and a scope commitment record the dollar-priced work.</p>
              <span aria-hidden="true" className="mechanism-arrow">→</span>
            </li>
            <li>
              <span className="mechanism-stage">FUND</span>
              <p>The FXRP lock, FTSOv2 price, and <code>InvoiceFunded</code> event prove funding.</p>
              <span aria-hidden="true" className="mechanism-arrow">→</span>
            </li>
            <li>
              <span className="mechanism-stage">DELIVER</span>
              <p>An evidence manifest commitment and <code>EvidenceSubmitted</code> event bind delivery proof.</p>
              <span aria-hidden="true" className="mechanism-arrow">→</span>
            </li>
            <li>
              <span className="mechanism-stage">SETTLE</span>
              <p>The freelancer payout, client refund, and <code>InvoiceReleased</code> event prove settlement.</p>
            </li>
          </ol>
          <div className="blocked-path">
            <span className="blocked-label">BLOCKED</span>
            <p>If the lock is short, the exact top-up is required and no payment is released.</p>
          </div>
        </section>

        <section aria-labelledby="price-protection-title" className="landing-section protection-section">
          <div className="section-heading">
            <p className="section-kicker">Price protection</p>
            <h2 id="price-protection-title">The buffer protects the target, not a token balance.</h2>
          </div>
          <p>
            For a $100 milestone at $1.00 per XRP, the client locks 110 FXRP: 100 for the target and 10% protection. At release, ProofPay pays only the FXRP needed for $100, refunds the rest, or blocks settlement and asks for the exact shortfall.
          </p>
          <div className="protection-calculation">
            <span><strong>100 FXRP</strong> target</span>
            <span aria-hidden="true">+</span>
            <span><strong>10 FXRP</strong> protection</span>
            <span aria-hidden="true">=</span>
            <span><strong>110 FXRP</strong> locked</span>
          </div>
        </section>

        <LiveProof receipt={receipt} />

        <section aria-labelledby="built-on-flare-title" className="landing-section flare-section">
          <div className="section-heading">
            <p className="section-kicker">Built on Flare</p>
            <h2 id="built-on-flare-title">Each layer has one settlement job.</h2>
          </div>
          <dl className="flare-mechanism">
            <div>
              <dt>FXRP</dt>
              <dd>Brings XRP-derived value into the escrow.</dd>
            </div>
            <div>
              <dt>FTSOv2</dt>
              <dd>Prices the USD milestone when it is funded and again when it is released.</dd>
            </div>
            <div>
              <dt>ProofPayEscrow</dt>
              <dd>Locks, releases, refunds, or blocks the FXRP according to the current quote.</dd>
            </div>
            <div>
              <dt>Coston2</dt>
              <dd>Exposes the public testnet contract state and settlement proof.</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="final-cta-title" className="landing-final-cta">
          <p className="section-kicker">Start a milestone</p>
          <h2 id="final-cta-title">Create a dollar-priced FXRP milestone</h2>
          <Link className="primary-action" href="/app">Create a milestone</Link>
        </section>
      </main>
    </div>
  );
}
