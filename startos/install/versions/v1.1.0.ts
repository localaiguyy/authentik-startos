import { VersionInfo } from '@start9labs/start-sdk'

export const v1_1_0 = VersionInfo.of({
  version: '1.1.0:0',
  releaseNotes: `SSO provisioning from the StartOS UI, and Authentik 2026.8

New actions under "SSO Provisioning":

- Set Up Cloudflare Access SSO — one form creates the OIDC (or SAML) provider
  and application for a Cloudflare Zero Trust team and returns the values to
  paste into Cloudflare's login-method settings. Users and groups are then
  managed in Authentik instead of per-user configuration at the edge.
- Add SAML Service Provider — generic SAML 2.0 provider + application for any
  external service.
- Create Group — group memberships ride along in SSO claims for policy
  matching.
- Show SSO Providers — lists configured applications and their endpoints.

The actions authenticate with a package-managed API token that is created
inside Authentik automatically on service start (also on installs upgraded
from older versions). All provisioning is idempotent and never modifies an
existing application.

Upstream Authentik upgraded 2026.2.1 -> 2026.8.0 (no new requirements per the
upstream release notes; database migrations run automatically on first start).
The configured Base URL is now also exported as AUTHENTIK_WEB__BASE_URL, which
Authentik makes mandatory starting with 2026.11.

No data migration is required — the on-disk layout is unchanged.`,
  migrations: {},
})
