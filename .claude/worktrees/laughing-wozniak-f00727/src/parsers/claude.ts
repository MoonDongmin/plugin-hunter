import type { Plugin } from '../ir/types.ts';
import type { ParseResult } from './index.ts';

/**
 * Parses a Claude Code plugin.
 *
 * Layout reference: https://github.com/anthropics/claude-code/tree/main/plugins
 *
 * Expected shape:
 *   <root>/
 *     .claude-plugin/plugin.json        (manifest)
 *     commands/*.md                     (slash commands)
 *     agents/*.md                       (subagents, YAML frontmatter + prompt body)
 *     skills/<name>/SKILL.md            (skills)
 *     hooks/hooks.json                  (PreToolUse / PostToolUse / Stop / ...)
 *     .mcp.json                         (bundled MCP servers)
 */
export async function parseClaude(root: string): Promise<ParseResult> {
  const plugin: Plugin = {
    platform: 'claude',
    manifest: { name: 'unknown' },
    components: [],
    root,
  };
  return { plugin, warnings: ['claude parser: not yet implemented'] };
}
