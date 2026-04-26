/**
 * Common intermediate representation for plugins across Claude Code, Codex CLI, and Gemini CLI.
 *
 * Each platform's parser converts its native layout (JSON / TOML / markdown with YAML
 * frontmatter) into a Plugin. Detectors operate only on this IR, so adding a new
 * platform is a single parser away.
 */

export type Platform = 'claude' | 'codex' | 'gemini';

export interface PluginManifest {
  name: string;
  version?: string;
  author?: string;
  description?: string;
  /** Declared permissions / tool allowlists, when the platform exposes them. */
  permissions?: string[];
  /** Any manifest fields we did not normalize — kept for the judge and audit. */
  extra?: Record<string, unknown>;
}

export interface SourceRef {
  /** Path relative to the plugin root. */
  path: string;
  /** 1-based line number when available. */
  line?: number;
}

export type Component =
  | SkillComponent
  | AgentComponent
  | CommandComponent
  | HookComponent
  | McpComponent
  | ContextComponent;

export interface SkillComponent {
  kind: 'skill';
  name: string;
  description?: string;
  prompt: string;
  frontmatter: Record<string, unknown>;
  source: SourceRef;
}

export interface AgentComponent {
  kind: 'agent';
  name: string;
  description?: string;
  systemPrompt: string;
  tools?: string[];
  source: SourceRef;
}

export interface CommandComponent {
  kind: 'command';
  name: string;
  body: string;
  source: SourceRef;
}

export interface HookComponent {
  kind: 'hook';
  /** Platform-specific event name — e.g. `PreToolUse`, `post-install`, `onCommand`. */
  event: string;
  /** Raw shell line(s) that will be executed. */
  shell: string;
  source: SourceRef;
}

export interface McpComponent {
  kind: 'mcp';
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  tools: McpTool[];
  source: SourceRef;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema?: unknown;
}

export interface ContextComponent {
  kind: 'context';
  name: string;
  content: string;
  source: SourceRef;
}

export interface Plugin {
  platform: Platform;
  manifest: PluginManifest;
  components: Component[];
  /** Plugin root path on disk. */
  root: string;
}

/* ─────────────────────────────────────────────────────────────────
 * Detector output
 * ───────────────────────────────────────────────────────────────── */

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type Detector = 'heuristic' | 'judge';

export type Vector =
  | 'skill-poisoning'
  | 'hook-rce'
  | 'mcp-poisoning'
  | 'secret-access'
  | 'network-exfil'
  | 'typosquat'
  | 'rug-pull'
  | 'other';

export interface Finding {
  id: string;
  vector: Vector;
  severity: Severity;
  /** Which detector produced this finding. */
  detector: Detector;
  /** Machine-readable confidence in [0, 1]. */
  confidence: number;
  /** One-line human summary. */
  title: string;
  /** Longer explanation, safe to print in the terminal report. */
  description: string;
  /** Textual evidence — e.g. matched regex, offending prompt fragment. */
  evidence: string[];
  /** Where in the plugin this was found. */
  source?: SourceRef;
}

export interface ScanReport {
  plugin: Plugin;
  findings: Finding[];
  /** Wall-clock ms for the whole scan, for the benchmark harness. */
  durationMs: number;
  /** Whether the LLM judge was actually invoked (can be disabled via env). */
  judgeUsed: boolean;
}
