import { scanLocalDir } from '../scanner/orchestrator.ts';
import { discoverAllPlugins, findPluginByName, type DiscoveredPlugin } from '../discovery/index.ts';
import { diffHashes, loadRegistry, upsertEntry } from '../state/registry.ts';
import { appendHistory } from '../state/history.ts';
import { renderReport, isUnsafe } from '../reporter/terminal.ts';
import type { RegistryEntry } from '../state/types.ts';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
};

interface WatchOptions {
  quiet?: boolean;
}

export async function runWatchCommand(target: string, opts: WatchOptions, version: string): Promise<number> {
  const discovered = discoverAllPlugins();
  if (discovered.length === 0) {
    process.stderr.write(`${C.dim}설치된 플러그인이 없습니다.${C.reset}\n`);
    return 0;
  }

  let queue: DiscoveredPlugin[];
  if (target === 'all') {
    queue = discovered;
  } else {
    const found = findPluginByName(discovered, target);
    if (!found) {
      process.stderr.write(`${C.red}플러그인을 찾을 수 없습니다: ${target}${C.reset}\n`);
      process.stderr.write(`${C.dim}'ph ls' 로 설치된 플러그인을 확인하세요.${C.reset}\n`);
      return 2;
    }
    queue = [found];
  }

  const reg = loadRegistry();
  let exitCode = 0;
  const summary: { id: string; status: 'clean' | 'unsafe' | 'error'; changed: number }[] = [];

  for (const plugin of queue) {
    const prev = reg.entries[plugin.id];
    if (!opts.quiet) {
      process.stdout.write(`\n${C.bold}${C.cyan}▸ ${plugin.id}${C.reset} ${C.dim}(${plugin.installPath})${C.reset}\n`);
    }

    let result;
    try {
      result = await scanLocalDir(plugin.installPath, plugin.source, {
        onStage: opts.quiet ? undefined : (stage, info) => process.stderr.write(`  · ${stage}${info ? ` — ${info}` : ''}\n`),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ✗ 검사 실패 (${plugin.id}): ${msg}\n`);
      exitCode = Math.max(exitCode, 2);
      summary.push({ id: plugin.id, status: 'error', changed: 0 });
      continue;
    }

    const { report, fileHashes } = result;
    const unsafe = isUnsafe(report);
    let changedCount = 0;

    if (prev) {
      const diff = diffHashes(prev.fileHashes, fileHashes);
      changedCount = diff.added.length + diff.removed.length + diff.modified.length;

      if (!opts.quiet) {
        if (changedCount === 0) {
          process.stdout.write(`  ${C.green}변경 없음${C.reset} — 이전 검사 결과 유효.\n`);
        } else {
          process.stdout.write(
            `  ${C.yellow}변경됨:${C.reset} +${diff.added.length} ~${diff.modified.length} -${diff.removed.length}\n`,
          );
          for (const p of diff.added) process.stdout.write(`    ${C.green}+ ${p}${C.reset}\n`);
          for (const p of diff.modified) process.stdout.write(`    ${C.yellow}~ ${p}${C.reset}\n`);
          for (const p of diff.removed) process.stdout.write(`    ${C.red}- ${p}${C.reset}\n`);
        }
      }
    }

    const shouldRenderReport = !opts.quiet && (changedCount > 0 || !prev || unsafe);
    if (shouldRenderReport) {
      process.stdout.write('\n' + renderReport(report, version) + '\n');
    }

    if (unsafe && prev?.status === 'clean') {
      process.stdout.write(`  ${C.red}${C.bold}⚠ rug-pull 감지: ${plugin.id}은(는) 이전엔 안전했으나 지금은 위험합니다${C.reset}\n`);
    }

    const entry: RegistryEntry = {
      id: report.pluginId,
      source: report.source,
      pluginName: report.pluginName,
      pluginType: report.pluginType,
      version: report.pluginVersion,
      fileHashes,
      lastScannedAt: report.scannedAt,
      status: unsafe ? 'unsafe' : 'clean',
      findingCount: report.highSurfaceSummary,
    };
    upsertEntry(entry);
    appendHistory({
      id: report.pluginId,
      pluginName: report.pluginName,
      source: report.source,
      scannedAt: report.scannedAt,
      status: unsafe ? 'unsafe' : 'clean',
      findingCount: report.highSurfaceSummary,
      changedFiles: prev ? changedCount : undefined,
    });

    summary.push({ id: plugin.id, status: unsafe ? 'unsafe' : 'clean', changed: changedCount });
    if (unsafe) exitCode = Math.max(exitCode, 1);
  }

  if (opts.quiet || target === 'all') {
    writeSummary(summary);
  }

  return exitCode;
}

function writeSummary(rows: { id: string; status: 'clean' | 'unsafe' | 'error'; changed: number }[]): void {
  if (rows.length === 0) return;
  const unsafe = rows.filter(r => r.status === 'unsafe').length;
  const clean = rows.filter(r => r.status === 'clean').length;
  const errors = rows.filter(r => r.status === 'error').length;
  process.stdout.write(
    `\n${C.bold}요약:${C.reset} 총 ${rows.length}개 — ` +
      `${C.green}안전 ${clean}${C.reset}, ${C.red}위험 ${unsafe}${C.reset}, ${C.yellow}오류 ${errors}${C.reset}\n`,
  );
  for (const r of rows.filter(x => x.status === 'unsafe')) {
    process.stdout.write(`  ${C.red}위험${C.reset} ${r.id}${r.changed > 0 ? ` (변경 ${r.changed})` : ''}\n`);
  }
}
