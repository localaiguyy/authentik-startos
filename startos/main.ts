import { sdk } from './sdk'
import { httpPort } from './utils'
import {
  configFile,
  defaultConfig,
  generateSecureString,
} from './fileModels/config.yaml'

export const main = sdk.setupMain(async ({ effects }) => {
  console.info('Starting Authentik Identity Provider!')

  let config = (await configFile.read().const(effects)) || { ...defaultConfig }

  // Generate secrets on first run
  let configUpdated = false

  if (!config['secret-key']) {
    console.info('Generating Authentik SECRET_KEY...')
    config['secret-key'] = generateSecureString(50)
    configUpdated = true
  }

  if (!config['db-password']) {
    console.info('Generating PostgreSQL password...')
    config['db-password'] = generateSecureString(32)
    configUpdated = true
  }

  if (!config['admin-password']) {
    console.info('Generating initial admin password...')
    config['admin-password'] = generateSecureString(16)
    configUpdated = true
  }

  if (configUpdated) {
    await configFile.write(effects, config)
    console.info('Secure credentials generated and saved')
  }

  console.info('Configuration loaded:', {
    adminEmail: config['admin-email'],
    baseUrl: config['base-url'],
    logLevel: config['log-level'],
    enableLdapOutpost: config['enable-ldap-outpost'],
    initialized: config['initialized'],
  })

  const subcontainer = await sdk.SubContainer.of(
    effects,
    { imageId: 'authentik' },
    sdk.Mounts.of().mountVolume({
      volumeId: 'main',
      subpath: null,
      mountpoint: '/root/data',
      readonly: false,
    }),
    'authentik-server',
  )

  const shellEscape = (s: string | number | boolean) => {
    return `'${String(s).replace(/'/g, "'\\''")}'`
  }

  const envVarsList = [
    // Admin settings
    `S9_AUTHENTIK_ADMIN_EMAIL=${shellEscape(config['admin-email'])}`,
    `S9_AUTHENTIK_ADMIN_PASSWORD=${shellEscape(config['admin-password'])}`,

    // Security
    `S9_AUTHENTIK_SECRET_KEY=${shellEscape(config['secret-key'])}`,
    `S9_AUTHENTIK_DB_PASSWORD=${shellEscape(config['db-password'])}`,

    // Server settings
    `S9_AUTHENTIK_BASE_URL=${shellEscape(config['base-url'])}`,
    `S9_AUTHENTIK_LOG_LEVEL=${shellEscape(config['log-level'])}`,

    // Outposts
    `S9_AUTHENTIK_ENABLE_LDAP=${shellEscape(config['enable-ldap-outpost'])}`,

    // SMTP
    `S9_AUTHENTIK_SMTP_HOST=${shellEscape(config['smtp-host'])}`,
    `S9_AUTHENTIK_SMTP_PORT=${shellEscape(config['smtp-port'])}`,
    `S9_AUTHENTIK_SMTP_USERNAME=${shellEscape(config['smtp-username'])}`,
    `S9_AUTHENTIK_SMTP_PASSWORD=${shellEscape(config['smtp-password'])}`,
    `S9_AUTHENTIK_SMTP_USE_TLS=${shellEscape(config['smtp-use-tls'])}`,
    `S9_AUTHENTIK_SMTP_FROM=${shellEscape(config['smtp-from'])}`,

    // Initialization state
    `S9_AUTHENTIK_INITIALIZED=${shellEscape(config['initialized'])}`,
  ]

  const envVars = envVarsList.join(' ')

  return sdk.Daemons.of(effects)
    .addDaemon('primary', {
      subcontainer,
      exec: {
        command: ['/bin/sh', '-c', `${envVars} /app/docker_entrypoint.sh`],
      },
      ready: {
        display: 'Authentik Server',
        fn: () =>
          sdk.healthCheck.checkPortListening(effects, httpPort, {
            successMessage: 'Authentik server is accepting connections',
            errorMessage: 'Authentik server is not responding on HTTP port',
          }),
      },
      requires: [],
    })
    .addHealthCheck('api-health', {
      ready: {
        display: 'API',
        fn: () =>
          sdk.healthCheck.runHealthScript(
            [
              'sh',
              '-c',
              `curl -sf http://localhost:${httpPort}/-/health/live/ || exit 1`,
            ],
            subcontainer,
            {
              timeout: 30000,
              errorMessage:
                'Authentik health endpoint not responding. The server may be starting up or running migrations.',
            },
          ),
      },
      requires: [],
    })
    .addHealthCheck('database', {
      ready: {
        display: 'Database',
        fn: () =>
          sdk.healthCheck.runHealthScript(
            ['sh', '-c', 'pg_isready -U authentik -d authentik || exit 1'],
            subcontainer,
            {
              timeout: 10000,
              errorMessage: 'PostgreSQL database is not ready',
            },
          ),
      },
      requires: [],
    })
})
