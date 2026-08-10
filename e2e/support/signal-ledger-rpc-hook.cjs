"use strict";

const RPC_ORIGIN = "https://coston2-api.flare.network/";
const originalFetch = globalThis.fetch;

function requestUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input && typeof input.url === "string" ? input.url : String(input);
}

globalThis.fetch = function proofPayVisualFetch(input, init) {
  const url = requestUrl(input);
  if (url.startsWith(RPC_ORIGIN)) {
    const mode = process.env.PROOFPAY_VISUAL_RPC_MODE;
    if (mode === "hang") return new Promise(() => undefined);
    if (mode === "fail") {
      throw new TypeError("Controlled Phase 6B1 Coston2 RPC failure.");
    }
  }
  return originalFetch.call(globalThis, input, init);
};
