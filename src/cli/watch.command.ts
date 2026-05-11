import { scanLocalDir, type ScanResult } from '../scanner/orchestrator.ts';
import { compareUpstream } from '../scanner/upstream.ts';
import { resolveJudge } from '../analyzer/judges/factory.ts';
import { UnknownJudgeError, type LlmJudge } from '../analyzer/judges/types.ts';
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
  noUpstream?: boolean;
}

export async function runWatchCommand(judgeName: string, target: string, opts: WatchOptions, version: string): Promise<number> {
  const judge = await prepareJudge(judgeName);
  if (!judge) return 2;

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
    process.stderr.write(`\n${c.boldCyan('plugin-hunter')} ${c.dim('v' + version + ' — watch (' + judge.name + ')')}  ${c.gray('—')}  ${c.bold(`${queue.length}개 플러그인 재검사`)}\n`);
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

    let result: ScanResult;
    try {
      result = await scanLocalDir(plugin.installPath, plugin.source, judge, {
        onStage: opts.quiet ? undefined : (stage, info) => {
          if (stage === 'judge-error') {
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

    // Upstream drift (preemptive rug-pull) — marketplace dir 이 알려져 있고 사용자가 끄지 않은 경우만.
    // cache 검사가 끝난 후 단계로 분리하여, judge CLI 호출 비용은 drift 가 있을 때만 발생.
    if (
      !opts.noUpstream &&
      plugin.source.kind === 'installed-claude' &&
      plugin.source.marketplaceDir
    ) {
      const upSpinner = new Spinner();
      if (!opts.quiet) upSpinner.start(describeStage('upstream', `marketplace dir 과 비교 중`));
      try {
        const up = await compareUpstream(fileHashes, plugin.source.marketplaceDir, judge, report.pluginType);
        if (up) {
          report.upstream = up;
          if (!opts.quiet) {
            const driftCount = up.drift.added.length + up.drift.modified.length + up.drift.removed.length;
            const hasHigh = up.findings.some(f => f.surface === 'high');
            upSpinner.succeed(describeStage('upstream', hasHigh ? `${driftCount}개 변경 — 위험` : `${driftCount}개 변경 — informational`));
          }
        } else if (!opts.quiet) {
          upSpinner.succeed(describeStage('upstream', 'marketplace dir 과 동일'));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!opts.quiet) upSpinner.warn(describeStage('upstream-error', msg.slice(0, 120)));
      }
    }

    const unsafe = isUnsafe(report);
    const cacheUnsafe = report.highSurfaceSummary.critical > 0 || report.highSurfaceSummary.high > 0;
    const upstreamUnsafe = (report.upstream?.findings ?? []).some(
      f => f.surface === 'high' && (f.severity === 'CRITICAL' || f.severity === 'HIGH'),
    );

    const shouldRenderReport = !opts.quiet && (changedCount > 0 || !prev || unsafe || !!report.upstream);
    if (shouldRenderReport) {
      process.stdout.write('\n' + renderReport(report, version) + '\n');
    }

    if (cacheUnsafe && prev?.status === 'clean') {
      process.stderr.write(`\n  ${badge('RUG-PULL', 'unsafe')} ${c.boldRed('이전엔 안전했으나 지금은 위험합니다:')} ${c.bold(plugin.id)}\n`);
    } else if (!cacheUnsafe && upstreamUnsafe) {
      process.stderr.write(`\n  ${badge('PRE-RUG-PULL', 'unsafe')} ${c.boldRed('marketplace 에 위험 변경 발견 — 다음 /plugin update 차단 권장:')} ${c.bold(plugin.id)}\n`);
    }

    // unsafe 면서 quiet 아니고 opt-out 도 안 한 경우에만 judge CLI(claude/codex/gemini)에게 권장 조치 생성을 위임.
    if (unsafe && !opts.quiet && opts.noRemediation !== true) {
      const remSpinner = new Spinner();
      remSpinner.start(describeStage('remediation', `AI 권장 조치 생성 중 (${judge.name} CLI)`));
      const result = await generateRemediation(report, judge);
      if (result.kind === 'ok') {
        remSpinner.succeed();
        process.stdout.write(renderRemediation(result.text) + '\n');
      } else if (result.kind === 'error') {
        remSpinner.fail(describeStage('remediation-error', result.error));
      } else if (result.reason === 'empty-response') {
        remSpinner.warn(describeStage('remediation-error', `${judge.name} CLI가 빈 응답을 반환했습니다`));
      } else {
        remSpinner.warn(describeStage('remediation-error', '권장 조치 대상 finding 없음'));
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

async function prepareJudge(judgeName: string): Promise<LlmJudge | null> {
  let judge: LlmJudge;
  try {
    judge = resolveJudge(judgeName);
  } catch (err) {
    if (err instanceof UnknownJudgeError) {
      process.stderr.write(`\n${c.red(icon.cross)} ${c.boldRed(err.message)}\n\n`);
      return null;
    }
    throw err;
  }

  if (await judge.isInstalled()) return judge;

  process.stderr.write(`\n${c.red(icon.cross)} ${c.boldRed(`${judge.bin} CLI를 찾을 수 없습니다.`)}\n`);
  process.stderr.write(`  ${c.dim(`${judge.bin}를 설치하고 PATH에 추가한 뒤 다시 실행하세요.`)}\n\n`);
  return null;
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
