import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import {
  apiClient,
  defaultSigningKeypair,
  errorResult,
  findApplication,
  flowPk,
  oauthScopeMappingPks,
  resolveApiBase,
  samlPropertyMappingPks,
  slugify,
} from './api'

const AUTHORIZATION_FLOW = 'default-provider-authorization-implicit-consent'
const INVALIDATION_FLOW = 'default-provider-invalidation-flow'

const cloudflareSsoInputSpec = InputSpec.of({
  teamDomain: Value.text({
    name: 'Cloudflare Team Domain',
    description:
      'Your Cloudflare Zero Trust team domain, found under Settings > Custom Pages ' +
      'in the Zero Trust dashboard. Enter either the full domain or just the team name.',
    required: true,
    default: '',
    placeholder: 'your-team.cloudflareaccess.com',
  }),
  protocol: Value.select({
    name: 'Protocol',
    description:
      'OIDC is recommended — simpler to configure and what Cloudflare suggests for generic IdPs. ' +
      'Choose SAML only if you specifically need it.',
    default: 'oidc',
    values: {
      oidc: 'OpenID Connect (recommended)',
      saml: 'SAML 2.0',
    },
  }),
  appName: Value.text({
    name: 'Application Name',
    description:
      'Display name for the application inside Authentik. Also determines the slug used in endpoint URLs.',
    required: true,
    default: 'Cloudflare Access',
  }),
})

function normalizeTeamDomain(input: string): string {
  let team = input.trim().toLowerCase()
  team = team.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!team.includes('.')) team = `${team}.cloudflareaccess.com`
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)) {
    throw new Error(
      `"${input}" does not look like a Cloudflare team domain (expected <team>.cloudflareaccess.com).`,
    )
  }
  return team
}

export const setupCloudflareSso = sdk.Action.withInput(
  'setup-cloudflare-sso',

  async ({ effects }) => ({
    name: 'Set Up Cloudflare Access SSO',
    description:
      'Create an SSO provider for Cloudflare Access so Authentik becomes the identity provider ' +
      'for your Cloudflare Zero Trust login — users and groups are managed here, not in Cloudflare.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  cloudflareSsoInputSpec,

  async () => ({
    teamDomain: '',
    protocol: 'oidc' as const,
    appName: 'Cloudflare Access',
  }),

  async ({ effects, input }) => {
    const config = await configFile.read().const(effects)
    if (!config) throw new Error('Configuration not loaded')

    const token = config['provisioning-token']
    if (!token) {
      return errorResult(
        'Provisioning Token Missing',
        new Error(
          'The provisioning token has not been generated yet. Restart the service once, then run this action again.',
        ),
      )
    }

    const externalUrl = (config['base-url'] || '').replace(/\/+$/, '')
    if (!externalUrl) {
      return errorResult(
        'Base URL Not Set',
        new Error(
          'Cloudflare must be able to reach Authentik at a public HTTPS URL. ' +
            'Set the Base URL in Configure Settings first, then run this action again.',
        ),
      )
    }

    try {
      const team = normalizeTeamDomain(input.teamDomain)
      const callbackUrl = `https://${team}/cdn-cgi/access/callback`
      const slug = slugify(input.appName)
      const api = apiClient(await resolveApiBase(config), token)

      // Idempotency: an existing application with this slug is reported,
      // never modified or replaced.
      const existing = await findApplication(api, slug)
      if (existing) {
        let detail = `An application with the slug "${slug}" already exists in Authentik (provider: ${existing.provider_obj?.name || 'unknown'}). Nothing was changed.

To reconfigure it, edit or delete it in the Authentik admin UI, or re-run this action with a different application name.`
        return {
          version: '1' as const,
          title: 'Already Configured',
          message: detail,
          result: {
            type: 'single' as const,
            value: `${externalUrl}/if/admin/#/core/applications/${slug}`,
            copyable: true,
            qr: false,
            masked: false,
          },
        }
      }

      const authFlow = await flowPk(api, AUTHORIZATION_FLOW)
      const invalidationFlow = await flowPk(api, INVALIDATION_FLOW)
      const signingKey = await defaultSigningKeypair(api)

      if (input.protocol === 'oidc') {
        const scopeMappings = await oauthScopeMappingPks(api)

        const provider = (await api.post('/providers/oauth2/', {
          name: `${input.appName} (OIDC)`,
          authorization_flow: authFlow,
          invalidation_flow: invalidationFlow,
          client_type: 'confidential',
          redirect_uris: [{ matching_mode: 'strict', url: callbackUrl }],
          signing_key: signingKey.pk,
          sub_mode: 'user_email',
          property_mappings: scopeMappings,
        })) as { pk: number }

        await api.post('/core/applications/', {
          name: input.appName,
          slug,
          provider: provider.pk,
        })

        const detail = (await api.get(`/providers/oauth2/${provider.pk}/`)) as {
          client_id: string
          client_secret: string
        }

        return {
          version: '1' as const,
          title: 'Cloudflare Access SSO Created (OIDC)',
          message: `Provider and application created in Authentik.

In the Cloudflare Zero Trust dashboard, go to Settings > Authentication > Login methods > Add new > OpenID Connect and enter the values below.

To use Authentik group memberships in Cloudflare Access policies, enable "Groups" under OIDC Claims (the groups claim is emitted via the profile scope).`,
          result: {
            type: 'group' as const,
            value: [
              {
                name: 'Client ID',
                description: 'App ID for the Cloudflare login method',
                type: 'single' as const,
                value: detail.client_id,
                copyable: true,
                qr: false,
                masked: false,
              },
              {
                name: 'Client Secret',
                description: 'Client secret for the Cloudflare login method',
                type: 'single' as const,
                value: detail.client_secret,
                copyable: true,
                qr: false,
                masked: true,
              },
              {
                name: 'Auth URL',
                description: 'Authorization endpoint',
                type: 'single' as const,
                value: `${externalUrl}/application/o/authorize/`,
                copyable: true,
                qr: false,
                masked: false,
              },
              {
                name: 'Token URL',
                description: 'Token endpoint',
                type: 'single' as const,
                value: `${externalUrl}/application/o/token/`,
                copyable: true,
                qr: false,
                masked: false,
              },
              {
                name: 'Certificate URL (JWKS)',
                description: 'Key set endpoint',
                type: 'single' as const,
                value: `${externalUrl}/application/o/${slug}/jwks/`,
                copyable: true,
                qr: false,
                masked: false,
              },
            ],
          },
        }
      }

      // SAML
      const samlMappings = await samlPropertyMappingPks(api)

      const provider = (await api.post('/providers/saml/', {
        name: `${input.appName} (SAML)`,
        authorization_flow: authFlow,
        invalidation_flow: invalidationFlow,
        acs_url: callbackUrl,
        audience: callbackUrl,
        sp_binding: 'post',
        signing_kp: signingKey.pk,
        property_mappings: samlMappings,
      })) as { pk: number }

      await api.post('/core/applications/', {
        name: input.appName,
        slug,
        provider: provider.pk,
      })

      return {
        version: '1' as const,
        title: 'Cloudflare Access SSO Created (SAML)',
        message: `Provider and application created in Authentik.

In the Cloudflare Zero Trust dashboard, go to Settings > Authentication > Login methods > Add new > SAML and enter the values below. Download the signing certificate from the metadata URL (it contains the IdP entity ID, SSO endpoint, and certificate).`,
        result: {
          type: 'group' as const,
          value: [
            {
              name: 'Single Sign-On URL',
              description: 'IdP SSO endpoint (POST binding)',
              type: 'single' as const,
              value: `${externalUrl}/application/saml/${slug}/sso/binding/post/`,
              copyable: true,
              qr: false,
              masked: false,
            },
            {
              name: 'IdP Entity ID',
              description: 'Issuer configured on the provider',
              type: 'single' as const,
              value: 'authentik',
              copyable: true,
              qr: false,
              masked: false,
            },
            {
              name: 'Metadata URL',
              description:
                'SAML metadata (includes the signing certificate) — requires an authenticated browser session',
              type: 'single' as const,
              value: `${externalUrl}/api/v3/providers/saml/${provider.pk}/metadata/?download`,
              copyable: true,
              qr: false,
              masked: false,
            },
          ],
        },
      }
    } catch (err) {
      return errorResult('Cloudflare SSO Setup Failed', err)
    }
  },
)
