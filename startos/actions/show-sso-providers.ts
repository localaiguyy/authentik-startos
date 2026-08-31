import { sdk } from '../sdk'
import { configFile } from '../fileModels/config.yaml'
import { apiClient, errorResult, resolveApiBase } from './api'

export const showSsoProviders = sdk.Action.withoutInput(
  'show-sso-providers',

  async ({ effects }: { effects: any }) => ({
    name: 'Show SSO Providers',
    description:
      'List the applications and SSO providers currently configured in Authentik, with their endpoints.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'SSO Provisioning',
    visibility: 'enabled',
  }),

  async ({ effects }: { effects: any }) => {
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
      const externalUrl = (config['base-url'] || '').replace(/\/+$/, '')
      const api = apiClient(await resolveApiBase(config), token)

      const apps = (await api.get(
        `/core/applications/?page_size=100&ordering=name`,
      )) as {
        results: {
          name: string
          slug: string
          provider_obj: {
            name: string
            verbose_name: string
          } | null
        }[]
      }

      if (!apps.results.length) {
        return {
          version: '1' as const,
          title: 'No Applications',
          message:
            'No applications are configured in Authentik yet. Use "Set Up Cloudflare Access SSO" or "Add SAML Service Provider" to create one.',
          result: {
            type: 'single' as const,
            value: '(none)',
            copyable: false,
            qr: false,
            masked: false,
          },
        }
      }

      const lines = apps.results.map((a) => {
        const type = a.provider_obj?.verbose_name || 'no provider'
        let endpoints = ''
        if (externalUrl && a.provider_obj) {
          if (/oauth2|openid/i.test(type)) {
            endpoints = `\n    OIDC config: ${externalUrl}/application/o/${a.slug}/.well-known/openid-configuration`
          } else if (/saml/i.test(type)) {
            endpoints = `\n    SAML SSO: ${externalUrl}/application/saml/${a.slug}/sso/binding/post/`
          }
        }
        return `- ${a.name} (${a.slug}) — ${type}${endpoints}`
      })

      return {
        version: '1' as const,
        title: 'SSO Providers',
        message: `${apps.results.length} application(s) configured in Authentik. Manage them in the admin UI under Applications.`,
        result: {
          type: 'single' as const,
          value: lines.join('\n'),
          copyable: true,
          qr: false,
          masked: false,
        },
      }
    } catch (err) {
      return errorResult('Provider Listing Failed', err)
    }
  },
)
