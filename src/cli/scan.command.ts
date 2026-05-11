import { scanRepo, type ScanResult } from '../scanner/orchestrator.ts';
import { resolveJudge } from '../analyzer/judges/factory.ts';
import { UnknownJudgeError, type LlmJudge } from '../analyzer/judges/types.ts';
import { renderReport, renderRemediation, isUnsafe } from '../reporter/terminal.ts';
import { generateRemediation } from '../analyzer/remediation.ts';
import { upsertEntry } from '../state/registry.ts';
import { appendHistory } from '../state/history.ts';
import type { RegistryEntry } from '../state/types.ts';
import { Spinner, c, describeStage, icon } from './ui.ts';

interface ScanCommandOptions {
  noSave?: boolean;
  noRemediation?: boolean;
}

export async function runScanCommand(judgeName: string, url: string, opts: ScanCommandOptions, version: string): Promise<number> {
  const judge = await prepareJudge(judgeName);
  if (!judge) return 2;

  process.stderr.write(`\n${c.boldCyan('plugin-hunter')} ${c.dim('v' + version)}  ${c.gray('—')}  ${c.bold(url)} ${c.dim('(' + judge.name + ')')}\n\n`);

  const spinner = new Spinner();
  let stageActive = false;

  let result: ScanResult;
  try {
    result = await scanRepo(url, judge, {
      onStage: (stage, info) => {
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
    if (stageActive) spinner.succeed();
  } catch (err) {
    if (stageActive) spinner.fail();
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`\n${c.red(icon.cross)} ${c.boldRed('검사 실패')} ${c.dim('—')} ${msg}\n`);
    return 2;
  }

  const { report, fileHashes } = result;
  const unsafe = isUnsafe(report);

  // unsafe 일 때만 LLM 으로 한국어 권장 조치 생성. judge CLI(claude/codex/gemini)가 직접 답변.
  let remediationText: string | null = null;
  if (unsafe && opts.noRemediation !== true) {
    const remSpinner = new Spinner();
    remSpinner.start(describeStage('remediation', `AI 권장 조치 생성 중 (${judge.name} CLI)`));
    const result = await generateRemediation(report, judge);
    if (result.kind === 'ok') {
      remediationText = result.text;
      remSpinner.succeed();
    } else if (result.kind === 'error') {
      remSpinner.fail(describeStage('remediation-error', result.error));
    } else if (result.reason === 'empty-response') {
      remSpinner.warn(describeStage('remediation-error', `${judge.name} CLI가 빈 응답을 반환했습니다`));
    } else {
      remSpinner.warn(describeStage('remediation-error', '권장 조치 대상 finding 없음'));
    }
  }

  process.stdout.write('\n' + renderReport(report, version) + '\n');
  if (remediationText) {
    process.stdout.write(renderRemediation(remediationText) + '\n');
  }

  if (opts.noSave !== true) {
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
    try {
      upsertEntry(entry);
      appendHistory({
        id: report.pluginId,
        pluginName: report.pluginName,
        source: report.source,
        scannedAt: report.scannedAt,
        status: unsafe ? 'unsafe' : 'clean',
        findingCount: report.highSurfaceSummary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${c.yellow(icon.warn)} ${c.dim('레지스트리 업데이트 실패: ' + msg)}\n`);
    }
  }

  return unsafe ? 1 : 0;
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
