import { scanLocalDir } from '../scanner/orchestrator.ts';
import { detectSurfaceEscalation, type EscalationFinding } from '../scanner/escalation.ts';
import { discoverAllPlugins, findPluginByName, type DiscoveredPlugin } from '../discovery/index.ts';
import { diffHashes, loadRegistry, upsertEntry } from '../state/registry.ts';
import { appendHistory } from '../state/history.ts';
import { renderReport, renderRemediation, isUnsafe } from '../reporter/terminal.ts';
import { generateRemediation } from '../analyzer/remediation.ts';
import type { RegistryEntry } from '../state/types.ts';
import type { Finding } from '../rules/types.ts';
import { Spinner, alignColumns, badge, c, describeStage, hr, icon, statusBadge, termWidth } from './ui.ts';

interface WatchOptions {
  quiet?: boolean;
  noRemediation?: boolean;
}

export async function runWatchCommand(target: string, opts: WatchOptions, version: string): Promise<number> {
  const discovered = discoverAllPlugins();
  const w = termWidth();

  if (discovered.length === 0) {
    process.stderr.write(`\n${c.dim('설치된 플러그인이 없습니다.')}\n\n`);
    return 0;
  }

  let queue: DiscoveredPlugin[];
  if (target === 'all') {
    queue = discovered;
  } else {
    const found = findPluginByName(discovered, target);
    if (!found) {
      process.stderr.write(`\n${c.red(icon.cross)} ${c.boldRed('플러그인을 찾을 수 없습니다:')} ${target}\n`);
      process.stderr.write(`  ${c.dim('설치된 플러그인 보기:')} ${c.cyan('ph ls')}\n\n`);
      return 2;
    }
    queue = [found];
  }

  if (!opts.quiet) {
    process.stderr.write(`\n${c.boldCyan('plugin-hunter')} ${c.dim('v' + version + ' — watch')}  ${c.gray('—')}  ${c.bold(`${queue.length}개 플러그인 재검사`)}\n`);
    process.stderr.write(hr(w) + '\n');
  }

  const reg = loadRegistry();
  let exitCode = 0;
  const summary: { id: string; status: 'clean' | 'unsafe' | 'error'; changed: number }[] = [];

  for (const plugin of queue) {
    const prev = reg.entries[plugin.id];

    if (!opts.quiet) {
      process.stderr.write(`\n${c.boldCyan(icon.arrow + ' ' + plugin.id)}\n`);
      process.stderr.write(`  ${c.dim(plugin.installPath)}\n\n`);
    }

    const spinner = new Spinner();
    let stageActive = false;

    let result;
    try {
      result = await scanLocalDir(plugin.installPath, plugin.source, {
        onStage: opts.quiet ? undefined : (stage, info) => {
          if (stage === 'claude-error') {
            if (stageActive) spinner.fail();
            spinner.warn(describeStage(stage, info));
            stageActive = false;
            return;
          }
          if (stageActive) spinner.succeed();
          spinner.start(describeStage(stage, info));
          stageActive = true;
        },
      });
      if (!opts.quiet && stageActive) spinner.succeed();
    } catch (err) {
      if (!opts.quiet && stageActive) spinner.fail();
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`  ${c.red(icon.cross)} ${c.boldRed('검사 실패')} ${c.dim('(' + plugin.id + ')')} ${c.dim('—')} ${msg}\n`);
      exitCode = Math.max(exitCode, 2);
      summary.push({ id: plugin.id, status: 'error', changed: 0 });
      continue;
    }

    const { report, fileHashes } = result;
    let changedCount = 0;
    let escalations: EscalationFinding[] = [];

    if (prev) {
      const diff = diffHashes(prev.fileHashes, fileHashes);
      changedCount = diff.added.length + diff.removed.length + diff.modified.length;

      // Detection 과 무관한 deterministic rug-pull 신호:
      // 직전엔 없던 high-surface 파일이 새로 등장한 케이스.
      escalations = detectSurfaceEscalation(prev.fileHashes, fileHashes);
      if (escalations.length > 0) {
        const escFindings: Finding[] = escalations.map(e => ({
          severity: 'HIGH',
          ruleId: e.ruleId,
          source: 'meta',
          surface: 'high',
          filePath: e.filePath,
          snippet: e.filePath,
          description: e.description,
        }));
        report.findings.push(...escFindings);
        // highSurfaceSummary / summary 재계산 — 모두 HIGH 이므로 high 카운트만 증가.
        report.highSurfaceSummary = {
          ...report.highSurfaceSummary,
          high: report.highSurfaceSummary.high + escFindings.length,
        };
        report.summary = {
          ...report.summary,
          high: report.summary.high + escFindings.length,
        };
      }

      if (!opts.quiet) {
        if (changedCount === 0) {
          process.stderr.write(`\n  ${c.green(icon.check)} ${c.green('변경 없음')} ${c.dim('— 이전 검사 결과 유효')}\n`);
        } else {
          process.stderr.write(
            `\n  ${c.yellow(icon.warn)} ${c.boldYellow('변경됨:')} ${c.green('+' + diff.added.length)}  ${c.yellow('~' + diff.modified.length)}  ${c.red('-' + diff.removed.length)}\n`,
          );
          for (const p of diff.added) process.stderr.write(`    ${c.green('+')} ${p}\n`);
          for (const p of diff.modified) process.stderr.write(`    ${c.yellow('~')} ${p}\n`);
          for (const p of diff.removed) process.stderr.write(`    ${c.red('-')} ${p}\n`);
        }

        if (escalations.length > 0) {
          process.stderr.write(`\n  ${badge('SURFACE ↑', 'unsafe')} ${c.boldRed('새로운 attack surface 등장:')}\n`);
          for (const e of escalations) {
            process.stderr.write(`    ${c.red('!')} ${c.bold(e.filePath)} ${c.dim('(' + e.ruleId + ')')}\n`);
          }
        }
      }
    }

    const unsafe = isUnsafe(report);

    const shouldRenderReport = !opts.quiet && (changedCount > 0 || !prev || unsafe);
    if (shouldRenderReport) {
      process.stdout.write('\n' + renderReport(report, version) + '\n');
    }

    if (unsafe && prev?.status === 'clean') {
      process.stderr.write(`\n  ${badge('RUG-PULL', 'unsafe')} ${c.boldRed('이전엔 안전했으나 지금은 위험합니다:')} ${c.bold(plugin.id)}\n`);
    }

    // unsafe 면서 quiet 아니고 opt-out 도 안 한 경우에만 LLM 권장 조치 생성.
    if (unsafe && !opts.quiet && opts.noRemediation !== true) {
      const remSpinner = new Spinner();
      remSpinner.start(describeStage('remediation', 'AI 권장 조치 생성 중'));
      const remediation = await generateRemediation(report);
      if (remediation) {
        remSpinner.succeed();
        process.stdout.write(renderRemediation(remediation) + '\n');
      } else {
        remSpinner.warn(describeStage('remediation-error', '생성 실패 — 건너뜀'));
      }
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
    writeSummary(summary, w);
  }

  return exitCode;
}

function writeSummary(rows: { id: string; status: 'clean' | 'unsafe' | 'error'; changed: number }[], w: number): void {
  if (rows.length === 0) return;
  const unsafe = rows.filter(r => r.status === 'unsafe').length;
  const clean = rows.filter(r => r.status === 'clean').length;
  const errors = rows.filter(r => r.status === 'error').length;

  process.stdout.write('\n' + hr(w) + '\n');
  process.stdout.write(`${c.bold('요약')} ${c.dim('— 총 ' + rows.length + '개')}\n\n`);
  process.stdout.write(
    `  ${statusBadge('clean')} ${c.dim('×')} ${c.boldGreen(String(clean))}` +
    `   ${statusBadge('unsafe')} ${c.dim('×')} ${c.boldRed(String(unsafe))}` +
    `   ${statusBadge('error')} ${c.dim('×')} ${c.boldYellow(String(errors))}\n\n`,
  );

  const unsafeRows = rows.filter(x => x.status === 'unsafe');
  if (unsafeRows.length > 0) {
    process.stdout.write(`  ${c.boldRed('위험 플러그인:')}\n`);
    const tableRows = unsafeRows.map(r => [
      statusBadge('unsafe'),
      c.bold(r.id),
      r.changed > 0 ? c.yellow(`(변경 ${r.changed}개)`) : c.dim(''),
    ]);
    for (const line of alignColumns(tableRows, 2)) {
      process.stdout.write(`    ${line}\n`);
    }
    process.stdout.write('\n');
  }
}
