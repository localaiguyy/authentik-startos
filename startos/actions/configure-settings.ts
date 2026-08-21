import { sdk, InputSpec, Value } from '../sdk'
import { configFile, defaultConfig } from '../fileModels/config.yaml'

const settingsInputSpec = InputSpec.of({
  adminEmail: Value.text({
    name: 'Admin Email',
    description: 'Email address for the akadmin account.',
    default: 'admin@example.com',
    required: true,
  }),

  baseUrl: Value.text({
    name: 'Base URL',
    description:
      'External HTTPS URL for Authentik. Used for OIDC issuer URL and SAML metadata. ' +
      'Set this to the public URL where Authentik is reachable (e.g., via Cloudflare Tunnel).',
    default: '',
    required: true,
  }),

  logLevel: Value.select({
    name: 'Log Level',
    description:
      'Logging verbosity. Use debug only when investigating issues.',
    default: 'info',
    values: {
      debug: 'Debug (Most Verbose)',
      info: 'Info (Recommended)',
      warning: 'Warning',
      error: 'Error Only',
    },
  }),

  enableLdapOutpost: Value.toggle({
    name: 'Enable LDAP Outpost',
    description:
      'Run the built-in LDAP outpost for legacy applications that require LDAP authentication. ' +
      'Listens on ports 3389 (LDAP) and 6636 (LDAPS).',
    default: false,
  }),

  smtpHost: Value.text({
    name: 'SMTP Host',
    description:
      'SMTP server hostname for sending emails (invitations, recovery). Leave blank to disable email.',
    default: '',
    required: false,
    placeholder: 'e.g. smtp.gmail.com',
  }),
  smtpPort: Value.text({
    name: 'SMTP Port',
    description: 'SMTP port (587 for TLS, 465 for SSL, 25 for plain).',
    default: '587',
    required: false,
  }),
  smtpUsername: Value.text({
    name: 'SMTP Username',
    description: 'SMTP authentication username.',
    default: '',
    required: false,
  }),
  smtpPassword: Value.text({
    name: 'SMTP Password',
    description: 'SMTP authentication password or app password.',
    default: '',
    required: false,
    masked: true,
  }),
  smtpUseTls: Value.toggle({
    name: 'SMTP Use TLS',
    description: 'Enable STARTTLS for SMTP connection.',
    default: true,
  }),
  smtpFrom: Value.text({
    name: 'SMTP From Address',
    description: 'Email address shown as the sender.',
    default: '',
    required: false,
    placeholder: 'e.g. noreply@example.com',
  }),
})

export const configureSettings = sdk.Action.withInput(
  'configure-settings',

  async ({ effects }) => ({
    name: 'Configure Settings',
    description:
      'Configure Authentik server settings including base URL, logging, and outposts',
    warning: 'Changes require a service restart to take effect',
    allowedStatuses: 'any',
    group: 'Configuration',
    visibility: 'enabled',
  }),

  settingsInputSpec,

  async ({ effects }) => {
    const config = await configFile.read().const(effects)

    if (config) {
      return {
        adminEmail: config['admin-email'],
        baseUrl: config['base-url'],
        logLevel: config['log-level'] as
          | 'debug'
          | 'info'
          | 'warning'
          | 'error',
        enableLdapOutpost: config['enable-ldap-outpost'],
        smtpHost: config['smtp-host'],
        smtpPort: config['smtp-port'],
        smtpUsername: config['smtp-username'],
        smtpPassword: config['smtp-password'],
        smtpUseTls: config['smtp-use-tls'],
        smtpFrom: config['smtp-from'],
      }
    }

    return {
      adminEmail: defaultConfig['admin-email'],
      baseUrl: defaultConfig['base-url'],
      logLevel: defaultConfig['log-level'],
      enableLdapOutpost: defaultConfig['enable-ldap-outpost'],
      smtpHost: defaultConfig['smtp-host'],
      smtpPort: defaultConfig['smtp-port'],
      smtpUsername: defaultConfig['smtp-username'],
      smtpPassword: defaultConfig['smtp-password'],
      smtpUseTls: defaultConfig['smtp-use-tls'],
      smtpFrom: defaultConfig['smtp-from'],
    }
  },

  async ({ effects, input }) => {
    const existingConfig =
      (await configFile.read().const(effects)) || defaultConfig

    await configFile.write(effects, {
      ...existingConfig,
      'admin-email': input.adminEmail,
      'base-url': input.baseUrl,
      'log-level': input.logLevel,
      'enable-ldap-outpost': input.enableLdapOutpost,
      'smtp-host': input.smtpHost || '',
      'smtp-port': input.smtpPort || '587',
      'smtp-username': input.smtpUsername || '',
      'smtp-password': input.smtpPassword || '',
      'smtp-use-tls': input.smtpUseTls,
      'smtp-from': input.smtpFrom || '',
    })

    const smtpStatus = input.smtpHost
      ? `${input.smtpHost}:${input.smtpPort} (from: ${input.smtpFrom})`
      : 'Not configured'

    return {
      version: '1' as const,
      title: 'Settings Saved',
      message: `Configuration has been saved successfully.

Applied settings:
- Admin Email: ${input.adminEmail}
- Base URL: ${input.baseUrl}
- Log Level: ${input.logLevel}
- LDAP Outpost: ${input.enableLdapOutpost ? 'Enabled' : 'Disabled'}
- SMTP: ${smtpStatus}

Please restart the service to apply these changes.`,
      result: {
        type: 'single' as const,
        value: 'Configuration saved. Restart Authentik to apply changes.',
        copyable: false,
        qr: false,
        masked: false,
      },
    }
  },
)
