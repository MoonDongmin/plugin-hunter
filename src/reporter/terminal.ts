import type { Finding, InstallSurface, ScanReport, Severity } from '../rules/types.ts';
import type { ScanSource } from '../state/types.ts';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

const SEV_COLOR: Record<Severity, string> = {
  CRITICAL: C.red,
  HIGH: C.magenta,
  MEDIUM: C.yellow,
  LOW: C.gray,
};

export function isUnsafe(report: ScanReport): boolean {
  return report.highSurfaceSummary.critical > 0 || report.highSurfaceSummary.high > 0;
}

export function renderReport(report: ScanReport, version: string): string {
  const lines: string[] = [];
  const bar = '━'.repeat(64);
  lines.push(`${C.bold}${C.cyan}plugin-hunter v${version}${C.reset}`);
  lines.push(C.cyan + bar + C.reset);
  lines.push(`  ${C.bold}플러그인:${C.reset} ${report.pluginName} v${report.pluginVersion}`);
  lines.push(`  ${C.bold}유형:${C.reset}     ${report.pluginType}`);
  lines.push(`  ${C.bold}출처:${C.reset}     ${describeSource(report.source)}`);
  lines.push(
    `  ${C.bold}파일:${C.reset}     ${report.filesScanned}개 검사 · ` +
    `설치 공격면 ${C.bold}${report.highSurfaceFiles}${C.reset}개`,
  );
  lines.push('');

  const claudeCount = report.findings.filter(f => f.source === 'claude').length;
  lines.push(`  Claude 분석 ${C.green}✓${C.reset} (설치 공격면에서 ${claudeCount}개 finding)`);
  lines.push('');

  const highFindings = report.findings.filter(f => f.surface === 'high');
  const lowFindings = report.findings.filter(f => f.surface === 'low');

  // ─── High surface (verdict-driving) ──────────────────────────────
  lines.push(
    `${C.bold}${C.cyan}┃ 설치 공격면${C.reset} ${C.dim}` +
    '— Claude/Codex가 세션 시작 시 자동 로드하는 파일' +
    `${C.reset}`,
  );
  lines.push('');
  if (highFindings.length === 0) {
    lines.push(`  ${C.green}✓ 설치 공격면 깨끗함${C.reset}`);
    lines.push('');
  } else {
    appendSeverityGroups(lines, highFindings, 'high');
  }

  // ─── Low surface (informational) ─────────────────────────────────
  if (lowFindings.length > 0) {
    lines.push(
      `${C.bold}${C.gray}┃ 대역 외${C.reset} ${C.dim}` +
      '— 테스트/픽스처/문서/빌드 (사용자가 직접 실행할 때만 동작)' +
      `${C.reset}`,
    );
    lines.push(`  ${C.dim}참고용 — 판정에 영향 없음${C.reset}`);
    lines.push('');
    appendSeverityGroups(lines, lowFindings, 'low');
  }

  // ─── Verdict ────────────────────────────────────────────────────
  const unsafe = isUnsafe(report);
  const verdict = unsafe
    ? `${C.bold}${C.red}결과: 위험${C.reset} — 이 플러그인을 설치하지 마세요.`
    : `${C.bold}${C.green}결과: 안전${C.reset} — 설치 공격면에서 critical/high 이슈가 발견되지 않음.`;
  lines.push(verdict);
  lines.push(formatSummaryLine('설치 공격면', report.highSurfaceSummary));
  if (lowFindings.length > 0) {
    lines.push(formatSummaryLine('대역 외    ', countByCategory(lowFindings)));
  }
  lines.push(C.cyan + bar + C.reset);
  return lines.join('\n');
}

function appendSeverityGroups(lines: string[], findings: Finding[], _surface: InstallSurface): void {
  const groups: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const sev of groups) {
    const items = findings.filter(f => f.severity === sev);
    if (items.length === 0) continue;
    const color = SEV_COLOR[sev];
    lines.push(`  ${color}${C.bold}${sev}${C.reset} (${items.length})`);
    for (const f of items) {
      lines.push(formatFinding(f));
    }
    lines.push('');
  }
}

function formatFinding(f: Finding): string {
  const sourceTag = sourceTagFor(f.source);
  const line = f.lineNumber !== undefined ? `:${f.lineNumber}` : '';
  const head = `    ${sourceTag} ${C.bold}${f.ruleId}${C.reset}  ${f.filePath}${line}`;
  const body = `         ${C.dim}"${truncate(f.snippet, 110)}"${C.reset}`;
  const desc = `         ${f.description}`;
  return [head, body, desc].join('\n');
}

function sourceTagFor(source: Finding['source']): string {
  if (source === 'symlink') return `${C.yellow}[symlink]${C.reset}`;
  if (source === 'meta') return `${C.gray}[meta]${C.reset}   `;
  return `${C.magenta}[claude]${C.reset} `;
}

function countByCategory(findings: Finding[]): { critical: number; high: number; medium: number; low: number } {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') out.critical++;
    else if (f.severity === 'HIGH') out.high++;
    else if (f.severity === 'MEDIUM') out.medium++;
    else out.low++;
  }
  return out;
}

function formatSummaryLine(label: string, c: { critical: number; high: number; medium: number; low: number }): string {
  return `  ${C.bold}${label}:${C.reset}  ` +
    `${C.red}critical=${c.critical}${C.reset}  ` +
    `${C.magenta}high=${c.high}${C.reset}  ` +
    `${C.yellow}medium=${c.medium}${C.reset}  ` +
    `${C.gray}low=${c.low}${C.reset}`;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function describeSource(s: ScanSource): string {
  switch (s.kind) {
    case 'github':
      return s.url;
    case 'installed-claude':
      return `claude-installed (${s.marketplace}) — ${s.installPath}`;
    case 'installed-codex':
      return `codex-installed (${s.marketplace}) — ${s.installPath}`;
    case 'codex-skill':
      return `codex skill — ${s.installPath}`;
    case 'codex-rule':
      return `codex rule — ${s.installPath}`;
    case 'codex-memory':
      return `codex memory — ${s.installPath}`;
  }
}
