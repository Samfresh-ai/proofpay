import Link from "next/link";

import { InvoiceActions } from "./invoice-actions";
import { HeaderWalletState } from "./header-wallet-state";
import { TechnicalIdentifier } from "./technical-identifier";

import type {
  InvoiceEvidenceView,
  InvoiceLifecycleView,
  InvoiceView,
  PriceView,
  ReleasePreviewView,
  ReceiptLifecycleView,
  ReceiptView,
} from "@/lib/proofpay";

const STATUS_HEADINGS: Record<Exclude<InvoiceView["status"], "UNKNOWN">, string> = {
  CREATED: "Agreement recorded",
  FUNDED: "Milestone funded",
  SUBMITTED: "Delivery evidence submitted",
  RELEASED: "Payment settled",
  CANCELLED: "Invoice cancelled",
  REFUNDED: "FXRP returned to the client",
};

const EXPLORER_ORIGIN = "https://coston2-explorer.flare.network";
const LIFECYCLE_LABELS = {
  AGREED: "Milestone agreed",
  FUNDED: "FXRP funded",
  DELIVERED: "Delivery evidence attached",
  SETTLED: "Payment settled",
} as const;
const LIFECYCLE_SHORT_LABELS = {
  AGREED: "Agreed",
  FUNDED: "Funded",
  DELIVERED: "Delivered",
  SETTLED: "Settled",
} as const;

function contractExplorerUrl(address: string): string {
  return `${EXPLORER_ORIGIN}/address/${address}`;
}

function displayTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\.000Z$/, " UTC");
}

function ExplorerLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a aria-label={label} className="text-action" href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

function DocumentMasthead({
  networkName,
  chainId,
  status,
  contextLabel,
  documentLabel = "PROOFPAY / MILESTONE RECORD",
}: {
  networkName: string;
  chainId: string;
  status: InvoiceView["status"] | "SETTLED" | "ERROR" | "WAITING";
  contextLabel?: string;
  documentLabel?: "PROOFPAY / MILESTONE RECORD" | "PROOFPAY / SETTLEMENT RECEIPT";
}) {
  return (
    <header className="document-masthead product-header">
      <div className="product-identity">
        <Link className="product-wordmark" href="/">ProofPay</Link>
        <div className="document-label">{documentLabel.replace("PROOFPAY / ", "")}</div>
        <p className="network-label">
          {contextLabel ?? `${networkName} · chain ${chainId}`}
        </p>
      </div>
      <div className="product-header-context">
        <span className="network-badge">Coston2 testnet</span>
        {documentLabel === "PROOFPAY / MILESTONE RECORD" ? <HeaderWalletState /> : null}
        <Link className="context-link" href="/app">Create a milestone</Link>
        <StatusStamp status={status} />
      </div>
    </header>
  );
}

export function StatusStamp({
  status,
}: {
  status: InvoiceView["status"] | "SETTLED" | "ERROR" | "WAITING";
}) {
  const label =
    status === "UNKNOWN"
      ? "No record"
      : status === "ERROR"
        ? "Read failed"
        : status === "WAITING"
          ? "Reading chain"
          : status === "RELEASED"
            ? "SETTLED"
            : status;

  return (
    <span
      aria-label={status in STATUS_HEADINGS ? `Invoice status: ${label}` : `Evidence status: ${label}`}
      className="status-stamp"
      data-testid="status-stamp"
    >
      {label}
    </span>
  );
}

export function AddressLabel({ label, address }: { label: string; address: string }) {
  return (
    <div className="term-row">
      <dt className="term-label">{label}</dt>
      <dd><TechnicalIdentifier explorerHref={contractExplorerUrl(address)} label={label} value={address} /></dd>
    </div>
  );
}

export function TransactionEvidence({ transaction }: { transaction: ReceiptLifecycleView }) {
  return (
    <div className="proof-row">
      <dt>
        <span className="evidence-label">{LIFECYCLE_LABELS[transaction.stage]}</span>
        <div className="confirmed-mark">Confirmed</div>
      </dt>
      <dd>
        <div>{transaction.detail}</div>
        <div className="contract-event">Contract event · {transaction.eventName}</div>
        <TechnicalIdentifier
          explorerHref={transaction.explorerUrl}
          explorerLabel={`Open the ${transaction.stage.toLowerCase()} transaction on the Coston2 explorer`}
          label={`${LIFECYCLE_LABELS[transaction.stage]} transaction`}
          value={transaction.transactionHash}
        />
        <div className="timestamp">
          Block {transaction.blockNumber} ·{" "}
          <time dateTime={transaction.blockTimestamp.iso}>{displayTimestamp(transaction.blockTimestamp.iso)}</time>
        </div>
      </dd>
    </div>
  );
}

function hasLifecycleEvidence(stage: InvoiceLifecycleView): stage is ReceiptLifecycleView {
  return "eventName" in stage && "transactionHash" in stage;
}

function MobileLifecycleSummary({ stages }: { stages: readonly InvoiceLifecycleView[] }) {
  return (
    <ol aria-label="Milestone lifecycle" className="lifecycle-strip mobile-lifecycle-summary">
      {stages.map((stage) => (
        <li className={stage.reached ? "stage-reached" : ""} key={stage.stage}>
          {LIFECYCLE_SHORT_LABELS[stage.stage]}
        </li>
      ))}
    </ol>
  );
}

export function SettlementRail({ stages }: { stages: readonly InvoiceLifecycleView[] }) {
  const isIllustrative = stages.some((stage) => stage.reached && !stage.confirmed);

  return (
    <details className="settlement-rail" data-testid="settlement-rail">
      <summary>Review lifecycle proof</summary>
      <div className="rail-details-body">
        <h2>Settlement evidence</h2>
        <p>
          {isIllustrative
            ? "Illustrative stages for this fixture-only scenario. Nothing here is confirmed onchain."
            : stages.every((stage) => !stage.reached || hasLifecycleEvidence(stage))
              ? "Each reached stage is tied to its confirmed contract event."
              : "Reached stages reflect the current ProofPay escrow state."}
        </p>
        <ol className="rail-list">
          {stages.map((stage) => (
            <li className={`rail-stage${stage.reached ? " stage-reached" : ""}`} key={stage.stage}>
              <span aria-hidden="true" className="rail-marker" />
              <div className="stage-label">{LIFECYCLE_LABELS[stage.stage]}</div>
              {hasLifecycleEvidence(stage) ? (
                <>
                  <p className="rail-detail">{stage.detail}</p>
                  <p>{stage.eventName} · block {stage.blockNumber}</p>
                  <details>
                    <summary>Transaction evidence</summary>
                    <TechnicalIdentifier
                      explorerHref={stage.explorerUrl}
                      explorerLabel={`Open the ${stage.stage.toLowerCase()} transaction on the Coston2 explorer`}
                      label={`${LIFECYCLE_LABELS[stage.stage]} transaction`}
                      value={stage.transactionHash}
                    />
                  </details>
                </>
              ) : (
                <p>
                  {stage.confirmed
                    ? "Confirmed by the current contract state."
                    : stage.reached
                      ? "Illustrative only · not confirmed onchain."
                      : "Not reached."}
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </details>
  );
}

export function EvidenceAttachment({ evidence }: { evidence: InvoiceEvidenceView }) {
  return (
    <section aria-labelledby="evidence-attachment-title" className="evidence-attachment">
      <h2 className="utility-label" id="evidence-attachment-title">
        Evidence attachment
      </h2>
      {evidence.completionNote ? <p>{evidence.completionNote}</p> : null}
      <div className="evidence-identifier">
        <span className="evidence-label">Evidence commitment</span>
        <TechnicalIdentifier label="Evidence commitment" value={evidence.hash} />
      </div>
      {evidence.uri ? (
        <p>
          <ExplorerLink href={evidence.uri} label="Open the submitted evidence reference">
            Open submitted evidence reference
          </ExplorerLink>
        </p>
      ) : null}
    </section>
  );
}

function ContractFooter({ invoice }: { invoice: InvoiceView }) {
  return (
    <footer className="document-footer">
      <span>
        ProofPayEscrow contract
        <br />
        <TechnicalIdentifier
          explorerHref={contractExplorerUrl(invoice.contractAddress)}
          explorerLabel="Open the ProofPay contract on the Coston2 explorer"
          label="ProofPayEscrow contract"
          value={invoice.contractAddress}
        />
      </span>
      <span>
        Read-only evidence
        <br />
        {invoice.network.name} · chain {invoice.network.chainId}
        <br />
        <span className="timestamp" data-testid="pinned-read">
          Pinned read · block {invoice.network.pinnedBlockNumber} ·{" "}
          <time dateTime={invoice.network.pinnedBlockTimestamp.iso}>
            {displayTimestamp(invoice.network.pinnedBlockTimestamp.iso)}
          </time>
        </span>
      </span>
    </footer>
  );
}

export function MilestoneDocument({ invoice, receipt }: { invoice: InvoiceView; receipt?: ReceiptView }) {
  const requiresTopUp = invoice.preview ? BigInt(invoice.preview.topUp.atomic) > 0n : false;
  const isSample = invoice.sampleScenario !== undefined;
  const isTerminal = ["RELEASED", "CANCELLED", "REFUNDED"].includes(invoice.status);
  const productState = invoice.status === "RELEASED" ? "SETTLED" : invoice.status;
  const nextAction = requiresTopUp || invoice.sampleScenario === "ACTION_SUBMITTED_TOP_UP"
    ? "Add the required top-up"
    : invoice.status === "CREATED"
      ? `Fund this ${invoice.usdTarget?.display ?? "USD-priced"} milestone`
      : invoice.status === "FUNDED"
        ? "Attach delivery evidence"
        : invoice.status === "SUBMITTED"
          ? "Release payment"
          : "No further wallet action";

  return (
    <main className="page-shell product-shell invoice-shell" id="main-content">
      <div className="document-spread">
        <article className="milestone-surface" data-testid="invoice-document">
          <div className="paper-body milestone-surface-body">
            <DocumentMasthead
              chainId={invoice.network.chainId.toString()}
              networkName={invoice.network.name}
              status={invoice.status}
              {...(isSample ? { contextLabel: "Fixture-only sample · not live Coston2 evidence" } : {})}
            />

            <header className="document-heading">
              <p className="eyebrow">{isSample ? "Fixture-only milestone sample" : `Milestone invoice #${invoice.id}`}</p>
              <h1>{invoice.title}</h1>
              <div className="identity-line">
                <span>{isSample ? "Sample fixture" : `Invoice ${invoice.id}`}</span>
                {invoice.deadline ? (
                  <span>
                    Delivery deadline{" "}
                    <time dateTime={invoice.deadline.iso}>{displayTimestamp(invoice.deadline.iso)}</time>
                  </span>
                ) : null}
              </div>
            </header>

            <MobileLifecycleSummary stages={invoice.lifecycle} />

            <section aria-labelledby="current-state-title" className={`milestone-overview${isTerminal ? " terminal-overview" : ""}`}>
              {isTerminal || invoice.sampleScenario === "TOP_UP_REQUIRED" ? (
                <dl className="milestone-facts" aria-label="Current milestone facts">
                  <div>
                    <dt>State</dt>
                    <dd>{productState}</dd>
                  </div>
                  <div className="term-row" data-testid="invoice-target">
                    <dt className="term-label">USD target</dt>
                    <dd className="display-value">{invoice.usdTarget?.display}</dd>
                  </div>
                  <div className="term-row" data-testid="invoice-current-lock">
                    <dt className="term-label">FXRP locked</dt>
                    <dd className="display-value">{invoice.currentFxrpLocked?.display}</dd>
                  </div>
                  <div>
                    <dt>{isTerminal ? "Wallet role" : "Scenario"}</dt>
                    <dd>{isTerminal ? "No action required" : "Illustrative only · no wallet action"}</dd>
                  </div>
                  <div>
                    <dt>{isTerminal ? "Next permitted action" : "Required state"}</dt>
                    <dd>{nextAction}</dd>
                  </div>
                </dl>
              ) : null}
              <div className="state-summary">
                <h2 id="current-state-title">
                  {requiresTopUp
                    ? "Top-up required"
                    : invoice.status === "UNKNOWN"
                      ? "This invoice does not exist"
                      : STATUS_HEADINGS[invoice.status]}
                </h2>
                <p>{invoice.summary}</p>
                <p className="next-step">{invoice.nextStep}</p>
              </div>
              {receipt ? (
                <dl className="terminal-settlement-facts" aria-label="Confirmed settlement movement">
                  <MoneyLine label="Freelancer payout" testId="terminal-payout" value={receipt.confirmed.payout.display} />
                  <MoneyLine label="Client refund" testId="terminal-refund" value={receipt.confirmed.refund.display} />
                </dl>
              ) : null}
              {invoice.status === "RELEASED" && invoice.receiptLocatorAvailable ? (
                <div className="terminal-receipt-bridge">
                  <p className="terminal-receipt-label">Completed settlement → permanent proof</p>
                  <Link className="receipt-link" href={`/receipt/${invoice.id}`}>View settlement receipt</Link>
                </div>
              ) : null}
            </section>

            {!isTerminal && invoice.status !== "UNKNOWN" && invoice.sampleScenario !== "TOP_UP_REQUIRED" ? (
              <InvoiceActions invoice={invoice} />
            ) : null}

            {invoice.preview ? (
              <ReleasePreview preview={invoice.preview} sampleScenario={invoice.sampleScenario} />
            ) : null}

            <details className="milestone-technical-details">
              <summary>Review milestone evidence and contract details</summary>
              <div className="details-body">
                <section aria-labelledby="contract-state-title">
                  <div className="section-rule">
                    <p className="utility-label">Exact record</p>
                    <h2 id="contract-state-title">Parties and commitments</h2>
                  </div>
                  <dl className="terms-list">
                    {invoice.client ? <AddressLabel address={invoice.client} label="Client" /> : null}
                    {invoice.freelancer ? <AddressLabel address={invoice.freelancer} label="Freelancer" /> : null}
                    {invoice.scopeHash ? (
                      <div className="term-row">
                        <dt className="term-label">Scope commitment</dt>
                        <dd><TechnicalIdentifier label="Scope commitment" value={invoice.scopeHash} /></dd>
                      </div>
                    ) : null}
                    <div className="term-row" data-testid="invoice-liabilities">
                      <dt className="term-label">Active FXRP liabilities</dt>
                      <dd className="display-value">{invoice.activeLiabilities.display}</dd>
                    </div>
                    <div className="term-row" data-testid="invoice-contract-balance">
                      <dt className="term-label">Contract FXRP balance</dt>
                      <dd className="display-value">{invoice.contractFxrpBalance.display}</dd>
                    </div>
                    <div className="term-row" data-testid="invoice-contract-state">
                      <dt className="term-label">Contract state</dt>
                      <dd className="display-value">{invoice.status}</dd>
                    </div>
                  </dl>
                </section>

                {invoice.scopeLines?.length ? (
                  <section aria-labelledby="scope-title">
                    <div className="section-rule">
                      <p className="utility-label">Hash-verified manifest</p>
                      <h2 id="scope-title">Milestone scope</h2>
                    </div>
                    <ol className="scope-lines">
                      {invoice.scopeLines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ol>
                  </section>
                ) : null}

                {invoice.evidence ? <EvidenceAttachment evidence={invoice.evidence} /> : null}

                <SettlementRail stages={invoice.lifecycle} />

                {isSample ? (
                  <footer className="document-footer sample-footer">
                    <span>
                      Fixture-only presentation
                      <br />
                      This is not live Coston2 evidence. No contract, transaction, or receipt evidence is attached.
                    </span>
                  </footer>
                ) : (
                  <ContractFooter invoice={invoice} />
                )}
              </div>
            </details>
          </div>
        </article>
      </div>
    </main>
  );
}

export function MoneyLine({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="money-line" data-testid={testId}>
      <dt className="money-label">{label}</dt>
      <dd className="money-value">{value}</dd>
    </div>
  );
}

export function PriceObservation({ label, observation }: { label: string; observation: PriceView }) {
  return (
    <div className="price-row">
      <dt>
        <span className="evidence-label">{label}</span>
        <div className="confirmed-mark">Confirmed</div>
      </dt>
      <dd>
        <div className="display-value">{observation.display}</div>
        <div className="timestamp">
          Feed time{" "}
          <time dateTime={observation.timestamp.iso}>{displayTimestamp(observation.timestamp.iso)}</time>
        </div>
      </dd>
    </div>
  );
}

function priceMovement(funding: PriceView, release: PriceView): string {
  const fundingValue = Number(funding.raw) / (10 ** funding.decimals);
  const releaseValue = Number(release.raw) / (10 ** release.decimals);
  const movement = ((releaseValue - fundingValue) / fundingValue) * 100;
  if (Math.abs(movement) < 0.005) return "0.00%";
  return `${movement > 0 ? "+" : "−"}${Math.abs(movement).toFixed(2)}%`;
}

function SettlementProtection({ receipt }: { receipt: ReceiptView }) {
  const target = receipt.invoice.usdTarget?.display ?? "the milestone target";
  return (
    <section aria-labelledby="price-protection-title" className="protection-summary">
      <div className="section-rule">
        <p className="utility-label">Confirmed settlement economics</p>
        <h2 id="price-protection-title">How the FXRP protection resolved</h2>
      </div>
      <div className="protection-copy">
        <p>The client funded the milestone plus a 10% FXRP protection buffer.</p>
        <p>At release, {receipt.confirmed.payout.display} covered the {target} target.</p>
        <p>The unused {receipt.confirmed.refund.display} returned to the client.</p>
      </div>
      <dl className="price-list">
        <PriceObservation label="Funding price" observation={receipt.confirmed.fundingPrice} />
        <PriceObservation label="Release price" observation={receipt.confirmed.releasePrice} />
        <div className="price-row" data-testid="price-movement">
          <dt><span className="evidence-label">Price movement</span></dt>
          <dd className="display-value">{priceMovement(receipt.confirmed.fundingPrice, receipt.confirmed.releasePrice)}</dd>
        </div>
      </dl>
    </section>
  );
}

function ReleasePreview({
  preview,
  sampleScenario,
}: {
  preview: ReleasePreviewView;
  sampleScenario?: InvoiceView["sampleScenario"];
}) {
  const isSample = sampleScenario === "TOP_UP_REQUIRED";
  return (
    <section aria-labelledby="release-preview-title" className="preview-quote" data-testid="release-preview">
      {isSample ? (
        <p className="sample-scenario-label" data-testid="sample-scenario-label">
          Sample scenario — Top-up required · fixture only
        </p>
      ) : null}
      <div className="preview-heading">
        <div>
          <p className="utility-label">{isSample ? "Fixture-only presentation" : "Live release simulation"}</p>
          <h2 id="release-preview-title">{preview.label}</h2>
        </div>
        <span className="unconfirmed-mark">Not confirmed</span>
      </div>
      <p className="preview-warning">
        {isSample
          ? "The escrow no longer covers the milestone target. No payment has been released."
          : "No payment has been released. This quote can change with the XRP / USD feed."}
      </p>
      <dl className="terms-list">
        <MoneyLine label="Previewed payout" testId="preview-payout" value={preview.payout.display} />
        <MoneyLine label="Previewed client refund" testId="preview-refund" value={preview.refund.display} />
        <MoneyLine label="FXRP top-up required" testId="preview-top-up" value={preview.topUp.display} />
        <div className="price-row" data-testid="preview-price">
          <dt>
            <span className="evidence-label">Preview price</span>
            <div className="unconfirmed-copy">Not confirmed</div>
          </dt>
          <dd>
            <div className="display-value">{preview.price.display}</div>
            <div className="timestamp">
              {isSample ? (
                "Illustrative price · no live feed observation"
              ) : (
                <>
                  Feed time{" "}
                  <time dateTime={preview.price.timestamp.iso}>{displayTimestamp(preview.price.timestamp.iso)}</time>
                </>
              )}
            </div>
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function SettlementReceipt({ receipt }: { receipt: ReceiptView }) {
  const invoice = receipt.invoice;
  const evidence = invoice.evidence
    ? { ...invoice.evidence, uri: receipt.evidenceUri }
    : undefined;
  const target = invoice.usdTarget?.display ?? "Target unavailable";

  return (
    <main className="page-shell receipt-shell" id="main-content">
      <article className="paper receipt-paper" data-testid="receipt-document">
        <div className="paper-body">
          <DocumentMasthead
            chainId={invoice.network.chainId.toString()}
            documentLabel="PROOFPAY / SETTLEMENT RECEIPT"
            networkName={invoice.network.name}
            status="SETTLED"
          />

          <header className="receipt-heading">
            <div>
              <p className="eyebrow">Confirmed Coston2 settlement</p>
              <h1>SETTLEMENT RECEIPT · INVOICE #{invoice.id}</h1>
              <p className="receipt-milestone-title">{invoice.title}</p>
            </div>
          </header>

          <section aria-labelledby="money-movement-title">
            <h2 className="visually-hidden" id="money-movement-title">
              Confirmed money movement
            </h2>
            <dl className="money-ledger">
              <MoneyLine label="Milestone target" testId="money-target" value={target} />
              <MoneyLine label="FXRP locked at funding" testId="money-locked" value={receipt.confirmed.locked.display} />
              <MoneyLine label="Freelancer payout" testId="money-payout" value={receipt.confirmed.payout.display} />
              <MoneyLine label="Client refund" testId="money-refund" value={receipt.confirmed.refund.display} />
            </dl>
          </section>

          <SettlementProtection receipt={receipt} />

          {evidence ? <EvidenceAttachment evidence={evidence} /> : null}

          <section aria-labelledby="settlement-evidence-title" className="proof-section">
            <div className="section-rule">
              <p className="utility-label">Decoded from Coston2</p>
              <h2 id="settlement-evidence-title">Settlement evidence</h2>
            </div>
            <details data-testid="evidence-details">
              <summary>How this settlement was confirmed</summary>
              <div className="details-body">
                <dl className="proof-list">
                  {receipt.lifecycle.map((transaction) => (
                    <TransactionEvidence key={transaction.transactionHash} transaction={transaction} />
                  ))}
                </dl>
              </div>
            </details>
            <details data-testid="contract-details">
              <summary>Commitments and final contract state</summary>
              <div className="details-body">
                <dl className="proof-list">
                  <div className="proof-row">
                    <dt className="evidence-label">Scope commitment</dt>
                    <dd>{invoice.scopeHash ? <TechnicalIdentifier label="Scope commitment" value={invoice.scopeHash} /> : "No scope commitment"}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Evidence commitment</dt>
                    <dd>{invoice.evidence?.hash
                      ? <TechnicalIdentifier label="Evidence commitment" value={invoice.evidence.hash} />
                      : "No evidence hash recorded"}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Current active liabilities</dt>
                    <dd>{invoice.activeLiabilities.display}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Current contract balance</dt>
                    <dd>{invoice.contractFxrpBalance.display}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Contract state</dt>
                    <dd>RELEASED</dd>
                  </div>
                </dl>
              </div>
            </details>
          </section>

          <p className="notice">
            <strong>Coston2 testnet evidence.</strong> This receipt uses test FXRP and does not claim audited,
            production, legal, fiat, or automatically released escrow.
          </p>

          <ContractFooter invoice={invoice} />
        </div>
      </article>
    </main>
  );
}

export function LoadingDocument({ resource }: { resource: "invoice" | "receipt" }) {
  return (
    <main className="page-shell product-shell status-shell" id="main-content">
      <article aria-live="polite" aria-busy="true" className="app-surface empty-document" role="status">
        <div className="paper-body">
          <DocumentMasthead chainId="114" networkName="Coston2" status="WAITING" />
          <div className="document-heading">
            <p className="eyebrow">ProofPay {resource}</p>
            <h1>Waiting for Coston2 data</h1>
          </div>
          <p>Reading the invoice terms and settlement evidence.</p>
          <div aria-hidden="true" className="loading-line" />
        </div>
      </article>
    </main>
  );
}

export function EmptyDocument({
  eyebrow,
  heading,
  message,
  nextStep,
  status = "UNKNOWN",
  onRetry,
  retryHref,
}: {
  eyebrow: string;
  heading: string;
  message: string;
  nextStep?: string;
  status?: "UNKNOWN" | "ERROR";
  onRetry?: () => void;
  retryHref?: string;
}) {
  return (
    <main className="page-shell product-shell status-shell" id="main-content">
      <article className="app-surface empty-document">
        <div className="paper-body">
          <DocumentMasthead chainId="114" networkName="Coston2" status={status} />
          <header className="document-heading">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{heading}</h1>
          </header>
          <section aria-live={status === "ERROR" ? "assertive" : undefined} className="state-summary">
            <p>{message}</p>
            {nextStep ? <p className="next-step">{nextStep}</p> : null}
            {onRetry ? (
              <button className="retry-button" onClick={onRetry} type="button">
                Try the Coston2 read again
              </button>
            ) : retryHref ? (
              <a className="retry-button" href={retryHref}>
                Try the Coston2 read again
              </a>
            ) : null}
          </section>
        </div>
      </article>
    </main>
  );
}
