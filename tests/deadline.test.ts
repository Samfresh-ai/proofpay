import { describe, expect, it } from "vitest";
import { getAddress } from "viem";

import {
  contractDeadlineFromLocalInput,
  formatLocalDeadline,
  formatUtcDeadline,
  localDateTimeToUnixSeconds,
  twentyFourHourDeadline,
  unixSecondsToLocalInput,
} from "../lib/deadline.js";
import { buildTransactionIntent } from "../lib/transaction-intents.js";

const FREELANCER = getAddress("0x1111111111111111111111111111111111111111");

describe("ProofPay Phase 5C deadline conversion", () => {
  it("converts an Africa/Lagos wall clock to one explicit UTC instant without a one-hour drift", () => {
    const deadline = localDateTimeToUnixSeconds("2026-08-09T12:00", "Africa/Lagos");
    expect(formatUtcDeadline(deadline)).toBe("2026-08-09T11:00:00Z");
    expect(unixSecondsToLocalInput(deadline, "Africa/Lagos")).toBe("2026-08-09T12:00");
    expect(formatLocalDeadline(deadline, "Africa/Lagos")).toContain("UTC+01:00");
  });

  it("preserves UTC and a negative UTC offset", () => {
    const utc = localDateTimeToUnixSeconds("2026-08-09T12:00", "UTC");
    const losAngeles = localDateTimeToUnixSeconds("2026-08-09T12:00", "America/Los_Angeles");
    expect(formatUtcDeadline(utc)).toBe("2026-08-09T12:00:00Z");
    expect(formatUtcDeadline(losAngeles)).toBe("2026-08-09T19:00:00Z");
    expect(formatLocalDeadline(losAngeles, "America/Los_Angeles")).toContain("UTC−07:00");
  });

  it("rejects a nonexistent daylight-saving clock time and round-trips an ambiguous one", () => {
    expect(() => localDateTimeToUnixSeconds("2026-03-08T02:30", "America/New_York"))
      .toThrow(/does not exist/u);
    const ambiguous = localDateTimeToUnixSeconds("2026-11-01T01:30", "America/New_York");
    expect(unixSecondsToLocalInput(ambiguous, "America/New_York")).toBe("2026-11-01T01:30");
    expect(formatUtcDeadline(ambiguous)).toBe("2026-11-01T05:30:00Z");
  });

  it.each(["Africa/Lagos", "UTC", "America/Los_Angeles", "Asia/Kathmandu"])(
    "round-trips local input in %s",
    (timeZone) => {
      const input = "2026-10-14T09:47";
      expect(unixSecondsToLocalInput(localDateTimeToUnixSeconds(input, timeZone), timeZone)).toBe(input);
    },
  );

  it("makes the 24-hour preset exactly 86,400 seconds after the current epoch", () => {
    const now = 1_786_243_027n;
    expect(twentyFourHourDeadline(now) - now).toBe(86_400n);
  });

  it("rejects past local input after explicit conversion", () => {
    const deadline = localDateTimeToUnixSeconds("2026-08-09T12:00", "Africa/Lagos");
    expect(() => contractDeadlineFromLocalInput("2026-08-09T12:00", "Africa/Lagos", deadline))
      .toThrow(/future/u);
  });

  it("binds and exposes the exact contract deadline in the transaction intent", () => {
    const deadline = localDateTimeToUnixSeconds("2026-08-09T12:00", "Africa/Lagos");
    const intent = buildTransactionIntent({
      action: "create",
      actionLabel: "Create this $2 milestone",
      account: FREELANCER,
      invoiceId: "2",
      token: "None",
      tokenAddress: null,
      amountAtomic: null,
      amountDisplay: "No token transfer",
      contractDeadline: deadline.toString(),
      quoteDeadline: null,
      maximumAtomic: null,
      maximumDisplay: "Not applicable",
      expectedResult: "Create the invoice.",
    });
    expect(intent.contractDeadline).toBe(deadline.toString());
    expect(formatUtcDeadline(BigInt(intent.contractDeadline ?? "0"))).toBe("2026-08-09T11:00:00Z");
  });
});
