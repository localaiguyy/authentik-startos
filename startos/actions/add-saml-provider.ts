import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import {
  apiClient,
  defaultSigningKeypair,
  errorResult,
  findApplication,
  flowPk,
  resolveApiBase,
  samlPropertyMappingPks,
  slugify,
} from './api'

const AUTHORIZATION_FLOW = 'default-provider-authorization-implicit-consent'
const INVALIDATION_FLOW = 'default-provider-invalidation-flow'

const samlInputSpec = InputSpec.of({
  appName: Value.text({
    name: 'Application Name',
    description:
      'Display name for the application inside Authentik. Also determines the slug used in endpoint URLs.',
    required: true,
    default: '',
    placeholder: 'e.g. My Service',
  }),
  acsUrl: Value.text({
    name: 'ACS URL',
    description:
      'The Assertion Consumer Service URL of the service provider — where Authentik posts the SAML assertion after login.',
    required: true,
    default: '',
    placeholder: 'https://service.example.com/saml/acs',
  }),
  entityId: Value.text({
    name: 'SP Entity ID (Audience)',
    description:
      'The service provider entity ID / audience restriction. Many services use their base URL or their ACS URL. Leave blank to use the ACS URL.',
    required: false,
    default: '',
    placeholder: 'https://service.example.com',
  }),
  binding: Value.select({
    name: 'SP Binding',
    description: 'How the assertion is delivered to the service provider.',
    default: 'post',
    values: {
      post: 'HTTP POST (most common)',
      redirect: 'HTTP Redirect',
    },
  }),
})

export const addSamlProvider = sdk.Action.withInput(
  'add-saml-provider',

  async ({ effects }) => ({
    name: 'Add SAML Service Provider',
    description:
      'Create a SAML 2.0 provider and application for an external service that authenticates against Authentik.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  samlInputSpec,

  async () => ({
    appName: '',
    acsUrl: '',
    entityId: '',
    binding: 'post' as const,
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
      if (!/^https?:\/\//.test(input.acsUrl.trim())) {
        throw new Error('The ACS URL must be an http(s) URL.')
      }
      const acsUrl = input.acsUrl.trim()
      const audience = (input.entityId || '').trim() || acsUrl
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
          message: `An application with the slug "${slug}" already exists in Authentik (provider: ${existing.provider_obj?.name || 'unknown'}). Nothing was changed.

To reconfigure it, edit or delete it in the Authentik admin UI, or re-run this action with a different application name.`,
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
      const samlMappings = await samlPropertyMappingPks(api)

      const provider = (await api.post('/providers/saml/', {
        name: `${input.appName} (SAML)`,
        authorization_flow: authFlow,
        invalidation_flow: invalidationFlow,
        acs_url: acsUrl,
        audience,
        sp_binding: input.binding,
        signing_kp: signingKey.pk,
        // Authentik requires at least one of these when a signing keypair is
        // set (HTTP 400 otherwise).
        sign_assertion: true,
        property_mappings: samlMappings,
      })) as { pk: number }

      await api.post('/core/applications/', {
        name: input.appName,
        slug,
        provider: provider.pk,
      })

      return {
        version: '1' as const,
        title: 'SAML Provider Created',
        message: `Provider and application created in Authentik.

Configure the service provider with the endpoints below. The metadata URL includes the IdP entity ID, SSO endpoints, and the signing certificate.`,
        result: {
          type: 'group' as const,
          value: [
            {
              name: 'SSO URL',
              description: `IdP single sign-on endpoint (${input.binding} binding)`,
              type: 'single' as const,
              value: `${externalUrl}/application/saml/${slug}/sso/binding/${input.binding}/`,
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
                'SAML metadata — requires an authenticated browser session',
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
      return errorResult('SAML Provider Setup Failed', err)
    }
  },
)
