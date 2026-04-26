import pc from 'picocolors';
import type { Finding, ScanReport, Severity } from './ir/types.ts';

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

const SEVERITY_COLOR: Record<Severity, (s: string) => string> = {
  critical: (s) => pc.bgRed(pc.white(pc.bold(` ${s} `))),
  high: (s) => pc.red(pc.bold(s)),
  medium: (s) => pc.yellow(pc.bold(s)),
  low: (s) => pc.blue(s),
  info: (s) => pc.gray(s),
};

export function printTerminalReport(report: ScanReport): void {
  const { plugin, findings, durationMs, judgeUsed } = report;

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  );

  console.log('');
  console.log(pc.bold(`plugin-hunter  ──  ${plugin.manifest.name} (${plugin.platform})`));
  console.log(pc.gray(`root: ${plugin.root}`));
  console.log(
    pc.gray(
      `components: ${plugin.components.length}  ·  findings: ${findings.length}  ·  judge: ${
        judgeUsed ? 'on' : 'off'
      }  ·  ${durationMs.toFixed(0)}ms`,
    ),
  );
  console.log('');

  if (sorted.length === 0) {
    console.log(pc.green('✓ No findings.'));
    return;
  }

  for (const f of sorted) {
    printFinding(f);
  }

  const worst = sorted[0]?.severity ?? 'info';
  console.log('');
  console.log(
    worst === 'critical' || worst === 'high'
      ? pc.red(pc.bold('✗ BLOCK INSTALL — critical findings above.'))
      : pc.yellow('⚠ Review findings before installing.'),
  );
}

function printFinding(f: Finding): void {
  const tag = SEVERITY_COLOR[f.severity](f.severity.toUpperCase());
  const origin = pc.gray(`[${f.detector}·${f.vector}·conf=${f.confidence.toFixed(2)}]`);
  console.log(`${tag} ${pc.bold(f.title)}  ${origin}`);
  console.log(`       ${f.description}`);
  if (f.source) {
    const line = f.source.line !== undefined ? `:${f.source.line}` : '';
    console.log(pc.gray(`       at ${f.source.path}${line}`));
  }
  for (const ev of f.evidence) {
    console.log(pc.gray(`       │ ${truncate(ev, 200)}`));
  }
  console.log('');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function printJsonReport(report: ScanReport): void {
  console.log(
    JSON.stringify(
      {
        plugin: {
          platform: report.plugin.platform,
          manifest: report.plugin.manifest,
          componentCount: report.plugin.components.length,
          root: report.plugin.root,
        },
        findings: report.findings,
        durationMs: report.durationMs,
        judgeUsed: report.judgeUsed,
      },
      null,
      2,
    ),
  );
}
