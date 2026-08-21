import { sdk, InputSpec, Value } from '../sdk'
import { configFile } from '../fileModels/config.yaml'

const ENROLLMENT_FLOW_SLUG = 'invitation-enrollment'

const inviteInputSpec = InputSpec.of({
  username: Value.text({
    name: 'Username',
    description:
      'Username for the new account. This will be fixed — the user cannot change it.',
    required: true,
    default: '',
    placeholder: 'e.g. jdoe',
  }),
  email: Value.text({
    name: 'Email (optional)',
    description:
      'Pre-fill the email address. If blank, the user will enter it during enrollment.',
    required: false,
    default: '',
    placeholder: 'e.g. user@example.com',
  }),
  expiresDays: Value.text({
    name: 'Expires (days)',
    description: 'Number of days before the invitation link expires (1-365).',
    required: true,
    default: '30',
    placeholder: '30',
  }),
  apiToken: Value.text({
    name: 'API Token',
    description:
      'Authentik API token (from Admin > Tokens). Required to create invitations via the API.',
    required: true,
    default: '',
    masked: true,
  }),
})

export const inviteUserLink = sdk.Action.withInput(
  'invite-user-link',

  async ({ effects }) => ({
    name: 'Create User Invitation (Link)',
    description:
      'Generate a single-use enrollment link for a new user. You define the username; they set their password and MFA.',
    warning: null,
    allowedStatuses: 'only-running',
    group: 'User Management',
    visibility: 'enabled',
  }),

  inviteInputSpec,

  async () => ({
    username: '',
    email: '',
    expiresDays: '30',
    apiToken: '',
  }),

  async ({ effects, input }) => {
    const config = await configFile.read().const(effects)
    if (!config) throw new Error('Configuration not loaded')

    const baseUrl = config['base-url']
    const days = parseInt(input.expiresDays, 10) || 30
    const headers = {
      Authorization: `Bearer ${input.apiToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'authentik-startos/1.0',
    }

    // Get the enrollment flow PK
    const flowResp = await fetch(
      `${baseUrl}/api/v3/flows/instances/${ENROLLMENT_FLOW_SLUG}/`,
      { headers },
    )

    if (!flowResp.ok) {
      return {
        version: '1' as const,
        title: 'Error',
        message: `Enrollment flow "${ENROLLMENT_FLOW_SLUG}" not found (HTTP ${flowResp.status}). Please set up the invitation enrollment flow in Authentik first.`,
        result: {
          type: 'single' as const,
          value: await flowResp.text(),
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    const flow = (await flowResp.json()) as { pk: string }

    // Create the invitation
    const expires = new Date()
    expires.setDate(expires.getDate() + days)

    const fixedData: Record<string, string> = {
      username: input.username,
    }
    if (input.email) {
      fixedData.email = input.email
    }

    const invResp = await fetch(
      `${baseUrl}/api/v3/stages/invitation/invitations/`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `invite-${input.username}`,
          expires: expires.toISOString(),
          fixed_data: fixedData,
          single_use: true,
          flow: flow.pk,
        }),
      },
    )

    if (!invResp.ok) {
      return {
        version: '1' as const,
        title: 'Invitation Failed',
        message: `Could not create invitation (HTTP ${invResp.status}).`,
        result: {
          type: 'single' as const,
          value: await invResp.text(),
          copyable: false,
          qr: false,
          masked: false,
        },
      }
    }

    const invitation = (await invResp.json()) as { pk: string }
    const enrollmentUrl = `${baseUrl}/if/flow/${ENROLLMENT_FLOW_SLUG}/?itoken=${invitation.pk}`

    return {
      version: '1' as const,
      title: 'Invitation Created',
      message: `Invitation link for **${input.username}**

Send this link to the user. It is single-use and expires in ${days} days.

The user will set their name, email, and password. MFA (TOTP or WebAuthn) is required on first login to any SSO-protected service.`,
      result: {
        type: 'single' as const,
        value: enrollmentUrl,
        copyable: true,
        qr: true,
        masked: false,
      },
    }
  },
)
