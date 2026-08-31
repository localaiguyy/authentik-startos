import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import {
  apiClient,
  errorResult,
  findApplication,
  flowPk,
  resolveApiBase,
  slugify,
} from './api'

const AUTHORIZATION_FLOW = 'default-provider-authorization-implicit-consent'
const INVALIDATION_FLOW = 'default-provider-invalidation-flow'
const EMBEDDED_OUTPOST_MANAGED = 'goauthentik.io/outposts/embedded'

const proxyInputSpec = InputSpec.of({
  appName: Value.text({
    name: 'Application Name',
    description:
      'Display name for the application inside Authentik. Also determines the slug.',
    required: true,
    default: '',
    placeholder: 'e.g. My Dashboard',
  }),
  externalHost: Value.text({
    name: 'External URL',
    description:
      'The public URL users visit. Requests arriving at the outpost with this hostname are authenticated and proxied.',
    required: true,
    default: '',
    placeholder: 'https://app.example.com',
  }),
  internalHost: Value.text({
    name: 'Internal Upstream URL',
    description:
      'Where the outpost forwards authenticated traffic — the real service, reachable from this Authentik instance.',
    required: true,
    default: '',
    placeholder: 'http://192.168.1.50:8080',
  }),
  groupName: Value.text({
    name: 'Restrict to Group (optional)',
    description:
      'If set, only members of this Authentik group get through. Leave blank to allow any authenticated user.',
    required: false,
    default: '',
    placeholder: 'e.g. admins',
  }),
})

export const addProxyProvider = sdk.Action.withInput(
  'add-proxy-provider',

  async ({ effects }) => ({
    name: 'Add Proxy Provider (Auth Gate)',
    description:
      'Put Authentik in front of a service that has no SSO support of its own: the embedded outpost authenticates users, enforces group membership, and reverse-proxies to the upstream. Point your ingress (reverse proxy or tunnel) for the external hostname at this Authentik instance.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  proxyInputSpec,

  async () => ({
    appName: '',
    externalHost: '',
    internalHost: '',
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
      const externalHost = input.externalHost.trim().replace(/\/+$/, '')
      const internalHost = input.internalHost.trim().replace(/\/+$/, '')
      if (!/^https?:\/\//.test(externalHost) || !/^https?:\/\//.test(internalHost)) {
        throw new Error('External and internal URLs must be http(s) URLs.')
      }

      const slug = slugify(input.appName)
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

      const provider = (await api.post('/providers/proxy/', {
        name: `${input.appName} Proxy`,
        mode: 'proxy',
        external_host: externalHost,
        internal_host: internalHost,
        internal_host_ssl_validation: false,
        authorization_flow: authFlow,
        invalidation_flow: invalidationFlow,
        access_token_validity: 'hours=24',
      })) as { pk: number }

      const app = (await api.post('/core/applications/', {
        name: input.appName,
        slug,
        provider: provider.pk,
      })) as { pk: string }

      let groupNote = 'Any authenticated user gets through.'
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

      // Attach to the embedded outpost so the gate is live immediately.
      const outposts = (await api.get(`/outposts/instances/?page_size=20`)) as {
        results: {
          pk: string
          name: string
          type: string
          managed: string | null
          providers: number[]
          config: any
          service_connection: string | null
        }[]
      }
      const embedded = outposts.results.find(
        (o) => o.managed === EMBEDDED_OUTPOST_MANAGED,
      )
      let outpostNote: string
      if (embedded) {
        await api.put(`/outposts/instances/${embedded.pk}/`, {
          name: embedded.name,
          type: embedded.type,
          providers: Array.from(new Set([...embedded.providers, provider.pk])),
          config: embedded.config,
          managed: embedded.managed,
          service_connection: embedded.service_connection,
        })
        outpostNote =
          'Attached to the embedded outpost. RESTART THE SERVICE to activate the gate — the embedded outpost only picks up new proxy hosts at startup.'
      } else {
        outpostNote =
          'WARNING: no embedded outpost found. Assign the provider to an outpost in the Authentik admin UI.'
      }

      return {
        version: '1' as const,
        title: 'Proxy Provider Created',
        message: `Provider and application created in Authentik. ${groupNote} ${outpostNote}

Final step (outside Authentik): point your ingress for ${externalHost.replace(/^https?:\/\//, '')} at this Authentik instance's web port, preserving the Host header. Unauthenticated visitors will be redirected to the Authentik login; authenticated, authorized users are proxied to the upstream.`,
        result: {
          type: 'single' as const,
          value: `${externalHost} -> authentik (auth) -> ${internalHost}`,
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    } catch (err) {
      return errorResult('Proxy Provider Setup Failed', err)
    }
  },
)
