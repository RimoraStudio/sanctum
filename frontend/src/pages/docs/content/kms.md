# KMS

Key Management Service. Generate, store, and use cryptographic keys (CMKs) for
encrypt, decrypt, sign, and verify operations over the API. Keys never leave
the platform.

## Core features

- **Key management** — create and lifecycle-manage keys per project with
  aliases, descriptions, and versioning.
- **Cryptographic operations** — encrypt, decrypt, sign, and verify via REST
  API calls. Data goes in, ciphertext or signature comes out.
- **KMIP server** — expose keys to KMIP-speaking clients (databases, storage
  arrays, enterprise software) through managed KMIP server endpoints under the
  org-level KMIP Servers page.
- **External KMS** — integrate external key stores and HSMs for
  key-custody/hybrid setups.
- **Post-quantum algorithms** — PQC key types and operations where the build
  includes the PQC provider.

## When to use it

- Encrypt application data without storing the key in your codebase or DB.
- Sign artifacts/tokens with a centrally managed key.
- Satisfy compliance requirements for key custody and rotation.

## Notes

Audit logs record every cryptographic operation. Project permissions control
who can manage keys versus use them.
