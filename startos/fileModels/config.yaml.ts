import { FileHelper, z } from '@start9labs/start-sdk'
import { Volume } from '@start9labs/start-sdk/package/lib/util'

const configShape = z.object({
  // Admin account
  'admin-email': z.string().catch('admin@example.com'),
  'admin-password': z.string().catch(''),

  // Security
  'secret-key': z.string().catch(''),
  'db-password': z.string().catch(''),

  // Server settings
  'base-url': z.string().catch(''),
  'log-level': z
    .enum(['debug', 'info', 'warning', 'error'])
    .catch('info'),

  // Outposts
  'enable-ldap-outpost': z.boolean().catch(false),

  // SMTP
  'smtp-host': z.string().catch(''),
  'smtp-port': z.string().catch('587'),
  'smtp-username': z.string().catch(''),
  'smtp-password': z.string().catch(''),
  'smtp-use-tls': z.boolean().catch(true),
  'smtp-from': z.string().catch(''),

  // Initialization tracking
  'initialized': z.boolean().catch(false),
})

export const configFile = FileHelper.yaml(
  {
    base: new Volume('main'),
    subpath: '/start9/config.yaml',
  },
  configShape,
)

export type Config = {
  'admin-email': string
  'admin-password': string
  'secret-key': string
  'db-password': string
  'base-url': string
  'log-level': 'debug' | 'info' | 'warning' | 'error'
  'enable-ldap-outpost': boolean
  'smtp-host': string
  'smtp-port': string
  'smtp-username': string
  'smtp-password': string
  'smtp-use-tls': boolean
  'smtp-from': string
  'initialized': boolean
}

export const defaultConfig: Config = {
  'admin-email': 'admin@example.com',
  'admin-password': '',
  'secret-key': '',
  'db-password': '',
  'base-url': '',
  'log-level': 'info',
  'enable-ldap-outpost': false,
  'smtp-host': '',
  'smtp-port': '587',
  'smtp-username': '',
  'smtp-password': '',
  'smtp-use-tls': true,
  'smtp-from': '',
  'initialized': false,
}

export function generateSecureString(length: number = 50): string {
  const chars =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let result = ''
  const randomValues = new Uint8Array(length)
  crypto.getRandomValues(randomValues)
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length]
  }
  return result
}
