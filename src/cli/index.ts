import { Command } from 'commander';
import { config as loadDotenv } from 'dotenv';
import { runScanCommand } from './scan.command.ts';
import { runListCommand } from './list.command.ts';
import { runWatchCommand } from './watch.command.ts';
import { runHistoryCommand } from './history.command.ts';
import { runClearCommand } from './clear.command.ts';
import { c } from './ui.ts';

const VERSION = '0.1.0';

export async function runCli(argv: string[]): Promise<number> {
  loadDotenv();

  const program = new Command();
  program
    .name('ph')
    .description(
      `${c.boldCyan('plugin-hunter')} ${c.dim('v' + VERSION)}\n` +
      'AI 코딩 에이전트 플러그인 설치 전 보안 검사기 (Claude Code · Codex CLI)',
    )
    .version(VERSION)
    .addHelpText('after', `
${c.bold('예시')}
  ${c.cyan('ph scan')} owner/repo                      ${c.dim('# GitHub 플러그인 1회 검사')}
  ${c.cyan('ph scan')} https://github.com/x/y --json   ${c.dim('# JSON 출력 (CI/스크립트용)')}
  ${c.cyan('ph ls')}                                   ${c.dim('# 설치된 플러그인 전체 보기')}
  ${c.cyan('ph watch')} all                            ${c.dim('# 모두 재검사 + rug-pull diff')}
  ${c.cyan('ph watch')} ralph-loop                     ${c.dim('# 한 개만 재검사')}
  ${c.cyan('ph history')} --limit 50                   ${c.dim('# 최근 50건 검사 이력')}

${c.bold('Exit codes')}
  ${c.green('0')} clean   ${c.red('1')} unsafe (critical/high finding)   ${c.yellow('2')} error
`);

  let exitCode = 0;

  program
    .command('scan')
    .description('GitHub 플러그인 레포지토리에서 악성 패턴 검사')
    .argument('<url>', 'GitHub URL 또는 owner/repo 형식')
    .option('--json', 'JSON 형식으로 출력 (기본: 사람이 읽기 좋은 보고서)')
    .option('--no-save', '레지스트리에 결과를 저장하지 않음')
    .action(async (url: string, opts: { json?: boolean; save?: boolean }) => {
      exitCode = await runScanCommand(url, {
        json: opts.json,
        noSave: opts.save === false,
      }, VERSION);
    });

  program
    .command('ls')
    .description('내 컴퓨터에 설치된 모든 플러그인 표시 (~/.claude, ~/.codex)')
    .action(() => {
      exitCode = runListCommand();
    });

  program
    .command('watch')
    .description('설치된 플러그인을 재검사 (rug-pull diff 포함)')
    .argument('<target>', '"all" 또는 플러그인 이름 / id')
    .option('--quiet', '요약만 출력 (hook 등 자동 실행용)')
    .action(async (target: string, opts: { quiet?: boolean }) => {
      exitCode = await runWatchCommand(target, { quiet: opts.quiet }, VERSION);
    });

  program
    .command('history')
    .description('과거 검사 이력 표시')
    .option('--limit <n>', '최근 N개만 표시 (기본 20)')
    .option('--id <plugin-id>', '특정 플러그인만 필터 (예: ralph-loop@claude-plugins-official)')
    .action((opts: { limit?: string; id?: string }) => {
      exitCode = runHistoryCommand({ limit: opts.limit, id: opts.id });
    });

  program
    .command('clear')
    .description('검사한 목록(registry + history)을 모두 초기화')
    .option('-y, --yes', '확인 프롬프트 없이 즉시 삭제')
    .action(async (opts: { yes?: boolean }) => {
      exitCode = await runClearCommand({ yes: opts.yes });
    });

  await program.parseAsync(argv);
  return exitCode;
}
