import type { ScanSource } from '../state/types.ts';
import { discoverClaudePlugins } from './claude.ts';
import { discoverCodexBundles, discoverCodexPlugins } from './codex.ts';

export type DiscoveryGroup = 'claude' | 'codex-plugin' | 'codex-skill' | 'codex-rule' | 'codex-memory';

export interface DiscoveredPlugin {
  id: string;
  name: string;
  installPath: string;
  version: string;
  source: ScanSource;
  group: DiscoveryGroup;
}

export function discoverAllPlugins(): DiscoveredPlugin[] {
  const out: DiscoveredPlugin[] = [];

  for (const p of discoverClaudePlugins()) {
    out.push({
      id: p.id,
      name: p.name,
      installPath: p.installPath,
      version: p.version,
      source: {
        kind: 'installed-claude',
        marketplace: p.marketplace,
        installPath: p.installPath,
        marketplaceDir: p.marketplaceDir,
        gitRepo: p.marketplaceRepo,
      },
      group: 'claude',
    });
  }

  for (const p of discoverCodexPlugins()) {
    out.push({
      id: p.id,
      name: p.name,
      installPath: p.installPath,
      version: p.version,
      source: {
        kind: 'installed-codex',
        marketplace: p.marketplace,
        installPath: p.installPath,
      },
      group: 'codex-plugin',
    });
  }

  for (const b of discoverCodexBundles()) {
    out.push({
      id: b.id,
      name: b.name,
      installPath: b.installPath,
      version: b.version,
      source: { kind: b.kind, installPath: b.installPath },
      group: b.kind,
    });
  }

  return out;
}

export function findPluginByName(plugins: DiscoveredPlugin[], query: string): DiscoveredPlugin | null {
  const lower = query.toLowerCase();
  const exactId = plugins.find(p => p.id.toLowerCase() === lower);
  if (exactId) return exactId;
  const exactName = plugins.find(p => p.name.toLowerCase() === lower);
  if (exactName) return exactName;
  const partial = plugins.find(p => p.name.toLowerCase().includes(lower) || p.id.toLowerCase().includes(lower));
  return partial ?? null;
}
