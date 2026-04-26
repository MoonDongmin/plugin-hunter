import type { Finding, InstallSurface, ScanReport, Severity } from '../rules/types.ts';
import type { ScanSource } from '../state/types.ts';
import {
  alignColumns,
  badge,
  box,
  c,
  hr,
  icon,
  indentWrap,
  severityBadge,
  termWidth,
  truncate,
  visibleLength,
} from '../cli/ui.ts';

export function isUnsafe(report: ScanReport): boolean {
  return report.highSurfaceSummary.critical > 0 || report.highSurfaceSummary.high > 0;
}

export function renderReport(report: ScanReport, version: string): string {
  const out: string[] = [];
  const w = termWidth();
  const unsafe = isUnsafe(report);

  // ─── Brand line ──────────────────────────────────────────────────────────
  out.push(`${c.boldCyan('plugin-hunter')} ${c.dim('v' + version)}`);
  out.push(hr(w));

  // ─── Verdict banner (always at top so it can't be missed) ────────────────
  out.push(verdictBanner(report, unsafe, w));
  out.push('');

  // ─── Plugin metadata ─────────────────────────────────────────────────────
  out.push(c.bold('플러그인 정보'));
  const meta: string[][] = [
    [c.dim('이름'), `${c.bold(report.pluginName)} ${c.dim('v' + report.pluginVersion)}`],
    [c.dim('유형'), report.pluginType],
    [c.dim('출처'), describeSource(report.source)],
    [c.dim('파일'), `${report.filesScanned}개 검사 · 설치 공격면 ${c.bold(String(report.highSurfaceFiles))}개`],
  ];
  for (const line of alignColumns(meta, 2)) out.push('  ' + line);
  out.push('');

  // ─── Analyzer status ─────────────────────────────────────────────────────
  const claudeCount = report.findings.filter(f => f.source === 'claude').length;
  const symlinkCount = report.findings.filter(f => f.source === 'symlink').length;
  const metaCount = report.findings.filter(f => f.source === 'meta').length;
  const analyzerLine = [
    `${c.green(icon.check)} Claude 분석 ${c.dim(`(${claudeCount} findings)`)}`,
    symlinkCount > 0 ? `${c.yellow(icon.warn)} 심볼릭 링크 ${c.dim(`(${symlinkCount})`)}` : null,
    metaCount > 0 ? `${c.gray(icon.info)} 메타 ${c.dim(`(${metaCount})`)}` : null,
  ].filter(Boolean).join('   ');
  out.push('  ' + analyzerLine);
  out.push('');

  // ─── High surface (verdict-driving) ──────────────────────────────────────
  const highFindings = report.findings.filter(f => f.surface === 'high');
  const lowFindings = report.findings.filter(f => f.surface === 'low');

  out.push(c.bold('설치 공격면 ') + c.dim('— 세션 시작 시 자동 로드되는 파일'));
  out.push('');
  if (highFindings.length === 0) {
    out.push(`  ${c.green(icon.check)} ${c.green('설치 공격면 깨끗함')}`);
    out.push('');
  } else {
    appendSeverityGroups(out, highFindings, 'high');
  }

  // ─── Low surface (informational) ─────────────────────────────────────────
  if (lowFindings.length > 0) {
    out.push(c.bold(c.gray('대역 외 ')) + c.dim('— 테스트/픽스처/문서 (사용자가 직접 실행할 때만 동작, 판정에 영향 없음)'));
    out.push('');
    appendSeverityGroups(out, lowFindings, 'low');
  }

  // ─── Summary footer ──────────────────────────────────────────────────────
  out.push(hr(w));
  out.push(formatSummaryLine('설치 공격면', report.highSurfaceSummary));
  if (lowFindings.length > 0) {
    out.push(formatSummaryLine('대역 외    ', countByCategory(lowFindings)));
  }

  // ─── Next steps ──────────────────────────────────────────────────────────
  out.push('');
  out.push(...nextSteps(report, unsafe));

  return out.join('\n');
}

function verdictBanner(report: ScanReport, unsafe: boolean, width: number): string {
  if (unsafe) {
    const c1 = report.highSurfaceSummary.critical;
    const h1 = report.highSurfaceSummary.high;
    const counts: string[] = [];
    if (c1 > 0) counts.push(c.boldRed(`critical ${c1}`));
    if (h1 > 0) counts.push(c.boldMagenta(`high ${h1}`));
    const countLine = counts.length > 0
      ? `${c.dim('└─')} ${counts.join(c.dim(' · '))}`
      : '';
    return box({
      title: `${badge('UNSAFE', 'unsafe')}  설치하지 마세요`,
      lines: [
        `${c.bold(report.pluginName)} ${c.dim('v' + report.pluginVersion)} ${c.dim('·')} ${c.dim(report.pluginType)}`,
        '',
        `${c.red(icon.cross)} 설치 공격면에서 ${c.bold('악성/의심 패턴')}이 발견되었습니다.`,
        ...(countLine ? ['  ' + countLine] : []),
      ],
      kind: 'unsafe',
      width,
    });
  }
  return box({
    title: `${badge('SAFE', 'safe')}  설치 가능`,
    lines: [
      `${c.bold(report.pluginName)} ${c.dim('v' + report.pluginVersion)} ${c.dim('·')} ${c.dim(report.pluginType)}`,
      '',
      `${c.green(icon.check)} 설치 공격면 ${c.dim('(hooks · skills · agents · commands · MCP)')} 깨끗`,
      `  critical / high finding 없음`,
    ],
    kind: 'safe',
    width,
  });
}

function nextSteps(report: ScanReport, unsafe: boolean): string[] {
  const lines: string[] = [c.bold('다음 단계')];
  if (unsafe) {
    lines.push(`  ${c.dim(icon.arrow)} 설치를 ${c.boldRed('중단')}하고 위 finding을 검토하세요.`);
    lines.push(`  ${c.dim(icon.arrow)} 결과 공유: ${c.cyan('ph scan <url> --json')}`);
  } else {
    lines.push(`  ${c.dim(icon.arrow)} 설치 후 변경 모니터링: ${c.cyan('ph watch ' + report.pluginName)}`);
    lines.push(`  ${c.dim(icon.arrow)} 전체 재검사:           ${c.cyan('ph watch all')}`);
  }
  return lines;
}

function appendSeverityGroups(lines: string[], findings: Finding[], _surface: InstallSurface): void {
  const groups: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (const sev of groups) {
    const items = findings.filter(f => f.severity === sev);
    if (items.length === 0) continue;
    lines.push(`  ${severityBadge(sev)} ${c.dim('×')} ${c.bold(String(items.length))}`);
    for (const f of items) {
      lines.push(formatFinding(f));
    }
    lines.push('');
  }
}

function formatFinding(f: Finding): string {
  const sourceTag = sourceTagFor(f.source);
  const line = f.lineNumber !== undefined ? c.dim(`:${f.lineNumber}`) : '';
  const w = termWidth();
  const head = `      ${sourceTag} ${c.bold(f.ruleId)}  ${c.cyan(f.filePath)}${line}`;
  const snippetMax = Math.max(40, w - 12);
  const body = `        ${c.dim('▸ ' + truncate(`"${f.snippet}"`, snippetMax))}`;
  // description은 길어질 수 있으므로 들여쓰기를 유지하며 wrap
  const desc = indentWrap(f.description, '        ', w);
  return [head, body, desc].join('\n');
}

function sourceTagFor(source: Finding['source']): string {
  if (source === 'symlink') return c.yellow('[symlink]');
  if (source === 'meta') return c.gray('[meta]   ');
  return c.magenta('[claude] ');
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

function formatSummaryLine(label: string, n: { critical: number; high: number; medium: number; low: number }): string {
  // 0인 카테고리는 dim 처리해서 한눈에 들어오는 숫자만 강조
  const fmt = (label: string, count: number, color: (s: string) => string) =>
    count > 0 ? color(`${label} ${count}`) : c.dim(`${label} ${count}`);
  return `  ${c.bold(label + ':')}  ` + [
    fmt('critical', n.critical, c.boldRed),
    fmt('high', n.high, c.boldMagenta),
    fmt('medium', n.medium, c.boldYellow),
    fmt('low', n.low, c.boldGray),
  ].join('  ');
}

function describeSource(s: ScanSource): string {
  switch (s.kind) {
    case 'github':
      return s.url;
    case 'installed-claude':
      return `claude-installed ${c.dim('(' + s.marketplace + ')')}  ${c.dim(s.installPath)}`;
    case 'installed-codex':
      return `codex-installed ${c.dim('(' + s.marketplace + ')')}  ${c.dim(s.installPath)}`;
    case 'codex-skill':
      return `codex skill  ${c.dim(s.installPath)}`;
    case 'codex-rule':
      return `codex rule  ${c.dim(s.installPath)}`;
    case 'codex-memory':
      return `codex memory  ${c.dim(s.installPath)}`;
  }
}

// visibleLength is exported via `cli/ui.ts` and used internally only — keep import alive
void visibleLength;
