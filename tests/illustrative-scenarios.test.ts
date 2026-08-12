import { describe, expect, it } from "vitest";

import {
  ILLUSTRATIVE_LOCKED_FXRP_ATOMIC,
  ILLUSTRATIVE_SCENARIOS,
  ILLUSTRATIVE_TARGET_USD_ATOMIC,
  calculateIllustrativeScenario,
  formatIllustrativeFxrp,
} from "../lib/illustrative-scenarios.js";

describe("Escrow Flow illustrative milestone", () => {
  it("keeps the fixed funding basis at $100 with 110 FXRP locked", () => {
    expect(ILLUSTRATIVE_TARGET_USD_ATOMIC).toBe(100_000_000n);
    expect(ILLUSTRATIVE_LOCKED_FXRP_ATOMIC).toBe(110_000_000n);
  });

  it("calculates all four release outcomes exactly at six FXRP decimals", () => {
    expect(ILLUSTRATIVE_SCENARIOS.map((scenario) => ({
      price: scenario.buttonLabel,
      required: formatIllustrativeFxrp(scenario.requiredFxrpAtomic),
      payout: formatIllustrativeFxrp(scenario.payoutFxrpAtomic),
      refund: formatIllustrativeFxrp(scenario.refundFxrpAtomic),
      shortfall: formatIllustrativeFxrp(scenario.shortfallFxrpAtomic),
      blocked: scenario.blocked,
    }))).toEqual([
      {
        price: "$1.25",
        required: "80 FXRP",
        payout: "80 FXRP",
        refund: "30 FXRP",
        shortfall: "0 FXRP",
        blocked: false,
      },
      {
        price: "$1.00",
        required: "100 FXRP",
        payout: "100 FXRP",
        refund: "10 FXRP",
        shortfall: "0 FXRP",
        blocked: false,
      },
      {
        price: "$0.95",
        required: "105.263158 FXRP",
        payout: "105.263158 FXRP",
        refund: "4.736842 FXRP",
        shortfall: "0 FXRP",
        blocked: false,
      },
      {
        price: "$0.90",
        required: "111.111112 FXRP",
        payout: "0 FXRP",
        refund: "0 FXRP",
        shortfall: "1.111112 FXRP",
        blocked: true,
      },
    ]);
  });

  it("rounds the required release amount upward so the USD target is never underpaid", () => {
    const scenario = calculateIllustrativeScenario(
      "protected-fall",
      "$0.95",
      "XRP falls to $0.95",
      950_000n,
    );
    expect(scenario.requiredFxrpAtomic * 950_000n).toBeGreaterThanOrEqual(
      ILLUSTRATIVE_TARGET_USD_ATOMIC * 1_000_000n,
    );
    expect((scenario.requiredFxrpAtomic - 1n) * 950_000n).toBeLessThan(
      ILLUSTRATIVE_TARGET_USD_ATOMIC * 1_000_000n,
    );
  });
});
