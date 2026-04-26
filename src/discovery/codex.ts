import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type CodexBundleKind = 'codex-skill' | 'codex-rule' | 'codex-memory';

export interface CodexBundle {
  id: string;
  name: string;
  kind: CodexBundleKind;
  installPath: string;
  version: string;
}

export interface CodexInstalledPlugin {
  id: string;
  name: string;
  marketplace: string;
  installPath: string;
  version: string;
}

const CODEX_DIR = join(homedir(), '.codex');
const CODEX_PLUGINS_CACHE = join(CODEX_DIR, 'plugins', 'cache');

/**
 * Codex CLI native 컨텍스트 — ~/.codex/{skills,rules,memories}/<name>/
 * 사용자가 직접 작성한 자연어 컨텍스트. LLM에 자동 주입되므로 prompt-injection 검사 대상.
 */
export function discoverCodexBundles(): CodexBundle[] {
  const out: CodexBundle[] = [];
  out.push(...enumerateBundleDir(join(CODEX_DIR, 'skills'), 'codex-skill', 'codex-skills'));
  out.push(...enumerateBundleDir(join(CODEX_DIR, 'rules'), 'codex-rule', 'codex-rules'));
  out.push(...enumerateBundleDir(join(CODEX_DIR, 'memories'), 'codex-memory', 'codex-memories'));
  return out;
}

/**
 * Codex CLI 마켓플레이스 플러그인 — ~/.codex/plugins/cache/<marketplace>/<name>/<version>/
 * Claude Code의 cache 레이아웃과 동일한 패턴. .codex-plugin/plugin.json 매니페스트 보유.
 */
export function discoverCodexPlugins(): CodexInstalledPlugin[] {
  if (!isExistingDir(CODEX_PLUGINS_CACHE)) return [];

  const out: CodexInstalledPlugin[] = [];
  for (const marketplace of safeReaddir(CODEX_PLUGINS_CACHE)) {
    const mktDir = join(CODEX_PLUGINS_CACHE, marketplace);
    if (!isExistingDir(mktDir)) continue;

    for (const pluginName of safeReaddir(mktDir)) {
      const pluginDir = join(mktDir, pluginName);
      if (!isExistingDir(pluginDir)) continue;

      // versions are sub-dirs (e.g., 1.0.0, local, sha)
      const versions = safeReaddir(pluginDir).filter(v => isExistingDir(join(pluginDir, v)));
      for (const version of versions) {
        const installPath = join(pluginDir, version);
        const manifestVersion = readManifestVersion(installPath) ?? version;
        out.push({
          id: `${pluginName}@${marketplace}`,
          name: pluginName,
          marketplace,
          installPath,
          version: manifestVersion,
        });
      }
    }
  }
  return out;
}

function enumerateBundleDir(root: string, kind: CodexBundleKind, idSuffix: string): CodexBundle[] {
  if (!isExistingDir(root)) return [];
  const out: CodexBundle[] = [];
  for (const name of safeReaddir(root)) {
    if (name.startsWith('.')) continue;
    const full = join(root, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    out.push({
      id: `${name}@${idSuffix}`,
      name,
      kind,
      installPath: full,
      version: `local-${st.mtimeMs.toString(36).slice(-8)}`,
    });
  }
  return out;
}

function readManifestVersion(installPath: string): string | null {
  const manifestPath = join(installPath, '.codex-plugin', 'plugin.json');
  if (!existsSync(manifestPath)) return null;
  try {
    const json = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    return typeof json.version === 'string' ? json.version : null;
  } catch {
    return null;
  }
}

function safeReaddir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isExistingDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
