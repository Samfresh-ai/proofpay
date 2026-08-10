const ATOMIC_SCALE = 1_000_000n;

export const ILLUSTRATIVE_TARGET_USD_ATOMIC = 100_000_000n;
export const ILLUSTRATIVE_LOCKED_FXRP_ATOMIC = 110_000_000n;

export type IllustrativeScenarioId = "rise" | "steady" | "protected-fall" | "blocked-fall";

export interface IllustrativeScenario {
  id: IllustrativeScenarioId;
  buttonLabel: string;
  changeLabel: string;
  releasePriceUsdAtomic: bigint;
  requiredFxrpAtomic: bigint;
  payoutFxrpAtomic: bigint;
  refundFxrpAtomic: bigint;
  shortfallFxrpAtomic: bigint;
  blocked: boolean;
}

function divideRoundingUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("Release price must be positive.");
  return (numerator + denominator - 1n) / denominator;
}

export function calculateIllustrativeScenario(
  id: IllustrativeScenarioId,
  buttonLabel: string,
  changeLabel: string,
  releasePriceUsdAtomic: bigint,
): IllustrativeScenario {
  const requiredFxrpAtomic = divideRoundingUp(
    ILLUSTRATIVE_TARGET_USD_ATOMIC * ATOMIC_SCALE,
    releasePriceUsdAtomic,
  );
  const blocked = requiredFxrpAtomic > ILLUSTRATIVE_LOCKED_FXRP_ATOMIC;
  const refundFxrpAtomic = blocked ? 0n : ILLUSTRATIVE_LOCKED_FXRP_ATOMIC - requiredFxrpAtomic;
  const shortfallFxrpAtomic = blocked ? requiredFxrpAtomic - ILLUSTRATIVE_LOCKED_FXRP_ATOMIC : 0n;

  return {
    id,
    buttonLabel,
    changeLabel,
    releasePriceUsdAtomic,
    requiredFxrpAtomic,
    payoutFxrpAtomic: blocked ? 0n : requiredFxrpAtomic,
    refundFxrpAtomic,
    shortfallFxrpAtomic,
    blocked,
  };
}

export const ILLUSTRATIVE_SCENARIOS = [
  calculateIllustrativeScenario("rise", "$1.25", "XRP rises to $1.25", 1_250_000n),
  calculateIllustrativeScenario("steady", "$1.00", "XRP remains $1.00", 1_000_000n),
  calculateIllustrativeScenario("protected-fall", "$0.95", "XRP falls to $0.95", 950_000n),
  calculateIllustrativeScenario("blocked-fall", "$0.90", "XRP falls to $0.90", 900_000n),
] as const satisfies readonly IllustrativeScenario[];

export function formatIllustrativeFxrp(value: bigint): string {
  const whole = value / ATOMIC_SCALE;
  const fraction = (value % ATOMIC_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${whole}${fraction ? `.${fraction}` : ""} FXRP`;
}
