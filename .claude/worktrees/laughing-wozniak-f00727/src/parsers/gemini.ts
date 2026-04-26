import type { Plugin } from '../ir/types.ts';
import type { ParseResult } from './index.ts';

/**
 * Parses a Gemini CLI extension.
 *
 * Layout reference: https://geminicli.com/docs/extensions/reference/
 *
 * Expected shape:
 *   <root>/
 *     gemini-extension.json    (manifest — name, version, contextFileName, mcpServers)
 *     GEMINI.md                (context file, per contextFileName)
 *     commands/*.toml          (custom slash commands)
 */
export async function parseGemini(root: string): Promise<ParseResult> {
  const plugin: Plugin = {
    platform: 'gemini',
    manifest: { name: 'unknown' },
    components: [],
    root,
  };
  return { plugin, warnings: ['gemini parser: not yet implemented'] };
}
