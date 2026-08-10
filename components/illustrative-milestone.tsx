"use client";

import { useState } from "react";

import {
  ILLUSTRATIVE_SCENARIOS,
  formatIllustrativeFxrp,
  type IllustrativeScenario,
  type IllustrativeScenarioId,
} from "@/lib/illustrative-scenarios";

function resultText(scenario: IllustrativeScenario): string {
  if (scenario.blocked) {
    return `Release blocked · ${formatIllustrativeFxrp(scenario.shortfallFxrpAtomic)} top-up required`;
  }
  return `${formatIllustrativeFxrp(scenario.payoutFxrpAtomic)} payout · ${formatIllustrativeFxrp(scenario.refundFxrpAtomic)} refund`;
}

function EscrowLine({ scenario }: { scenario: IllustrativeScenario }) {
  const accessibleOutcome = scenario.blocked
    ? `110 FXRP is locked. Release stops at a barrier because ${formatIllustrativeFxrp(scenario.shortfallFxrpAtomic)} more is required.`
    : `110 FXRP is locked, then branches into ${formatIllustrativeFxrp(scenario.payoutFxrpAtomic)} paid to the freelancer and ${formatIllustrativeFxrp(scenario.refundFxrpAtomic)} returned to the client.`;

  return (
    <div
      aria-label={accessibleOutcome}
      className={`escrow-line ${scenario.blocked ? "escrow-line-blocked" : "escrow-line-covered"}`}
      data-outcome={scenario.blocked ? "blocked" : "covered"}
      role="img"
    >
      <div className="escrow-source">
        <span>Escrow</span>
        <strong>110 FXRP</strong>
      </div>
      <span aria-hidden="true" className="escrow-rule" />
      {scenario.blocked ? (
        <div className="escrow-barrier">
          <span aria-hidden="true" className="barrier-mark">!</span>
          <span>Release blocked</span>
          <strong>{formatIllustrativeFxrp(scenario.shortfallFxrpAtomic)} short</strong>
        </div>
      ) : (
        <div className="escrow-branches">
          <div className="escrow-branch escrow-payout">
            <span>Freelancer payout</span>
            <strong>{formatIllustrativeFxrp(scenario.payoutFxrpAtomic)}</strong>
          </div>
          <div className="escrow-branch escrow-refund">
            <span>Client refund</span>
            <strong>{formatIllustrativeFxrp(scenario.refundFxrpAtomic)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export function IllustrativeMilestone() {
  const [selectedId, setSelectedId] = useState<IllustrativeScenarioId>("steady");
  const scenario = ILLUSTRATIVE_SCENARIOS.find((candidate) => candidate.id === selectedId)
    ?? ILLUSTRATIVE_SCENARIOS[1];

  return (
    <section aria-labelledby="illustrative-milestone-title" className="illustrative-milestone" data-testid="illustrative-milestone">
      <header className="illustrative-heading">
        <h2 className="scenario-label" id="illustrative-milestone-title">
          Illustrative $100 milestone · not live Coston2 data
        </h2>
        <p className="funding-basis">
          Funded at $1.00 per XRP · 100 FXRP base + 10 FXRP protection = 110 FXRP locked
        </p>
      </header>

      <div aria-label="Choose the XRP price at release" className="scenario-controls" role="group">
        {ILLUSTRATIVE_SCENARIOS.map((candidate) => (
          <button
            aria-pressed={candidate.id === scenario.id}
            className="scenario-button"
            data-scenario-id={candidate.id}
            key={candidate.id}
            onClick={() => setSelectedId(candidate.id)}
            type="button"
          >
            <span>{candidate.changeLabel}</span>
          </button>
        ))}
      </div>

      <div className="scenario-calculation" data-testid="scenario-calculation">
        <dl>
          <div>
            <dt>USD target</dt>
            <dd>$100.00</dd>
          </div>
          <div>
            <dt>FXRP locked</dt>
            <dd>110 FXRP</dd>
          </div>
          <div>
            <dt>FXRP required now</dt>
            <dd>{formatIllustrativeFxrp(scenario.requiredFxrpAtomic)}</dd>
          </div>
          <div className={scenario.blocked ? "calculation-result result-blocked" : "calculation-result result-covered"}>
            <dt>Result</dt>
            <dd>{resultText(scenario)}</dd>
          </div>
        </dl>
      </div>

      <EscrowLine scenario={scenario} />

      <output aria-atomic="true" aria-live="polite" className="scenario-announcement visually-hidden">
        At {scenario.buttonLabel} per XRP, ProofPay requires {formatIllustrativeFxrp(scenario.requiredFxrpAtomic)}. {resultText(scenario)}.
      </output>
    </section>
  );
}
