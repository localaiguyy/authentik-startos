import { sdk } from '../sdk'
import { configFile } from '../fileModels/config.yaml'

export const showCredentials = sdk.Action.withoutInput(
  'show-credentials',

  async ({ effects }: { effects: any }) => ({
    name: 'Show Admin Credentials',
    description:
      'Display the admin username and password for initial login.',
    warning: null,
    allowedStatuses: 'any',
    group: 'Credentials',
    visibility: 'enabled',
  }),

  async ({ effects }: { effects: any }) => {
    const config = await configFile.read().const(effects)

    if (!config || !config['admin-password']) {
      return {
        version: '1' as const,
        title: 'Credentials Not Available',
        message:
          'Admin credentials have not been generated yet. Please start the service first.',
        result: {
          type: 'single' as const,
          value: 'Service not initialized',
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    return {
      version: '1' as const,
      title: 'Admin Credentials',
      message: `Use these credentials to log into Authentik.

The default admin account is **akadmin**. You can change the password in the Authentik web UI under Directory > Users.`,
      result: {
        type: 'group' as const,
        value: [
          {
            name: 'Username',
            description: 'Admin username',
            type: 'single' as const,
            value: 'akadmin',
            copyable: true,
            qr: false,
            masked: false,
          },
          {
            name: 'Password',
            description: 'Initial admin password',
            type: 'single' as const,
            value: config['admin-password'],
            copyable: true,
            qr: false,
            masked: true,
          },
          {
            name: 'Email',
            description: 'Admin email address',
            type: 'single' as const,
            value: config['admin-email'],
            copyable: true,
            qr: false,
            masked: false,
          },
        ],
      },
    }
  },
)
