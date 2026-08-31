import { sdk } from '../sdk'
import { configureSettings } from './configure-settings'
import { inviteUserEmail } from './invite-user-email'
import { inviteUserLink } from './invite-user-link'
import { showCredentials } from './show-credentials'
import { setupCloudflareSso } from './setup-cloudflare-sso'
import { addSamlProvider } from './add-saml-provider'
import { addOidcProvider } from './add-oidc-provider'
import { addProxyProvider } from './add-proxy-provider'
import { bindGroup } from './bind-group'
import { createGroup } from './create-group'
import { setupLdapOutpost } from './setup-ldap-outpost'
import { showSsoProviders } from './show-sso-providers'

export const actions = sdk.Actions.of()
  .addAction(showCredentials)
  .addAction(configureSettings)
  .addAction(inviteUserLink)
  .addAction(inviteUserEmail)
  .addAction(setupCloudflareSso)
  .addAction(addOidcProvider)
  .addAction(addSamlProvider)
  .addAction(addProxyProvider)
  .addAction(createGroup)
  .addAction(bindGroup)
  .addAction(setupLdapOutpost)
  .addAction(showSsoProviders)
