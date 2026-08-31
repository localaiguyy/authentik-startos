import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import { apiClient, errorResult, resolveApiBase } from './api'

const groupInputSpec = InputSpec.of({
  groupName: Value.text({
    name: 'Group Name',
    description:
      'Name of the group to create. Group memberships are included in SSO claims, so edge policies (for example Cloudflare Access group rules) can match on them.',
    required: true,
    default: '',
    placeholder: 'e.g. admins',
  }),
})

export const createGroup = sdk.Action.withInput(
  'create-group',

  async ({ effects }) => ({
    name: 'Create Group',
    description:
      'Create a user group. Assign members in the Authentik admin UI; group names ride along in SSO claims for policy matching.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  groupInputSpec,

  async () => ({
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
      const name = input.groupName.trim()
      if (!name) throw new Error('Group name must not be empty.')

      const api = apiClient(await resolveApiBase(config), token)

      const existing = (await api.get(
        `/core/groups/?name=${encodeURIComponent(name)}&include_users=false`,
      )) as { results: { pk: string; name: string }[] }

      let created = false
      if (!existing.results.some((g) => g.name === name)) {
        await api.post('/core/groups/', { name })
        created = true
      }

      const all = (await api.get(
        `/core/groups/?include_users=false&page_size=100&ordering=name`,
      )) as { results: { name: string; num_pk: number }[] }
      const groupList = all.results.map((g) => g.name).join('\n')

      return {
        version: '1' as const,
        title: created ? 'Group Created' : 'Group Already Exists',
        message: created
          ? `Group "${name}" created. Add members under Directory > Groups in the Authentik admin UI.`
          : `Group "${name}" already exists. Nothing was changed.`,
        result: {
          type: 'single' as const,
          value: groupList || '(no groups)',
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    } catch (err) {
      return errorResult('Group Creation Failed', err)
    }
  },
)
