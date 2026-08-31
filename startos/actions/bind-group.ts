import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import { apiClient, errorResult, findApplication, resolveApiBase } from './api'

const bindInputSpec = InputSpec.of({
  appSlug: Value.text({
    name: 'Application Slug',
    description:
      'Slug of the Authentik application to restrict (see Show SSO Providers for the list).',
    required: true,
    default: '',
    placeholder: 'e.g. my-service',
  }),
  groupName: Value.text({
    name: 'Group Name',
    description: 'Only members of this group will pass authorization.',
    required: true,
    default: '',
    placeholder: 'e.g. admins',
  }),
})

export const bindGroup = sdk.Action.withInput(
  'bind-group',

  async ({ effects }) => ({
    name: 'Restrict Application to Group',
    description:
      'Add a group policy binding to an application, so only members of that group can use it. Without any binding, every authenticated user passes.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  bindInputSpec,

  async () => ({
    appSlug: '',
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
      const api = apiClient(await resolveApiBase(config), token)

      const app = await findApplication(api, input.appSlug.trim())
      if (!app) {
        throw new Error(
          `No application with slug "${input.appSlug.trim()}" found. Run Show SSO Providers to list applications.`,
        )
      }

      const groupName = input.groupName.trim()
      const groups = (await api.get(
        `/core/groups/?name=${encodeURIComponent(groupName)}&include_users=false`,
      )) as { results: { pk: string; name: string }[] }
      const group = groups.results.find((g) => g.name === groupName)
      if (!group) {
        throw new Error(
          `Group "${groupName}" does not exist. Create it with the Create Group action first.`,
        )
      }

      // Idempotency: report an existing binding instead of duplicating it.
      const bindings = (await api.get(
        `/policies/bindings/?target=${app.pk}&page_size=100`,
      )) as { results: { pk: string; group: string | null }[] }
      if (bindings.results.some((b) => b.group === group.pk)) {
        return {
          version: '1' as const,
          title: 'Already Bound',
          message: `Application "${app.name}" is already restricted to group "${groupName}". Nothing was changed.`,
          result: {
            type: 'single' as const,
            value: `${app.slug} <- ${groupName}`,
            copyable: false,
            qr: false,
            masked: false,
          },
        }
      }

      await api.post('/policies/bindings/', {
        target: app.pk,
        group: group.pk,
        enabled: true,
        order: bindings.results.length,
        negate: false,
        timeout: 30,
        failure_result: false,
      })

      return {
        version: '1' as const,
        title: 'Group Binding Added',
        message: `Application "${app.name}" is now restricted to members of "${groupName}".

Note: if the application had other group bindings, a user passing ANY of them is allowed (default policy engine mode).`,
        result: {
          type: 'single' as const,
          value: `${app.slug} <- ${groupName}`,
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    } catch (err) {
      return errorResult('Group Binding Failed', err)
    }
  },
)
