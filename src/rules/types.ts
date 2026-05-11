export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AnalysisSource = 'claude' | 'codex' | 'gemini' | 'symlink' | 'meta';

export type PluginType = 'claude' | 'codex' | 'unknown';

export type FileRole =
  | 'MANIFEST'
  | 'HOOKS'
  | 'MCP_JSON'
  | 'SKILL_MD'
  | 'AGENT_MD'
  | 'COMMAND_MD'
  | 'SHELL_SCRIPT'
  | 'JS_SCRIPT'
  | 'PACKAGE_JSON'
  | 'GITMODULES'
  | 'UNKNOWN';

/**
 * Install attack surface — does the AI agent auto-load or execute this file
 * at plugin install/session-start time, without user interaction?
 *
 *  - 'high': hooks.json, .mcp.json, skills/agents/commands markdown, manifest,
 *           and any script transitively referenced by them. These are the only
 *           files an attacker can use to land code at install time.
 *  - 'low':  test fixtures, benchmarks, seminar/demo docs, READMEs, dist/build
 *           artifacts, stand-alone src code. Only run if the user explicitly
 *           invokes them (npm test, manual node ...). Findings here are
 *           informational, not blocking.
 */
export type InstallSurface = 'high' | 'low';

export interface ScanTarget {
  filePath: string;
  fileRole: FileRole;
  surface: InstallSurface;
  rawContent: string;
  parsedContent?: unknown;
}

/**
 * `origin: 'cache'` (기본값) — 사용자 머신에서 *지금* 실행되는 install snapshot 에 대한 finding.
 * `origin: 'upstream'` — marketplace dir (= 다음 update 시 cache 로 복사될 source) 에 대한 finding.
 *   PRE-RUG-PULL 시한폭탄 단계를 표시할 때 사용. surface 와 severity 정책은 동일하게 적용되지만
 *   reporter 에서 별도 섹션으로 렌더되어 사용자 혼동을 방지한다.
 */
export type FindingOrigin = 'cache' | 'upstream';

export interface Finding {
  severity: Severity;
  ruleId: string;
  source: AnalysisSource;
  surface: InstallSurface;
  filePath: string;
  lineNumber?: number;
  snippet: string;
  description: string;
  origin?: FindingOrigin;
}

import type { ScanSource } from '../state/types.ts';

/**
 * Upstream drift 비교 결과. `report.upstream` 으로 첨부되며, 존재 여부 자체가
 *   - undefined  → drift 비교 skip (marketplaceDir 없음, --no-upstream, scan 명령 등)
 *   - present    → drift 가 *있었거나* clean drift 인 경우. drift 가 0 이면 처음부터 null 을 반환하므로 attach 자체가 안 됨.
 * 의 의미를 가진다.
 */
export interface UpstreamReport {
  marketplaceDir: string;
  drift: { added: string[]; removed: string[]; modified: string[] };
  findings: Finding[];
}

export interface ScanReport {
  pluginId: string;
  pluginName: string;
  pluginVersion: string;
  pluginType: PluginType;
  source: ScanSource;
  scannedAt: string;
  findings: Finding[];
  summary: SeverityCount;
  highSurfaceSummary: SeverityCount;
  filesScanned: number;
  highSurfaceFiles: number;
  upstream?: UpstreamReport;
}

export interface SeverityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};
