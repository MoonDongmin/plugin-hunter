import type { Finding } from '../../ir/types.ts';
import type { HeuristicContext } from './index.ts';

/**
 * Detects high-risk shell constructs in hook bodies and command shellouts.
 *
 * Attack class: Hook RCE. This is the single most dangerous vector because it
 * bypasses the LLM entirely — the shell runs on `pre-commit`, `post-install`,
 * etc. No prompt injection required.
 */
export function detectShellRce(_ctx: HeuristicContext): Finding[] {
  // TODO: regex set — curl|wget|fetch piped to sh/bash, `eval`, base64 -d,
  // backticks / $(...) in hook bodies, unpinned network (no sha256, no
  // allowlisted host), setsid / nohup / disown, `rm -rf`.
  return [];
}
