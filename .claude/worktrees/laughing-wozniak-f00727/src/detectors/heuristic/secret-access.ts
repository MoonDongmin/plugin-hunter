import type { Finding } from '../../ir/types.ts';
import type { HeuristicContext } from './index.ts';

/**
 * Detects references to sensitive host paths inside *any* textual component —
 * skills, agents, commands, hooks, context files.
 *
 * Even a mention in a skill prompt is a strong signal: the LLM will happily
 * `cat ~/.ssh/id_rsa` if instructed. Low FP because legitimate plugins rarely
 * need to name these paths.
 */
export function detectSecretAccess(_ctx: HeuristicContext): Finding[] {
  // TODO: scan all textual fields for:
  //   ~/.ssh/, id_rsa, id_ed25519, authorized_keys
  //   ~/.aws/credentials, AWS_SECRET_ACCESS_KEY
  //   ~/.kube/config, ~/.npmrc, ~/.pypirc
  //   .env, .env.local, /etc/passwd, /etc/shadow
  //   keychain, security find-generic-password
  return [];
}
