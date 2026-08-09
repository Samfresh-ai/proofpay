"use client";

import { useState } from "react";

export function shortenIdentifier(value: string, head = 6, tail = 5): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function TechnicalIdentifier({
  explorerHref,
  explorerLabel = "Open in Coston2 explorer",
  label,
  value,
}: {
  explorerHref?: string;
  explorerLabel?: string;
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };
  return (
    <div className="technical-identifier">
      <code aria-label={`${label}: ${value}`} className="identifier-short">{shortenIdentifier(value)}</code>
      <div className="identifier-actions">
        <button className="identifier-button" onClick={() => void copy()} type="button">
          {copied ? "Copied" : "Copy"}
        </button>
        {explorerHref ? (
          <a aria-label={explorerLabel} href={explorerHref} rel="noreferrer" target="_blank">Explorer</a>
        ) : null}
      </div>
      <details className="identifier-reveal">
        <summary>Reveal full value</summary>
        <code>{value}</code>
      </details>
    </div>
  );
}
