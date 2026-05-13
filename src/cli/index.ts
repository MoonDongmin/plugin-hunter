import { Command } from 'commander';
import { runScanCommand } from './scan.command.ts';
import { runListCommand } from './list.command.ts';
import { runWatchCommand } from './watch.command.ts';
import { runHistoryCommand } from './history.command.ts';
import { runClearCommand } from './clear.command.ts';
import { maybeFirstRunPrompt, runLangCommand } from './lang.command.ts';
import { c } from './ui.ts';
import { L, resolveLang, setLang } from '../i18n/index.ts';
import pkg from '../../package.json' with { type: 'json' };

const VERSION = pkg.version;

/**
 * Pre-parse --lang so we can pin the global language before any command
 * action runs. We don't depend on commander's option parser here because
 * commander only triggers .opts() inside an action; banners/help built at
 * configuration time need lang resolved first.
 */
function preParseLangFlag(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--lang' || a === '-L') return argv[i + 1];
    if (a && a.startsWith('--lang=')) return a.slice('--lang='.length);
  }
  return undefined;
}

export async function runCli(argv: string[]): Promise<number> {
  const explicit = preParseLangFlag(argv);
  setLang(resolveLang(explicit));

  // First-run interactive prompt: only when no saved/env/explicit lang and TTY.
  // Skipped automatically for `ph lang ...` to avoid double-prompting.
  if (!explicit && !argv.slice(2).some(a => a === 'lang')) {
    await maybeFirstRunPrompt();
  }

  const program = new Command();
  program
    .name('ph')
    .description(
      `${c.boldCyan('plugin-hunter')} ${c.dim('v' + VERSION)}\n` +
      L(
        'Pre-install security scanner for AI coding-agent plugins (Claude Code · Codex CLI · Gemini CLI)',
        'AI 코딩 에이전트 플러그인 설치 전 보안 검사기 (Claude Code · Codex CLI · Gemini CLI)',
      ),
    )
    .version(VERSION)
    .option('--lang <code>', L('UI language: en | ko (overrides config and PH_LANG)', 'UI 언어: en | ko (config 및 PH_LANG보다 우선)'))
    .addHelpText('after', `
${c.bold(L('Examples', '예시'))}
  ${c.cyan('ph scan claude')} owner/repo               ${c.dim(L('# scan a GitHub plugin with Claude Code as judge', '# Claude Code로 GitHub 플러그인 1회 검사'))}
  ${c.cyan('ph scan codex')} https://github.com/x/y   ${c.dim(L('# use Codex CLI as judge', '# Codex CLI를 judge로 검사'))}
  ${c.cyan('ph ls')}                                   ${c.dim(L('# list all installed plugins', '# 설치된 플러그인 전체 보기'))}
  ${c.cyan('ph watch claude')} all                     ${c.dim(L('# re-scan all + rug-pull diff', '# Claude Code로 모두 재검사 + rug-pull diff'))}
  ${c.cyan('ph watch codex')} ralph-loop               ${c.dim(L('# re-scan one plugin with Codex', '# Codex로 한 개만 재검사'))}
  ${c.cyan('ph history')} --limit 50                   ${c.dim(L('# show last 50 scans', '# 최근 50건 검사 이력'))}
  ${c.cyan('ph lang')} en                              ${c.dim(L('# switch UI language', '# UI 언어 전환'))}

${c.bold('Exit codes')}
  ${c.green('0')} clean   ${c.red('1')} unsafe (critical/high finding)   ${c.yellow('2')} error
`);

  let exitCode = 0;

  program
    .command('scan')
    .description(L('Scan a GitHub plugin repository for malicious patterns', 'GitHub 플러그인 레포지토리에서 악성 패턴 검사'))
    .argument('<judge>', L('LLM CLI used as judge: claude | codex | gemini', '판정에 사용할 LLM CLI: claude | codex | gemini'))
    .argument('<url>', L('GitHub URL or owner/repo shorthand', 'GitHub URL 또는 owner/repo 형식'))
    .option('--no-save', L('do not persist the result into the registry', '레지스트리에 결과를 저장하지 않음'))
    .option('--no-remediation', L('disable AI remediation generation on unsafe (CI/script use)', 'unsafe 시 AI 권장 조치 생성 비활성화 (CI/스크립트용)'))
    .action(async (judge: string, url: string, opts: { save?: boolean; remediation?: boolean }) => {
      exitCode = await runScanCommand(judge, url, {
        noSave: opts.save === false,
        noRemediation: opts.remediation === false,
      }, VERSION);
    });

  program
    .command('ls')
    .description(L('List every plugin installed on this machine (~/.claude, ~/.codex)', '내 컴퓨터에 설치된 모든 플러그인 표시 (~/.claude, ~/.codex)'))
    .action(() => {
      exitCode = runListCommand();
    });

  program
    .command('watch')
    .description(L('Re-scan installed plugins (with rug-pull diff)', '설치된 플러그인을 재검사 (rug-pull diff 포함)'))
    .argument('<judge>', L('LLM CLI used as judge: claude | codex | gemini', '판정에 사용할 LLM CLI: claude | codex | gemini'))
    .argument('<target>', L('"all" or a plugin name / id', '"all" 또는 플러그인 이름 / id'))
    .option('--quiet', L('summary only (for hook / cron use)', '요약만 출력 (hook 등 자동 실행용)'))
    .option('--no-remediation', L('disable AI remediation generation on unsafe (CI/script use)', 'unsafe 시 AI 권장 조치 생성 비활성화 (CI/스크립트용)'))
    .option('--no-upstream', L('skip marketplace dir drift comparison (saves judge calls)', 'marketplace dir 과의 drift 비교 비활성화 (judge CLI 호출 절감)'))
    .action(async (judge: string, target: string, opts: { quiet?: boolean; remediation?: boolean; upstream?: boolean }) => {
      exitCode = await runWatchCommand(judge, target, {
        quiet: opts.quiet,
        noRemediation: opts.remediation === false,
        noUpstream: opts.upstream === false,
      }, VERSION);
    });

  program
    .command('history')
    .description(L('Show past scan history', '과거 검사 이력 표시'))
    .option('--limit <n>', L('show only the most recent N entries (default 20)', '최근 N개만 표시 (기본 20)'))
    .option('--id <plugin-id>', L('filter to one plugin (e.g. ralph-loop@claude-plugins-official)', '특정 플러그인만 필터 (예: ralph-loop@claude-plugins-official)'))
    .action((opts: { limit?: string; id?: string }) => {
      exitCode = runHistoryCommand({ limit: opts.limit, id: opts.id });
    });

  program
    .command('clear')
    .description(L('Wipe all scan records (registry + history)', '검사한 목록(registry + history)을 모두 초기화'))
    .option('-y, --yes', L('skip confirmation prompt', '확인 프롬프트 없이 즉시 삭제'))
    .action(async (opts: { yes?: boolean }) => {
      exitCode = await runClearCommand({ yes: opts.yes });
    });

  program
    .command('lang')
    .description(L('Show / change the UI language preference', 'UI 언어 설정 표시 / 변경'))
    .argument('[code]', L('language code: en | ko', '언어 코드: en | ko'))
    .option('--reset', L('clear saved preference and fall back to auto-detect', '저장된 설정 삭제 후 자동 감지로 복귀'))
    .action(async (code: string | undefined, opts: { reset?: boolean }) => {
      exitCode = await runLangCommand(code, { reset: opts.reset });
    });

  await program.parseAsync(argv);
  return exitCode;
}
