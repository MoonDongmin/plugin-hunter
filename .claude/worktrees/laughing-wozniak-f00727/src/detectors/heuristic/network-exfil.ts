import type { Finding } from '../../ir/types.ts';
import type { HeuristicContext } from './index.ts';

/**
 * Detects outbound network calls to non-allowlisted hosts.
 *
 * A legitimate hook almost never needs to `curl` an arbitrary domain during
 * install. Combined with secret-access this catches the classic "tar ~/.ssh
 * && curl -T" exfil pattern.
 */
export function detectNetworkExfil(_ctx: HeuristicContext): Finding[] {
  // TODO: match curl/wget/fetch/nc/python -c urllib targets,
  // extract host, compare against allowlist (github.com, npmjs.org, pypi.org,
  // registry.npmjs.org, deno.land, jsr.io, the plugin's declared author
  // domain). Anything else → finding.
  return [];
}
