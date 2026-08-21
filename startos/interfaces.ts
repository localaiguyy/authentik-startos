import { sdk } from './sdk'
import { httpPort, ldapPort, ldapsPort } from './utils'
import { configFile } from './fileModels/config.yaml'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const config = await configFile.read().const(effects)

  const httpMulti = sdk.MultiHost.of(effects, 'http-multi')
  const httpOrigin = await httpMulti.bindPort(httpPort, {
    protocol: 'http',
  })

  const webUi = sdk.createInterface(effects, {
    name: 'Web UI',
    id: 'web-ui',
    description:
      'Identity provider admin interface and SSO login portal',
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  const api = sdk.createInterface(effects, {
    name: 'REST API',
    id: 'api',
    description:
      'Authentik REST API for automation and integration',
    type: 'api',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '/api/v3/',
    query: {},
  })

  const webUiReceipt = await httpOrigin.export([webUi])
  const apiReceipt = await httpOrigin.export([api])

  const receipts = [webUiReceipt, apiReceipt]

  if (config && config['enable-ldap-outpost']) {
    const ldapMulti = sdk.MultiHost.of(effects, 'ldap-multi')
    const ldapOrigin = await ldapMulti.bindPort(ldapPort, {
      protocol: null,
      preferredExternalPort: 3389,
      addSsl: null,
      secure: { ssl: false },
    })

    const ldap = sdk.createInterface(effects, {
      name: 'LDAP',
      id: 'ldap',
      description: 'LDAP directory service for authentication (port 3389)',
      type: 'api',
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      query: {},
    })

    const ldapReceipt = await ldapOrigin.export([ldap])
    receipts.push(ldapReceipt)

    const ldapsMulti = sdk.MultiHost.of(effects, 'ldaps-multi')
    const ldapsOrigin = await ldapsMulti.bindPort(ldapsPort, {
      protocol: null,
      preferredExternalPort: 6636,
      addSsl: null,
      secure: { ssl: true },
    })

    const ldaps = sdk.createInterface(effects, {
      name: 'LDAPS',
      id: 'ldaps',
      description: 'LDAP over TLS directory service (port 6636)',
      type: 'api',
      masked: false,
      schemeOverride: null,
      username: null,
      path: '',
      query: {},
    })

    const ldapsReceipt = await ldapsOrigin.export([ldaps])
    receipts.push(ldapsReceipt)
  }

  return receipts
})
