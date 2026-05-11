export const JUDGE_NAMES = ['claude', 'codex', 'gemini'] as const;

export type JudgeName = typeof JUDGE_NAMES[number];

export interface LlmJudge {
  name: JudgeName;
  bin: string;
  isInstalled(): Promise<boolean>;
  invoke(systemPrompt: string, userPayload: string): Promise<string>;
}

export class UnknownJudgeError extends Error {
  override name = 'UnknownJudgeError';

  constructor(readonly value: string) {
    super(`Unknown judge "${value}". Use one of: ${JUDGE_NAMES.join(', ')}`);
  }
}

export class JudgeExecError extends Error {
  override name = 'JudgeExecError';

  constructor(
    readonly judge: JudgeName,
    readonly exitCode: number | null,
    message: string,
  ) {
    super(`${judge} CLI execution failed${exitCode === null ? '' : ` with exit code ${exitCode}`}: ${message}`);
  }
}

/**
 * LLM 제공자 측 정책 필터가 분석 요청 자체를 거부한 케이스.
 * 일반 실행 실패와 달리, 이 자체가 "분석 대상 콘텐츠가 위험 패턴을 포함한다"는
 * 강한 시그널로 해석할 수 있어 finding 으로 변환된다.
 */
export class JudgePolicyBlockError extends JudgeExecError {
  override name = 'JudgePolicyBlockError';

  constructor(
    judge: JudgeName,
    message: string,
    readonly providerRawMessage: string,
  ) {
    super(judge, null, message);
  }
}

export class JudgeParseError extends Error {
  override name = 'JudgeParseError';

  constructor(
    message: string,
    readonly rawResponse: string,
  ) {
    super(message);
  }
}
