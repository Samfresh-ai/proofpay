import { describe, expect, it } from "vitest";

import { resolveDeploymentOrigin } from "../lib/site-metadata.js";

describe("public deployment metadata origin", () => {
  it("uses the production-only canonical site URL when configured", () => {
    expect(resolveDeploymentOrigin({
      publicSiteUrl: "https://proofpay.paysmat.xyz",
      vercelUrl: "proofpay-preview.vercel.app",
    }).origin).toBe("https://proofpay.paysmat.xyz");
  });

  it("uses the current Vercel deployment origin for previews", () => {
    expect(resolveDeploymentOrigin({ vercelUrl: "proofpay-preview-abc.vercel.app" }).origin)
      .toBe("https://proofpay-preview-abc.vercel.app");
  });

  it("uses a local-only fallback outside Vercel", () => {
    expect(resolveDeploymentOrigin({}).origin).toBe("http://localhost:3000");
  });

  it("rejects non-HTTPS or path-bearing deployment origins", () => {
    expect(() => resolveDeploymentOrigin({ publicSiteUrl: "http://proofpay.paysmat.xyz" }))
      .toThrow(/absolute HTTPS origin/u);
    expect(() => resolveDeploymentOrigin({ vercelUrl: "https://preview.vercel.app/path" }))
      .toThrow(/absolute HTTPS origin/u);
  });
});
