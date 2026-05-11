import { collectTargets, HIGH_SURFACE_ROLES, roleFor } from './collector.ts';
import { buildHashes } from './orchestrator.ts';
import { analyzeWithJudge } from '../analyzer/judge.ts';
import { diffHashes } from '../state/registry.ts';
import type { Finding, PluginType, ScanTarget, UpstreamReport } from '../rules/types.ts';
import type { LlmJudge } from '../analyzer/judges/types.ts';

/**
 * Marketplace dir (= 다음 /plugin update 시 cache 로 복사될 source-of-truth) 와 현재 cache 의
 * high-surface 파일을 비교한다. drift 가 발견되면 marketplace 콘텐츠를 judge 에게 분석 의뢰하여
 * "PRE-RUG-PULL" 시한폭탄 단계를 감지한다.
 *
 * 반환값
 *   - null            → drift 없음. marketplace 가 cache 와 동일하므로 안전. judge 호출 자체 skip.
 *   - UpstreamReport  → drift 가 있었음. findings 에 marketplace judge 결과 또는 LOW informational finding 포함.
 *
 * v1 가정: marketplace dir root == plugin root (single-plugin marketplace).
 *   v2 에서 marketplace.json 의 plugins[].source 따라가도록 확장 예정.
 */
export async function compareUpstream(
  cacheHashes: Record<string, string>,
  marketplaceDir: string,
  judge: LlmJudge,
  pluginType: PluginType,
): Promise<UpstreamReport | null> {
  const { targets: marketTargets } = collectTargets(marketplaceDir);
  const marketHashes = buildHashes(marketTargets);

  const cacheHigh = pickHighSurface(cacheHashes);
  const marketHigh = pickHighSurface(marketHashes);
  const drift = diffHashes(cacheHigh, marketHigh);

  if (drift.added.length === 0 && drift.removed.length === 0 && drift.modified.length === 0) {
    return null;
  }

  const highTargets: ScanTarget[] = marketTargets.filter(t => t.surface === 'high');
  const findings: Finding[] = [];

  try {
    const judgeFindings = await analyzeWithJudge(judge, highTargets, pluginType);
    for (const f of judgeFindings) {
      findings.push({ ...f, origin: 'upstream' });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    findings.push({
      severity: 'HIGH',
      ruleId: 'PH-UPSTREAM-JUDGE-ERR',
      source: 'meta',
      surface: 'high',
      filePath: '(upstream)',
      snippet: msg.slice(0, 200),
      description:
        `${judge.name} judge 의 marketplace 분석이 실패하여 upstream 안전성을 확정할 수 없습니다. ` +
        '신뢰성 보존 차원에서 PRE-RUG-PULL 가능성을 HIGH 로 격상합니다. judge CLI 의 인증/네트워크 상태를 확인 후 재시도하세요.',
      origin: 'upstream',
    });
  }

  if (findings.length === 0) {
    findings.push(buildCleanDriftFinding(drift));
  }

  return { marketplaceDir, drift, findings };
}

function pickHighSurface(hashes: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, hash] of Object.entries(hashes)) {
    const role = roleFor(path);
    if (role === null) continue;
    if (!HIGH_SURFACE_ROLES.has(role)) continue;
    out[path] = hash;
  }
  return out;
}

function buildCleanDriftFinding(drift: { added: string[]; removed: string[]; modified: string[] }): Finding {
  const summary = `+${drift.added.length}  ~${drift.modified.length}  -${drift.removed.length}`;
  const sample = [...drift.added, ...drift.modified, ...drift.removed].slice(0, 3).join(', ');
  return {
    severity: 'LOW',
    ruleId: 'PH-UPSTREAM-DRIFT',
    source: 'meta',
    surface: 'low',
    filePath: '(upstream)',
    snippet: summary + (sample ? ` — ${sample}` : ''),
    description:
      'marketplace dir 에 cache 와 다른 변경이 있습니다. judge 분석 결과는 안전하지만, ' +
      '다음 /plugin update 시 이 변경이 cache 로 복사되어 SessionStart 등에서 자동 로드됩니다. ' +
      '예상한 정상 변경인지 확인하세요.',
    origin: 'upstream',
  };
}
