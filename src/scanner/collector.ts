import { lstatSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import type { Finding, FileRole, InstallSurface, ScanTarget } from '../rules/types.ts';
import { parseHooksJson } from '../parser/hooks-json.ts';
import { parseMcpJson } from '../parser/mcp-json.ts';

/**
 * /plugin install 시 Claude Code / Codex CLI 가 자동으로 로드/실행하는 파일 매트릭스.
 * 이게 우리가 검사하는 install attack surface 의 단일 source of truth.
 *
 * | Role         | Path / Filename                                                   | 자동-로드 시점               |
 * | ------------ | ----------------------------------------------------------------- | ---------------------------- |
 * | MANIFEST     | .claude-plugin/plugin.json, .codex-plugin/plugin.json, plugin.json| install                      |
 * | HOOKS        | hooks/hooks.json, .codex/hooks.json, hooks.json                   | install / session-start      |
 * | MCP_JSON     | .mcp.json, mcp.json                                               | install (서버 spawn + 컨텍스트 주입) |
 * | SKILL_MD     | skills/**\/*.md(x)                                                | session-start (skill discovery) |
 * | AGENT_MD     | agents/**\/*.md(x)                                                | session-start                |
 * | COMMAND_MD   | commands/**\/*.md(x)                                              | invocation                   |
 * | PACKAGE_JSON | package.json (lifecycle scripts: postinstall 등)                  | install (npm i)              |
 * | GITMODULES   | .gitmodules                                                       | clone                        |
 * | SHELL/JS     | hooks/MCP `command`/`args` 에서 참조되는 스크립트                  | hook/MCP 실행 시 (transitive)|
 *
 * 위에 해당하지 않는 파일 (tests/, docs/, fixtures/, examples/, dist/, README 등) 은
 * 사용자가 직접 호출할 때만 동작 — 'low' surface 로 분류되어 verdict 에 영향을 주지 않음.
 */
const HIGH_SURFACE_ROLES: ReadonlySet<FileRole> = new Set<FileRole>([
  'MANIFEST',
  'HOOKS',
  'MCP_JSON',
  'SKILL_MD',
  'AGENT_MD',
  'COMMAND_MD',
  'PACKAGE_JSON',
  'GITMODULES',
]);

export { HIGH_SURFACE_ROLES };

const MAX_FILE_BYTES = 200_000;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', '.cache']);
const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.json', '.jsonc', '.json5',
  '.sh', '.bash', '.zsh', '.fish',
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts', '.tsx', '.jsx',
  '.toml', '.yaml', '.yml', '.txt', '.env', '.cfg', '.ini',
  '.py', '.rb', '.pl', '.lua',
]);
const IS_BINARY_RE = /\0/;

/**
 * Path patterns that mark a file as out-of-band (low install surface).
 * These files are NOT auto-loaded by the agent at install/session-start.
 * They only run if the user explicitly invokes test/example tooling.
 */
const LOW_SURFACE_PATTERNS: RegExp[] = [
  /(^|\/)__tests__\//,
  /(^|\/)tests?\//,
  /(^|\/)spec\//,
  /(^|\/)fixtures?\//,
  /(^|\/)benchmarks?\//,
  /(^|\/)examples?\//,
  /(^|\/)demos?\//,
  /(^|\/)seminar\//,
  /(^|\/)docs?\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)\.next\//,
  /(^|\/)coverage\//,
  /\.test\.[a-z]+$/,
  /\.spec\.[a-z]+$/,
  /(^|\/)README(\.[a-z]+)?$/i,
  /(^|\/)CHANGELOG(\.[a-z]+)?$/i,
  /(^|\/)CONTRIBUTING(\.[a-z]+)?$/i,
  /(^|\/)LICENSE(\.[a-z]+)?$/i,
  /(^|\/)SECURITY(\.[a-z]+)?$/i,
  /(^|\/)templates?\//,
];

export interface CollectionResult {
  targets: ScanTarget[];
  preFindings: Finding[];
}

export function collectTargets(rootDir: string): CollectionResult {
  const targets: ScanTarget[] = [];
  const preFindings: Finding[] = [];
  walk(rootDir, rootDir, targets, preFindings);
  resolveTransitiveSurface(targets);
  return { targets, preFindings };
}

function walk(rootDir: string, dir: string, out: ScanTarget[], findings: Finding[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const rel = relative(rootDir, full);
    if (SKIP_DIRS.has(entry)) continue;

    let lst;
    try {
      lst = lstatSync(full);
    } catch {
      continue;
    }

    if (lst.isSymbolicLink()) {
      const sym = checkSymlink(rootDir, full, rel);
      if (sym) findings.push(sym);
      continue;
    }

    if (lst.isDirectory()) {
      walk(rootDir, full, out, findings);
      continue;
    }

    if (!lst.isFile()) continue;
    if (lst.size > MAX_FILE_BYTES) continue;

    const role = roleFor(rel);
    if (role === null) continue;

    let raw: string;
    try {
      raw = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    if (IS_BINARY_RE.test(raw.slice(0, 1024))) continue;

    const surface = surfaceFor(rel, role);
    out.push({ filePath: rel, fileRole: role, surface, rawContent: raw });
  }
}

function checkSymlink(rootDir: string, full: string, rel: string): Finding | null {
  let target: string;
  try {
    target = readlinkSync(full);
  } catch {
    return null;
  }
  const resolved = resolve(full, '..', target);
  const root = resolve(rootDir);
  const isOutside = !resolved.startsWith(root + sep) && resolved !== root;

  let stExists = false;
  try {
    statSync(resolved);
    stExists = true;
  } catch {
    stExists = false;
  }

  if (!isOutside) return null;
  return {
    severity: 'MEDIUM',
    ruleId: 'SL-001',
    source: 'symlink',
    surface: 'high',
    filePath: rel,
    snippet: `${rel} -> ${target}${stExists ? '' : ' (broken)'}`,
    description: `심볼릭 링크가 레포 외부(${target})를 가리킴 — path traversal 벡터 가능성.`,
  };
}

export function roleFor(rel: string): FileRole | null {
  const lower = rel.toLowerCase().replaceAll('\\', '/');
  const slashed = '/' + lower; // makes "starts with foldername/" and "/foldername/" both match `/foldername/`
  const base = lower.split('/').pop() ?? '';
  const ext = '.' + (base.includes('.') ? base.split('.').pop() ?? '' : '');

  if (base === 'plugin.json' || lower.endsWith('/.claude-plugin/plugin.json') || lower.endsWith('/.codex-plugin/plugin.json')) return 'MANIFEST';
  if (base === 'hooks.json' || lower.endsWith('/hooks/hooks.json') || lower.endsWith('/.codex/hooks.json')) return 'HOOKS';
  if (base === '.mcp.json' || lower.endsWith('/.mcp.json') || lower.endsWith('/mcp.json')) return 'MCP_JSON';
  if (slashed.includes('/skills/') && (ext === '.md' || ext === '.mdx')) return 'SKILL_MD';
  if (slashed.includes('/agents/') && (ext === '.md' || ext === '.mdx')) return 'AGENT_MD';
  if (slashed.includes('/commands/') && (ext === '.md' || ext === '.mdx')) return 'COMMAND_MD';
  if (ext === '.sh' || ext === '.bash' || ext === '.zsh') return 'SHELL_SCRIPT';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.ts' || ext === '.mts' || ext === '.cts') return 'JS_SCRIPT';
  if (base === 'package.json') return 'PACKAGE_JSON';
  if (base === '.gitmodules') return 'GITMODULES';
  if (TEXT_EXTENSIONS.has(ext)) return 'UNKNOWN';
  return null;
}

function surfaceFor(rel: string, role: FileRole): InstallSurface {
  const lower = rel.toLowerCase().replaceAll('\\', '/');

  // Hard "low": test/docs/fixtures regardless of file type — 사용자가 직접
  // 실행해야만 동작. (SKILL_MD / AGENT_MD 가 tests/ 안에 있어도 자동 로드 X.)
  for (const re of LOW_SURFACE_PATTERNS) {
    if (re.test(lower)) return 'low';
  }

  // 매트릭스에 등록된 자동 로드 role → 'high'.
  if (HIGH_SURFACE_ROLES.has(role)) return 'high';

  // 나머지 JS/TS/SH 스크립트와 unknown text 는 'low' 기본값.
  // hooks/MCP 가 직접 참조하면 resolveTransitiveSurface 에서 'high' 로 승격.
  return 'low';
}

/**
 * Promote scripts referenced by HOOKS or MCP_JSON command/args fields to 'high'.
 * If a hook or MCP server runs `node scripts/setup.mjs`, then `scripts/setup.mjs`
 * is part of the install attack surface even though its path looks ordinary.
 */
function resolveTransitiveSurface(targets: ScanTarget[]): void {
  const referenced = new Set<string>();
  for (const t of targets) {
    if (t.fileRole === 'HOOKS') {
      const parsed = parseHooksJson(t.rawContent);
      for (const h of parsed.entries) {
        if (h.command) collectScriptPaths(h.command, referenced);
      }
    } else if (t.fileRole === 'MCP_JSON') {
      const parsed = parseMcpJson(t.rawContent);
      for (const s of parsed.servers) {
        if (s.command) collectScriptPaths(s.command, referenced);
        if (s.args) for (const a of s.args) collectScriptPaths(a, referenced);
      }
    }
  }
  if (referenced.size === 0) return;
  for (const t of targets) {
    if (t.surface === 'high') continue;
    const lower = t.filePath.toLowerCase().replaceAll('\\', '/');
    for (const ref of referenced) {
      if (lower.endsWith(ref) || lower.includes('/' + ref)) {
        t.surface = 'high';
        break;
      }
    }
  }
}

function collectScriptPaths(text: string, out: Set<string>): void {
  // Match plausible relative script paths inside command strings.
  const re = /([\w./\-]+\.(?:sh|bash|zsh|js|mjs|cjs|ts|mts|cts|py|rb|pl|lua))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.add(m[1].toLowerCase());
  }
}
