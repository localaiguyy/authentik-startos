import { sdk } from '../sdk'
import { configureSettings } from './configure-settings'
import { inviteUserEmail } from './invite-user-email'
import { inviteUserLink } from './invite-user-link'
import { showCredentials } from './show-credentials'

export const actions = sdk.Actions.of()
  .addAction(showCredentials)
  .addAction(configureSettings)
  .addAction(inviteUserLink)
  .addAction(inviteUserEmail)
