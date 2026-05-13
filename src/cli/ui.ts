// Central UI helpers — TTY-aware colors, badges, spinner, layout utilities.
import { L } from '../i18n/index.ts';

const COLOR_ENABLED = (() => {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout.isTTY ?? process.stderr.isTTY);
})();

const RAW = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgGray: '\x1b[100m',
} as const;

type Style = keyof typeof RAW;

function paint(style: Style, text: string): string {
  if (!COLOR_ENABLED) return text;
  return `${RAW[style]}${text}${RAW.reset}`;
}

function combine(styles: Style[], text: string): string {
  if (!COLOR_ENABLED) return text;
  const open = styles.map(s => RAW[s]).join('');
  return `${open}${text}${RAW.reset}`;
}

export const c = {
  bold: (s: string) => paint('bold', s),
  dim: (s: string) => paint('dim', s),
  red: (s: string) => paint('red', s),
  green: (s: string) => paint('green', s),
  yellow: (s: string) => paint('yellow', s),
  blue: (s: string) => paint('blue', s),
  magenta: (s: string) => paint('magenta', s),
  cyan: (s: string) => paint('cyan', s),
  gray: (s: string) => paint('gray', s),
  boldRed: (s: string) => combine(['bold', 'red'], s),
  boldGreen: (s: string) => combine(['bold', 'green'], s),
  boldYellow: (s: string) => combine(['bold', 'yellow'], s),
  boldCyan: (s: string) => combine(['bold', 'cyan'], s),
  boldMagenta: (s: string) => combine(['bold', 'magenta'], s),
  boldGray: (s: string) => combine(['bold', 'gray'], s),
};

const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

function charWidth(cp: number): number {
  if (cp < 0x1100) return 1;
  if (
    (cp >= 0x1100 && cp <= 0x115F) ||  // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0x303E) ||  // CJK Radicals
    (cp >= 0x3041 && cp <= 0x33FF) ||  // Hiragana, Katakana
    (cp >= 0x3400 && cp <= 0x4DBF) ||  // CJK Extension A
    (cp >= 0x4E00 && cp <= 0x9FFF) ||  // CJK Unified
    (cp >= 0xA000 && cp <= 0xA4CF) ||  // Yi
    (cp >= 0xAC00 && cp <= 0xD7A3) ||  // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||  // CJK Compatibility
    (cp >= 0xFE30 && cp <= 0xFE4F) ||  // CJK Compatibility Forms
    (cp >= 0xFF00 && cp <= 0xFF60) ||  // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6)     // Fullwidth Symbols
  ) return 2;
  return 1;
}

export function visibleLength(s: string): number {
  const plain = stripAnsi(s);
  let total = 0;
  for (const ch of plain) {
    const cp = ch.codePointAt(0) ?? 0;
    total += charWidth(cp);
  }
  return total;
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const chars = Array.from(stripAnsi(text));
  const lines: string[] = [];
  let buf: string[] = [];
  let bufWidth = 0;
  let lastSpaceIdx = -1;

  for (const ch of chars) {
    if (ch === '\n') {
      lines.push(buf.join(''));
      buf = [];
      bufWidth = 0;
      lastSpaceIdx = -1;
      continue;
    }
    const w = charWidth(ch.codePointAt(0) ?? 0);
    if (bufWidth + w > width && buf.length > 0) {
      if (lastSpaceIdx >= 0 && lastSpaceIdx < buf.length - 1) {
        const head = buf.slice(0, lastSpaceIdx).join('');
        const tail = buf.slice(lastSpaceIdx + 1);
        lines.push(head);
        buf = tail;
        bufWidth = tail.reduce((acc, c) => acc + charWidth(c.codePointAt(0) ?? 0), 0);
      } else {
        lines.push(buf.join(''));
        buf = [];
        bufWidth = 0;
      }
      lastSpaceIdx = -1;
    }
    if (ch === ' ') lastSpaceIdx = buf.length;
    buf.push(ch);
    bufWidth += w;
  }
  if (buf.length > 0) lines.push(buf.join(''));
  return lines;
}

export function indentWrap(text: string, indent: string, totalWidth: number): string {
  const inner = Math.max(20, totalWidth - visibleLength(indent));
  return wrapText(text, inner).map(line => indent + line).join('\n');
}

export function termWidth(min = 60, max = 100): number {
  const w = process.stdout.columns ?? 80;
  return Math.max(min, Math.min(max, w));
}

export function truncate(s: string, max: number): string {
  if (visibleLength(s) <= max) return s;
  // ANSI가 없는 plain string에 대해서만 정확히 잘라낸다 (대부분의 경우 OK)
  const plain = stripAnsi(s);
  return plain.slice(0, Math.max(1, max - 1)) + '…';
}

export function padEndVisible(s: string, target: number): string {
  const diff = target - visibleLength(s);
  return diff > 0 ? s + ' '.repeat(diff) : s;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
export const icon = {
  check: '✓',
  cross: '✗',
  warn: '⚠',
  info: 'ℹ',
  arrow: '▸',
  bullet: '·',
  dot: '•',
  diamond: '◆',
};

// ─── Badges ──────────────────────────────────────────────────────────────────

export function badge(text: string, kind: 'safe' | 'unsafe' | 'warn' | 'info' | 'muted'): string {
  const T = ` ${text} `;
  if (!COLOR_ENABLED) return `[${text}]`;
  switch (kind) {
    case 'safe':
      return combine(['bold'], `${RAW.green}▌${RAW.bgGreen}${RAW.black}${T}${RAW.reset}${RAW.green}▐${RAW.reset}`);
    case 'unsafe':
      return combine(['bold'], `${RAW.red}▌${RAW.bgRed}${RAW.white}${T}${RAW.reset}${RAW.red}▐${RAW.reset}`);
    case 'warn':
      return combine(['bold'], `${RAW.yellow}▌${RAW.bgYellow}${RAW.black}${T}${RAW.reset}${RAW.yellow}▐${RAW.reset}`);
    case 'info':
      return combine(['bold'], `${RAW.cyan}▌${RAW.bgCyan}${RAW.black}${T}${RAW.reset}${RAW.cyan}▐${RAW.reset}`);
    case 'muted':
      return combine(['bold'], `${RAW.gray}▌${RAW.bgGray}${RAW.white}${T}${RAW.reset}${RAW.gray}▐${RAW.reset}`);
  }
}

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export function severityBadge(sev: Severity): string {
  switch (sev) {
    case 'CRITICAL':
      return badge('CRITICAL', 'unsafe');
    case 'HIGH':
      if (!COLOR_ENABLED) return '[HIGH]';
      return combine(['bold'], `${RAW.magenta}▌${RAW.bgMagenta}${RAW.white} HIGH ${RAW.reset}${RAW.magenta}▐${RAW.reset}`);
    case 'MEDIUM':
      return badge('MEDIUM', 'warn');
    case 'LOW':
      return badge('LOW', 'muted');
  }
}

export function statusBadge(status: 'clean' | 'unsafe' | 'unscanned' | 'error'): string {
  switch (status) {
    case 'clean':
      return badge('SAFE', 'safe');
    case 'unsafe':
      return badge('UNSAFE', 'unsafe');
    case 'unscanned':
      return badge(' — ', 'muted');
    case 'error':
      return badge('ERROR', 'warn');
  }
}

// ─── Layout ──────────────────────────────────────────────────────────────────

export function hr(width = termWidth(), char = '─'): string {
  return c.gray(char.repeat(width));
}

export function box(opts: {
  title?: string;
  lines: string[];
  kind?: 'safe' | 'unsafe' | 'warn' | 'info' | 'plain';
  width?: number;
}): string {
  const w = opts.width ?? termWidth();
  const inner = w - 2;
  const colorFn =
    opts.kind === 'safe' ? c.green :
    opts.kind === 'unsafe' ? c.red :
    opts.kind === 'warn' ? c.yellow :
    opts.kind === 'info' ? c.cyan :
    c.gray;

  const top = (() => {
    if (!opts.title) return colorFn('╭' + '─'.repeat(inner) + '╮');
    const titleStr = ` ${opts.title} `;
    const remaining = inner - visibleLength(titleStr) - 1;
    if (remaining < 0) {
      const trimmed = truncate(titleStr, inner - 2);
      return colorFn('╭─' + trimmed + '─'.repeat(Math.max(0, inner - visibleLength(trimmed) - 1)) + '╮');
    }
    return colorFn('╭─') + c.bold(titleStr.trim() ? ` ${opts.title} ` : '') + colorFn('─'.repeat(remaining) + '╮');
  })();

  const bottom = colorFn('╰' + '─'.repeat(inner) + '╯');
  const body = opts.lines.map(line => {
    const padded = padEndVisible(line, inner - 2);
    return `${colorFn('│')} ${padded} ${colorFn('│')}`;
  });

  return [top, ...body, bottom].join('\n');
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const TTY = Boolean(process.stderr.isTTY);

export class Spinner {
  private interval: ReturnType<typeof setInterval> | null = null;
  private label = '';
  private startedAt = 0;

  start(label: string): void {
    this.label = label;
    this.startedAt = Date.now();
    if (!TTY) {
      process.stderr.write(`${icon.arrow} ${label}\n`);
      return;
    }
    let i = 0;
    this.interval = setInterval(() => {
      const frame = SPINNER_FRAMES[i++ % SPINNER_FRAMES.length] ?? '⠋';
      process.stderr.write(`\r\x1b[2K${c.cyan(frame)} ${this.label}`);
    }, 80);
  }

  retitle(label: string): void {
    this.label = label;
    if (!TTY) process.stderr.write(`  ${c.dim(label)}\n`);
  }

  succeed(label?: string): void {
    this.stop();
    const text = label ?? this.label;
    const ms = Date.now() - this.startedAt;
    const elapsed = ms > 200 ? c.dim(` (${formatMs(ms)})`) : '';
    if (TTY) process.stderr.write(`\r\x1b[2K${c.green(icon.check)} ${text}${elapsed}\n`);
    else process.stderr.write(`${icon.check} ${text}${elapsed}\n`);
  }

  fail(label?: string): void {
    this.stop();
    const text = label ?? this.label;
    if (TTY) process.stderr.write(`\r\x1b[2K${c.red(icon.cross)} ${text}\n`);
    else process.stderr.write(`${icon.cross} ${text}\n`);
  }

  warn(label?: string): void {
    this.stop();
    const text = label ?? this.label;
    if (TTY) process.stderr.write(`\r\x1b[2K${c.yellow(icon.warn)} ${text}\n`);
    else process.stderr.write(`${icon.warn} ${text}\n`);
  }

  clear(): void {
    this.stop();
    if (TTY) process.stderr.write('\r\x1b[2K');
  }

  private stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Stage label mapping ─────────────────────────────────────────────────────

function stageLabel(stage: string): string {
  switch (stage) {
    case 'clone': return L('Cloning repository', '레포지토리 클론');
    case 'detect': return L('Detecting plugin', '플러그인 탐지');
    case 'collect': return L('Collecting target files', '대상 파일 수집');
    case 'judge': return L('Semantic analysis by LLM judge', 'LLM judge 의미 분석');
    case 'judge-error': return L('LLM judge analysis failed', 'LLM judge 분석 실패');
    case 'remediation': return L('Generating AI remediation', 'AI 권장 조치 생성');
    case 'remediation-error': return L('AI remediation generation failed', 'AI 권장 조치 생성 실패');
    case 'upstream': return L('Checking upstream marketplace drift', 'Upstream marketplace drift 검사');
    case 'upstream-error': return L('Upstream drift check failed', 'Upstream drift 검사 실패');
    default: return stage;
  }
}

export function describeStage(stage: string, info?: string): string {
  const base = stageLabel(stage);
  return info ? `${base} ${c.dim('— ' + info)}` : base;
}

// ─── Tables ──────────────────────────────────────────────────────────────────

export function alignColumns(rows: string[][], gap = 2): string[] {
  if (rows.length === 0) return [];
  const cols = rows[0]?.length ?? 0;
  const widths = new Array<number>(cols).fill(0);
  for (const row of rows) {
    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? '';
      const w = visibleLength(cell);
      if (w > (widths[i] ?? 0)) widths[i] = w;
    }
  }
  return rows.map(row => {
    const parts: string[] = [];
    for (let i = 0; i < cols; i++) {
      const cell = row[i] ?? '';
      if (i === cols - 1) parts.push(cell);
      else parts.push(padEndVisible(cell, widths[i] ?? 0));
    }
    return parts.join(' '.repeat(gap));
  });
}
