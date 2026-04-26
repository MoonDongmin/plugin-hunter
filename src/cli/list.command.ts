import { discoverAllPlugins, type DiscoveredPlugin } from '../discovery/index.ts';
import { loadRegistry } from '../state/registry.ts';
import type { RegistryEntry } from '../state/types.ts';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

const GROUP_LABEL: Record<DiscoveredPlugin['group'], string> = {
  'claude': 'Claude Code 플러그인',
  'codex-plugin': 'Codex CLI 플러그인',
  'codex-skill': 'Codex CLI skills',
  'codex-rule': 'Codex CLI rules',
  'codex-memory': 'Codex CLI memories',
};

export function runListCommand(): number {
  const discovered = discoverAllPlugins();
  const registry = loadRegistry();
  const seenIds = new Set<string>();

  process.stdout.write(`${C.bold}${C.cyan}Plugin Hunter — 내 컴퓨터의 플러그인${C.reset}\n`);

  const groups = ['claude', 'codex-plugin', 'codex-skill', 'codex-rule', 'codex-memory'] as const;
  for (const group of groups) {
    const items = discovered.filter(p => p.group === group);
    if (items.length === 0) continue;
    process.stdout.write(`\n${C.bold}${GROUP_LABEL[group]}${C.reset} (${items.length})\n`);
    for (const p of items) {
      seenIds.add(p.id);
      const entry = registry.entries[p.id];
      writeRow(p, entry);
    }
  }

  // discovery에 없지만 registry에 있는 항목 (주로 GitHub URL scan 결과)
  const orphans = Object.values(registry.entries).filter(e => !seenIds.has(e.id));
  if (orphans.length > 0) {
    process.stdout.write(`\n${C.bold}URL 스캔 기록${C.reset} (${orphans.length})\n`);
    for (const e of orphans) {
      writeOrphanRow(e);
    }
  }

  if (discovered.length === 0 && orphans.length === 0) {
    process.stdout.write(`\n${C.dim}설치된 플러그인이 없습니다.${C.reset}\n`);
  }
  return 0;
}

function writeRow(p: DiscoveredPlugin, entry: RegistryEntry | undefined): void {
  const status = entry
    ? entry.status === 'unsafe'
      ? `${C.red}위험${C.reset}`
      : `${C.green}안전${C.reset}`
    : `${C.gray}미검사${C.reset}`;
  process.stdout.write(`  ${status.padEnd(6)} ${C.bold}${p.id}${C.reset} v${p.version}\n`);
  process.stdout.write(`         ${C.dim}${p.installPath}${C.reset}\n`);
  if (entry) {
    process.stdout.write(
      `         ${C.dim}critical=${entry.findingCount.critical} high=${entry.findingCount.high} medium=${entry.findingCount.medium} low=${entry.findingCount.low}  마지막 검사 ${entry.lastScannedAt}${C.reset}\n`,
    );
  }
}

function writeOrphanRow(e: RegistryEntry): void {
  const status = e.status === 'unsafe' ? `${C.red}위험${C.reset}` : `${C.green}안전${C.reset}`;
  process.stdout.write(`  ${status.padEnd(6)} ${C.bold}${e.pluginName}${C.reset} v${e.version} ${C.gray}(${e.id})${C.reset}\n`);
  if (e.source.kind === 'github') {
    process.stdout.write(`         ${C.dim}${e.source.url}${C.reset}\n`);
  }
  process.stdout.write(
    `         ${C.dim}critical=${e.findingCount.critical} high=${e.findingCount.high} medium=${e.findingCount.medium} low=${e.findingCount.low}  마지막 검사 ${e.lastScannedAt}${C.reset}\n`,
  );
}
