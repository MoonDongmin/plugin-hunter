import { isRecord, readArray, readString } from './parse.ts';
import { commandExists, runProcess } from './process.ts';
import { JudgeExecError, JudgeParseError, type LlmJudge } from './types.ts';

export class GeminiCliJudge implements LlmJudge {
  readonly name = 'gemini';
  readonly bin = 'gemini';

  async isInstalled(): Promise<boolean> {
    return commandExists(this.bin);
  }

  async invoke(systemPrompt: string, userPayload: string): Promise<string> {
    const result = await runProcess(
      this.bin,
      ['-p', `${systemPrompt}\n\n${userPayload}`, '--output-format', 'json'],
      undefined,
      { isolateCwd: true },
    );

    if (result.exitCode !== 0 || result.timedOut) {
      throw new JudgeExecError(this.name, result.exitCode, result.timedOut ? 'Timed out.' : result.stderr.trim());
    }

    return parseGeminiOutput(result.stdout);
  }
}

function parseGeminiOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) throw new JudgeParseError('Gemini output was empty.', stdout);

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }

  const text = extractKnownText(parsed);
  if (text) return text;
  return trimmed;
}

function extractKnownText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value.map(extractKnownText).filter((part): part is string => Boolean(part));
    return parts.length > 0 ? parts.join('\n') : null;
  }
  if (!isRecord(value)) return null;

  const direct = readString(value, 'response') ?? readString(value, 'result') ?? readString(value, 'text') ?? readString(value, 'message');
  if (direct) return direct;

  const candidates = readArray(value, 'candidates');
  if (candidates) return extractKnownText(candidates);

  const content = value['content'];
  if (content) return extractKnownText(content);

  const parts = readArray(value, 'parts');
  if (parts) return extractKnownText(parts);

  return null;
}
