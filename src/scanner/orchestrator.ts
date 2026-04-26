import { createHash } from 'node:crypto';
import { shallowClone } from './cloner.ts';
import { detectPlugin } from './detector.ts';
import { collectTargets } from './collector.ts';
import { analyzeWithClaude } from '../analyzer/claude.ts';
import { removeDir } from '../util/tmp.ts';
import { parseGitHubUrl } from '../util/github.ts';
import { buildPluginId, type ScanSource } from '../state/types.ts';
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
  options: ScanOptions = {},
): Promise<ScanResult> {
  const onStage = options.onStage ?? (() => undefined);

  const detected = detectPlugin(localPath);
  onStage('detect', `${detected.pluginType} / ${detected.pluginName}@${detected.version}`);

  const { targets, preFindings } = collectTargets(localPath);
  onStage('collect', `${targets.length} files`);

  const errorFindings: Finding[] = [];
  let claudeFindings: Finding[] = [];
  onStage('claude', 'claude-sonnet-4-6 분석 중');
  try {
    claudeFindings = await analyzeWithClaude(targets, detected.pluginType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onStage('claude-error', msg);
    // Fail-CLOSED: 분석이 실패하면 'clean' 판정을 내릴 근거가 없으므로
    // HIGH/surface=high 로 승격해 isUnsafe()가 true가 되게 한다.
    errorFindings.push({
      severity: 'HIGH',
      ruleId: 'PH-CLAUDE-ERR',
      source: 'meta',
      surface: 'high',
      filePath: '(scanner)',
      snippet: msg.slice(0, 200),
      description: 'Claude 분석이 실패하여 결과를 신뢰할 수 없습니다. 안전 판정을 보류합니다. ANTHROPIC_API_KEY 또는 네트워크를 확인 후 재시도하세요.',
    });
  }

  const findings = sortFindings([...preFindings, ...claudeFindings, ...errorFindings]);
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
export async function scanRepo(repoUrl: string, options: ScanOptions = {}): Promise<ScanResult> {
  const onStage = options.onStage ?? (() => undefined);
  const repo = parseGitHubUrl(repoUrl);

  onStage('clone', repo.cloneUrl);
  const cloned = await shallowClone(repo);

  try {
    return await scanLocalDir(cloned.localPath, { kind: 'github', url: repo.cloneUrl }, options);
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
