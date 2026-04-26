export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type AnalysisSource = 'claude' | 'symlink' | 'meta';

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

export interface Finding {
  severity: Severity;
  ruleId: string;
  source: AnalysisSource;
  surface: InstallSurface;
  filePath: string;
  lineNumber?: number;
  snippet: string;
  description: string;
}

import type { ScanSource } from '../state/types.ts';

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
