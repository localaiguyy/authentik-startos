import { sdk } from '../sdk'
import { configureSettings } from './configure-settings'
import { inviteUserEmail } from './invite-user-email'
import { inviteUserLink } from './invite-user-link'
import { showCredentials } from './show-credentials'
import { setupCloudflareSso } from './setup-cloudflare-sso'
import { addSamlProvider } from './add-saml-provider'
import { createGroup } from './create-group'
import { showSsoProviders } from './show-sso-providers'

export const actions = sdk.Actions.of()
  .addAction(showCredentials)
  .addAction(configureSettings)
  .addAction(inviteUserLink)
  .addAction(inviteUserEmail)
  .addAction(setupCloudflareSso)
  .addAction(addSamlProvider)
  .addAction(createGroup)
  .addAction(showSsoProviders)
