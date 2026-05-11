import { discoverAllPlugins, type DiscoveredPlugin } from '../discovery/index.ts';
import { loadRegistry } from '../state/registry.ts';
import type { RegistryEntry } from '../state/types.ts';
import { alignColumns, badge, c, hr, icon, statusBadge, termWidth, truncate } from './ui.ts';

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
  const w = termWidth();

  // ─── Brand line ───────────────────────────────────────────────────────────
  process.stdout.write(`\n${c.boldCyan('plugin-hunter')} ${c.dim('— 내 컴퓨터의 플러그인')}\n`);
  process.stdout.write(hr(w) + '\n');

  // ─── Top-level summary ────────────────────────────────────────────────────
  const totalUnsafe = Object.values(registry.entries).filter(e => e.status === 'unsafe').length;
  const totalSafe = Object.values(registry.entries).filter(e => e.status === 'clean').length;
  const totalUnscanned = discovered.filter(p => !registry.entries[p.id]).length;
  process.stdout.write(
    `  ${badge(String(discovered.length) + ' 설치됨', 'info')}` +
    `   ${statusBadge('clean')} ${c.boldGreen(String(totalSafe))}` +
    `   ${statusBadge('unsafe')} ${c.boldRed(String(totalUnsafe))}` +
    `   ${statusBadge('unscanned')} ${c.boldGray(String(totalUnscanned))}\n\n`,
  );

  const groups = ['claude', 'codex-plugin', 'codex-skill', 'codex-rule', 'codex-memory'] as const;
  for (const group of groups) {
    const items = discovered.filter(p => p.group === group);
    if (items.length === 0) continue;
    process.stdout.write(`${c.bold(GROUP_LABEL[group])} ${c.dim('(' + items.length + ')')}\n`);

    // 메인 행: status + id + version
    const mainRows = items.map(p => {
      seenIds.add(p.id);
      const entry = registry.entries[p.id];
      return [
        entry ? statusBadge(entry.status) : statusBadge('unscanned'),
        c.bold(p.id),
        c.gray('v' + truncate(p.version, 14)),
      ];
    });
    const aligned = alignColumns(mainRows, 2);
    aligned.forEach((line, i) => {
      const p = items[i];
      const entry = p ? registry.entries[p.id] : undefined;
      process.stdout.write(`  ${line}\n`);
      if (p) process.stdout.write(`    ${c.dim(truncate(p.installPath, w - 6))}\n`);
      if (entry) process.stdout.write(`    ${findingLine(entry)}\n`);
    });
    process.stdout.write('\n');
  }

  // discovery에 없지만 registry에 있는 항목 (주로 GitHub URL scan 결과)
  const orphans = Object.values(registry.entries).filter(e => !seenIds.has(e.id));
  if (orphans.length > 0) {
    process.stdout.write(`${c.bold('URL 스캔 기록')} ${c.dim('(' + orphans.length + ')')}\n`);
    const mainRows = orphans.map(e => [
      statusBadge(e.status),
      c.bold(e.pluginName) + c.dim('  ' + e.id),
      c.gray('v' + truncate(e.version, 14)),
    ]);
    const aligned = alignColumns(mainRows, 2);
    aligned.forEach((line, i) => {
      const e = orphans[i];
      process.stdout.write(`  ${line}\n`);
      if (e?.source.kind === 'github') {
        process.stdout.write(`    ${c.dim(truncate(e.source.url, w - 6))}\n`);
      }
      if (e) process.stdout.write(`    ${findingLine(e)}\n`);
    });
    process.stdout.write('\n');
  }

  if (discovered.length === 0 && orphans.length === 0) {
    process.stdout.write(`  ${c.dim('설치된 플러그인이 없습니다.')}\n`);
    process.stdout.write(`  ${c.dim('GitHub URL을 직접 검사하려면:')} ${c.cyan('ph scan claude <url>')}\n\n`);
    return 0;
  }

  process.stdout.write(hr(w) + '\n');
  process.stdout.write(`  ${c.dim(icon.arrow + ' 모든 플러그인 재검사:')} ${c.cyan('ph watch claude all')}\n`);
  process.stdout.write(`  ${c.dim(icon.arrow + ' 한 개만 재검사:       ')} ${c.cyan('ph watch claude <name>')}\n\n`);
  return 0;
}

function findingLine(entry: RegistryEntry): string {
  const fc = entry.findingCount;
  const counts = [
    fc.critical > 0 ? c.boldRed(`critical ${fc.critical}`) : null,
    fc.high > 0 ? c.boldMagenta(`high ${fc.high}`) : null,
    fc.medium > 0 ? c.boldYellow(`medium ${fc.medium}`) : null,
    fc.low > 0 ? c.boldGray(`low ${fc.low}`) : null,
  ].filter(Boolean).join('  ');
  const findingsPart = counts || c.dim('finding 없음');
  return `${c.gray(icon.bullet)} ${findingsPart}  ${c.dim('· last scan ' + formatTs(entry.lastScannedAt))}`;
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
