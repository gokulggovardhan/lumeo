import "server-only";

import { getSupabaseEnv } from "@/lib/supabase/env";

/**
 * Read only the two specifically approved anonymous RPCs. This is not a
 * caller-selectable SQL/RPC proxy and does not use a privileged API key.
 * Neither endpoint forwards visitor cookies, file content, nor user input.
 */
type PublicReadRpc =
  | "get_public_analytics_setting"
  | "get_public_announcements";

const PUBLIC_RPC_TIMEOUT_MS = 2300;

export async function readPublicRpc(name: PublicReadRpc): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PUBLIC_RPC_TIMEOUT_MS);
  try {
    const { url, publishableKey } = getSupabaseEnv();
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        "content-type": "application/json",
      },
      body: "{}",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
