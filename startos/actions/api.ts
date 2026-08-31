import { httpPort } from '../utils'

// Shared helpers for actions that talk to the Authentik REST API using the
// package-managed provisioning token (see docker_entrypoint.sh, which ensures
// the token exists inside Authentik on every service start).

export type ApiClient = {
  base: string
  get: (path: string) => Promise<any>
  post: (path: string, body: any) => Promise<any>
  put: (path: string, body: any) => Promise<any>
}

// The action runtime is not guaranteed to share a network namespace with the
// service container, so try localhost first and fall back to the configured
// external base URL.
export async function resolveApiBase(config: {
  'base-url': string
}): Promise<string> {
  const candidates = [`http://localhost:${httpPort}`]
  const external = (config['base-url'] || '').replace(/\/+$/, '')
  if (external) candidates.push(external)

  for (const base of candidates) {
    try {
      const resp = await fetch(`${base}/-/health/live/`, {
        signal: AbortSignal.timeout(5000),
      })
      if (resp.ok) return base
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    `Authentik API is unreachable (tried: ${candidates.join(', ')}). ` +
      'Make sure the service is running and the Base URL is set in Configure Settings.',
  )
}

export function apiClient(base: string, token: string): ApiClient {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'authentik-startos',
  }

  const request = async (path: string, init?: RequestInit) => {
    const resp = await fetch(`${base}/api/v3${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30000),
    })
    const text = await resp.text()
    if (!resp.ok) {
      throw new Error(`Authentik API ${init?.method || 'GET'} ${path} failed (HTTP ${resp.status}): ${text}`)
    }
    return text ? JSON.parse(text) : null
  }

  return {
    base,
    get: (path: string) => request(path),
    post: (path: string, body: any) =>
      request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path: string, body: any) =>
      request(path, { method: 'PUT', body: JSON.stringify(body) }),
  }
}

// Look up a flow's pk by slug (e.g. the default provider authorization flow).
export async function flowPk(api: ApiClient, slug: string): Promise<string> {
  const flow = (await api.get(`/flows/instances/${slug}/`)) as { pk: string }
  return flow.pk
}

// The default self-signed certificate keypair that ships with Authentik.
// Used to sign OIDC id_tokens / SAML assertions.
export async function defaultSigningKeypair(api: ApiClient): Promise<{
  pk: string
  name: string
}> {
  const res = (await api.get(
    `/crypto/certificatekeypairs/?ordering=name&page_size=100`,
  )) as { results: { pk: string; name: string }[] }
  if (!res.results.length) {
    throw new Error(
      'No certificate keypair found in Authentik (expected at least the built-in self-signed certificate).',
    )
  }
  const selfSigned = res.results.find((k) =>
    k.name.toLowerCase().includes('self-signed'),
  )
  return selfSigned || res.results[0]
}

// Pks of the managed OAuth2 scope mappings (openid, email, profile). The
// profile scope's claims include the user's group memberships, which is what
// lets an edge proxy (e.g. Cloudflare Access) apply group-based policies.
export async function oauthScopeMappingPks(api: ApiClient): Promise<string[]> {
  const managed = [
    'goauthentik.io/providers/oauth2/scope-openid',
    'goauthentik.io/providers/oauth2/scope-email',
    'goauthentik.io/providers/oauth2/scope-profile',
  ]
  const res = (await api.get(
    `/propertymappings/provider/scope/?page_size=100`,
  )) as { results: { pk: string; managed: string | null }[] }
  const pks = res.results
    .filter((m) => m.managed && managed.includes(m.managed))
    .map((m) => m.pk)
  if (pks.length !== managed.length) {
    throw new Error(
      `Expected the ${managed.length} default OAuth2 scope mappings, found ${pks.length}. ` +
        'The default property mappings may have been deleted from Authentik.',
    )
  }
  return pks
}

// Pks of the managed default SAML property mappings (uid, username, email,
// name, groups).
export async function samlPropertyMappingPks(
  api: ApiClient,
): Promise<string[]> {
  const res = (await api.get(
    `/propertymappings/provider/saml/?page_size=100`,
  )) as { results: { pk: string; managed: string | null }[] }
  const pks = res.results
    .filter((m) => m.managed?.startsWith('goauthentik.io/providers/saml/'))
    .map((m) => m.pk)
  if (!pks.length) {
    throw new Error(
      'No default SAML property mappings found. They may have been deleted from Authentik.',
    )
  }
  return pks
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Look up an application by slug; returns null when it does not exist.
export async function findApplication(
  api: ApiClient,
  slug: string,
): Promise<any | null> {
  const res = (await api.get(
    `/core/applications/?slug=${encodeURIComponent(slug)}`,
  )) as { results: any[] }
  return res.results.find((a) => a.slug === slug) || null
}

// Standard error result for actions when something in the API path fails.
export function errorResult(title: string, err: unknown) {
  return {
    version: '1' as const,
    title,
    message: err instanceof Error ? err.message : String(err),
    result: {
      type: 'single' as const,
      value: err instanceof Error ? err.message : String(err),
      copyable: true,
      qr: false,
      masked: false,
    },
  }
}
