import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { PluginType } from '../rules/types.ts';

export interface DetectedPlugin {
  pluginType: PluginType;
  pluginName: string;
  version: string;
  manifestPath?: string;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage']);
const MAX_DEPTH = 4;

export function detectPlugin(rootDir: string): DetectedPlugin {
  const found = findManifest(rootDir, 0);
  if (found) return found;
  return {
    pluginType: 'unknown',
    pluginName: basename(rootDir),
    version: '0.0.0',
  };
}

function findManifest(dir: string, depth: number): DetectedPlugin | null {
  if (depth > MAX_DEPTH) return null;
  const codex = join(dir, '.codex-plugin', 'plugin.json');
  if (isFile(codex)) return readManifest(codex, 'codex');

  const claudePlugin = join(dir, '.claude-plugin', 'plugin.json');
  if (isFile(claudePlugin)) return readManifest(claudePlugin, 'claude');

  const flatPlugin = join(dir, 'plugin.json');
  if (isFile(flatPlugin)) return readManifest(flatPlugin, 'claude');

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const sub = join(dir, entry);
    let st;
    try {
      st = statSync(sub);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const r = findManifest(sub, depth + 1);
    if (r) return r;
  }
  return null;
}

function isFile(p: string): boolean {
  if (!existsSync(p)) return false;
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function readManifest(path: string, type: PluginType): DetectedPlugin {
  try {
    const raw = readFileSync(path, 'utf8');
    const json = JSON.parse(raw) as Record<string, unknown>;
    return {
      pluginType: type,
      pluginName: typeof json.name === 'string' ? json.name : 'unnamed',
      version: typeof json.version === 'string' ? json.version : '0.0.0',
      manifestPath: path,
    };
  } catch {
    return { pluginType: type, pluginName: 'unparseable', version: '0.0.0', manifestPath: path };
  }
}
