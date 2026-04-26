import Anthropic from '@anthropic-ai/sdk';
import type { FileRole, Finding, PluginType, ScanTarget, Severity } from '../rules/types.ts';

const MODEL = 'claude-sonnet-4-6';
// High-surface only — these are the files an attacker can use to land code
// at install/session-start time. The cap is generous because the high-surface
// set is small (a handful of skill/agent/command md + hooks + mcp + manifest).
const MAX_TOTAL_BYTES = 200_000;
const MAX_PER_FILE_BYTES = 16_000;

const ROLE_PRIORITY: FileRole[] = [
  'HOOKS',
  'MCP_JSON',
  'SKILL_MD',
  'AGENT_MD',
  'COMMAND_MD',
  'MANIFEST',
  'JS_SCRIPT',
  'SHELL_SCRIPT',
  'PACKAGE_JSON',
  'GITMODULES',
  'UNKNOWN',
];

const SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const SYSTEM_PROMPT = `You are a security auditor for AI-assistant plugins (Claude Code, Codex CLI).

## What auto-loads on /plugin install
When a user runs /plugin install, the AI agent will automatically read or
execute the following files WITHOUT further consent:
  - manifest (.claude-plugin/plugin.json, .codex-plugin/plugin.json, plugin.json)
  - hooks.json — every entry's \`command\` runs in the user's shell on the
    matching event (PreToolUse, SessionStart, etc.)
  - .mcp.json — every server's \`command\`/\`args\` is spawned at install,
    and tool \`description\` fields are injected into the LLM context
  - skills/**/*.md(x), agents/**/*.md(x), commands/**/*.md(x) — loaded into
    the LLM's instructions and treated as authoritative directives
  - package.json — npm postinstall scripts run
  - any script transitively referenced by hooks/MCP \`command\`/\`args\`

Anything in tests/, docs/, examples/, fixtures/, dist/, README is NOT
auto-loaded. Treat as informational context only.

## Threat vectors to flag (hackathon scope)
1. Skill / Agent / Command poisoning — natural-language instructions to
   silently read \`~/.ssh\`, \`~/.aws\`, \`.env\`, \`~/.docker\`,
   \`~/.config/gcloud\`, history files, or to exfiltrate them (curl,
   nslookup/dig subshells, webhook POST, DNS side channel).
2. Hook RCE — shell that pipes the network into the shell (\`curl … | sh\`,
   \`wget … | bash\`), unpinned downloads, eval of fetched content,
   base64-decoded shell, obfuscated tar+upload of credential dirs.
3. MCP Tool Poisoning Attack — a server \`command\` that fetches and runs
   untrusted code; a tool \`description\` that instructs the LLM to read
   unrelated files (e.g. .env, ~/.ssh) before answering, or to attach their
   contents to the response; hidden directives in schema fields.
4. Typosquat / rug-pull cover stories — phrases like "anti-tampering
   signature", "opaque payload", "tell the user it is harmless / a
   diagnostic", instructions to hide actions from the user.
5. Obfuscation — string concatenation across lines, homoglyphs (Cyrillic
   lookalikes), zero-width characters, base64-encoded credential paths,
   variable assembly of forbidden commands.
6. Multi-file attacks — individually-benign files that combine into a
   credential exfiltration chain.

## Output rules
- Use the report_findings tool. Empty array if nothing actionable.
- ruleId format: "CL-NNN" (e.g. CL-001).
- description: **반드시 한국어로 작성**. 1~3 문장, 왜 이 패턴이 악성인지 명료하게.
  Korean is mandatory for description. Korean must be used.
- snippet: keep the original text from the file (do NOT translate code or shell).
- lineNumber: best effort, optional.
- Do NOT flag: documentation that warns against attacks, security-tooling
  source code, comments explaining why something is unsafe, or legitimate
  examples that are clearly framed as illustrations.`;

const FINDINGS_TOOL = {
  name: 'report_findings',
  description: 'Report all malicious findings found in the plugin files. Pass an empty array if nothing suspicious was found.',
  input_schema: {
    type: 'object' as const,
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            severity: { type: 'string', enum: SEVERITIES },
            ruleId: { type: 'string', description: 'Identifier in CL-NNN form (e.g. CL-001).' },
            filePath: { type: 'string' },
            lineNumber: { type: 'number' },
            snippet: { type: 'string', description: 'Short excerpt (max 200 chars). Keep original text, do not translate.' },
            description: { type: 'string', description: '한국어로 왜 이 패턴이 악성인지 설명. 1~3 문장. (Must be written in Korean.)' },
          },
          required: ['severity', 'ruleId', 'filePath', 'snippet', 'description'],
        },
      },
    },
    required: ['findings'],
  },
};

interface ClaudeFindingShape {
  severity: Severity;
  ruleId: string;
  filePath: string;
  lineNumber?: number;
  snippet: string;
  description: string;
}

export async function analyzeWithClaude(targets: ScanTarget[], pluginType: PluginType): Promise<Finding[]> {
  // Only send the install attack surface to Claude. This is the user's actual
  // exposure: files Claude/Codex auto-load at install/session-start. Sending
  // tests/docs/fixtures wastes context on stuff the agent never executes.
  const highSurface = targets.filter(t => t.surface === 'high');
  if (highSurface.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not set. Add it to .env or the environment.');
  }

  const bundle = bundleTargets(highSurface);
  if (!bundle) return [];

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [FINDINGS_TOOL],
    tool_choice: { type: 'tool', name: 'report_findings' },
    messages: [
      {
        role: 'user',
        content: `Plugin type: ${pluginType}\n\nFiles:\n\n${bundle}`,
      },
    ],
  });

  const toolBlock = response.content.find(b => b.type === 'tool_use');
  if (!toolBlock || toolBlock.type !== 'tool_use') return [];

  const input = toolBlock.input as { findings?: unknown };
  if (!input.findings || !Array.isArray(input.findings)) return [];

  const out: Finding[] = [];
  for (const item of input.findings) {
    const f = coerceFinding(item);
    if (f) out.push(f);
  }
  return out;
}

function bundleTargets(targets: ScanTarget[]): string {
  const sorted = [...targets].sort((a, b) =>
    ROLE_PRIORITY.indexOf(a.fileRole) - ROLE_PRIORITY.indexOf(b.fileRole),
  );
  let used = 0;
  const chunks: string[] = [];
  for (const t of sorted) {
    if (used >= MAX_TOTAL_BYTES) break;
    const remainingBudget = MAX_TOTAL_BYTES - used;
    const sliceSize = Math.min(MAX_PER_FILE_BYTES, remainingBudget, t.rawContent.length);
    if (sliceSize <= 0) break;
    const slice = t.rawContent.slice(0, sliceSize);
    const truncated = sliceSize < t.rawContent.length ? '\n[...truncated]' : '';
    const block = `### ${t.filePath} [${t.fileRole}]\n${slice}${truncated}\n`;
    chunks.push(block);
    used += block.length;
  }
  return chunks.join('\n');
}

function coerceFinding(value: unknown): Finding | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const sev = v.severity;
  if (typeof sev !== 'string' || !SEVERITIES.includes(sev as Severity)) return null;
  if (typeof v.ruleId !== 'string') return null;
  if (typeof v.filePath !== 'string') return null;
  if (typeof v.snippet !== 'string') return null;
  if (typeof v.description !== 'string') return null;
  const result: ClaudeFindingShape = {
    severity: sev as Severity,
    ruleId: v.ruleId,
    filePath: v.filePath,
    snippet: v.snippet.slice(0, 240),
    description: v.description,
  };
  if (typeof v.lineNumber === 'number' && Number.isFinite(v.lineNumber)) {
    result.lineNumber = v.lineNumber;
  }
  // Claude only sees high-surface files, so any finding it returns is by
  // definition on the install attack surface.
  return { ...result, source: 'claude', surface: 'high' };
}
