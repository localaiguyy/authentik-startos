# Authentik on StartOS

Authentik is a self-hosted identity provider: single sign-on (OIDC and SAML 2.0), multi-factor authentication, LDAP, and centralized user management for all of your services.

## First Login

1. Start the service and wait for the health checks to turn green (first start runs database migrations and can take a few minutes).
2. Run **Actions > Show Admin Credentials** to get the initial `akadmin` password.
3. Open the Web UI and sign in as `akadmin`.
4. Change the admin password in the Authentik UI under **Directory > Users** if desired.

## Base URL (important)

Most SSO integrations require services — and their users' browsers — to reach Authentik at a stable HTTPS address. Run **Actions > Configure Settings** and set the **Base URL** to the public URL where Authentik is reachable (for example, a domain routed through a reverse proxy or tunnel). Endpoint URLs shown by the SSO actions are built from this value.

## Setting Up SSO

The package can provision SSO providers for you — no manual clicking through the admin UI needed:

- **Set Up Cloudflare Access SSO** — makes Authentik the identity provider for a Cloudflare Zero Trust team. Enter your team domain (`<team>.cloudflareaccess.com`) and the action creates the provider and application, then shows the Client ID, Client Secret, and endpoint URLs to paste into Cloudflare's login-method form. Manage users and groups in Authentik; Cloudflare Access policies can match on Authentik group names (enable the Groups claim in Cloudflare's OIDC settings).
- **Add SAML Service Provider** — creates a SAML 2.0 provider and application for any external service. Enter the service's ACS URL and entity ID; the action returns the SSO URL and metadata URL for the service's SAML configuration.
- **Create Group** — creates a user group. Group memberships are included in SSO claims, so downstream policies can match on them.
- **Show SSO Providers** — lists every configured application/provider with its endpoints.

These actions are idempotent: an application that already exists is reported and left untouched, never modified or replaced.

## Inviting Users

Use **Actions > Create User Invitation (Link)** to generate a single-use enrollment link, or **Create User Invitation (Email)** to send it by email (requires SMTP settings in **Configure Settings**). The invited user sets their own password and MFA device.

## LDAP Outpost

For legacy applications that only speak LDAP, enable the LDAP outpost in **Configure Settings**. It listens on port 3389 (LDAP) and 6636 (LDAPS). Configure the LDAP provider and bind accounts in the Authentik admin UI.

## Backups

Backups include the full PostgreSQL database (users, groups, applications, providers, certificates) and media files. Restoring a backup restores your complete identity configuration.
