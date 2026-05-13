import { isRecord, readArray, readRecord, readString } from './parse.ts';
import { commandExists, runProcess } from './process.ts';
import { JudgeExecError, JudgeParseError, JudgePolicyBlockError, type LlmJudge } from './types.ts';
import { L } from '../../i18n/index.ts';

export class CodexCliJudge implements LlmJudge {
  readonly name = 'codex';
  readonly bin = 'codex';

  async isInstalled(): Promise<boolean> {
    return commandExists(this.bin);
  }

  async invoke(systemPrompt: string, userPayload: string): Promise<string> {
    const result = await runProcess(
      this.bin,
      ['exec', '--json', '--ephemeral', '--skip-git-repo-check'],
      `${systemPrompt}\n\n${userPayload}`,
      { isolateCwd: true },
    );

    if (result.timedOut) {
      throw new JudgeExecError(this.name, result.exitCode, 'Timed out.');
    }

    // Codex CLI는 exit code ≠ 0 일 때도 진짜 에러를 stdout NDJSON 의
    // `type: "error"` / `turn.failed` 이벤트에 담아 보냅니다.
    // stderr 에는 `"Reading prompt from stdin..."` 같은 진행 메시지만 남는
    // 경우가 흔하므로, stdout 을 먼저 검사해 사용자에게 의미 있는 메시지를 노출합니다.
    const codexError = extractCodexErrorMessage(result.stdout);
    if (codexError) {
      if (codexError.kind === 'policy-block') {
        throw new JudgePolicyBlockError(this.name, codexError.userMessage, codexError.raw);
      }
      throw new JudgeExecError(this.name, result.exitCode, codexError.userMessage);
    }

    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim();
      throw new JudgeExecError(this.name, result.exitCode, stderr.length > 0 ? stderr : 'Codex CLI exited with non-zero status.');
    }

    return extractCodexFinalMessage(result.stdout);
  }
}

interface CodexErrorClassification {
  kind: 'policy-block' | 'generic';
  userMessage: string;
  raw: string;
}

function extractCodexErrorMessage(stdout: string): CodexErrorClassification | null {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    if (!isRecord(parsed)) continue;
    const type = readString(parsed, 'type');

    if (type === 'error') {
      const msg = readString(parsed, 'message');
      if (msg) return classifyCodexError(msg);
    }

    if (type === 'turn.failed') {
      const err = readRecord(parsed, 'error');
      const msg = err ? readString(err, 'message') : null;
      if (msg) return classifyCodexError(msg);
    }
  }
  return null;
}

function classifyCodexError(message: string): CodexErrorClassification {
  if (/flagged for possible cybersecurity risk/i.test(message)) {
    return {
      kind: 'policy-block',
      userMessage: L(
        'Codex refused to analyze this plugin. ' +
          'OpenAI policy filter classified the input as a cybersecurity threat pattern, ' +
          'which strongly suggests the plugin contains very dangerous content. ' +
          'Abort installation and re-run with "ph scan claude" or "ph scan gemini" for a second opinion.',
        'Codex 가 이 플러그인의 분석 자체를 거부했습니다. ' +
          'OpenAI 정책 필터가 입력 콘텐츠를 사이버보안 위협 패턴으로 분류한 결과로, ' +
          '플러그인 내부에 매우 위험한 패턴이 포함되어 있을 가능성이 높습니다. ' +
          '설치를 중단하고, 정밀 분석은 "ph scan claude" 또는 "ph scan gemini" 로 재실행하세요.',
      ),
      raw: message,
    };
  }
  return { kind: 'generic', userMessage: message, raw: message };
}

function extractCodexFinalMessage(stdout: string): string {
  let finalMessage: string | null = null;
  let parsedLineCount = 0;

  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }

    parsedLineCount += 1;
    const candidate = codexMessageFromEvent(parsed);
    if (candidate) finalMessage = candidate;
  }

  if (finalMessage) return finalMessage;
  if (parsedLineCount === 0 && stdout.trim()) return stdout.trim();
  throw new JudgeParseError('Codex output did not include a final assistant message.', stdout);
}

function codexMessageFromEvent(value: unknown): string | null {
  if (!isRecord(value)) return null;

  const type = readString(value, 'type');
  if (type === 'agent_message' || type === 'turn.agent_message') {
    return readString(value, 'message') ?? readString(value, 'text') ?? contentText(value['content']);
  }

  const item = readRecord(value, 'item');
  if (item) {
    const role = readString(item, 'role');
    const itemType = readString(item, 'type');
    if (role === 'assistant' || itemType === 'agent_message' || itemType === 'message') {
      return readString(item, 'message') ?? readString(item, 'text') ?? contentText(item['content']);
    }
  }

  const message = readRecord(value, 'message');
  if (message && readString(message, 'role') === 'assistant') {
    return readString(message, 'content') ?? contentText(message['content']);
  }

  const output = readString(value, 'output');
  if (type === 'turn.completed' && output) return output;

  return null;
}

function contentText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.map(contentText).filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (!isRecord(value)) return null;

  const text = readString(value, 'text') ?? readString(value, 'content') ?? readString(value, 'message');
  if (text) return text;

  const nested = readArray(value, 'content') ?? readArray(value, 'parts');
  return nested ? contentText(nested) : null;
}
