/**
 * Classifies global browser errors that are transport teardown signals rather
 * than actionable application failures.
 *
 * React production error #412 decodes to "Connection closed." It can be emitted
 * when an RSC/Flight stream is intentionally interrupted by reload/navigation
 * or by a transient network disconnect. Lumeo already prevents stale/cross-
 * variant RSC reuse at the Cloudflare response layer (private/no-store + Vary),
 * so this signature should not create an application-error incident.
 *
 * Keep this matcher intentionally exact. Other React errors, dynamic-import
 * failures, and ordinary network/application exceptions must continue to be
 * reported.
 */
const REACT_CONNECTION_CLOSED =
  /^Minified React error #412; visit https:\/\/react\.dev\/errors\/412\b/;

export function isNonActionableGlobalClientError(message: string): boolean {
  return REACT_CONNECTION_CLOSED.test(message.trim());
}
