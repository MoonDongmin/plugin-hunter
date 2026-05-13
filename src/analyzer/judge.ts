import type { FileRole, Finding, PluginType, ScanTarget, Severity } from '../rules/types.ts';
import { extractJsonObject } from './judges/parse.ts';
import { getJudgeSystemPrompt } from './judges/prompt.ts';
import type { LlmJudge } from './judges/types.ts';

const MAX_TOTAL_BYTES = 200_000;
const MAX_PER_FILE_BYTES = 16_000;

const ROLE_PRIORITY: FileRole[] = [
  'HOOKS',
  'MCP_JSON',
  'SKILL_MD',
  'AGENT_MD',
  'COMMAND_MD',
  'MANIFEST',
  'JS_SCRIPT',
  'SHELL_SCRIPT',
  'PACKAGE_JSON',
  'GITMODULES',
  'UNKNOWN',
];

const SEVERITIES: Record<string, Severity> = {
  CRITICAL: 'CRITICAL',
  critical: 'CRITICAL',
  HIGH: 'HIGH',
  high: 'HIGH',
  MEDIUM: 'MEDIUM',
  medium: 'MEDIUM',
  LOW: 'LOW',
  low: 'LOW',
};

export async function analyzeWithJudge(
  judge: LlmJudge,
  targets: ScanTarget[],
  pluginType: PluginType,
): Promise<Finding[]> {
  const highSurface = targets.filter(t => t.surface === 'high');
  if (highSurface.length === 0) return [];

  const bundle = bundleTargets(highSurface);
  if (!bundle) return [];

  const raw = await judge.invoke(getJudgeSystemPrompt(), `Plugin type: ${pluginType}\n\nFiles:\n\n${bundle}`);
  const parsed = extractJsonObject(raw);
  const findingsValue = parsed['findings'];
  if (!Array.isArray(findingsValue)) return [];

  const out: Finding[] = [];
  for (const item of findingsValue) {
    const finding = coerceFinding(item, judge);
    if (finding) out.push(finding);
  }
  return out;
}

function bundleTargets(targets: ScanTarget[]): string {
  const sorted = [...targets].sort((a, b) => ROLE_PRIORITY.indexOf(a.fileRole) - ROLE_PRIORITY.indexOf(b.fileRole));
  let used = 0;
  const chunks: string[] = [];
  for (const t of sorted) {
    if (used >= MAX_TOTAL_BYTES) break;
    const remainingBudget = MAX_TOTAL_BYTES - used;
    const sliceSize = Math.min(MAX_PER_FILE_BYTES, remainingBudget, t.rawContent.length);
    if (sliceSize <= 0) break;
    const slice = t.rawContent.slice(0, sliceSize);
    const truncated = sliceSize < t.rawContent.length ? '\n[...truncated]' : '';
    const block = `### ${t.filePath} [${t.fileRole}]\n${slice}${truncated}\n`;
    chunks.push(block);
    used += block.length;
  }
  return chunks.join('\n');
}

function coerceFinding(value: unknown, judge: LlmJudge): Finding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const severity = normalizeSeverity(v['severity']);
  if (!severity) return null;
  if (typeof v['ruleId'] !== 'string') return null;
  if (typeof v['filePath'] !== 'string') return null;
  if (typeof v['snippet'] !== 'string') return null;
  if (typeof v['description'] !== 'string') return null;

  const result: Finding = {
    severity,
    ruleId: v['ruleId'],
    source: judge.name,
    surface: 'high',
    filePath: v['filePath'],
    snippet: v['snippet'].slice(0, 240),
    description: v['description'],
  };

  if (typeof v['lineNumber'] === 'number' && Number.isFinite(v['lineNumber'])) {
    result.lineNumber = v['lineNumber'];
  }

  return result;
}

function normalizeSeverity(value: unknown): Severity | null {
  if (typeof value !== 'string') return null;
  return SEVERITIES[value] ?? null;
}
