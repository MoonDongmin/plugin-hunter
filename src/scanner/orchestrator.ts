import { createHash } from 'node:crypto';
import { shallowClone } from './cloner.ts';
import { detectPlugin } from './detector.ts';
import { collectTargets } from './collector.ts';
import { analyzeWithJudge } from '../analyzer/judge.ts';
import { removeDir } from '../util/tmp.ts';
import { parseGitHubUrl } from '../util/github.ts';
import { buildPluginId, type ScanSource } from '../state/types.ts';
import { JudgePolicyBlockError, type LlmJudge } from '../analyzer/judges/types.ts';
import type { Finding, ScanReport, SeverityCount } from '../rules/types.ts';

export interface ScanOptions {
  onStage?: (stage: string, info?: string) => void;
}

export interface ScanResult {
  report: ScanReport;
  fileHashes: Record<string, string>;
}

/**
 * 로컬 디렉토리를 직접 스캔하는 코어. clone/cleanup 책임 없음.
 * GitHub URL flow와 installed-plugin flow의 공통 분석 경로.
 */
export async function scanLocalDir(
  localPath: string,
  source: ScanSource,
  judge: LlmJudge,
  options: ScanOptions = {},
): Promise<ScanResult> {
  const onStage = options.onStage ?? (() => undefined);

  const detected = detectPlugin(localPath);
  onStage('detect', `${detected.pluginType} / ${detected.pluginName}@${detected.version}`);

  const { targets, preFindings } = collectTargets(localPath);
  onStage('collect', `${targets.length} files`);

  const errorFindings: Finding[] = [];
  let judgeFindings: Finding[] = [];
  onStage('judge', `${judge.name} CLI 분석 중`);
  try {
    judgeFindings = await analyzeWithJudge(judge, targets, detected.pluginType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onStage('judge-error', msg);

    if (err instanceof JudgePolicyBlockError) {
      // LLM 제공자 측 정책 필터가 분석 자체를 거부했다는 사실은
      // "이 콘텐츠가 사이버보안 위협 패턴을 포함한다" 는 강한 시그널이다.
      // 단순 실패가 아니라 CRITICAL finding 으로 격상하여 UNSAFE 판정에 반영한다.
      errorFindings.push({
        severity: 'CRITICAL',
        ruleId: 'PH-PROVIDER-POLICY-BLOCK',
        source: 'meta',
        surface: 'high',
        filePath: '(scanner)',
        snippet: err.providerRawMessage.slice(0, 200),
        description:
          `${judge.name} CLI 의 제공자 정책 필터가 이 플러그인의 분석을 거부했습니다. ` +
          '이는 입력 콘텐츠가 위험 패턴(자격 증명 탈취, 외부 송신, RCE 등)을 포함할 가능성이 매우 높다는 ' +
          '신호로 해석될 수 있습니다. 설치를 중단하세요. 단, 정상 콘텐츠도 false positive 로 차단될 수 ' +
          '있으므로 "ph scan claude" 또는 "ph scan gemini" 로 cross-verify 를 권장합니다.',
      });
    } else {
      errorFindings.push({
        severity: 'HIGH',
        ruleId: 'PH-JUDGE-ERR',
        source: 'meta',
        surface: 'high',
        filePath: '(scanner)',
        snippet: msg.slice(0, 200),
        description: `${judge.name} judge 분석이 실패하여 결과를 신뢰할 수 없습니다. 안전 판정을 보류합니다. CLI 설치와 인증 상태를 확인 후 재시도하세요.`,
      });
    }
  }

  const findings = sortFindings([...preFindings, ...judgeFindings, ...errorFindings]);
  const summary = countSeverity(findings);
  const highSurfaceSummary = countSeverity(findings.filter(f => f.surface === 'high'));
  const fileHashes = buildHashes(targets);
  const highSurfaceFiles = targets.filter(t => t.surface === 'high').length;
  const pluginId = buildPluginId(source, detected.pluginName);

  const report: ScanReport = {
    pluginId,
    pluginName: detected.pluginName,
    pluginVersion: detected.version,
    pluginType: detected.pluginType,
    source,
    scannedAt: new Date().toISOString(),
    findings,
    summary,
    highSurfaceSummary,
    filesScanned: targets.length,
    highSurfaceFiles,
  };

  return { report, fileHashes };
}

/**
 * GitHub URL을 받아 shallow clone 후 scanLocalDir 위임.
 * 임시 디렉토리는 항상 cleanup.
 */
export async function scanRepo(repoUrl: string, judge: LlmJudge, options: ScanOptions = {}): Promise<ScanResult> {
  const onStage = options.onStage ?? (() => undefined);
  const repo = parseGitHubUrl(repoUrl);

  onStage('clone', repo.cloneUrl);
  const cloned = await shallowClone(repo);

  try {
    return await scanLocalDir(cloned.localPath, { kind: 'github', url: repo.cloneUrl }, judge, options);
  } finally {
    await removeDir(cloned.localPath);
  }
}

function sortFindings(findings: Finding[]): Finding[] {
  const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as const;
  return [...findings].sort((a, b) => {
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    if (a.filePath !== b.filePath) return a.filePath.localeCompare(b.filePath);
    return (a.lineNumber ?? 0) - (b.lineNumber ?? 0);
  });
}

function countSeverity(findings: Finding[]): SeverityCount {
  const out: SeverityCount = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') out.critical++;
    else if (f.severity === 'HIGH') out.high++;
    else if (f.severity === 'MEDIUM') out.medium++;
    else out.low++;
  }
  return out;
}

function buildHashes(targets: { filePath: string; rawContent: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of targets) {
    out[t.filePath] = createHash('sha256').update(t.rawContent).digest('hex');
  }
  return out;
}

export { buildHashes };
