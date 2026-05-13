import { roleFor } from './collector.ts';
import type { FileRole } from '../rules/types.ts';
import { L } from '../i18n/index.ts';

/**
 * Surface-escalation detector.
 *
 * Detection-independent rug-pull signal: 직전 검사에 존재하지 않던
 * high-surface 파일(hooks / MCP / skill / agent / command / package.json /
 * .gitmodules) 이 plugin update 후 새로 등장하는 케이스를 deterministic 하게 잡는다.
 *
 * 첫 검사 시점엔 plugin이 정상적으로 surface를 가지고 있으므로 동작하지 않고,
 * 두 번째 이후 검사(prev 존재) 에만 의미가 있다 — 호출부에서 그 조건을 보장한다.
 */

export interface EscalationFinding {
  ruleId: string;
  filePath: string;
  description: string;
}

interface EscalationRule {
  ruleId: string;
  describe: (path: string) => string;
}

const RULE_BY_ROLE: Partial<Record<FileRole, EscalationRule>> = {
  HOOKS: {
    ruleId: 'PH-RUG-001',
    describe: p => L(
      `A hooks file was newly added that did not exist on the previous scan (${p}). Hook commands run immediately in the user's shell when their event matches, creating a new arbitrary code execution channel — a strong rug-pull signal.`,
      `직전 검사엔 없던 hooks 파일이 새로 추가되었습니다 (${p}). hook 의 command 는 매칭 이벤트 발생 시 사용자 셸에서 즉시 실행되므로, 동의 없는 임의 코드 실행 통로가 새로 생긴 것입니다 — rug-pull 의 강한 신호입니다.`,
    ),
  },
  MCP_JSON: {
    ruleId: 'PH-RUG-002',
    describe: p => L(
      `An MCP config file was newly added (${p}). MCP servers are spawned at install time and their tool descriptions are injected into the LLM context, creating a new tool-poisoning and arbitrary-process-execution surface.`,
      `직전 검사엔 없던 MCP 설정 파일이 새로 추가되었습니다 (${p}). MCP 서버는 install 시점에 spawn 되며 도구 description 이 LLM 컨텍스트에 주입되므로, tool poisoning 및 임의 프로세스 실행 surface 가 새로 생깁니다.`,
    ),
  },
  SKILL_MD: {
    ruleId: 'PH-RUG-003',
    describe: p => L(
      `A skill file was newly added (${p}). The skills directory is auto-loaded at session start and treated as authoritative LLM instructions, creating a new prompt-injection attack surface.`,
      `직전 검사엔 없던 skill 파일이 새로 추가되었습니다 (${p}). skills 디렉토리는 세션 시작 시 자동 로드되어 권위 있는 LLM 지시문으로 처리되므로, prompt injection 공격 표면이 새로 생깁니다.`,
    ),
  },
  AGENT_MD: {
    ruleId: 'PH-RUG-003',
    describe: p => L(
      `An agent file was newly added (${p}). The agents directory is auto-loaded into the session as authoritative LLM instructions, creating a new prompt-injection attack surface.`,
      `직전 검사엔 없던 agent 파일이 새로 추가되었습니다 (${p}). agents 디렉토리는 세션에 자동 로드되어 권위 있는 LLM 지시문으로 처리되므로, prompt injection 공격 표면이 새로 생깁니다.`,
    ),
  },
  COMMAND_MD: {
    ruleId: 'PH-RUG-003',
    describe: p => L(
      `A slash command file was newly added (${p}). When the user invokes the command its contents are injected as LLM instructions, so an attacker can plant unknown commands.`,
      `직전 검사엔 없던 slash command 파일이 새로 추가되었습니다 (${p}). 사용자가 명령을 호출하면 LLM 지시문으로 주입되므로, 공격자가 사용자가 모르는 새 명령을 심을 수 있습니다.`,
    ),
  },
  PACKAGE_JSON: {
    ruleId: 'PH-RUG-004',
    describe: p => L(
      `A package.json was newly added (${p}). Lifecycle scripts such as npm postinstall can run at install time.`,
      `직전 검사엔 없던 package.json 이 새로 추가되었습니다 (${p}). npm postinstall 등 lifecycle 스크립트가 install 시점에 실행될 수 있습니다.`,
    ),
  },
  GITMODULES: {
    ruleId: 'PH-RUG-004',
    describe: p => L(
      `A .gitmodules file was newly added (${p}). External repositories are pulled on clone, expanding the attack surface.`,
      `직전 검사엔 없던 .gitmodules 가 새로 추가되었습니다 (${p}). clone 시 외부 저장소가 함께 받아져 attack surface 가 확장됩니다.`,
    ),
  },
};

export function detectSurfaceEscalation(
  prevHashes: Record<string, string>,
  nextHashes: Record<string, string>,
): EscalationFinding[] {
  const out: EscalationFinding[] = [];
  for (const path of Object.keys(nextHashes)) {
    if (path in prevHashes) continue;
    const role = roleFor(path);
    if (role === null) continue;
    const rule = RULE_BY_ROLE[role];
    if (!rule) continue;
    out.push({ ruleId: rule.ruleId, filePath: path, description: rule.describe(path) });
  }
  return out;
}
