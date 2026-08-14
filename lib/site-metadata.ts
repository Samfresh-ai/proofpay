export const PROOFPAY_PUBLIC_TITLE = "ProofPay — FXRP Milestone Settlement";
export const PROOFPAY_PUBLIC_DESCRIPTION =
  "Fund a USD-priced milestone with FXRP, preserve its value through Flare pricing, and verify the settlement on Coston2.";

interface DeploymentOriginInput {
  publicSiteUrl?: string | undefined;
  vercelUrl?: string | undefined;
}

function httpsOrigin(value: string, label: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTPS origin.`);
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(`${label} must be an absolute HTTPS origin.`);
  }
  return new URL(url.origin);
}

export function resolveDeploymentOrigin(input: DeploymentOriginInput): URL {
  const publicSiteUrl = input.publicSiteUrl?.trim();
  if (publicSiteUrl) return httpsOrigin(publicSiteUrl, "NEXT_PUBLIC_SITE_URL");

  const vercelUrl = input.vercelUrl?.trim();
  if (vercelUrl) {
    return httpsOrigin(vercelUrl.includes("://") ? vercelUrl : `https://${vercelUrl}`, "VERCEL_URL");
  }

  return new URL("http://localhost:3000");
}
