type OidcHeader = {
  alg?: string;
  kid?: string;
};

type GitHubClaims = {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  repository?: string;
  workflow_ref?: string;
  job_workflow_ref?: string;
};

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = "https://lumeo.in";
const REPOSITORY = "gokulggovardhan/lumeo";
const ALLOWED_WORKFLOWS = [
  ".github/workflows/cloudflare-production-audit.yml@",
  ".github/workflows/production-conversion-smoke.yml@",
  ".github/workflows/production-health.yml@",
];

let cachedKeys: { expiresAt: number; keys: Jwk[] } | null = null;

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
  } catch {
    return null;
  }
}

function audienceMatches(audience: string | string[] | undefined) {
  return typeof audience === "string"
    ? audience === AUDIENCE
    : Array.isArray(audience) && audience.includes(AUDIENCE);
}

function workflowAllowed(claims: GitHubClaims) {
  const refs = [claims.workflow_ref, claims.job_workflow_ref].filter(
    (value): value is string => Boolean(value),
  );
  return refs.some(
    (value) =>
      value.startsWith(`${REPOSITORY}/`) &&
      ALLOWED_WORKFLOWS.some((workflow) => value.includes(workflow)),
  );
}

async function getGitHubJwks() {
  const now = Date.now();
  if (cachedKeys && cachedKeys.expiresAt > now) return cachedKeys.keys;

  const discoveryResponse = await fetch(
    `${ISSUER}/.well-known/openid-configuration`,
    { cache: "no-store" },
  );
  if (!discoveryResponse.ok) return [];
  const discovery = (await discoveryResponse.json()) as { jwks_uri?: string };
  if (!discovery.jwks_uri?.startsWith("https://")) return [];

  const keysResponse = await fetch(discovery.jwks_uri, { cache: "no-store" });
  if (!keysResponse.ok) return [];
  const payload = (await keysResponse.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  cachedKeys = { keys, expiresAt: now + 10 * 60 * 1000 };
  return keys;
}

export async function verifyGitHubSyntheticToken(token: string | null | undefined) {
  if (!token || token.length > 5000) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const header = decodeJson<OidcHeader>(parts[0]);
  const claims = decodeJson<GitHubClaims>(parts[1]);
  if (!header || !claims || header.alg !== "RS256" || !header.kid) return false;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    claims.iss !== ISSUER ||
    claims.repository !== REPOSITORY ||
    !audienceMatches(claims.aud) ||
    !workflowAllowed(claims) ||
    typeof claims.exp !== "number" ||
    claims.exp < nowSeconds - 30 ||
    (typeof claims.nbf === "number" && claims.nbf > nowSeconds + 30)
  ) {
    return false;
  }

  try {
    const keys = await getGitHubJwks();
    const jwk = keys.find((candidate) => candidate.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(parts[2]),
      data,
    );
  } catch {
    return false;
  }
}
