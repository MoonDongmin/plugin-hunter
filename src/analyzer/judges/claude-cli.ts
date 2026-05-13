import { readBoolean, readString, isRecord } from './parse.ts';
import { commandExists, runProcess } from './process.ts';
import { JudgeExecError, JudgeParseError, type LlmJudge } from './types.ts';
import { L } from '../../i18n/index.ts';

export class ClaudeCliJudge implements LlmJudge {
  readonly name = 'claude';
  readonly bin = 'claude';

  async isInstalled(): Promise<boolean> {
    return commandExists(this.bin);
  }

  async invoke(systemPrompt: string, userPayload: string): Promise<string> {
    // --bare 묶음 대신 개별 안전 옵션 + cwd 격리 + auto-memory 차단 env 로 동일한 보안 가치를 보존하면서
    // keychain / OAuth 인증은 살린다 (--bare 는 keychain 까지 차단해서 P1 사용자 zero-config 가 깨짐).
    // 차단되는 자동 컨텍스트: skill, slash command, user/project/local settings, MCP 서버,
    // per-machine system-prompt sections, auto-memory, cwd CLAUDE.md auto-discovery.
    const result = await runProcess(
      this.bin,
      [
        '-p',
        '--output-format', 'json',
        '--disable-slash-commands',
        '--exclude-dynamic-system-prompt-sections',
        '--setting-sources', '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--allowedTools', '',
        '--max-turns', '1',
      ],
      `${systemPrompt}\n\n${userPayload}`,
      {
        isolateCwd: true,
        extraEnv: { CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' },
      },
    );

    if (result.timedOut) {
      throw new JudgeExecError(this.name, result.exitCode, 'Timed out.');
    }

    // Claude CLI는 exit code ≠ 0 일 때도 stdout JSON envelope 에 진짜 원인을
    // 담아 보내는 경우가 많습니다 (api_error_status, is_error=true, result 에 에러 텍스트).
    // 그래서 stdout 을 먼저 파싱하고, 그게 비어있을 때만 stderr / exit code 로 폴백합니다.
    if (result.stdout.trim().length > 0) {
      return parseClaudeEnvelope(result.stdout, result.exitCode);
    }

    const stderr = result.stderr.trim();
    throw new JudgeExecError(
      this.name,
      result.exitCode,
      stderr.length > 0
        ? stderr
        : L(
            `Claude Code CLI exited without stdout/stderr (exit ${result.exitCode}). Check login state or network.`,
            `Claude Code CLI 가 stdout/stderr 없이 종료했습니다 (exit ${result.exitCode}). 로그인 상태 또는 네트워크를 확인하세요.`,
          ),
    );
  }
}

function parseClaudeEnvelope(stdout: string, exitCode: number | null): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JudgeParseError(`Claude Code JSON envelope parse failed: ${message}`, stdout);
  }

  if (!isRecord(parsed)) {
    throw new JudgeParseError('Claude Code JSON envelope is not an object.', stdout);
  }

  const resultText = readString(parsed, 'result');
  const isError = readBoolean(parsed, 'is_error');
  const apiErrorStatus = readString(parsed, 'api_error_status');
  const subtype = readString(parsed, 'subtype');

  if (isError === true || (exitCode !== null && exitCode !== 0)) {
    const parts: string[] = [];
    if (apiErrorStatus) parts.push(`api_error_status=${apiErrorStatus}`);
    if (subtype && subtype !== 'success') parts.push(`subtype=${subtype}`);
    if (resultText) parts.push(resultText);
    const detail = parts.length > 0
      ? parts.join(' — ')
      : L(
          `Claude Code CLI exited with code ${exitCode ?? 'unknown'}.`,
          `Claude Code CLI 가 exit ${exitCode ?? 'unknown'} 으로 종료했습니다.`,
        );
    throw new JudgeExecError('claude', exitCode, detail);
  }

  if (!resultText) {
    throw new JudgeParseError('Claude Code JSON envelope did not include a string result.', stdout);
  }

  return resultText;
}
