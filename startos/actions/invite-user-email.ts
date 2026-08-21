import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'

const emailInviteInputSpec = InputSpec.of({
  username: Value.text({
    name: 'Username',
    description: 'Username for the new account.',
    required: true,
    default: '',
    placeholder: 'e.g. jdoe',
  }),
  email: Value.text({
    name: 'Email',
    description: 'Email address to send the invitation to.',
    required: true,
    default: '',
    placeholder: 'e.g. user@example.com',
  }),
  name: Value.text({
    name: 'Full Name',
    description: "User's display name.",
    required: true,
    default: '',
    placeholder: 'e.g. Jane Doe',
  }),
  apiToken: Value.text({
    name: 'API Token',
    description:
      'Authentik API token (from Admin > Tokens). Required to create users via the API.',
    required: true,
    default: '',
    masked: true,
  }),
})

export const inviteUserEmail = sdk.Action.withInput(
  'invite-user-email',

  async ({ effects }) => ({
    name: 'Create User Invitation (Email)',
    description:
      'Create a new user account and send them an email to set their password. Requires SMTP to be configured.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'User Management',
    visibility: 'enabled',
  }),

  emailInviteInputSpec,

  async () => ({
    username: '',
    email: '',
    name: '',
    apiToken: '',
  }),

  async ({ effects, input }) => {
    const config = await configFile.read().const(effects)
    if (!config) throw new Error('Configuration not loaded')

    if (!config['smtp-host']) {
      return {
        version: '1' as const,
        title: 'SMTP Not Configured',
        message:
          'Email invitations require SMTP. Go to Configure Settings and set up SMTP first, then restart the service.',
        result: {
          type: 'single' as const,
          value: 'SMTP not configured',
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    const baseUrl = config['base-url']
    const headers = {
      Authorization: `Bearer ${input.apiToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'authentik-startos/1.0',
    }

    // Step 1: Create the user
    const userResp = await fetch(`${baseUrl}/api/v3/core/users/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username: input.username,
        name: input.name,
        email: input.email,
        is_active: true,
      }),
    })

    if (!userResp.ok) {
      const errText = await userResp.text()
      return {
        version: '1' as const,
        title: 'User Creation Failed',
        message: `Could not create user (HTTP ${userResp.status}).`,
        result: {
          type: 'single' as const,
          value: errText,
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    const user = (await userResp.json()) as { pk: number }

    // Step 2: Send password reset email (this triggers the recovery flow email)
    const recoveryResp = await fetch(
      `${baseUrl}/api/v3/core/users/${user.pk}/recovery_email/`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      },
    )

    if (!recoveryResp.ok) {
      const errText = await recoveryResp.text()
      return {
        version: '1' as const,
        title: 'User Created, Email Failed',
        message: `User **${input.username}** was created but the email could not be sent (HTTP ${recoveryResp.status}). The user can use the recovery flow at ${baseUrl}/if/flow/default-recovery-flow/ to set their password.

Error: ${errText}`,
        result: {
          type: 'single' as const,
          value: `User created (PK: ${user.pk}), email failed`,
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    return {
      version: '1' as const,
      title: 'User Invited',
      message: `User **${input.username}** (${input.email}) has been created and a password setup email has been sent.

The user will:
1. Receive an email with a link to set their password
2. Be required to set up MFA (TOTP or WebAuthn) on first login to any SSO-protected service`,
      result: {
        type: 'single' as const,
        value: `User ${input.username} created and email sent to ${input.email}`,
        copyable: false,
        qr: false,
        masked: false,
      },
    }
  },
)
