# Certificate Manager

Issue, rotate, and govern X.509 certificates for TLS, mTLS, code signing, and
device identity. Acts as your internal PKI.

## Core features

- **Internal & external CAs** — create a root/intermediate CA in Sanctum or
  connect an external CA (AWS ACM PCA, DigiCert, and others).
- **Certificate profiles & policies** — define allowed domains, key usages,
  TTLs, and key algorithms once; issuance is constrained by policy.
- **Certificate issuance** — issue and download certs from the UI, API, or
  enrollment protocols.
- **Enrollment protocols** — ACME (like Let's Encrypt on your own CA), EST,
  and SCEP for automated device/service enrollment.
- **Renewal & CRLs** — track expiry, auto-renew where configured, and publish
  certificate revocation lists.
- **Code signing** — managed signing operations with signers, approval
  workflows, and an operations audit trail.
- **Discovery** — scan networks/cloud accounts to inventory certificates
  already in the wild.
- **Certificate syncs** — push issued certs to destinations like cloud secret
  stores.

## Typical flow

1. Create a CA (or connect an external one).
2. Create a certificate profile + policy describing what may be issued.
3. Issue certs from the UI, or enroll a client via ACME/EST/SCEP.
4. Track expiry under Certificates; set up alerts before expiration.
