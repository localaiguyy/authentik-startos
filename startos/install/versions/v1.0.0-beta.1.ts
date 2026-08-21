import { VersionInfo } from '@start9labs/start-sdk'

export const v1_0_0_beta_1 = VersionInfo.of({
  version: '1.0.0-beta.1:0',
  releaseNotes: `Initial Release

Authentik 2024.12.3 Identity Provider for StartOS 0.4.0

Features:
- OpenID Connect (OIDC) provider
- SAML 2.0 provider
- Multi-factor authentication (TOTP, WebAuthn)
- User and group management
- Application access policies
- Optional LDAP outpost
- Embedded PostgreSQL and Redis`,
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
