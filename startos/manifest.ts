import { setupManifest } from '@start9labs/start-sdk'

export const manifest = setupManifest({
  id: 'authentik',
  title: 'Authentik',
  license: 'MIT',
  packageRepo: 'https://github.com/localaiguyy/authentik-startos',
  upstreamRepo: 'https://github.com/goauthentik/authentik',
  marketingUrl: 'https://goauthentik.io',
  donationUrl: null,
  docsUrls: ['https://docs.goauthentik.io'],
  description: {
    short: 'Identity Provider with SSO, MFA, and user management',
    long: 'Authentik is an open-source Identity Provider supporting OpenID Connect (OIDC), SAML 2.0, LDAP, and SCIM. It provides single sign-on (SSO), multi-factor authentication (MFA), user lifecycle management, and application access policies. Use it to centralize authentication across your infrastructure.',
  },
  volumes: ['main'],
  images: {
    authentik: {
      source: {
        dockerBuild: {
          dockerfile: './Dockerfile',
          workdir: '.',
        },
      },
    },
  },
  alerts: {
    install:
      'After installation, access Authentik via the web UI. The initial admin credentials are shown in Actions > Show Admin Credentials. Complete the initial setup wizard to configure your first application.',
    update:
      'Database migrations will run automatically. Large databases may take several minutes.',
    uninstall:
      'Uninstalling Authentik will permanently delete all identity data including users, groups, applications, and providers. Export your configuration first.',
    restore:
      'After restoring, you may need to wait a few minutes for services to fully start.',
    start: null,
    stop: null,
  },
  dependencies: {},
})
