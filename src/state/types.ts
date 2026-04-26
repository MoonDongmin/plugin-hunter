import type { PluginType, SeverityCount } from '../rules/types.ts';

export type ScanSource =
  | { kind: 'github'; url: string }
  | {
      kind: 'installed-claude';
      marketplace: string;
      installPath: string;
      gitRepo?: string;
    }
  | {
      kind: 'installed-codex';
      marketplace: string;
      installPath: string;
    }
  | { kind: 'codex-skill'; installPath: string }
  | { kind: 'codex-rule'; installPath: string }
  | { kind: 'codex-memory'; installPath: string };

export interface RegistryEntry {
  id: string;
  source: ScanSource;
  pluginName: string;
  pluginType: PluginType;
  version: string;
  fileHashes: Record<string, string>;
  lastScannedAt: string;
  status: 'clean' | 'unsafe';
  findingCount: SeverityCount;
}

export interface Registry {
  entries: Record<string, RegistryEntry>;
}

export interface HistoryEntry {
  id: string;
  pluginName: string;
  source: ScanSource;
  scannedAt: string;
  status: 'clean' | 'unsafe';
  findingCount: SeverityCount;
  changedFiles?: number;
}

export function buildPluginId(source: ScanSource, pluginName: string): string {
  switch (source.kind) {
    case 'github': {
      const m = source.url.match(/github\.com[:/]+([^/]+)\/([^/.]+)/);
      if (m?.[1] && m[2]) return `github:${m[1]}/${m[2]}`;
      return `github:${source.url}`;
    }
    case 'installed-claude':
      return `${pluginName}@${source.marketplace}`;
    case 'installed-codex':
      return `${pluginName}@${source.marketplace}`;
    case 'codex-skill':
      return `${pluginName}@codex-skills`;
    case 'codex-rule':
      return `${pluginName}@codex-rules`;
    case 'codex-memory':
      return `${pluginName}@codex-memories`;
  }
}
