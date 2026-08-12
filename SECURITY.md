# Security policy

ProofPay is a Coston2 hackathon prototype. It has not been audited, is not
production-ready, and must not receive real funds, mainnet assets, private keys,
seed phrases, or other valuable credentials. The deployed contract and the live
application use testnet FXRP and C2FLR only.

## Reporting a vulnerability

Please report a suspected vulnerability privately to
[paysmat@paysmat.xyz](mailto:paysmat@paysmat.xyz) with:

- the affected route, commit, contract method, or transaction;
- a minimal reproduction and the expected impact;
- whether the issue can be reproduced without sending a transaction; and
- any suggested mitigation.

Do not include a private key, mnemonic, wallet export, cookie, access token, or
other secret. Do not test against wallets or accounts you do not control, send
unsolicited transactions, disrupt the public Coston2 service, or attempt to move
real assets. A read-only reproduction is strongly preferred.

## Supported version and scope

Only the current `main` branch and the Coston2 deployment documented in
`deployment/coston2.json` are in scope. Dependency and upstream projects retain
their own security policies. This project does not promise a bug bounty,
response time, embargo period, or production support.

The public settlement receipts prove recorded chain state and committed bytes;
they do not prove delivery quality. The browser transaction journal is local to
one browser profile and is not cross-device coordination. These are known
product boundaries, not security guarantees.
