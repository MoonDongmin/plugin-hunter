import Anthropic from '@anthropic-ai/sdk';
import type { ScanReport } from '../rules/types.ts';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `당신은 AI 코딩 에이전트(Claude Code, Codex CLI) 플러그인 보안 사고 대응 가이드입니다.
사용자는 방금 자신이 설치했거나 설치하려던 플러그인이 unsafe 판정을 받았습니다.
findings 리스트를 입력받아, 사용자가 즉시 따를 수 있는 한국어 markdown 가이드를 작성하세요.

## 출력 형식 (정확히 이 5섹션 순서, **굵은 글씨 헤더 사용**)
**1. 즉시 조치** — 지금 당장 멈춰야 할 행동(실행 중인 세션 종료, plugin disable 등). 1~2 줄.
**2. 제거 절차** — uninstall 명령. Claude Code 라면 \`/plugin uninstall <name>\`, Codex CLI 라면 등가 명령. 잔여물(설치 디렉토리, 캐시) 제거 단계 포함.
**3. 노출 가능성 평가** — finding 의 description / snippet 을 근거로 어떤 자산이 노출되었을 수 있는지 (예: \`~/.ssh/id_rsa\`, \`~/.aws/credentials\`, \`.env\`, shell history). 추정이 어려우면 "확정 불가, 보수적 가정 권장" 이라고 명시.
**4. credential rotation 우선순위** — 위 자산을 근거로 rotation 순서를 한 줄씩. SSH 키 → cloud credential → API token → DB password 흐름을 기본으로.
**5. 안전한 대안 (선택)** — 공식 marketplace 우선 또는 fork 검토. 가능하면 한 줄, 모르면 생략.

## 작성 규칙
- 모두 한국어. 명령어와 파일 경로는 원문 유지.
- 추측보다 finding 근거 우선. 근거 없는 단정 금지.
- 각 섹션은 짧게, 불릿/번호 사용. 전체 600 토큰 미만 권장.
- 단호하고 명확하게. 군더더기 없음.`;

export async function generateRemediation(report: ScanReport): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const findings = report.findings
    .filter(f => f.surface === 'high' && (f.severity === 'CRITICAL' || f.severity === 'HIGH'))
    .slice(0, 30);

  if (findings.length === 0) return null;

  const userMessage = [
    `Plugin: ${report.pluginName} v${report.pluginVersion} (${report.pluginType})`,
    '',
    'Findings:',
    ...findings.map(f => {
      const loc = f.lineNumber !== undefined ? `:${f.lineNumber}` : '';
      return [
        `- [${f.severity}] ${f.ruleId} ${f.filePath}${loc}`,
        `  snippet: ${f.snippet.slice(0, 160)}`,
        `  description: ${f.description}`,
      ].join('\n');
    }),
  ].join('\n');

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;
    const text = textBlock.text.trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
