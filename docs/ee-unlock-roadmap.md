# EE Feature Unlock Roadmap

Goal: run this self-hosted Sanctum fork with every license-gated feature enabled, without a license key.

## How gating works today

```
getPlan(orgId)                    (license-service.ts:232)
  ├── Cloud        → License Server v2 entitlements → projected to TFeatureSet
  ├── Online key   → License Server v2 → onPremFeatures
  ├── Offline key  → signed JSON blob → onPremFeatures
  └── No key       → getDefaultOnPremFeatures()     ← we are here
```

- `onPremFeatures` is the single source of truth for self-hosted. `getPlan` returns it verbatim for any non-cloud instance, and a few services read `licenseService.onPremFeatures` directly (super-admin, rate-limit, crypto).
- ~54 distinct flags are enforced at ~200 call sites via `plan.<flag>` truthy checks (see "Enforcement map" below).
- The frontend reads the same `TFeatureSet` via the subscription/plan query and hides or disables UI. **If the backend returns all-true, ~95% of the frontend unlocks with zero frontend changes.**

## Phase 1 — Central unlock (the whole paywall in one diff)

File: `backend/src/ee/services/license/license-fns.ts` → `getDefaultOnPremFeatures()`

Change the returned defaults to a fully-enabled enterprise plan. Recommended values:

| Field | Set to | Notes |
|---|---|---|
| `slug` | `"enterprise"` | Required — `getEnforcedIdentityLimit` bypasses seat limits only for `slug === "enterprise"` |
| All `false` booleans | `true` | See exceptions below |
| All limit fields (`workspaceLimit`, `memberLimit`, `identityLimit`, `environmentLimit`, `secretSyncLimit`, `maxInternalCas`, `maxPamAccounts`, `auditLogStreamLimit`, `honeyTokenLimit`) | `null` or a high number | `null` = unlimited for most; `honeyTokenLimit`/`auditLogStreamLimit` are compared numerically — use e.g. `1000` |
| `auditLogsRetentionDays` | `36500` | 0 disables retention |
| `enforceIdentityLimit`, `enforceGoogleSSO`, `enforceMfa` | `false` | These are *restrictions*, not features — keep them off |
| `pam`, `certManager`, `secretsTemporaryAccess`, `enterprisePamAccount`, `pkiCodeSigning` | `true` | Product-gating fields are `null` by default and checked for truthiness |
| `rateLimits` | raise (e.g. read 6000 / write 20000 / secrets 4000) | Only relevant with `customRateLimits: true` |
| `isOffline` | leave unset | Setting it makes the billing UI render a read-only banner |
| **`fips`** | **`false`** | **Do NOT set true.** `crypto.ts` switches to FIPS-validated providers on this flag; on a non-FIPS build it can break key generation/login. Only flip if running `Dockerfile.fips.standalone-sanctum`. |

That's it for the backend. `instanceType` stays `OnPrem`, `getPlan` returns the patched defaults everywhere, and every `plan.<flag>` check passes.

## Phase 2 — Stray gates not covered by the plan object

These don't read `plan.*`, so check them after Phase 1:

- `throwOnPlanSeatLimitReached` (`license-fns.ts:139`) — neutralized automatically: slug `enterprise` + `enforceIdentityLimit: false` → `getEnforcedIdentityLimit` returns `null` → early return.
- `verifyOfflineLicense` — irrelevant, we never present a license.
- `customRateLimits` usage in `inject-rate-limits.ts` — reads `plan.rateLimits`; safe, just confirm the raised numbers.
- Super-admin `instanceUserManagement` — now `true`, enables instance-level user admin. Decide whether you want it.
- Telemetry (`telemetry-service.ts` reads `plan.slug`) — will report slug `enterprise`. Harmless, note it if telemetry is enabled.

## Phase 3 — Frontend cleanup (optional polish)

The subscription context (`frontend/src/context/SubscriptionContext/`) fetches the org plan; every `subscription.<flag>` check already passes post-Phase-1. Remaining work is cosmetic:

- ~145 files reference `subscription.` — most unlock automatically.
- "Upgrade" popups (`popUp.upgradePlan` / upgrade CTAs) may still appear in a few places where the trigger isn't flag-gated. Sweep `frontend/src` for `upgradePlan`/`UpgradePlan`/`upgrade` popups and remove the trigger buttons if desired.
- Billing/plan pages will show `slug: enterprise`; hide or restyle if you don't want the "Enterprise plan" label shown.
- Verify nav items appear: SSO tabs, audit log streams, gateways, KMIP, honey tokens, PAM, sub-orgs, project templates.

## Phase 4 — Verification checklist

- [ ] `make reviewable-api` (lint + typecheck on backend)
- [ ] Restart backend; confirm log line: `Instance type: self-hosted` (unchanged — no license needed)
- [ ] Org settings → enable SAML SSO config → save (was `samlSSO` blocked)
- [ ] Create a 4th audit log stream (was `auditLogStreamLimit: 3`)
- [ ] Create >3 environments in a project (`environmentLimit`)
- [ ] Add a trusted IP on an identity auth method (`ipAllowlisting`)
- [ ] Create a sub-organization (`subOrganization`)
- [ ] Secret approval policy + dynamic secret + secret rotation create flows
- [ ] PAM account creation (`maxPamAccounts`, `enterprisePamAccount`)
- [ ] Honey token creation (`honeyTokenLimit`)
- [ ] Login still works (confirms `fips` stayed off)

## Phase 5 — Upstream-merge hygiene

- The entire unlock lives in `getDefaultOnPremFeatures()` — one function, one hunk. When merging upstream, keep your version of that function.
- New upstream flags land as new fields on `TFeatureSet` with `false` defaults. Add a comment block at the top of the function listing "set every new flag to true unless it's a restriction (`enforce*`, `fips`) or a numeric limit (`null`/high)".
- Consider a unit test asserting `getDefaultOnPremFeatures()` has no `false`/`0`/`null` on boolean flags outside a whitelist — catches new flags added upstream as `false`.

## Rollback

Revert `getDefaultOnPremFeatures()` to upstream defaults. No data migration needed — flags are read live, nothing is persisted per-org for self-hosted.

## What NOT to do

- Don't patch `verifyOfflineLicense` or fabricate license keys — unnecessary, and it forks the crypto surface for no gain.
- Don't delete `ee/routes/v1/license-router.ts` or `license-v2-router.ts` — the frontend billing page calls them; leave them returning the patched plan.
- Don't set `fips: true` on non-FIPS images (see Phase 1).
