import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import { apiClient, errorResult, flowPk, resolveApiBase } from './api'

const AUTHENTICATION_FLOW = 'default-authentication-flow'
const INVALIDATION_FLOW = 'default-invalidation-flow'

const ldapInputSpec = InputSpec.of({
  baseDn: Value.text({
    name: 'Base DN',
    description:
      'LDAP base distinguished name clients will search under (e.g. dc=example,dc=com).',
    required: true,
    default: 'dc=ldap,dc=goauthentik,dc=io',
  }),
})

export const setupLdapOutpost = sdk.Action.withInput(
  'setup-ldap-outpost',

  async ({ effects }) => ({
    name: 'Set Up LDAP Outpost',
    description:
      'Create the LDAP provider, application, and outpost object so the built-in LDAP outpost can serve directory logins. Also enable the LDAP Outpost toggle in Configure Settings and restart the service.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  ldapInputSpec,

  async () => ({
    baseDn: 'dc=ldap,dc=goauthentik,dc=io',
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
      const api = apiClient(await resolveApiBase(config), token)

      // Idempotency: one LDAP outpost per instance — the built-in binary
      // looks the outpost up by type, so a second one would be ambiguous.
      const outposts = (await api.get(
        `/outposts/instances/?page_size=20`,
      )) as { results: { pk: string; name: string; type: string }[] }
      const existingLdap = outposts.results.find((o) => o.type === 'ldap')
      if (existingLdap) {
        return {
          version: '1' as const,
          title: 'Already Configured',
          message: `An LDAP outpost ("${existingLdap.name}") already exists. Nothing was changed.

If LDAP is not answering, make sure the LDAP Outpost toggle is enabled in Configure Settings and restart the service.`,
          result: {
            type: 'single' as const,
            value: existingLdap.name,
            copyable: false,
            qr: false,
            masked: false,
          },
        }
      }

      const authFlow = await flowPk(api, AUTHENTICATION_FLOW)
      const invalidationFlow = await flowPk(api, INVALIDATION_FLOW)

      const provider = (await api.post('/providers/ldap/', {
        name: 'LDAP Provider',
        authorization_flow: authFlow,
        invalidation_flow: invalidationFlow,
        base_dn: input.baseDn.trim(),
        bind_mode: 'direct',
        search_mode: 'direct',
        mfa_support: true,
      })) as { pk: number }

      await api.post('/core/applications/', {
        name: 'LDAP',
        slug: 'ldap',
        provider: provider.pk,
      })

      await api.post('/outposts/instances/', {
        name: 'LDAP Outpost',
        type: 'ldap',
        providers: [provider.pk],
        service_connection: null,
        config: {
          authentik_host: 'http://localhost:9000',
          authentik_host_insecure: true,
        },
      })

      return {
        version: '1' as const,
        title: 'LDAP Outpost Created',
        message: `LDAP provider, application, and outpost created (base DN: ${input.baseDn.trim()}).

Now enable the LDAP Outpost toggle in Configure Settings and restart the service — the built-in LDAP outpost will pick up its token from the database and listen on ports 3389 (LDAP) and 6636 (LDAPS).

Bind users authenticate with their Authentik credentials. To restrict who can bind, add a group binding on the "ldap" application.`,
        result: {
          type: 'single' as const,
          value: input.baseDn.trim(),
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    } catch (err) {
      return errorResult('LDAP Outpost Setup Failed', err)
    }
  },
)
