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
  slugify,
} from './api'

const AUTHORIZATION_FLOW = 'default-provider-authorization-implicit-consent'
const INVALIDATION_FLOW = 'default-provider-invalidation-flow'

const oidcInputSpec = InputSpec.of({
  appName: Value.text({
    name: 'Application Name',
    description:
      'Display name for the application inside Authentik. Also determines the slug used in endpoint URLs.',
    required: true,
    default: '',
    placeholder: 'e.g. My Service',
  }),
  redirectUris: Value.text({
    name: 'Redirect URIs',
    description:
      'Allowed OAuth2 redirect/callback URIs, one per line or comma-separated. Get these from the service you are connecting.',
    required: true,
    default: '',
    placeholder: 'https://service.example.com/oauth/callback',
  }),
  clientType: Value.select({
    name: 'Client Type',
    description:
      'Confidential clients (server-side apps) get a client secret. Public clients (SPAs, mobile apps) use PKCE instead.',
    default: 'confidential',
    values: {
      confidential: 'Confidential (client secret)',
      public: 'Public (PKCE, no secret)',
    },
  }),
  groupName: Value.text({
    name: 'Restrict to Group (optional)',
    description:
      'If set, only members of this Authentik group can authorize. Leave blank to allow any authenticated user.',
    required: false,
    default: '',
    placeholder: 'e.g. admins',
  }),
})

export const addOidcProvider = sdk.Action.withInput(
  'add-oidc-provider',

  async ({ effects }) => ({
    name: 'Add OIDC Provider',
    description:
      'Create an OpenID Connect provider and application for a service with native OIDC support.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  oidcInputSpec,

  async () => ({
    appName: '',
    redirectUris: '',
    clientType: 'confidential' as const,
    groupName: '',
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

    try {
      const uris = input.redirectUris
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean)
      if (!uris.length || uris.some((u) => !/^https?:\/\//.test(u))) {
        throw new Error('Every redirect URI must be an http(s) URL.')
      }

      const slug = slugify(input.appName)
      const externalUrl = (config['base-url'] || '').replace(/\/+$/, '')
      const api = apiClient(await resolveApiBase(config), token)

      // Idempotency: an existing application with this slug is reported,
      // never modified or replaced.
      const existing = await findApplication(api, slug)
      if (existing) {
        return {
          version: '1' as const,
          title: 'Already Configured',
          message: `An application with the slug "${slug}" already exists in Authentik (provider: ${existing.provider_obj?.name || 'unknown'}). Nothing was changed.`,
          result: {
            type: 'single' as const,
            value: slug,
            copyable: true,
            qr: false,
            masked: false,
          },
        }
      }

      const authFlow = await flowPk(api, AUTHORIZATION_FLOW)
      const invalidationFlow = await flowPk(api, INVALIDATION_FLOW)
      const signingKey = await defaultSigningKeypair(api)
      const scopeMappings = await oauthScopeMappingPks(api)

      const provider = (await api.post('/providers/oauth2/', {
        name: `${input.appName} (OIDC)`,
        authorization_flow: authFlow,
        invalidation_flow: invalidationFlow,
        client_type: input.clientType,
        redirect_uris: uris.map((url) => ({ matching_mode: 'strict', url })),
        signing_key: signingKey.pk,
        property_mappings: scopeMappings,
      })) as { pk: number }

      const app = (await api.post('/core/applications/', {
        name: input.appName,
        slug,
        provider: provider.pk,
      })) as { pk: string }

      let groupNote = 'Any authenticated user may authorize.'
      const groupName = (input.groupName || '').trim()
      if (groupName) {
        const groups = (await api.get(
          `/core/groups/?name=${encodeURIComponent(groupName)}&include_users=false`,
        )) as { results: { pk: string; name: string }[] }
        const group = groups.results.find((g) => g.name === groupName)
        if (!group) {
          groupNote = `WARNING: group "${groupName}" does not exist — no restriction applied. Create it with the Create Group action, then bind it in the admin UI.`
        } else {
          await api.post('/policies/bindings/', {
            target: app.pk,
            group: group.pk,
            enabled: true,
            order: 0,
            negate: false,
            timeout: 30,
            failure_result: false,
          })
          groupNote = `Restricted to group "${groupName}".`
        }
      }

      const detail = (await api.get(`/providers/oauth2/${provider.pk}/`)) as {
        client_id: string
        client_secret: string
      }

      const resultValues: any[] = [
        {
          name: 'Client ID',
          description: 'OAuth2 client ID',
          type: 'single' as const,
          value: detail.client_id,
          copyable: true,
          qr: false,
          masked: false,
        },
        {
          name: 'OIDC Configuration URL',
          description: 'Discovery document (issuer, endpoints, JWKS)',
          type: 'single' as const,
          value: `${externalUrl}/application/o/${slug}/.well-known/openid-configuration`,
          copyable: true,
          qr: false,
          masked: false,
        },
      ]
      if (input.clientType === 'confidential') {
        resultValues.splice(1, 0, {
          name: 'Client Secret',
          description: 'OAuth2 client secret',
          type: 'single' as const,
          value: detail.client_secret,
          copyable: true,
          qr: false,
          masked: true,
        })
      }

      return {
        version: '1' as const,
        title: 'OIDC Provider Created',
        message: `Provider and application created in Authentik. ${groupNote}

Configure the service with the values below.`,
        result: {
          type: 'group' as const,
          value: resultValues,
        },
      }
    } catch (err) {
      return errorResult('OIDC Provider Setup Failed', err)
    }
  },
)
