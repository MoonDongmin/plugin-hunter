import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Platform, Plugin } from '../ir/types.ts';
import { parseClaude } from './claude.ts';
import { parseCodex } from './codex.ts';
import { parseGemini } from './gemini.ts';

export interface ParseResult {
  plugin: Plugin;
  /** Non-fatal parsing issues — surfaced as findings by the scanner. */
  warnings: string[];
}

/**
 * Detect a platform by probing well-known marker files at the plugin root.
 *
 * Detection is intentionally loose: we want to analyze even "almost valid" plugins,
 * since attackers can craft broken manifests to evade strict parsers.
 */
export function detectPlatform(root: string): Platform | undefined {
  if (existsSync(join(root, '.claude-plugin', 'plugin.json'))) return 'claude';
  if (existsSync(join(root, 'plugin.json'))) return 'claude';

  if (existsSync(join(root, 'gemini-extension.json'))) return 'gemini';

  if (existsSync(join(root, 'codex-plugin.toml'))) return 'codex';
  if (existsSync(join(root, 'plugin.toml'))) return 'codex';

  return undefined;
}

export async function parsePlugin(root: string, platform?: Platform): Promise<ParseResult> {
  const resolved = platform ?? detectPlatform(root);
  if (!resolved) {
    throw new Error(
      `Could not detect plugin platform at ${root}. ` +
        'Expected one of: .claude-plugin/plugin.json, gemini-extension.json, codex-plugin.toml.',
    );
  }

  switch (resolved) {
    case 'claude':
      return parseClaude(root);
    case 'codex':
      return parseCodex(root);
    case 'gemini':
      return parseGemini(root);
  }
}
