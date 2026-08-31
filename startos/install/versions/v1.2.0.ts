import { VersionInfo } from '@start9labs/start-sdk'

export const v1_2_0 = VersionInfo.of({
  version: '1.2.0:0',
  releaseNotes: `Full SSO provisioning coverage from the StartOS UI.

New actions (joining the 1.1.x set):

- Add OIDC Provider — generic OpenID Connect provider + application for any
  service with native OIDC support (confidential or public/PKCE clients,
  optional group restriction).
- Add Proxy Provider (Auth Gate) — put Authentik in front of a service with
  no SSO support: the embedded outpost authenticates, enforces group
  membership, and reverse-proxies to the upstream. Attached to the embedded
  outpost automatically; restart the service afterwards — the embedded
  outpost only picks up new proxy hosts at startup.
- Restrict Application to Group — add a group policy binding to any
  application (idempotent; reports an existing binding).
- Set Up LDAP Outpost — creates the LDAP provider, application, and outpost
  object, so enabling the LDAP Outpost toggle is now fully self-service
  (previously the outpost object had to be created in the admin UI).
- Show SSO Providers now lists ALL applications (previously group-restricted
  applications were silently hidden by API visibility filtering).

With these, a complete identity deployment — edge SSO for a Cloudflare team,
per-app OIDC, auth gates for legacy apps, groups, bindings, and LDAP — can be
provisioned entirely from Start9 action forms.`,
  migrations: {},
})
