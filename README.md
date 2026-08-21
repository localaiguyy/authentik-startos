# Authentik for StartOS

A [StartOS](https://start9.com) 0.4.0 package wrapping
[Authentik](https://goauthentik.io) — an open-source Identity Provider supporting
OpenID Connect (OIDC), SAML 2.0, LDAP, and SCIM.

Run your own SSO and MFA provider on your own hardware, and point your other
self-hosted services at it instead of maintaining a separate login for each one.

## Features

- **OpenID Connect (OIDC)** provider — works with anything speaking standard OIDC
- **SAML 2.0** provider
- **Multi-factor authentication** — TOTP and WebAuthn
- **User and group management**, with invitation flows
- **Application access policies**
- **Optional LDAP outpost** for legacy applications that only speak LDAP
- **Embedded PostgreSQL** — no external database to provision
- **`pg_dump`-based backups** that integrate with StartOS backup targets

## Service Actions

| Action | Purpose |
| --- | --- |
| **Show Admin Credentials** | Display the generated `akadmin` username and password for first login |
| **Configure Settings** | Base URL, admin email, log level, LDAP outpost toggle, SMTP settings |
| **Invite User (Link)** | Generate an invitation link to hand to a new user |
| **Invite User (Email)** | Email an invitation directly (requires SMTP to be configured) |

## Configuration

All configuration lives under **Configure Settings**. Nothing is preset to a
particular network — you supply the values that match your own deployment.

- **Base URL** — the external HTTPS URL where Authentik is reachable. This is
  used as the OIDC issuer and in SAML metadata, so it must match the URL your
  clients actually use. Leave it until you know your final public URL.
- **Admin Email** — the address attached to the `akadmin` account.
- **Log Level** — `info` is recommended; use `debug` only while investigating.
- **Enable LDAP Outpost** — off by default. When enabled, exposes LDAP on 3389
  and LDAPS on 6636. You must also create an LDAP outpost in the Authentik admin
  UI; the wrapper reads its API token from the database at startup.
- **SMTP** — optional. Without it, email invitations and password recovery
  emails are unavailable; link-based invitations still work.

Admin password, database password, and the Authentik secret key are generated
randomly on first start and stored in the service's own config. They are never
baked into the image or this repository.

## Building

Requires `start-cli`, `npm`, and `jq`.

```sh
make              # build the s9pk for all architectures
make x86_64       # build for x86_64 only
make aarch64      # build for aarch64 only
make verify       # inspect the built package
make clean        # remove build artifacts
```

To install to a StartOS server, set your host in `~/.startos/config.yaml`:

```yaml
host: http://your-server.local
```

then:

```sh
make install
```

`make install` picks the most recently built `.s9pk` in the working directory.

## Notes and Caveats

- **PostgreSQL runs inside the container.** Backups use
  `sdk.Backups.withPgDump` rather than rsyncing the raw data directory —
  rsyncing Postgres data to an encrypted FUSE/CIFS backup target triggers a
  read-modify-write loop that can wedge a backup run for hours.
- **`supervisord` is wrapped in `tini -s`.** The StartOS subcontainer's PID 1
  does not reap reparented orphans, so without a subreaper, orphaned children
  accumulate as zombies. This is a workaround for a platform behaviour, not an
  Authentik issue.
- **Changing settings requires a service restart** to take effect.
- **Set the Base URL before configuring OIDC/SAML clients.** Changing it later
  invalidates issuer URLs your clients have already recorded.

## Upstream

- Authentik: <https://github.com/goauthentik/authentik>
- Authentik docs: <https://docs.goauthentik.io>

## License

MIT — see [LICENSE](LICENSE). Authentik itself is licensed separately by its
upstream authors.
