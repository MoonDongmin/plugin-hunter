import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface ClaudeInstalledPlugin {
  id: string;
  name: string;
  marketplace: string;
  installPath: string;
  version: string;
  gitCommitSha?: string;
  marketplaceRepo?: string;
  marketplaceDir?: string;
}

interface InstalledPluginsFile {
  version?: number;
  plugins?: Record<string, InstalledScopeEntry[]>;
}

interface InstalledScopeEntry {
  scope?: string;
  installPath?: string;
  version?: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string;
}

interface KnownMarketplacesFile {
  [marketplace: string]:
    | {
        source?: { source?: string; repo?: string };
        installLocation?: string;
        lastUpdated?: string;
      }
    | undefined;
}

const CLAUDE_PLUGINS_DIR = join(homedir(), '.claude', 'plugins');
const INSTALLED_PATH = join(CLAUDE_PLUGINS_DIR, 'installed_plugins.json');
const KNOWN_MARKETPLACES_PATH = join(CLAUDE_PLUGINS_DIR, 'known_marketplaces.json');

export function discoverClaudePlugins(): ClaudeInstalledPlugin[] {
  if (!existsSync(INSTALLED_PATH)) return [];

  let parsed: InstalledPluginsFile;
  try {
    parsed = JSON.parse(readFileSync(INSTALLED_PATH, 'utf8')) as InstalledPluginsFile;
  } catch {
    return [];
  }
  if (!parsed.plugins || typeof parsed.plugins !== 'object') return [];

  const marketRepos = loadMarketplaceMeta();
  const out: ClaudeInstalledPlugin[] = [];

  for (const [key, scopes] of Object.entries(parsed.plugins)) {
    if (!Array.isArray(scopes)) continue;
    const split = splitKey(key);
    if (!split) continue;
    const { name, marketplace } = split;

    for (const scope of scopes) {
      if (!scope.installPath || typeof scope.installPath !== 'string') continue;
      if (!isExistingDir(scope.installPath)) continue;

      const meta = marketRepos[marketplace];
      out.push({
        id: `${name}@${marketplace}`,
        name,
        marketplace,
        installPath: scope.installPath,
        version: scope.version ?? '0.0.0',
        gitCommitSha: scope.gitCommitSha,
        marketplaceRepo: meta?.repo,
        marketplaceDir: meta?.installLocation && isExistingDir(meta.installLocation) ? meta.installLocation : undefined,
      });
    }
  }

  return out;
}

function splitKey(key: string): { name: string; marketplace: string } | null {
  const idx = key.lastIndexOf('@');
  if (idx <= 0 || idx === key.length - 1) return null;
  return { name: key.slice(0, idx), marketplace: key.slice(idx + 1) };
}

interface MarketplaceMeta {
  repo?: string;
  installLocation?: string;
}

function loadMarketplaceMeta(): Record<string, MarketplaceMeta> {
  if (!existsSync(KNOWN_MARKETPLACES_PATH)) return {};
  try {
    const parsed = JSON.parse(readFileSync(KNOWN_MARKETPLACES_PATH, 'utf8')) as KnownMarketplacesFile;
    const out: Record<string, MarketplaceMeta> = {};
    for (const [name, entry] of Object.entries(parsed)) {
      if (!entry) continue;
      out[name] = {
        repo: typeof entry.source?.repo === 'string' ? entry.source.repo : undefined,
        installLocation: typeof entry.installLocation === 'string' ? entry.installLocation : undefined,
      };
    }
    return out;
  } catch {
    return {};
  }
}

function isExistingDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
