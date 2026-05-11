import { ClaudeCliJudge } from './claude-cli.ts';
import { CodexCliJudge } from './codex-cli.ts';
import { GeminiCliJudge } from './gemini-cli.ts';
import { type LlmJudge, UnknownJudgeError } from './types.ts';

export function resolveJudge(name: string): LlmJudge {
  if (name === 'claude') return new ClaudeCliJudge();
  if (name === 'codex') return new CodexCliJudge();
  if (name === 'gemini') return new GeminiCliJudge();
  throw new UnknownJudgeError(name);
}

