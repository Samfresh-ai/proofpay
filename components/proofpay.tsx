import Link from "next/link";

import { InvoiceActions } from "./invoice-actions";

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
  RELEASED: "Payment released",
  CANCELLED: "Invoice cancelled",
  REFUNDED: "FXRP returned to the client",
};

const EXPLORER_ORIGIN = "https://coston2-explorer.flare.network";

function contractExplorerUrl(address: string): string {
  return `${EXPLORER_ORIGIN}/address/${address}`;
}

function displayTimestamp(iso: string): string {
  return iso.replace("T", " ").replace(/\.000Z$/, " UTC");
}

function ExplorerLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a aria-label={label} href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

function DocumentMasthead({
  networkName,
  chainId,
  status,
  contextLabel,
}: {
  networkName: string;
  chainId: string;
  status: InvoiceView["status"] | "SETTLED" | "ERROR" | "WAITING";
  contextLabel?: string;
}) {
  return (
    <header className="document-masthead">
      <div>
        <div className="wordmark">
          ProofPay <span aria-hidden="true">/</span> evidence record
        </div>
        <p className="network-label">
          {contextLabel ?? `${networkName} · chain ${chainId}`}
        </p>
      </div>
      <StatusStamp status={status} />
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
          : status;

  return (
    <span
      aria-label={status in STATUS_HEADINGS ? `Invoice status: ${status}` : `Evidence status: ${label}`}
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
      <dd className="address">{address}</dd>
    </div>
  );
}

export function TransactionEvidence({ transaction }: { transaction: ReceiptLifecycleView }) {
  return (
    <div className="proof-row">
      <dt>
        <span className="evidence-label">{transaction.stage}</span>
        <div className="confirmed-mark">Confirmed</div>
      </dt>
      <dd>
        <div>{transaction.eventName}</div>
        <div className="transaction">
          <ExplorerLink
            href={transaction.explorerUrl}
            label={`Open the ${transaction.stage.toLowerCase()} transaction on the Coston2 explorer`}
          >
            {transaction.transactionHash}
          </ExplorerLink>
        </div>
        <div className="timestamp">
          Block {transaction.blockNumber} ·{" "}
          <time dateTime={transaction.blockTimestamp.iso}>{displayTimestamp(transaction.blockTimestamp.iso)}</time>
        </div>
      </dd>
    </div>
  );
}

export function SettlementRail({ stages }: { stages: readonly InvoiceLifecycleView[] }) {
  const isIllustrative = stages.some((stage) => stage.reached && !stage.confirmed);

  return (
    <aside aria-labelledby="settlement-rail-title" className="settlement-rail" data-testid="settlement-rail">
      <h2 id="settlement-rail-title">Settlement path</h2>
      <p>
        {isIllustrative
          ? "Illustrative stages for this fixture-only scenario. Nothing here is confirmed onchain."
          : "Reached stages reflect the current invoice status read from the ProofPay contract."}
      </p>
      <ol className="rail-list">
        {stages.map((stage) => (
          <li className={`rail-stage${stage.reached ? " stage-reached" : ""}`} key={stage.stage}>
            <span aria-hidden="true" className="rail-marker" />
            <div className="stage-label">{stage.stage}</div>
            <p>
              {stage.confirmed
                ? "Confirmed by the current contract state."
                : stage.reached
                  ? "Illustrative only · not confirmed onchain."
                  : "Not reached."}
            </p>
          </li>
        ))}
      </ol>
    </aside>
  );
}

export function EvidenceAttachment({ evidence }: { evidence: InvoiceEvidenceView }) {
  return (
    <section aria-labelledby="evidence-attachment-title" className="evidence-attachment">
      <h2 className="utility-label" id="evidence-attachment-title">
        Evidence attachment
      </h2>
      {evidence.completionNote ? <p>{evidence.completionNote}</p> : null}
      <p className="hash">Evidence commitment: {evidence.hash}</p>
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
        Contract
        <br />
        <ExplorerLink
          href={contractExplorerUrl(invoice.contractAddress)}
          label="Open the ProofPay contract on the Coston2 explorer"
        >
          <span className="address">{invoice.contractAddress}</span>
        </ExplorerLink>
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

export function MilestoneDocument({ invoice }: { invoice: InvoiceView }) {
  const requiresTopUp = invoice.preview ? BigInt(invoice.preview.topUp.atomic) > 0n : false;
  const isSample = invoice.sampleScenario !== undefined;

  return (
    <main className="page-shell" id="main-content">
      <div className="document-spread">
        <article className="paper" data-testid="invoice-document">
          <div className="paper-body">
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

            <section aria-labelledby="invoice-terms-title">
              <h2 className="visually-hidden" id="invoice-terms-title">
                {isSample ? "Illustrative invoice terms" : "Invoice terms and current contract state"}
              </h2>
              <dl className="terms-list">
                <div className="term-row" data-testid="invoice-target">
                  <dt className="term-label">{isSample ? "Illustrative milestone target" : "Milestone target"}</dt>
                  <dd className="display-value">{invoice.usdTarget?.display}</dd>
                </div>
                <div className="term-row" data-testid="invoice-current-lock">
                  <dt className="term-label">{isSample ? "Illustrative stored lock" : "Stored lock · current read"}</dt>
                  <dd className="display-value">{invoice.currentFxrpLocked?.display}</dd>
                </div>
                {invoice.client ? <AddressLabel address={invoice.client} label="Client" /> : null}
                {invoice.freelancer ? <AddressLabel address={invoice.freelancer} label="Freelancer" /> : null}
                {invoice.scopeHash ? (
                  <div className="term-row">
                    <dt className="term-label">Scope commitment</dt>
                    <dd className="hash">{invoice.scopeHash}</dd>
                  </div>
                ) : null}
              </dl>
            </section>

            <section aria-labelledby="current-state-title" className="state-summary">
              <h2 id="current-state-title">
                {requiresTopUp
                  ? "Top-up required"
                  : invoice.status === "UNKNOWN"
                    ? "This invoice does not exist"
                    : STATUS_HEADINGS[invoice.status]}
              </h2>
              <p>{invoice.summary}</p>
              <p className="next-step">{invoice.nextStep}</p>
              {invoice.status === "RELEASED" && invoice.receiptLocatorAvailable ? (
                <p>
                  <Link href={`/receipt/${invoice.id}`}>Read the confirmed settlement receipt</Link>
                </p>
              ) : null}
            </section>

            {invoice.preview ? (
              <ReleasePreview preview={invoice.preview} sampleScenario={invoice.sampleScenario} />
            ) : null}

            {invoice.status !== "UNKNOWN" && invoice.sampleScenario !== "TOP_UP_REQUIRED" ? (
              <InvoiceActions invoice={invoice} />
            ) : null}

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

            {isSample ? (
              <footer className="document-footer sample-footer">
                <span>
                  Fixture-only presentation
                  <br />
                  This is not live Coston2 evidence. No contract, transaction, or receipt evidence is attached.
                </span>
              </footer>
            ) : (
              <>
                <section aria-labelledby="contract-state-title">
                  <div className="section-rule">
                    <p className="utility-label">Current aggregate state</p>
                    <h2 id="contract-state-title">Contract accounting</h2>
                  </div>
                  <dl className="terms-list">
                    <div className="term-row" data-testid="invoice-liabilities">
                      <dt className="term-label">Active FXRP liabilities</dt>
                      <dd className="display-value">{invoice.activeLiabilities.display}</dd>
                    </div>
                    <div className="term-row" data-testid="invoice-contract-balance">
                      <dt className="term-label">Contract FXRP balance</dt>
                      <dd className="display-value">{invoice.contractFxrpBalance.display}</dd>
                    </div>
                  </dl>
                </section>

                <ContractFooter invoice={invoice} />
              </>
            )}
          </div>
        </article>

        <SettlementRail stages={invoice.lifecycle} />
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
      <p className="preview-warning">No payment has been released. This quote can change with the XRP / USD feed.</p>
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
  const explanation = `The client locked ${receipt.confirmed.locked.display}. At release, ${receipt.confirmed.payout.display} covered the ${target} target. The remaining ${receipt.confirmed.refund.display} returned to the client.`;

  return (
    <main className="page-shell" id="main-content">
      <article className="paper receipt-paper" data-testid="receipt-document">
        <div className="paper-body">
          <DocumentMasthead
            chainId={invoice.network.chainId.toString()}
            networkName={invoice.network.name}
            status="SETTLED"
          />

          <header className="receipt-heading">
            <div>
              <p className="eyebrow">Settlement receipt · invoice #{invoice.id}</p>
              <h1>{invoice.title}</h1>
            </div>
          </header>

          <section aria-labelledby="money-movement-title">
            <h2 className="visually-hidden" id="money-movement-title">
              Confirmed money movement
            </h2>
            <dl className="money-ledger">
              <MoneyLine label="Milestone target" testId="money-target" value={target} />
              <MoneyLine label="Confirmed historical lock" testId="money-locked" value={receipt.confirmed.locked.display} />
              <MoneyLine label="Freelancer payout" testId="money-payout" value={receipt.confirmed.payout.display} />
              <MoneyLine label="Client refund" testId="money-refund" value={receipt.confirmed.refund.display} />
            </dl>
          </section>

          <p className="protection-note">{explanation}</p>

          <section aria-labelledby="price-observations-title" className="proof-section">
            <div className="section-rule">
              <p className="utility-label">XRP / USD observations</p>
              <h2 id="price-observations-title">Price protection evidence</h2>
            </div>
            <dl className="price-list">
              <PriceObservation label="Confirmed funding" observation={receipt.confirmed.fundingPrice} />
              <PriceObservation label="Confirmed release" observation={receipt.confirmed.releasePrice} />
            </dl>
          </section>

          {evidence ? <EvidenceAttachment evidence={evidence} /> : null}

          <section aria-labelledby="settlement-evidence-title" className="proof-section">
            <div className="section-rule">
              <p className="utility-label">Decoded from Coston2</p>
              <h2 id="settlement-evidence-title">Settlement evidence</h2>
            </div>
            <details data-testid="evidence-details">
              <summary>Reveal lifecycle transactions</summary>
              <div className="details-body">
                <dl className="proof-list">
                  {receipt.lifecycle.map((transaction) => (
                    <TransactionEvidence key={transaction.transactionHash} transaction={transaction} />
                  ))}
                </dl>
              </div>
            </details>
            <details data-testid="contract-details">
              <summary>Reveal commitments and contract state</summary>
              <div className="details-body">
                <dl className="proof-list">
                  <div className="proof-row">
                    <dt className="evidence-label">Scope commitment</dt>
                    <dd className="hash">{invoice.scopeHash}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Evidence commitment</dt>
                    <dd className="hash">{invoice.evidence?.hash ?? "No evidence hash recorded"}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Current active liabilities</dt>
                    <dd>{invoice.activeLiabilities.display}</dd>
                  </div>
                  <div className="proof-row">
                    <dt className="evidence-label">Current contract balance</dt>
                    <dd>{invoice.contractFxrpBalance.display}</dd>
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
    <main className="page-shell" id="main-content">
      <article aria-live="polite" aria-busy="true" className="paper empty-document" role="status">
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
    <main className="page-shell" id="main-content">
      <article className="paper empty-document">
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
