# ProofPay public deployment

Status: `PUBLIC_DEPLOYMENT_NEEDS_REVISION`

This document records the completed Phase 6A Vercel publication through the corrected custom
domain. DNS, HTTPS, anonymous public access, production logs, and public Coston2 reconciliation
pass. The overall gate remains `PUBLIC_DEPLOYMENT_NEEDS_REVISION` because the requested hosted
client funding-role quote and funding-intent screenshot cannot be produced from the two terminal
public invoices without a prohibited broadcast. The machine-readable companion is
`deployment/vercel.json`.

## Evidence identity

- Application commit: `903c36bf8d0bf172c1aaf113b46db375c4e210c7`
- Vercel project: `proofpay-paysmat`
- Intended canonical origin: `https://proofpay.paysmat.xyz`
- Production environment variable names recorded: `NEXT_PUBLIC_SITE_URL`
- Evidence commit in `deployment/vercel.json`: `SELF`. Git commits cannot contain their own final
  hash. `SELF` therefore means that the containing commit is the evidence commit; its actual hash
  must be reported externally after that commit is created.

No environment-variable value or credential is recorded here.

## Deployment inventory

### Preview

- URL: `https://proofpay-paysmat-l2nkco16r-adamolekuntemitope4-2758s-projects.vercel.app`
- Deployment ID: `dpl_28ihjc2manYnfZrydwyhDNDBnnAk`
- Created: `2026-08-09T23:17:41.809Z`
- Vercel target/state: `preview` / `READY`
- Protected-deployment smoke: `PASS`

The preview deployment was exercised through Vercel's automation bypass because generated
deployment URLs are protected. The checks covered `/`, `/app`, both live invoice and receipt
routes, unknown invoice and receipt routes, desktop and mobile overflow, serious/critical
accessibility findings, browser and network errors, and a Coston2 wallet-read plus safe
create-invoice intent simulation. The simulation made zero signing calls and zero broadcast calls.
The Preview was created from precursor commit `326e827fb06b68028ea4f05091fce89d6d1aef3d`.
The corrected application commit changes only a metadata unit-test fixture excluded by
`.vercelignore`; the uploaded Preview runtime is unchanged.

### Promoted production deployment

- URL: `https://proofpay-paysmat-6rkpku49p-adamolekuntemitope4-2758s-projects.vercel.app`
- Deployment ID: `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9`
- Created: `2026-08-10T02:36:57.442Z`
- Ready: `2026-08-10T02:37:15.851Z`
- Vercel target/state: `production` / `READY`
- Protected-deployment smoke: `PASS`
- Canonical metadata origin observed in the staged build: `https://proofpay.paysmat.xyz`
- Promotion to the custom domain: `PASS`

The same protected-deployment route, responsive, accessibility, browser-error, Coston2 read, and
safe intent checks passed before promotion. Vercel then promoted this exact deployment without a
rebuild. Anonymous custom-domain checks through `https://proofpay.paysmat.xyz` independently pass
and are recorded below.

### Superseded staged production history

The first staged candidate is retained as correction history and must not be promoted. It compiled
the initially supplied `.com` canonical origin before the owner corrected the intended domain to
`proofpay.paysmat.xyz`:

- URL: `https://proofpay-paysmat-5gfgdxs3q-adamolekuntemitope4-2758s-projects.vercel.app`
- Deployment ID: `dpl_F1wvviZF1tLe75yMHmkF4Ho8Rqfz`
- Created: `2026-08-09T23:55:05.535Z`
- Observed canonical origin: `https://proofpay.paysmat.com`
- Disposition: `DO NOT PROMOTE`

### Bootstrap production history

The first deployment made while bootstrapping the Vercel project was automatically assigned to
production by Vercel even though the deploy command did not request `--prod`. It remains part of the
honest deployment history but is not the staged Phase 6A production candidate:

- URL: `https://proofpay-paysmat-kqh13h9eq-adamolekuntemitope4-2758s-projects.vercel.app`
- Deployment ID: `dpl_2teLezcnMTwmSg53q7tXFk2fAEG6`
- Created: `2026-08-09T23:16:14.836Z`
- State: `READY`

## Custom-domain gate

The owner corrected the canonical host from `proofpay.paysmat.com` to
`proofpay.paysmat.xyz` before any DNS record or public custom-domain alias was created. Vercel's
mistaken unverified `.com` project-domain entry was detached; its verification TXT was never
installed. The corrected `.xyz` domain is attached and Vercel already reports ownership verified.

The corrected redacted before-state was captured at `2026-08-10T02:32:10.775Z`. Cloudflare is the
authoritative DNS provider through `braden.ns.cloudflare.com` and `heather.ns.cloudflare.com`.
Both authorities returned `NXDOMAIN` for the `proofpay` A, AAAA, CNAME, and TXT lookups, so no
conflicting record requires replacement. Namecheap is the registrar but is not authoritative for
DNS; its records and the nameservers must not be changed.

1. Vercel reports `proofpay.paysmat.xyz` attached and verified, so no ownership TXT is required.
2. Vercel's domain configuration returned the exact project-specific routing record below, which
   is installed in Cloudflare:
   - Type: `CNAME`
   - Name: `proofpay.paysmat.xyz` (Cloudflare name: `proofpay`)
   - Target: `ac2b1f40626610de.vercel-dns-017.com.`
   - Proxy status: `DNS only` (`proxied: false`)
   - TTL: `Auto`
3. Only that `proofpay` CNAME was added through Cloudflare; the generic fallback target was not
   used.
4. Preserve the root domain, `www`, mail, nameservers, existing TXT values, and every unrelated DNS
   record.
5. Both authorities and public resolvers return the exact CNAME. Vercel reports `verified: true`,
   `misconfigured: false`, and zero conflicts.
6. The staged candidate was promoted without rebuilding; Vercel's promotion status maps the project
   to deployment `dpl_HYzfUxvqqiLijsY2vCaNMXP268V9`.
7. HTTPS, the HTTP-to-HTTPS redirect, anonymous routes, responsive and accessibility checks,
   wallet simulation, read-only Coston2 reconciliation, and production logs pass through
   `https://proofpay.paysmat.xyz`.

The authenticated Cloudflare session changed only the `proofpay` CNAME. No ownership TXT was
required or installed.

## Public production verification

- HTTPS first passed at `2026-08-10T03:09:02Z`. The Let's Encrypt certificate identifies only
  `proofpay.paysmat.xyz`, was valid when tested, and expires `2026-11-08T02:09:18Z`.
- Plain HTTP returns `308` to the corrected HTTPS origin; `/app` returns `200` with HSTS.
- The anonymous smoke run used no Vercel bypass. The root redirect, application, invoices `1` and
  `2`, receipts `1` and `2`, and unknown invoice/receipt states returned their expected content and
  exact `.xyz` canonical metadata.
- Desktop and 390-pixel mobile views had zero horizontal overflow. Sampled Axe scans on the app,
  invoice, and receipt found no serious or critical issue. Console errors, page errors, and failed
  browser responses were zero.
- The injected Coston2 wallet prepared and then abandoned one unsigned `create_invoice` intent.
  Signing calls and transaction broadcasts were both zero.
- Invoice `1` reconciled at block `33845120`; invoice `2` reconciled at block `33845158`. Both were
  `RELEASED` with zero active liabilities and zero contract FXRP balance. The isolated invoice-2
  verifier passed all seven checks, and protected historical artifacts were byte-identical.
- Vercel logs for `2026-08-10T03:09:00Z` through `03:19:44Z` contained zero application
  error/fatal entries and zero HTTP 5xx entries. A bounded 1,000-entry request sample contained only
  the corrected host and included the expected public routes.
- Public Copy and Reveal controls matched all eight receipt identifiers exactly; explorer-link
  origins and safety attributes passed without opening them. Twelve sensitive-path probes were
  non-public, and a 1,094,326-byte scan of 18 same-origin assets found no local-path, owner-name,
  credential, private-key, or explicit source-map reference. No guessed source-map companion was
  publicly readable.

The seven visually reviewed production captures are preserved under
`artifacts/public-deployment/production/`. `07-create-intent-preview.png` is intentionally labelled
as an unsigned create-invoice preview; it is not misrepresented as funding evidence.

## Rollback procedure

Run Vercel commands from `/home/samfresh22/openclaw-grower-workspace/proofpay`, whose local Vercel
link identifies project `proofpay-paysmat`.

To restore the immediately previous Production deployment after this candidate, or a future
release, has been promoted:

```sh
npx --yes vercel@58.9.0 rollback --yes
npx --yes vercel@58.9.0 rollback status proofpay-paysmat
```

If an explicit known deployment must be restored, promote the recorded bootstrap deployment:

```sh
npx --yes vercel@58.9.0 promote https://proofpay-paysmat-kqh13h9eq-adamolekuntemitope4-2758s-projects.vercel.app --yes
```

Then inspect the canonical assignment and repeat the public read-only checks:

```sh
npx --yes vercel@58.9.0 inspect https://proofpay.paysmat.xyz
```

To undo a rollback and re-promote the known-good Phase 6A candidate without rebuilding:

```sh
npx --yes vercel@58.9.0 promote https://proofpay-paysmat-6rkpku49p-adamolekuntemitope4-2758s-projects.vercel.app --yes
npx --yes vercel@58.9.0 promote status proofpay-paysmat
```

If DNS itself must be withdrawn, remove only the newly added `proofpay` CNAME. No ProofPay
verification TXT is required or installed for the corrected domain. Do not change root, `www`, mail,
nameserver, or unrelated records. Detach the custom domain from Vercel without removing the project:

```sh
npx --yes vercel@58.9.0 domains rm proofpay.paysmat.xyz --yes
```

## Known limitations

- Cloudflare is authoritative for `paysmat.xyz`. The exact project-specific `proofpay` CNAME is
  installed DNS-only and resolves through both authorities and public resolvers; no verification
  TXT is required or installed.
- The generated Vercel URLs remain protected. Anonymous access is proved separately through the
  custom domain, not inferred from an automation bypass.
- Both existing public invoices are terminal. A public funding-intent screenshot cannot be
  produced from them, and Phase 6A forbids creating or broadcasting another on-chain invoice. The
  deployment smoke safely simulated a create-invoice intent with no signing or broadcast; the
  client funding-role behavior is supported by deterministic tests rather than a live public
  funding-intent screenshot.
- The corrected before-state proves the ProofPay host did not exist. Preservation of unrelated DNS
  is supported by the single scoped Cloudflare create action, not by a complete pre-change export
  of the full zone.
- The first project deployment's automatic production classification is preserved above so it is
  not mistaken for the separately staged production candidate.
- ProofPay runs against Coston2 test assets. It is not audited, legal escrow, or fiat escrow.
