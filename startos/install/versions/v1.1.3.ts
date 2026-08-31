import { VersionInfo } from '@start9labs/start-sdk'

export const v1_1_3 = VersionInfo.of({
  version: '1.1.3:0',
  releaseNotes: `SAML provisioning fix.

The SAML paths of "Set Up Cloudflare Access SSO" and "Add SAML Service
Provider" failed with an Authentik validation error: when a signing keypair
is selected, at least one of "Sign assertion" / "Sign response" must be set.
Created SAML providers now sign assertions.

Feature content is otherwise identical to 1.1.0-1.1.2 — see those notes for
the SSO provisioning actions and the Authentik 2026.8.0 upgrade.`,
  migrations: {},
})
