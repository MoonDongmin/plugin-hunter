#!/usr/bin/env bun
import { resolve } from 'node:path';
import { Command } from 'commander';
import { printJsonReport, printTerminalReport } from './report.ts';
import { scan } from './scanner.ts';

const program = new Command();

program
  .name('plugin-hunter')
  .description('Pre-install security scanner for Claude Code / Codex CLI / Gemini CLI plugins.')
  .version('0.0.1');

program
  .command('scan')
  .argument('<path>', 'path to the plugin directory')
  .option('--platform <platform>', 'force a platform (claude|codex|gemini)')
  .option('--json', 'emit JSON instead of a terminal report')
  .option('--no-judge', 'disable the LLM judge (heuristics only)')
  .option('--exit-code', 'exit 1 if any high/critical finding is present')
  .action(async (path: string, opts) => {
    const root = resolve(path);
    const report = await scan(root, {
      platform: opts.platform,
      noJudge: opts.judge === false,
    });

    if (opts.json) {
      printJsonReport(report);
    } else {
      printTerminalReport(report);
    }

    if (opts.exitCode) {
      const worst = report.findings.some(
        (f) => f.severity === 'high' || f.severity === 'critical',
      );
      if (worst) process.exit(1);
    }
  });

program.parseAsync().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
});
