import type { Plugin } from '../ir/types.ts';
import type { ParseResult } from './index.ts';

/**
 * Parses a Codex CLI plugin.
 *
 * Layout reference: https://developers.openai.com/codex/plugins
 *
 * Expected shape (to be confirmed during implementation):
 *   <root>/
 *     codex-plugin.toml        (manifest — name, version, hooks, agents, mcp)
 *     agents/*.md              (agent/system prompts)
 *     hooks.toml               (lifecycle hooks)
 */
export async function parseCodex(root: string): Promise<ParseResult> {
  const plugin: Plugin = {
    platform: 'codex',
    manifest: { name: 'unknown' },
    components: [],
    root,
  };
  return { plugin, warnings: ['codex parser: not yet implemented'] };
}
