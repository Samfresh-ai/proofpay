"use client";

import { useRef, useState } from "react";

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
    ? `$100 USD agreement becomes a 110 FXRP lock. Release stops at a barrier because ${formatIllustrativeFxrp(scenario.shortfallFxrpAtomic)} more is required.`
    : `$100 USD agreement becomes a 110 FXRP lock, then branches into ${formatIllustrativeFxrp(scenario.payoutFxrpAtomic)} paid to the freelancer and ${formatIllustrativeFxrp(scenario.refundFxrpAtomic)} returned to the client.`;

  return (
    <div
      aria-label={accessibleOutcome}
      className={`escrow-line escrow-flow escrow-flow-causal ${scenario.blocked ? "escrow-line-blocked escrow-flow-blocked" : "escrow-line-covered escrow-flow-covered"}`}
      data-outcome={scenario.blocked ? "blocked" : "covered"}
      role="img"
    >
      <div className="escrow-source escrow-flow-node escrow-flow-agreement">
        <span>USD agreement</span>
        <strong>$100</strong>
      </div>
      <span aria-hidden="true" className="escrow-rule escrow-flow-connector escrow-flow-connector-in" />
      <div className="escrow-lock escrow-flow-node escrow-flow-lock">
        <span>FXRP lock</span>
        <strong>110 FXRP</strong>
      </div>
      <span aria-hidden="true" className="escrow-rule escrow-flow-connector escrow-flow-connector-out" />
      {scenario.blocked ? (
        <div className="escrow-barrier escrow-flow-node escrow-flow-barrier escrow-flow-barrier-amber">
          <span aria-hidden="true" className="barrier-mark">!</span>
          <span>Release blocked</span>
          <strong>{formatIllustrativeFxrp(scenario.requiredFxrpAtomic)} required</strong>
          <small>Top up exactly {formatIllustrativeFxrp(scenario.shortfallFxrpAtomic)}</small>
        </div>
      ) : (
        <div className="escrow-branches escrow-flow-outputs">
          <div className="escrow-branch escrow-payout escrow-flow-node escrow-flow-payout">
            <span>Freelancer payout</span>
            <strong>{formatIllustrativeFxrp(scenario.payoutFxrpAtomic)}</strong>
          </div>
          <div className="escrow-branch escrow-refund escrow-flow-node escrow-flow-refund">
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
  const controlsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const scenario = ILLUSTRATIVE_SCENARIOS.find((candidate) => candidate.id === selectedId)
    ?? ILLUSTRATIVE_SCENARIOS[1];

  const selectScenario = (index: number, moveFocus = false) => {
    const scenarioCount = ILLUSTRATIVE_SCENARIOS.length;
    const nextIndex = (index + scenarioCount) % scenarioCount;
    const nextScenario = ILLUSTRATIVE_SCENARIOS[nextIndex] ?? ILLUSTRATIVE_SCENARIOS[0];
    setSelectedId(nextScenario.id);
    if (moveFocus) controlsRef.current[nextIndex]?.focus();
  };

  return (
    <section aria-labelledby="illustrative-milestone-title" className="illustrative-milestone" data-testid="illustrative-milestone">
      <header className="illustrative-heading">
        <h2 className="scenario-label" id="illustrative-milestone-title">
          Illustrative $100 milestone · no transaction is being sent
        </h2>
        <p className="funding-basis">
          Funded at $1.00 per XRP · 100 FXRP base + 10 FXRP protection = 110 FXRP locked
        </p>
      </header>

      <div aria-label="Choose the XRP price at release" className="scenario-controls" role="group">
        {ILLUSTRATIVE_SCENARIOS.map((candidate, index) => (
          <button
            aria-pressed={candidate.id === scenario.id}
            className="scenario-button"
            data-scenario-id={candidate.id}
            key={candidate.id}
            onClick={() => selectScenario(index)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                selectScenario(index + 1, true);
              } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                selectScenario(index - 1, true);
              } else if (event.key === "Home") {
                event.preventDefault();
                selectScenario(0, true);
              } else if (event.key === "End") {
                event.preventDefault();
                selectScenario(ILLUSTRATIVE_SCENARIOS.length - 1, true);
              }
            }}
            ref={(node) => {
              controlsRef.current[index] = node;
            }}
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

      <EscrowLine key={scenario.id} scenario={scenario} />

      <output aria-atomic="true" aria-live="polite" className="scenario-announcement visually-hidden">
        At {scenario.buttonLabel} per XRP, ProofPay requires {formatIllustrativeFxrp(scenario.requiredFxrpAtomic)}. {resultText(scenario)}.
      </output>
    </section>
  );
}
